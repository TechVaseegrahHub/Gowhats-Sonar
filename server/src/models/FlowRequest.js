// models/FlowRequest.js
const mongoose = require('mongoose');

const flowRequestSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['INIT', 'data_exchange', 'BACK', 'health_check', 'error_notification', 'unknown'],
    default: 'unknown'
  },
  screen: {
    type: String,
    default: ''
  },
  action: {
    type: String,
    default: ''
  },
  flow_token: {
    type: String,
    default: ''
  },
  phoneNumber: {
    type: String,
    default: ''
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: String,
  headers: {
    type: Object,
    default: {}
  },
  body: {
    type: Object,
    default: {}
  },
  decryptedData: {
    type: Object,
    default: {}
  },
  response: {
    type: Object,
    default: {}
  },
  error: {
    type: String,
    default: ''
  },
  processingTime: {
    type: Number,
    default: 0
  },
  success: {
    type: Boolean,
    default: true
  }
});

// Create indexes for better query performance
flowRequestSchema.index({ tenantId: 1, receivedAt: -1 });
flowRequestSchema.index({ tenantId: 1, type: 1 });
flowRequestSchema.index({ flow_token: 1 });

module.exports = mongoose.model('FlowRequest', flowRequestSchema);