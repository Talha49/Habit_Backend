const mongoose = require('mongoose');

const userLinkSchema = new mongoose.Schema({
  linkType: {
    type: String,
    enum: ['parent-child', 'doctor-patient'],
    required: true,
    index: true
  },
  initiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true,
    index: true
  },
  linkedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    default: null,
    index: true
  },
  inviteCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'revoked', 'expired'],
    default: 'pending',
    index: true
  },
  expiresAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  notes: { type: String, default: null, trim: true },
  metadata: {
    type: Map,
    of: String,
    default: {}
  }
}, {
  timestamps: true
});

userLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UserLinkV1', userLinkSchema);

