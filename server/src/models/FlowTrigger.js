const mongoose = require('mongoose');

const flowTriggerSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  triggerWord: {
    type: String,
    required: true,
    trim: true
  },
  keywords: {
    type: [String],
    default: []
  },
  flowId: {
    type: String,
    required: true,
    trim: true
  },
  flowName: {
    type: String,
    default: '',
    trim: true
  },
  messageText: {
    type: String,
    default: 'Please fill out the form below.',
    trim: true
  },
  buttonLabel: {
    type: String,
    default: 'Open Flow',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastTriggeredAt: Date,
  lastTriggeredBy: {
    type: String,
    default: '',
    trim: true
  },
  createdBy: {
    type: String,
    default: '',
    trim: true
  },
  updatedBy: {
    type: String,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

flowTriggerSchema.index({ tenantId: 1, isActive: 1, updatedAt: -1 });
flowTriggerSchema.index({ tenantId: 1, flowId: 1 });
flowTriggerSchema.index({ tenantId: 1, keywords: 1 });

module.exports = mongoose.models.FlowTrigger || mongoose.model('FlowTrigger', flowTriggerSchema);

