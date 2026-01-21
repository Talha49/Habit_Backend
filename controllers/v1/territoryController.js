const Territory = require('../../models/v1/Territory');
const Category = require('../../models/v1/Category');
const GeoFence = require('../../models/v1/Geofence');
const User = require('../../models/v1/User');
const TerritoryLog = require('../../models/v1/TerritoryLog');

// Helper to compute distance between two coordinates in meters
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isWithinAnyZone = (lat, lon, zones) => {
  if (!Array.isArray(zones) || zones.length === 0) return false;
  return zones.some((zone) => {
    if (!zone.center || !Array.isArray(zone.center.coordinates)) return false;
    const [zoneLon, zoneLat] = zone.center.coordinates;
    const distance = haversineDistance(lat, lon, zoneLat, zoneLon);
    return distance <= zone.radiusMeters;
  });
};

const MAX_GLOBAL_RESULTS = 200;

// Get territories by category and location
exports.getTerritories = async (req, res) => {
  console.log('🗺️ Get Territories API hit');
  try {
    const { categoryId, scope, latitude, longitude } = req.query;
    const radiusKm = req.query.radius ? parseFloat(req.query.radius) : 0.01;
    const isGlobalScope = scope === 'all' || !latitude || !longitude;

    const baseQuery = { isActive: true };
    if (categoryId) {
      baseQuery.categoryId = categoryId;
    }

    let territories;

    if (isGlobalScope) {
      const statusFilter = req.query.status;
      if (statusFilter) {
        baseQuery.status = Array.isArray(statusFilter)
          ? { $in: statusFilter }
          : statusFilter;
      } else {
        baseQuery.status = { $in: ['claimed', 'contested'] };
      }

      territories = await Territory.find(baseQuery)
        .populate('categoryId', 'name color icon')
        .populate('claimedBy', 'fullName email')
        .sort({ lastActivity: -1 })
        .limit(MAX_GLOBAL_RESULTS);
    } else {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);

      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude must be valid numbers'
        });
      }

      territories = await Territory.find({
        ...baseQuery,
        coordinates: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [lon, lat]
            },
            $maxDistance: Math.min(Math.max(radiusKm, 0.001), 10) * 1000
          }
        }
      })
        .populate('categoryId', 'name color icon')
        .populate('claimedBy', 'fullName email')
        .limit(100)
        .sort({ lastActivity: -1 });
    }

    console.log(`✅ Found ${territories.length} territories`);

    res.status(200).json({
      success: true,
      message: 'Territories retrieved successfully',
      data: territories,
      count: territories.length,
      scope: isGlobalScope ? 'all' : 'nearby'
    });
  } catch (err) {
    console.error('❌ Get territories failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve territories',
      message: err.message
    });
  }
};

// Get territory by cell ID
exports.getTerritoryByCellId = async (req, res) => {
  console.log('🗺️ Get Territory by Cell ID API hit:', req.params.cellId);
  try {
    const { cellId } = req.params;

    const territory = await Territory.findOne({ cellId })
      .populate('categoryId', 'name color icon')
      .populate('claimedBy', 'fullName email');

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    console.log(`✅ Found territory: ${territory.cellId}`);

    res.status(200).json({
      success: true,
      message: 'Territory retrieved successfully',
      data: territory
    });
  } catch (err) {
    console.error('❌ Get territory by cell ID failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve territory',
      message: err.message
    });
  }
};

// Claim a territory
exports.claimTerritory = async (req, res) => {
  console.log('🏴 Claim Territory API hit');
  try {
    const { cellId, categoryId, userId, latitude, longitude } = req.body;

    if (!cellId || !categoryId || !userId || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // 1. HABIT ENERGY CHECK
    // User must have completed at least one habit "today" (last 24h roughly or calendar day)
    // We check HabitLog for entries in the last 18 hours to be safe/generous for "today"
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Check if user has any habit log today
    const habitLog = await require('../../models/v1/HabitLog').findOne({
      userId,
      completedAt: { $gte: startOfDay }
    });

    if (!habitLog) {
      return res.status(400).json({
        success: false,
        error: 'No Habit Energy! Complete a habit today to claim territory.',
        meta: { type: 'NO_HABIT_ENERGY' }
      });
    }

    // 2. STREAK CHECK (For Locking Bonus)
    // Find user's best CURRENT streak in any active habit
    const habits = await require('../../models/v1/Habit').find({ userId, isActive: true });
    const maxStreak = Math.max(0, ...habits.map(h => h.streak));
    const shouldLock = maxStreak > 3; // Rule: Streak > 3 locks territory

    // If the user is a child, enforce geo-zone restrictions only when zones exist
    if (user.role === 'child') {
      const activeZones = await GeoFence.find({ child: userId, active: true });

      if (activeZones.length) {
        const withinZone = isWithinAnyZone(parseFloat(latitude), parseFloat(longitude), activeZones);

        if (!withinZone) {
          return res.status(403).json({
            success: false,
            error: 'You are outside your approved geo-zone.',
            meta: { type: 'GEOZONE_OUT_OF_BOUNDS' },
          });
        }
      }
    }

    // Check if territory already exists
    let territory = await Territory.findOne({ cellId });

    if (territory) {
      // 3. LOCK CHECK (Defense)
      if (territory.status === 'locked' && territory.lockedUntil && new Date() < territory.lockedUntil) {
        if (territory.claimedBy.toString() !== userId) {
          return res.status(403).json({
            success: false,
            error: 'Territory is LOCKED by a high-streak player!',
            meta: { type: 'TERRITORY_LOCKED' }
          });
        }
      }

      if (territory.status === 'claimed' && territory.claimedBy.toString() !== userId) {
        // Stealing logic (allowed if not locked)
        // Check if stealing player has higher streak? (Optional rule, skipping for MVP)
      }

      // Update existing territory
      territory.status = shouldLock ? 'locked' : 'claimed';
      territory.lockedUntil = shouldLock ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
      territory.claimedBy = userId;
      territory.categoryId = categoryId; // Allow changing category if stealing
      territory.claimDate = new Date();
      territory.lastActivity = new Date();
      territory.activityCount += 1;
      // Update coordinates to GeoJSON format
      territory.coordinates = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    } else {
      // Create new territory
      territory = new Territory({
        cellId,
        categoryId,
        claimedBy: userId,
        status: shouldLock ? 'locked' : 'claimed',
        lockedUntil: shouldLock ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
        claimDate: new Date(),
        lastActivity: new Date(),
        activityCount: 1,
        coordinates: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        }
      });
    }

    await territory.save();

    // Populate the response
    await territory.populate('categoryId', 'name color icon');
    await territory.populate('claimedBy', 'fullName email');

    // GAMIFICATION REWARDS
    const gamificationService = require('../../services/gamificationService');
    // Award 50 XP for claiming territory (Category Specific)
    const xpResult = await gamificationService.addXP(userId, 50, categoryId);

    // Check for Badges (Territory Count)
    // Count total claimed territories by user
    const totalClaimed = await Territory.countDocuments({ claimedBy: userId, status: { $in: ['claimed', 'locked'] } });
    const newBadges = await gamificationService.checkBadges(userId, 'territory_count', totalClaimed);

    // LOG ENTRY
    await TerritoryLog.create({
      territoryId: territory._id,
      userId,
      action: territory.status === 'locked' ? 'lock' : 'claim',
      details: `Claimed in category: ${categoryId}`
    });

    console.log(`✅ Territory ${cellId} claimed successfully. Locked: ${shouldLock}. XP: +50`);

    res.status(200).json({
      success: true,
      message: shouldLock ? 'Territory Claimed & LOCKED! 🔒' : 'Territory Claimed!',
      data: territory,
      rewards: {
        xpEarned: 50,
        newLevel: xpResult?.levelUp ? xpResult.newLevel : null,
        newBadges: newBadges
      }
    });
  } catch (err) {
    console.error('❌ Claim territory failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to claim territory',
      message: err.message
    });
  }
};

// Release a territory
exports.releaseTerritory = async (req, res) => {
  console.log('🏴 Release Territory API hit');
  try {
    const { cellId, userId } = req.body;

    if (!cellId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Cell ID and User ID are required'
      });
    }

    const territory = await Territory.findOne({ cellId });

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    if (territory.claimedBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only release territories you have claimed'
      });
    }

    // Release the territory
    territory.status = 'unclaimed';
    territory.claimedBy = null;
    territory.claimDate = null;
    territory.lastActivity = new Date();

    await territory.save();

    await territory.populate('categoryId', 'name color icon');
    await territory.populate('claimedBy', 'fullName email');

    console.log(`✅ Territory ${cellId} released successfully`);

    // LOG ENTRY
    await TerritoryLog.create({
      territoryId: territory._id,
      userId: userId,
      action: 'release',
      details: 'Manual release by user'
    });

    res.status(200).json({
      success: true,
      message: 'Territory released successfully',
      data: territory
    });
  } catch (err) {
    console.error('❌ Release territory failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to release territory',
      message: err.message
    });
  }
};

// Update territory activity
exports.updateActivity = async (req, res) => {
  console.log('📊 Update Territory Activity API hit');
  try {
    const { cellId, userId } = req.body;

    if (!cellId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Cell ID and User ID are required'
      });
    }

    const territory = await Territory.findOne({ cellId });

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    // Update activity
    territory.lastActivity = new Date();
    territory.activityCount += 1;

    await territory.save();

    await territory.populate('categoryId', 'name color icon');
    await territory.populate('claimedBy', 'fullName email');

    console.log(`✅ Territory ${cellId} activity updated`);

    res.status(200).json({
      success: true,
      message: 'Territory activity updated successfully',
      data: territory
    });
  } catch (err) {
    console.error('❌ Update territory activity failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update territory activity',
      message: err.message
    });
  }
};

// Get territory history
exports.getTerritoryHistory = async (req, res) => {
  console.log('📜 Get Territory History API hit:', req.params.cellId);
  try {
    const { cellId } = req.params;

    // Find territory first to get its ID
    const territory = await Territory.findOne({ cellId });

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    const logs = await TerritoryLog.find({ territoryId: territory._id })
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('❌ Get territory history failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get history'
    });
  }
};
