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
    }
}, {
    timestamps: true
});

// Compound index to help find logs for a specific habit in a time range
habitLogSchema.index({ habitId: 1, completedAt: -1 });

module.exports = mongoose.model('HabitLogV1', habitLogSchema);
