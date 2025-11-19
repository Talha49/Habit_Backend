const GeoFence = require('../../models/v1/Geofence');
const GeoFenceLog = require('../../models/v1/GeofenceLog');
const User = require('../../models/v1/User');

const getRequestUser = (req) => req.authenticatedUser || req.clerkLinkedUser || req.legacyUser || null;

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

exports.trackChildLocation = async (req, res) => {
  try {
    const { userId, latitude, longitude } = req.body || {};

    if (!userId || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ success: false, error: 'userId, latitude and longitude are required' });
    }

    const actor = getRequestUser(req);
    if (actor && actor.role === 'child' && actor._id.toString() !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to submit location for another child' });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== 'child') {
      return res.status(400).json({ success: false, error: 'Location tracking only applies to child accounts' });
    }

    const zones = await GeoFence.find({ child: userId, active: true });
    if (!zones.length) {
      return res.status(200).json({ success: true, message: 'No geo-zones defined for child' });
    }

    const inside = zones.some((zone) => {
      const [zoneLon, zoneLat] = zone.center.coordinates;
      return haversineDistance(latitude, longitude, zoneLat, zoneLon) <= zone.radiusMeters;
    });

    if (!inside) {
      const log = await GeoFenceLog.create({
        child: userId,
        parent: zones[0].parent,
        eventType: 'exit',
        location: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
      });

      console.warn(`⚠️ Geo-zone alert for child ${userId}: outside approved area at ${latitude},${longitude}`);

      return res.status(200).json({
        success: true,
        message: 'Child is outside the approved geo-zone',
        meta: {
          eventLogged: log._id,
        },
      });
    }

    return res.status(200).json({ success: true, message: 'Child is within approved geo-zone' });
  } catch (error) {
    console.error('❌ trackChildLocation failed:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

exports.listGeoFenceAlerts = async (req, res) => {
  try {
    const requestingUser = getRequestUser(req);
    if (!requestingUser || requestingUser.role !== 'parent') {
      return res.status(403).json({ success: false, error: 'Only parents can view geo-zone alerts' });
    }

    const { since } = req.query;
    const query = { parent: requestingUser._id };

    if (since) {
      query.triggeredAt = { $gte: new Date(since) };
    }

    const logs = await GeoFenceLog.find(query)
      .populate('child', 'fullName email')
      .sort({ triggeredAt: -1 })
      .limit(50);

    res.json({ success: true, logs });
  } catch (error) {
    console.error('❌ listGeoFenceAlerts failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
