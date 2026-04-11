const mongoose = require('mongoose');

const wooCommerceRestockRequestSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  integrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Integration',
    required: true,
    index: true
  },
  storeUrl: {
    type: String,
    required: true,
    index: true
  },
  wooProductId: {
    type: String,
    required: true,
    index: true
  },
  wooVariationId: {
    type: String,
    default: '',
    index: true
  },
  productTitle: {
    type: String,
    default: ''
  },
  variationTitle: {
    type: String,
    default: ''
  },
  productUrl: {
    type: String,
    default: ''
  },
  productImageUrl: {
    type: String,
    default: ''
  },
  customerName: {
    type: String,
    default: ''
  },
  rawPhoneNumber: {
    type: String,
    required: true
  },
  normalizedPhoneNumber: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'notified', 'cancelled'],
    default: 'pending',
    index: true
  },
  source: {
    type: String,
    enum: ['woocommerce_plugin', 'api', 'manual'],
    default: 'woocommerce_plugin'
  },
  requestedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  processingStartedAt: {
    type: Date,
    default: null
  },
  notifiedAt: {
    type: Date,
    default: null
  },
  dispatchBatchId: {
    type: String,
    default: null
  },
  templateName: {
    type: String,
    default: ''
  },
  templateLanguage: {
    type: String,
    default: 'en'
  },
  messageId: {
    type: String,
    default: null
  },
  attemptCount: {
    type: Number,
    default: 0
  },
  lastAttemptAt: {
    type: Date,
    default: null
  },
  lastError: {
    type: String,
    default: ''
  },
  requestContext: {
    siteUrl: { type: String, default: '' },
    pluginVersion: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' }
  }
}, {
  timestamps: true
});

wooCommerceRestockRequestSchema.index({
  tenantId: 1,
  integrationId: 1,
  wooProductId: 1,
  wooVariationId: 1,
  status: 1,
  requestedAt: 1
});

wooCommerceRestockRequestSchema.index(
  {
    tenantId: 1,
    integrationId: 1,
    storeUrl: 1,
    wooProductId: 1,
    wooVariationId: 1,
    normalizedPhoneNumber: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending'
    }
  }
);

module.exports =
  mongoose.models.WooCommerceRestockRequest ||
  mongoose.model('WooCommerceRestockRequest', wooCommerceRestockRequestSchema);

