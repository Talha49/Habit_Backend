const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['activity', 'rival_alert', 'system', 'chat'],
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    relatedEntity: {
        type: mongoose.Schema.Types.ObjectId,
        // Could be a HabitId, SquadId, or MessageId depending on the type
    },
    entityModel: {
        type: String,
        // E.g., 'HabitV1', 'SquadV1', 'MessageV1'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('NotificationV1', notificationSchema);
