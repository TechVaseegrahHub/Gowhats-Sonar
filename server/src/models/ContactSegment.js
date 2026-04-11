const mongoose = require('mongoose');

const contactSegmentSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  filterCriteria: {
    orderStatus: {
      type: [String],
      enum: ['completed', 'pending', 'cancelled', 'processing']
    },
    contactAge: {
      type: String,
      enum: ['new', 'recent', 'old']
    },
    lastMessageDays: Number,
    hasOrders: Boolean,
    source: {
      type: [String],
      enum: ['whatsapp', 'manual', 'imported']
    },
    tags: [String],
    dateRange: {
      start: Date,
      end: Date
    }
  },
  contactCount: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

contactSegmentSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ContactSegment', contactSegmentSchema);
