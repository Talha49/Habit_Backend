const Habit = require('../models/v1/Habit');
const User = require('../models/v1/User');
const CoachNotification = require('../models/v1/CoachNotification');

const ALERT_COOLDOWN_HOURS = 12;
const MAX_NOTIFICATIONS_PER_RUN = 2;
const HIGH_RISK_THRESHOLD = 70;
const MEDIUM_RISK_THRESHOLD = 45;

const hoursSince = date => (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);

const computeRiskScore = habit => {
  let score = 0;
  const now = new Date();

  if (!habit.lastCompletedAt) {
    score += 65;
  } else {
    const hours = hoursSince(habit.lastCompletedAt);
    if (hours >= 24) score += 50;
    else if (hours >= 18) score += 35;
    else if (hours >= 12) score += 20;
  }

  if ((habit.streak || 0) <= 1) score += 15;
  if ((habit.totalCompletions || 0) < 7) score += 10;

  return Math.min(100, score);
};

const getNotificationType = riskScore => {
  if (riskScore >= HIGH_RISK_THRESHOLD) return 'risk_alert';
  if (riskScore >= MEDIUM_RISK_THRESHOLD) return 'reminder';
  return 'suggestion';
};

const buildTemplateMessage = ({ user, habit, riskScore, type }) => {
  if (type === 'risk_alert') {
    return {
      title: 'Streak at Risk',
      message: `${user.fullName}, your "${habit.title}" streak is in danger. Do a quick check-in now to protect your momentum.`,
    };
  }
  if (type === 'reminder') {
    return {
      title: 'Coach Reminder',
      message: `Small step time: complete "${habit.title}" today. A 2-minute action is enough to stay consistent.`,
    };
  }
  return {
    title: 'Coach Suggestion',
    message: `You are building consistency on "${habit.title}". Keep today simple and finish one clear action.`,
  };
};

const shouldSkipDueToCooldown = async (userId, habitId, type) => {
  const latest = await CoachNotification.findOne({ userId, habitId, type }).sort({ createdAt: -1 });
  if (!latest) return false;
  return hoursSince(latest.createdAt) < ALERT_COOLDOWN_HOURS;
};

const createRiskNotification = async ({ user, habit, riskScore }) => {
  const type = getNotificationType(riskScore);
  const skip = await shouldSkipDueToCooldown(user._id, habit._id, type);
  if (skip) return null;

  const template = buildTemplateMessage({ user, habit, riskScore, type });
  return CoachNotification.create({
    userId: user._id,
    habitId: habit._id,
    type,
    title: template.title,
    message: template.message,
    riskScore,
    metadata: {
      habitTitle: habit.title,
      streak: habit.streak || 0,
      totalCompletions: habit.totalCompletions || 0,
    },
  });
};

exports.generateCoachNotificationsForUser = async userId => {
  const user = await User.findById(userId).select('fullName aiConsent');
  if (!user || !user.aiConsent) return [];

  const habits = await Habit.find({ userId, isActive: true }).select(
    'title streak totalCompletions lastCompletedAt isActive'
  );
  if (!habits.length) return [];

  const ranked = habits
    .map(habit => ({ habit, riskScore: computeRiskScore(habit) }))
    .filter(item => item.riskScore >= MEDIUM_RISK_THRESHOLD)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, MAX_NOTIFICATIONS_PER_RUN);

  const created = [];
  for (const item of ranked) {
    // eslint-disable-next-line no-await-in-loop
    const notification = await createRiskNotification({
      user,
      habit: item.habit,
      riskScore: item.riskScore,
    });
    if (notification) created.push(notification);
  }
  return created;
};

exports.runCoachNotificationSweep = async () => {
  const users = await User.find({ aiConsent: true }).select('_id');
  let total = 0;
  for (const user of users) {
    // eslint-disable-next-line no-await-in-loop
    const created = await exports.generateCoachNotificationsForUser(user._id);
    total += created.length;
  }
  return { usersScanned: users.length, notificationsCreated: total };
};
