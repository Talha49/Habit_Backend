const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');
const config = require('../config');
const {
  getClerkUser,
  linkOrCreateUserFromClerk,
} = require('../services/v1/clerkService');

const noopMiddleware = (_req, _res, next) => next();

const clerkMiddleware = config.CLERK_SECRET_KEY
  ? ClerkExpressWithAuth({
      secretKey: config.CLERK_SECRET_KEY,
    })
  : noopMiddleware;

const attachClerkAuthContext = async (req, _res, next) => {
  try {
    if (req.auth?.userId) {
      req.clerkUserId = req.auth.userId;
      req.clerkSessionId = req.auth.sessionId;

      const clerkUser = await getClerkUser(req.clerkUserId);
      if (clerkUser) {
        req.clerkUser = clerkUser;

        const { user, matchType, wasLinked, wasCreated } = await linkOrCreateUserFromClerk(clerkUser);
        if (user) {
          req.clerkLinkedUser = user;
          req.clerkLinkMatchType = matchType;
          req.clerkLinkWasLinked = wasLinked;
          req.clerkLinkWasCreated = wasCreated;
        }
      }
    }
  } catch (error) {
    console.error('❌ Clerk middleware context attachment failed:', error.message);
  } finally {
    next();
  }
};

module.exports = {
  clerkMiddleware,
  attachClerkAuthContext,
};

