const express = require('express');
const router = express.Router();
const coachingController = require('../../controllers/v1/coachingController');
const { requireAuth } = require('../../middleware/requireAuth');

// POST /v1/coaching/consent - Update AI coaching consent
router.post('/consent', requireAuth, coachingController.updateConsent);

// GET /v1/coaching/insight - Get real-time AI insights
router.get('/insight', requireAuth, coachingController.getInsights);

// POST /v1/coaching/chat - Chat with AI coach
router.post('/chat', requireAuth, coachingController.chatWithCoach);

// GET /v1/coaching/notifications - In-app coach alerts/reminders
router.get('/notifications', requireAuth, coachingController.getNotifications);

// PATCH /v1/coaching/notifications/:id/read - Mark notification as read
router.patch('/notifications/:id/read', requireAuth, coachingController.markNotificationRead);

module.exports = router;
