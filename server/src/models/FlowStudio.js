const mongoose = require('mongoose');

const flowScreenSchema = new mongoose.Schema({
  id: String,
  title: String,
  type: String,
  summary: String
}, { _id: false });

const flowResponseMappingSchema = new mongoose.Schema({
  sourceField: String,
  targetField: String,
  required: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const publishHistorySchema = new mongoose.Schema({
  version: Number,
  publishedAt: Date,
  note: String
}, { _id: false });

const flowStudioSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    ref: 'Tenant',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    enum: [
      'lead_generation',
      'appointment_booking',
      'customer_support',
      'shopping',
      'survey',
      'registration',
      'custom'
    ],
    default: 'custom'
  },
  templateKey: {
    type: String,
    default: 'custom'
  },
  metaFlowId: {
    type: String,
    default: ''
  },
  meta: {
    syncStatus: {
      type: String,
      enum: ['not_synced', 'draft_created', 'synced', 'published', 'error'],
      default: 'not_synced'
    },
    status: {
      type: String,
      default: ''
    },
    previewUrl: {
      type: String,
      default: ''
    },
    lastSyncedAt: Date,
    lastError: {
      type: String,
      default: ''
    }
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'throttled', 'blocked', 'deprecated'],
    default: 'draft',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  requiresEndpoint: {
    type: Boolean,
    default: true
  },
  linkedPhoneNumberId: {
    type: String,
    default: ''
  },
  version: {
    type: Number,
    default: 0
  },
  lastPublishedAt: Date,
  flowJson: {
    type: String,
    default: ''
  },
  builder: {
    entryScreen: {
      type: String,
      default: 'WELCOME'
    },
    previewMode: {
      type: String,
      enum: ['mobile', 'desktop'],
      default: 'mobile'
    },
    screens: {
      type: [flowScreenSchema],
      default: []
    },
    samplePayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    responseMapping: {
      type: [flowResponseMappingSchema],
      default: []
    }
  },
  endpoint: {
    uri: String,
    method: {
      type: String,
      enum: ['POST', 'GET'],
      default: 'POST'
    },
    healthStatus: {
      type: String,
      enum: ['pending', 'healthy', 'warning', 'error', 'not_required'],
      default: 'pending'
    },
    lastCheckedAt: Date,
    lastLatencyMs: Number,
    lastMessage: String
  },
  analytics: {
    totalSends: {
      type: Number,
      default: 0
    },
    totalCompletions: {
      type: Number,
      default: 0
    },
    totalErrors: {
      type: Number,
      default: 0
    },
    lastSentAt: Date,
    lastCompletedAt: Date
  },
  publishHistory: {
    type: [publishHistorySchema],
    default: []
  },
  createdBy: String,
  updatedBy: String
}, {
  timestamps: true
});

flowStudioSchema.index({ tenantId: 1, isActive: 1, updatedAt: -1 });
flowStudioSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.models.FlowStudio || mongoose.model('FlowStudio', flowStudioSchema);

