const resolveAuthUser = require('./resolveAuthUser');

const requireAuth = (req, res, next) => {
    // Use resolveAuthUser to populate req.authUser
    resolveAuthUser(req, res, () => {
        if (!req.authUser) {
            return res.status(401).json({ success: false, error: 'Unauthorized access' });
        }
        // Set req.user to be consistent with controllers expecting it
        req.user = req.authUser;
        next();
    });
};

module.exports = { requireAuth };
