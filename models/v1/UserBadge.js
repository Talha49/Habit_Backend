const mongoose = require('mongoose');

const userBadgeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1',
        required: true,
        index: true
    },
    badgeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BadgeV1',
        required: true
    },
    earnedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Ensure a user earns a badge only once
userBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });

module.exports = mongoose.model('UserBadgeV1', userBadgeSchema);
