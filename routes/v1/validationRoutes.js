const express = require('express');
const router  = express.Router();
const {
  getMyValidationLogs,
  getValidationStats,
  getAllFlaggedLogs,
} = require('../../controllers/v1/validationController');
const { requireAuth } = require('../../middleware/requireAuth');

router.use(requireAuth);

// User-facing
router.get('/my-logs', getMyValidationLogs);      // GET /v1/validation/my-logs
router.get('/stats',   getValidationStats);        // GET /v1/validation/stats

// Admin / moderation
router.get('/flagged', getAllFlaggedLogs);          // GET /v1/validation/flagged

module.exports = router;
