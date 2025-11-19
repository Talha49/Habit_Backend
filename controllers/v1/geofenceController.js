const GeoFence = require('../../models/v1/Geofence');
const GeoFenceLog = require('../../models/v1/GeofenceLog');
const User = require('../../models/v1/User');
const UserLink = require('../../models/v1/UserLink');

const getRequestUser = (req) => req.authenticatedUser || req.clerkLinkedUser || req.legacyUser || null;

const ensureParentRole = (user) => {
  if (!user || user.role !== 'parent') {
    const err = new Error('Only parent accounts can manage geo-zones');
    err.statusCode = 403;
    throw err;
  }
};

const ensureChildRelationship = async (parentId, childId) => {
  const child = await User.findById(childId);
  if (!child) {
    const err = new Error('Child account not found');
    err.statusCode = 404;
    throw err;
  }

  if (child.role === 'child' || child.role === 'standard') {
    const linkExists = await UserLink.exists({
      linkType: 'parent-child',
      status: 'active',
      $or: [
        { initiator: parentId, linkedUser: childId },
        { initiator: childId, linkedUser: parentId },
      ],
    });

    if (!linkExists) {
      const err = new Error('Child is not linked to this parent');
      err.statusCode = 403;
      throw err;
    }
  }

  return child;
};

exports.listChildZones = async (req, res) => {
  try {
    const parentUser = getRequestUser(req);
    ensureParentRole(parentUser);
    const zones = await GeoFence.find({ parent: parentUser._id, active: true })
      .populate('child', 'fullName email role');

    const latestAssignment = await GeoFenceLog.findOne({
      parent: parentUser._id,
      eventType: 'assigned',
    }).sort({ triggeredAt: -1 }).lean();

    res.json({ success: true, zones, latestAssignment });
  } catch (error) {
    console.error('❌ listChildZones failed:', error.message);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

exports.createZone = async (req, res) => {
  try {
    const parentUser = getRequestUser(req);
    ensureParentRole(parentUser);

    const { childId, latitude, longitude, radiusMeters, name } = req.body || {};
    if (!childId || typeof latitude !== 'number' || typeof longitude !== 'number' || typeof radiusMeters !== 'number') {
      return res.status(400).json({ success: false, error: 'childId, latitude, longitude, and radiusMeters are required' });
    }

    await ensureChildRelationship(parentUser._id, childId);

    const zone = await GeoFence.create({
      child: childId,
      parent: parentUser._id,
      name: name?.trim() || 'Approved Zone',
      center: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      radiusMeters,
      createdBy: 'parent',
    });

    await GeoFenceLog.create({
      child: childId,
      parent: parentUser._id,
      eventType: 'assigned',
      location: zone.center,
      triggeredAt: new Date(),
    });

    res.status(201).json({ success: true, zone });
  } catch (error) {
    console.error('❌ createZone failed:', error.message);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

exports.updateZone = async (req, res) => {
  try {
    const parentUser = getRequestUser(req);
    ensureParentRole(parentUser);

    const { zoneId } = req.params;
    const updates = { ...req.body };

    if (updates.latitude !== undefined || updates.longitude !== undefined) {
      if (typeof updates.latitude !== 'number' || typeof updates.longitude !== 'number') {
        return res.status(400).json({ success: false, error: 'latitude and longitude must be numbers' });
      }
      updates.center = {
        type: 'Point',
        coordinates: [updates.longitude, updates.latitude],
      };
      delete updates.latitude;
      delete updates.longitude;
    }

    if (updates.radiusMeters !== undefined && typeof updates.radiusMeters !== 'number') {
      return res.status(400).json({ success: false, error: 'radiusMeters must be a number' });
    }

    const zone = await GeoFence.findOneAndUpdate(
      { _id: zoneId, parent: parentUser._id },
      updates,
      { new: true }
    );

    if (!zone) {
      return res.status(404).json({ success: false, error: 'Geo-zone not found' });
    }

    res.json({ success: true, zone });
  } catch (error) {
    console.error('❌ updateZone failed:', error.message);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

exports.deleteZone = async (req, res) => {
  try {
    const parentUser = getRequestUser(req);
    ensureParentRole(parentUser);
    const { zoneId } = req.params;

    const zone = await GeoFence.findOneAndUpdate(
      { _id: zoneId, parent: parentUser._id },
      { active: false },
      { new: true }
    );

    if (!zone) {
      return res.status(404).json({ success: false, error: 'Geo-zone not found' });
    }

    res.json({ success: true, message: 'Geo-zone removed' });
  } catch (error) {
    console.error('❌ deleteZone failed:', error.message);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

exports.listZonesForChild = async (req, res) => {
  try {
    const requestingUser = getRequestUser(req);
    if (!requestingUser) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
 
    const { childId } = req.params;
 
    const isSelf = requestingUser._id && requestingUser._id.toString() === childId;
    if (!isSelf && requestingUser.role !== 'parent') {
      return res.status(403).json({ success: false, error: 'Not authorized to view child zones' });
    }

    if (requestingUser.role === 'parent') {
      await ensureChildRelationship(requestingUser._id, childId);
    }

    const zones = await GeoFence.find({ child: childId, active: true })
      .select('-createdBy')
      .lean();

    const latestAssignment = await GeoFenceLog.findOne({
      child: childId,
      eventType: 'assigned',
    }).sort({ triggeredAt: -1 }).lean();

    res.json({ success: true, zones, latestAssignment });
  } catch (error) {
    console.error('❌ listZonesForChild failed:', error.message);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};
