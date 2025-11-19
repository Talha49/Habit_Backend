const express = require('express');
const router = express.Router();
const geoFenceController = require('../../controllers/v1/geofenceController');
const { clerkMiddleware, attachClerkAuthContext } = require('../../middleware/clerkAuth');
const resolveAuthUser = require('../../middleware/resolveAuthUser');

router.use(clerkMiddleware);
router.use(attachClerkAuthContext);
router.use(resolveAuthUser);

const getRequestUser = (req) => req.authUser || req.clerkLinkedUser || req.legacyUser || null;

const requireAuth = (req, res, next) => {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  req.authenticatedUser = user;
  next();
};

const requireParentRole = (req, res, next) => {
  const user = req.authenticatedUser || getRequestUser(req);
  if (!user || user.role !== 'parent') {
    return res.status(403).json({ success: false, error: 'Only parent accounts can manage geo-zones' });
  }
  next();
};

const requireParentOrSelfChild = (req, res, next) => {
  const user = req.authenticatedUser || getRequestUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (user.role === 'parent') {
    return next();
  }

  if (user._id && user._id.toString() === req.params.childId) {
    return next();
  }

  return res.status(403).json({ success: false, error: 'Not authorized to view child zones' });
};

router.get('/', requireAuth, requireParentRole, geoFenceController.listChildZones);
router.post('/', requireAuth, requireParentRole, geoFenceController.createZone);
router.put('/:zoneId', requireAuth, requireParentRole, geoFenceController.updateZone);
router.delete('/:zoneId', requireAuth, requireParentRole, geoFenceController.deleteZone);
router.get('/child/:childId', requireAuth, requireParentOrSelfChild, geoFenceController.listZonesForChild);

module.exports = router;
