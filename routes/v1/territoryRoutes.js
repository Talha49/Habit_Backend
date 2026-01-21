const express = require('express');
const router = express.Router();
const territoryController = require('../../controllers/v1/territoryController');

// GET /v1/territories - Get territories by location and category
router.get('/', territoryController.getTerritories);

// GET /v1/territories/:cellId - Get single territory by cell ID
router.get('/:cellId', territoryController.getTerritoryByCellId);

// POST /v1/territories/claim - Claim a territory
router.post('/claim', territoryController.claimTerritory);

// POST /v1/territories/release - Release a territory
router.post('/release', territoryController.releaseTerritory);

// POST /v1/territories/activity - Update territory activity
router.post('/activity', territoryController.updateActivity);

// GET /v1/territories/:cellId/history - Get territory history
router.get('/:cellId/history', territoryController.getTerritoryHistory);

module.exports = router;
