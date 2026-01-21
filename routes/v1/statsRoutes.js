const express = require('express');
const router = express.Router();
const statsController = require('../../controllers/v1/statsController');
const { requireAuth } = require('../../middleware/requireAuth');

// GET /v1/stats/dashboard
router.get('/dashboard', requireAuth, statsController.getDashboardSummary);

module.exports = router;
