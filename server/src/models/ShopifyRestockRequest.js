const mongoose = require('mongoose');

const shopifyRestockRequestSchema = new mongoose.Schema({
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
  shopifyProductId: {
    type: String,
    required: true,
    index: true
  },
  shopifyVariantId: {
    type: String,
    required: true,
    index: true
  },
  productTitle: {
    type: String,
    default: ''
  },
  variantTitle: {
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
    enum: ['shopify_app_proxy', 'api', 'manual'],
    default: 'shopify_app_proxy'
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
  proxyContext: {
    shop: { type: String, default: '' },
    loggedInCustomerId: { type: String, default: '' },
    pathPrefix: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' }
  }
}, {
  timestamps: true
});

shopifyRestockRequestSchema.index({
  tenantId: 1,
  integrationId: 1,
  shopifyVariantId: 1,
  status: 1,
  requestedAt: 1
});

shopifyRestockRequestSchema.index(
  {
    tenantId: 1,
    integrationId: 1,
    storeUrl: 1,
    shopifyVariantId: 1,
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
  mongoose.models.ShopifyRestockRequest ||
  mongoose.model('ShopifyRestockRequest', shopifyRestockRequestSchema);

