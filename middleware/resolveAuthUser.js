const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/v1/User');

module.exports = async function resolveAuthUser(req, _res, next) {
  try {
    if (req.clerkLinkedUser && !req.authUser) {
      req.authUser = req.clerkLinkedUser;
      req.authSource = 'clerk';
      return next();
    }

    const authHeader = req.headers?.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next();
    }

    const payload = jwt.verify(token, config.JWT_SECRET);
    if (!payload?.sub) {
      return next();
    }

    const user = await User.findById(payload.sub);
    if (user) {
      req.legacyUser = user;
      req.authUser = user;
      req.authSource = 'legacy';
    }
  } catch (error) {
    console.warn('⚠️ resolveAuthUser: failed to resolve auth user:', error.message);
  } finally {
    next();
  }
};






