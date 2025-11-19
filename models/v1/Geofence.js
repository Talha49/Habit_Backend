const mongoose = require('mongoose');

const geoFenceSchema = new mongoose.Schema({
  child: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true,
    index: true,
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true,
    index: true,
  },
  name: {
    type: String,
    trim: true,
    default: 'Approved Zone',
  },
  center: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (coords) => Array.isArray(coords) && coords.length === 2,
        message: 'Center must have [longitude, latitude] coordinates',
      },
    },
  },
  radiusMeters: {
    type: Number,
    min: 50,
    max: 5000,
    required: true,
  },
  createdBy: {
    type: String,
    enum: ['parent', 'system'],
    default: 'parent',
  },
  active: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

geoFenceSchema.index({ center: '2dsphere' });
geoFenceSchema.index({ child: 1, active: 1 });

module.exports = mongoose.model('GeoFence', geoFenceSchema);






