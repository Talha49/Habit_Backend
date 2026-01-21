const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    icon: {
        type: String,
        required: true,
        default: 'trophy' // Ionicons name
    },
    triggerType: {
        type: String,
        enum: ['streak', 'territory_count', 'habit_count', 'total_xp', 'manual'],
        required: true
    },
    triggerValue: {
        type: Number,
        required: true
    },
    xpReward: {
        type: Number,
        default: 50
    }
}, { timestamps: true });

module.exports = mongoose.model('BadgeV1', badgeSchema);
