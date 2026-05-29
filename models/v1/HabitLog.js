const mongoose = require('mongoose');

const habitLogSchema = new mongoose.Schema({
    habitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HabitV1',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1',
        required: true,
        index: true
    },
    completedAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    timezone: {
        type: String, // e.g., 'Asia/Karachi'
        default: 'UTC'
    },
    // Anti-Cheating: validation status for this log entry
    validationStatus: {
        type: String,
        enum: ['pending', 'verified', 'flagged'],
        default: 'pending',
        index: true,
    },
    // Anti-Cheating: GPS snapshot sent by client
    gpsData: {
        lat: Number,
        lon: Number,
        accuracy: Number,       // metres – lower = more precise
        provider: String,       // 'gps' | 'network' | 'fused'
        mockedLocation: { type: Boolean, default: false },
    },
    // Anti-Cheating: timer data (for timed habits)
    timerData: {
        requiredSeconds: { type: Number, default: 0 },
        elapsedSeconds:  { type: Number, default: 0 },
        startedAt:       Date,
    }
}, {
    timestamps: true
});

// Compound index to help find logs for a specific habit in a time range
habitLogSchema.index({ habitId: 1, completedAt: -1 });

module.exports = mongoose.model('HabitLogV1', habitLogSchema);
