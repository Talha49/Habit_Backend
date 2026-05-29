const mongoose = require('mongoose');

const squadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    unique: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CategoryV1',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserV1'
  }],
  totalXP: {
    type: Number,
    default: 0
  },
  contributions: {
    // Maps userId (string) → XP contributed to this squad
    type: Map,
    of: Number,
    default: {}
  },
  inviteCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

squadSchema.index({ totalXP: -1 });
squadSchema.index({ categoryId: 1, totalXP: -1 });

module.exports = mongoose.model('Squad', squadSchema);
