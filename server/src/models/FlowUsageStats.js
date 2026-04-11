// models/FlowUsageStats.js
const mongoose = require('mongoose');

const flowUsageStatsSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true
  },
  flowType: {
    type: String,
    required: true,
    enum: ['order_completion', 'customer_support', 'feedback', 'generic']
  },
  count: {
    type: Number,
    default: 0
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for efficient queries
flowUsageStatsSchema.index({ tenantId: 1, date: 1, flowType: 1 }, { unique: true });

module.exports = mongoose.model('FlowUsageStats', flowUsageStatsSchema);