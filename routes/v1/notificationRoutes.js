const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/v1/notificationController');
const { requireAuth } = require('../../middleware/requireAuth');

router.use(requireAuth);

router.get('/', notificationController.getNotifications);
router.put('/:notificationId/read', notificationController.markAsRead);

module.exports = router;
