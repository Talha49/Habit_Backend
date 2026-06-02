const express = require('express');
const router = express.Router();
const statsController = require('../../controllers/v1/statsController');
const { requireAuth } = require('../../middleware/requireAuth');

// GET /v1/stats/dashboard
router.get('/dashboard', requireAuth, statsController.getDashboardSummary);

// GET /v1/stats/report
router.get('/report', requireAuth, statsController.getPerformanceReport);

// GET /v1/stats/export
router.get('/export', requireAuth, statsController.exportUserData);

module.exports = router;
