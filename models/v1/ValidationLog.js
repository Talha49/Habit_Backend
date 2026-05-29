const mongoose = require('mongoose');

const validationLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true,
    index: true,
  },
  habitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HabitV1',
    required: true,
    index: true,
  },
  habitLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HabitLogV1',
    default: null,
  },
  // The type of check that failed or passed
  checkType: {
    type: String,
    enum: ['gps_validation', 'timer_validation', 'anomaly_detection', 'integrity_check'],
    required: true,
  },
  // The result
  status: {
    type: String,
    enum: ['passed', 'flagged', 'failed'],
    required: true,
    index: true,
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  // GPS snapshot at check-in time
  gpsData: {
    lat: Number,
    lon: Number,
    accuracy: Number, // in metres
    provider: String, // 'gps', 'network', 'fused'
    mockedLocation: Boolean,
  },
  // Timer data snapshot
  timerData: {
    requiredSeconds: Number,
    elapsedSeconds: Number,
    startedAt: Date,
    completedAt: Date,
  },
  // Anomaly detail
  anomalyData: {
    prevLat: Number,
    prevLon: Number,
    prevCompletedAt: Date,
    distanceKm: Number,
    timeElapsedSeconds: Number,
    speedKph: Number,
    humanSpeedLimitKph: Number,
  },
}, { timestamps: true });

validationLogSchema.index({ userId: 1, createdAt: -1 });
validationLogSchema.index({ habitId: 1, status: 1 });

module.exports = mongoose.model('ValidationLogV1', validationLogSchema);
