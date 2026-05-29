const User = require('../../models/v1/User');
const Habit = require('../../models/v1/Habit');
const CoachNotification = require('../../models/v1/CoachNotification');
const aiCoachingService = require('../../services/aiCoachingService');
const { generateCoachNotificationsForUser } = require('../../services/coachAgentService');

// Update AI Consent
exports.updateConsent = async (req, res) => {
  try {
    const { consent } = req.body;
    const userId = req.user.id; // from clerkAuth middleware

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.aiConsent = !!consent;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'AI Coaching consent updated',
      data: { aiConsent: user.aiConsent }
    });
  } catch (error) {
    console.error('❌ Update consent error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Get AI Insights
exports.getInsights = async (req, res) => {
  try {
    const userId = req.user.id;
    const forceFresh = req.query.forceFresh === 'true';

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.aiConsent) {
      return res.status(403).json({ 
        success: false, 
        error: 'Consent required', 
        message: 'You must grant consent to use AI Coaching.' 
      });
    }

    // Fetch user's active habits
    const habits = await Habit.find({ userId, isActive: true });

    // Call AI service (optionally bypass cache for fresh generation)
    const insights = await aiCoachingService.generateInsights(user, habits, { forceFresh });

    res.status(200).json({
      success: true,
      data: insights
    });
  } catch (error) {
    console.error('❌ Get insights error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate AI insights' });
  }
};

// Chat with AI Coach
exports.chatWithCoach = async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.aiConsent) {
      return res.status(403).json({
        success: false,
        error: 'Consent required',
        message: 'You must grant consent to use AI Coaching.',
      });
    }

    const habits = await Habit.find({ userId, isActive: true });
    const reply = await aiCoachingService.chatWithCoach(user, habits, message.trim(), history);

    res.status(200).json({
      success: true,
      data: { reply },
    });
  } catch (error) {
    console.error('❌ Chat with coach error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get coach reply' });
  }
};

// Get coach notifications
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    // Opportunistically generate fresh notifications when user opens coach view.
    await generateCoachNotificationsForUser(userId);

    const notifications = await CoachNotification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error('❌ Get coach notifications error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get coach notifications' });
  }
};

// Mark one notification as read
exports.markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notification = await CoachNotification.findOneAndUpdate(
      { _id: id, userId },
      { status: 'read' },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error('❌ Mark coach notification read error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
};
