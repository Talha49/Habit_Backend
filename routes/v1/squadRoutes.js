const express = require('express');
const router = express.Router();
const squadController = require('../../controllers/v1/squadController');
const { requireAuth } = require('../../middleware/requireAuth');

router.use(requireAuth);

router.post('/', squadController.createSquad);
router.post('/join', squadController.joinSquad);
router.post('/leave', squadController.leaveSquad);
router.get('/me', squadController.getMySquad);
router.get('/leaderboard', squadController.getLeaderboard);

module.exports = router;
