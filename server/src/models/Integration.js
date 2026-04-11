const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true
  },
  storeType: {
    type: String,
    required: true,
    enum: ['shopify', 'woocommerce']
  },
  storeUrl: {
    type: String,
    required: true
  },
  apiKey: {
    type: String,
    required: function () {
      return this.storeType === 'woocommerce';
    },
    default: null
  },
  apiSecret: {
    type: String,
    required: function () {
      return this.storeType === 'woocommerce';
    },
    default: null
  },
  adminAccessToken: {
    type: String,
    default: null
  },
  webhookSecret: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isMessageEnabled: {
    type: Boolean,
    default: true
  },
  isAbandonedCartEnabled: {
    type: Boolean,
    default: false
  },
  abandonedCartDelay: {
    type: Number,
    default: 30
  },
  isDispatchedMessageEnabled: {
    type: Boolean,
    default: true
  },
  isRestockEnabled: {
    type: Boolean,
    default: false
  },
  restockTemplateName: {
    type: String,
    default: ''
  },
  restockTemplateLanguage: {
    type: String,
    default: 'en'
  },
  restockNotificationMode: {
    type: String,
    enum: ['available_quantity', 'fixed_cap'],
    default: 'available_quantity'
  },
  restockFixedCap: {
    type: Number,
    default: 30
  },
  restockCtaLabel: {
    type: String,
    default: 'Request stock'
  },
  restockPhonePlaceholder: {
    type: String,
    default: 'Enter your WhatsApp number'
  },
  restockSuccessDescription: {
    type: String,
    default: 'Get notified on WhatsApp when the product comes back in stock'
  },
  restockDefaultCountry: {
    type: String,
    default: 'IN'
  },
  connectedVia: {
    type: String,
    enum: ['admin_token', 'oauth'],
    default: 'admin_token'
  },
  shopifyScopes: {
    type: [String],
    default: []
  },
  shopifyWebhookSubscriptions: [{
    topic: { type: String },
    webhookId: { type: String },
    address: { type: String }
  }],
  shopifyWebhookStatus: {
    status: {
      type: String,
      enum: ['pending', 'success', 'partial', 'error'],
      default: 'pending'
    },
    lastAttemptAt: {
      type: Date,
      default: null
    },
    lastSuccessAt: {
      type: Date,
      default: null
    },
    lastErrorCode: {
      type: String,
      default: ''
    },
    lastErrorMessage: {
      type: String,
      default: ''
    },
    requiresProtectedCustomerData: {
      type: Boolean,
      default: false
    }
  },
  apiConfig: {
    version: {
      type: String,
      default: '2024-10'
    },
    lastVerified: {
      type: Date
    }
  }
}, {
  timestamps: true
});

integrationSchema.index({ tenantId: 1 });

module.exports = mongoose.model('Integration', integrationSchema);
