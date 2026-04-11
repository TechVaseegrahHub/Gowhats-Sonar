// models/FlowResponse.js
const mongoose = require('mongoose');

const flowResponseSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FlowRequest'
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  responsePayload: Object,
  sentAt: {
    type: Date,
    default: Date.now
  },
  processingTime: Number
}, { timestamps: true });

// ✅ FIX: Export FlowResponse only, and use the safe check
module.exports = mongoose.models.FlowResponse || mongoose.model('FlowResponse', flowResponseSchema);
