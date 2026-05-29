const mongoose = require('mongoose');

const coachNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true,
    index: true,
  },
  habitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HabitV1',
    default: null,
    index: true,
  },
  type: {
    type: String,
    enum: ['risk_alert', 'reminder', 'suggestion'],
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  status: {
    type: String,
    enum: ['unread', 'read'],
    default: 'unread',
    index: true,
  },
  metadata: {
    type: Object,
    default: {},
  },
}, { timestamps: true });

coachNotificationSchema.index({ userId: 1, createdAt: -1 });
coachNotificationSchema.index({ userId: 1, habitId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('CoachNotificationV1', coachNotificationSchema);
