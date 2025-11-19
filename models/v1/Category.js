const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  description: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  icon: { 
    type: String, 
    required: true,
    trim: true
  },
  color: { 
    type: String, 
    required: true,
    trim: true,
    match: /^#[0-9A-F]{6}$/i // Hex color validation
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  sortOrder: { 
    type: Number, 
    default: 0 
  }
}, { 
  timestamps: true 
});

// Index for efficient queries
categorySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('CategoryV1', categorySchema);
