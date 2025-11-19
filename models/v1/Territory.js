const mongoose = require('mongoose');

const territorySchema = new mongoose.Schema({
  cellId: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  categoryId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CategoryV1',
    required: true
  },
  claimedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'UserV1',
    default: null
  },
  status: { 
    type: String, 
    enum: ['unclaimed', 'claimed', 'contested'],
    default: 'unclaimed'
  },
  claimDate: { 
    type: Date, 
    default: null
  },
  lastActivity: { 
    type: Date, 
    default: Date.now
  },
  activityCount: { 
    type: Number, 
    default: 0
  },
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude] for GeoJSON
      required: true
    }
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true 
});

// Indexes for efficient queries
territorySchema.index({ categoryId: 1, status: 1 });
territorySchema.index({ claimedBy: 1 });
territorySchema.index({ coordinates: '2dsphere' }); // Geospatial index
territorySchema.index({ lastActivity: -1 });

module.exports = mongoose.model('TerritoryV1', territorySchema);
