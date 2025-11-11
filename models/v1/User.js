const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  professional: { type: String, required: true, trim: true },
  role: {
    type: String,
    enum: ['child', 'parent', 'doctor', 'standard'],
    default: 'standard',
    index: true
  },
  verifiedAt: { type: Date, default: null },
  verificationMethod: {
    type: String,
    enum: ['otp', 'manual', 'admin'],
    default: null
  },
  // OTP related fields
  otp: { type: String },
  otpExpiry: { type: Date },
  otpCooldown: { type: Date }, // Prevents spam requests
  isVerified: { type: Boolean, default: false },
  loginAttempts: { type: Number, default: 0 },
  lastLoginAttempt: { type: Date },
  resetInProgress: { type: Boolean, default: false },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  refreshTokens: [{
    tokenHash: { type: String, required: true },
    userAgent: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  }]
}, { timestamps: true });

// Index for OTP expiry cleanup
userSchema.index({ otpExpiry: 1 }, { expireAfterSeconds: 0 });
userSchema.index({ passwordResetExpires: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UserV1', userSchema);
