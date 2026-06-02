const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
    emoji: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserV1', required: true }
}, { _id: false });

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1',
        required: true,
        index: true
    },
    // For 1-on-1 Professional chat
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1',
        index: true
    },
    // For Squad group chat
    squadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SquadV1',
        index: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    messageType: {
        type: String,
        enum: ['text', 'image', 'system'],
        default: 'text'
    },
    reactions: [reactionSchema],
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1'
    }]
}, {
    timestamps: true
});

// Ensure a message belongs to either a direct conversation or a squad
messageSchema.pre('save', function (next) {
    if (!this.receiver && !this.squadId) {
        return next(new Error('A message must have either a receiver or a squadId.'));
    }
    if (this.receiver && this.squadId) {
        return next(new Error('A message cannot have both a receiver and a squadId.'));
    }
    next();
});

module.exports = mongoose.model('MessageV1', messageSchema);
