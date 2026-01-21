const mongoose = require('mongoose');

const habitSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CategoryV1',
        required: true
    },
    frequency: {
        type: String,
        enum: ['daily', 'weekly'],
        default: 'daily'
    },
    streak: {
        type: Number,
        default: 0
    },
    bestStreak: {
        type: Number,
        default: 0
    },
    totalCompletions: {
        type: Number,
        default: 0
    },
    lastCompletedAt: {
        type: Date,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('HabitV1', habitSchema);
