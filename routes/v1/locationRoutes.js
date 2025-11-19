const express = require('express');
const router = express.Router();
const locationController = require('../../controllers/v1/locationController');
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
    return res.status(403).json({ success: false, error: 'Only parent accounts can view geo-zone alerts' });
  }
  next();
};

const requireChildOrParent = (req, res, next) => {
  const user = req.authenticatedUser || getRequestUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  if (user.role === 'parent') {
    return next();
  }
  if (user.role === 'child' && user._id.toString() === req.body?.userId) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Not authorized to submit location updates for this child' });
};

router.post('/track', requireAuth, requireChildOrParent, locationController.trackChildLocation);
router.get('/alerts', requireAuth, requireParentRole, locationController.listGeoFenceAlerts);

module.exports = router;
