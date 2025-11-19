const mongoose = require('mongoose');

const geoFenceLogSchema = new mongoose.Schema({
  child: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true,
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true,
  },
  eventType: {
    type: String,
    enum: ['exit', 'return', 'assigned'],
    required: true,
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  triggeredAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: true });

geoFenceLogSchema.index({ location: '2dsphere' });
geoFenceLogSchema.index({ child: 1, triggeredAt: -1 });

module.exports = mongoose.model('GeoFenceLog', geoFenceLogSchema);
