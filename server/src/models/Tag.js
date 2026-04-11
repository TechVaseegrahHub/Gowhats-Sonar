// models/Tag.js - Match your existing data structure
const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  tenantId: { 
    type: String, // ✅ CHANGE: Your data uses UUID strings, not ObjectId
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Tag name is required'],
    trim: true
  },
  color: {
    type: String,
    required: [true, 'Tag color is required'],
    default: '#3B82F6'
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['customer', 'lead', 'support', 'sales', 'marketing', 'other'],
    default: 'other'
  },
  contactCount: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true 
});

// Indexes
tagSchema.index({ tenantId: 1, name: 1 }, { unique: true });
tagSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model("Tag", tagSchema);
