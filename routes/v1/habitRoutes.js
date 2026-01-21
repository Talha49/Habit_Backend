const express = require('express');
const router = express.Router();
const {
    createHabit,
    getHabits,
    checkIn,
    deleteHabit
} = require('../../controllers/v1/habitController');
const { requireAuth } = require('../../middleware/requireAuth');

// All routes require authentication
router.use(requireAuth);

router.post('/', createHabit);
router.get('/', getHabits);
router.post('/:id/check-in', checkIn);
router.delete('/:id', deleteHabit);

module.exports = router;
