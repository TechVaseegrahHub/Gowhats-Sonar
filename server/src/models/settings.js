const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, unique: true, index: true },

  // Catalog Configuration
  catalogId:    { type: String, default: '' },
  catalogName:  { type: String, default: '' },
  category:     { type: String, default: '' },
  description:  { type: String, default: '' },
  address:      { type: String, default: '' },
  email:        { type: String, default: '' },
  website:      { type: String, default: '' },

  // COMPLETE AUTOMATION CONFIGURATION
  automationConfig: {

    // 1. ORDER FLOW
    orderFlow: {
      enabled:     { type: Boolean, default: false },
      flowId:      { type: String,  default: '' },
      autoTrigger: { type: Boolean, default: true },
      template: {
        header:  { type: String, default: '' },
        body:    { type: String, default: '' },
        footer:  { type: String, default: '' },
        ctaText: { type: String, default: '' }
      }
    },

    // 2. ORDER CONFIRMATION
    orderConfirmation: {
      enabled:  { type: Boolean, default: true },
      template: {
        body: { type: String, default: '' }
      }
    },

    // 3. PAYMENT REQUEST  ← UPDATED: added paymentGateway, stripeConfig, cashfreeConfig
    paymentRequest: {
      enabled: { type: Boolean, default: true },

      // ── Which gateway is active for this tenant ──────────
      paymentGateway: {
        type:    String,
        enum:    ['razorpay', 'stripe', 'cashfree', 'hitpay'],
        default: 'razorpay'
      },

      // ── Razorpay ─────────────────────────────────────────
      paymentConfigurationName: { type: String, default: '' },

      // ── Stripe (per-tenant credentials) ──────────────────
      stripeConfig: {
        secretKey:     { type: String, default: '' },  // sk_live_… or sk_test_…
        webhookSecret: { type: String, default: '' },  // whsec_…
        currency:      { type: String, default: 'inr' },
        successUrl:    { type: String, default: '' },
        cancelUrl:     { type: String, default: '' },
      },

      // ── Cashfree (per-tenant credentials) ────────────────
      cashfreeConfig: {
        clientId:                 { type: String, default: '' },
        clientSecret:             { type: String, default: '' },
        environment:              { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
        merchantVpa:              { type: String, default: '' },
        paymentConfigurationName: { type: String, default: '' },
        notifyUrl:                { type: String, default: '' },
        currency:                 { type: String, default: 'INR' },
      },

	// ── HitPay (per-tenant credentials) ──────────────────
	hitpayConfig: {
	  apiKey:      { type: String, default: '' },
	  webhookSalt: { type: String, default: '' },
	  environment: { type: String, enum: ['sandbox', 'production'], default: 'production' },
	  currency:    { type: String, default: 'SGD' },
	  successUrl:  { type: String, default: '' },
	},

      // ── Shared message template ───────────────────────────
      template: {
        header: { type: String, default: '' },
        body:   { type: String, default: '' },
        footer: { type: String, default: '' }
      }
    },

    // 4. SHIPPING UPDATE
    shippingUpdate: {
      enabled:  { type: Boolean, default: true },
      template: {
        body: { type: String, default: '' }
      }
    },

    // 5. SHIPPING SELECTION
    shippingSelection: {
      enabled: { type: Boolean, default: true },
      selectionMode: {
        type:    String,
        enum:    ['auto', 'customer_choice'],
        default: 'auto'
      },
      courierListTemplate: {
        header: { type: String, default: '🚚 Choose Courier' },
        body:   { type: String, default: 'Hi {{name}}! Please select your preferred courier.' },
        footer: { type: String, default: 'Select your preferred option' }
      },
      freeShippingTemplate: {
        body: { type: String, default: '🎉 Your order qualifies for FREE SHIPPING!' }
      }
    },

    // 6. TRACKING SHEET
    trackingSheet: {
      enabled:                { type: Boolean, default: false },
      spreadsheetId:          { type: String,  default: '' },
      range:                  { type: String,  default: 'Sheet1!A:Z' },
      pollIntervalMinutes:    { type: Number,  default: 1, min: 1, max: 60 },
      autoCreateMissingOrder: { type: Boolean, default: true },
      lastSyncedAt:           { type: Date,    default: null },
      lastSyncSummary:        { type: String,  default: '' },
      lastSyncError:          { type: String,  default: '' }
    },

    // 7. ABANDONED CART
    abandonedCart: {
      enabled:      { type: Boolean, default: true },
      delayMinutes: { type: Number,  default: 30 },
      buttonLink:   { type: String,  default: '' },
      template: {
        header:  { type: String, default: '⏳ Forgotten Items?' },
        body:    { type: String, default: 'Hi! You left items in your cart. Complete your order now before they run out.' },
        footer:  { type: String, default: "Don't miss out!" },
        ctaText: { type: String, default: 'Shop Now' }
      }
    },

    // 8. INVENTORY LOW STOCK ALERTS
    inventoryAlerts: {
      enabled:          { type: Boolean, default: true },
      threshold:        { type: Number,  default: 10, min: 1, max: 1000 },
      templateName:     { type: String,  default: 'low_stock_alertt' },
      templateLanguage: { type: String,  default: 'en' },
      messageTemplate: {
        type:    String,
        default: 'Low stock alert: {{productName}} ({{retailerId}}) is now at {{currentStock}} units. Alert threshold is {{threshold}}. Please restock soon.'
      },
      ceoPhone:   { type: String, default: '' },
      adminPhone: { type: String, default: '' }
    },

    // 9. ORDER ID CONFIG
    orderIdConfig: {
      prefix:        { type: String, default: 'ORD' },
      startSequence: { type: Number, default: 1000 }
    }

  }, // ← automationConfig ends here

  // 10. DAILY SALES ALERT (top-level, NOT inside automationConfig)
  dailySalesAlert: {
    enabled:      { type: Boolean, default: false },
    sendTime:     { type: String,  default: '20:00' },
    lastSentDate: { type: String,  default: '' },
    contacts: [{
      label: { type: String, default: 'Admin' },
      phone: { type: String, default: '' }
    }]
  },

  // Printing Configuration
  printingConfig: {
    fromAddress: {
      name:     { type: String, default: '' },
      address1: { type: String, default: '' },
      address2: { type: String, default: '' },
      city:     { type: String, default: '' },
      state:    { type: String, default: '' },
      zipCode:  { type: String, default: '' },
      phone:    { type: String, default: '' }
    },
    labelFormat: { type: String, enum: ['thermal', 'thermal6', 'a4'], default: 'thermal' },
    printerConnection: {
      type: {
        type: String,
        enum: ['browser', 'network', 'bluetooth', 'usb'],
        default: 'browser'
      },
      network: {
        host: { type: String, default: '' },
        port: { type: Number, default: 9100 }
      },
      paperWidth: {
        type: String,
        enum: ['58mm', '80mm', '4x4', '4x6', 'a4'],
        default: '4x4'
      },
      autoPrintOnSale: { type: Boolean, default: false },
      printMode: {
        type: String,
        enum: ['pdf', 'graphical', 'text'],
        default: 'pdf'
      },
      lastSelectedAt: { type: Date, default: null },
      status: { type: String, default: 'Not configured' },
      deviceLabel: { type: String, default: '' },
      lastTestedAt: { type: Date, default: null }
    }
  },

  // AI Configuration
  aiConfig: {
    provider: {
      type:    String,
      enum:    ['openai', 'deepseek', 'claude', 'grok', 'ai_studio'],
      default: 'openai'
    },
    apiKey:                    { type: String,  default: '' },
    baseUrl:                   { type: String,  default: '' },
    chatModel:                 { type: String,  default: '' },
    visionModel:               { type: String,  default: '' },
    embeddingModel:            { type: String,  default: '' },
    productImageFetchEnabled:  { type: Boolean, default: false },
    cloudinaryImageUploadEnabled: { type: Boolean, default: false }
},

  fieldMapping: { type: Map, of: String },

  // Legacy Flow Config (kept for backward compatibility)
  flowConfig: {
    orderCompletionFlowId:    { type: String,  default: '' },
    enableFlowMessages:       { type: Boolean, default: false },
    autoSendOrderFlow:        { type: Boolean, default: true },
    flowEndpointUrl:          { type: String,  default: '' },
    lastFlowUpdate:           { type: Date,    default: Date.now },
    flowMessage:              { type: mongoose.Schema.Types.Mixed, default: {} },
    fieldMapping:             { type: mongoose.Schema.Types.Mixed, default: {} },
    paymentConfigurationName: { type: String,  default: '' }
  }

}, { timestamps: true });

// Pre-save hook to ensure flowConfig objects are valid
settingsSchema.pre('save', function (next) {
  if (!this.flowConfig)               this.flowConfig = {};
  if (!this.flowConfig.flowMessage)   this.flowConfig.flowMessage = {};
  if (!this.flowConfig.fieldMapping)  this.flowConfig.fieldMapping = {};
  next();
});

module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
