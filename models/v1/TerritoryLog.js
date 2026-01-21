const mongoose = require('mongoose');

const territoryLogSchema = new mongoose.Schema({
    territoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TerritoryV1',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserV1',
        required: true
    },
    action: {
        type: String,
        enum: ['claim', 'release', 'decay', 'steal', 'lock'],
        required: true
    },
    details: {
        type: String,
        default: ''
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('TerritoryLog', territoryLogSchema);
