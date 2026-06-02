const express = require('express');
const router = express.Router();
const chatController = require('../../controllers/v1/chatController');
const { requireAuth } = require('../../middleware/requireAuth');

router.use(requireAuth);

router.get('/squad/:squadId', chatController.getSquadMessages);
router.get('/direct/:targetUserId', chatController.getDirectMessages);
router.post('/send', chatController.sendMessage);
router.post('/:messageId/react', chatController.addReaction);

module.exports = router;
