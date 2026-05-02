// models/Tenant.js
const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  name: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  whatsappConfig: {
    businessAccountId: {
      type: String,
      index: true
    },
    phoneNumberId: String,
    accessToken: {
      type: String,
      unique: true,
      sparse: true
    },
    webhookSecret: String,
    verifyToken: String,
    isCallingEnabled: { 
      type: Boolean,
      default: false
    }
  },

  flowConfig: {
    orderCompletionFlowId: String,
    enableFlowMessages: { type: Boolean, default: false },
    autoSendOrderFlow: { type: Boolean, default: false },
    customerSupportFlowId: String,
    feedbackFlowId: String,

    publicKey: String,
    privateKey: String,
    passphrase: String,
    keysGenerated: Date,
    keyStatus: {
      type: String,
      enum: ['GENERATED', 'UPLOADED', 'UPLOAD_FAILED', 'VALID', 'MISMATCH', 'FAILED', null],
      default: null
    },
    keyUploadedAt: Date,
    keyCheckedAt: Date,
    keyUploadError: String,
    lastUploadAttempt: Date,
    keyValidated: { type: Boolean, default: false },
    keyGenerationMethod: String,
    whatsappResponse: mongoose.Schema.Types.Mixed,
    endpointUri: String,
    linkedPhoneNumberId: String,
    appId: String,
    appSecret: String,
    appSecretConfigured: { type: Boolean, default: false },
    appSecretUpdatedAt: Date,
    lastHealthCheck: Date,
    healthCheckStatus: {
      type: String,
      enum: ['pending', 'healthy', 'warning', 'error', null],
      default: null
    },
    lastFailedSignature: mongoose.Schema.Types.Mixed,
    flowStudioConfiguredAt: Date,

    configurationSteps: {
      whatsappConfig: { type: Boolean, default: false },
      keyGeneration: { type: Boolean, default: false },
      keyUpload: { type: Boolean, default: false },
      flowSetup: { type: Boolean, default: false },
      healthCheck: { type: Boolean, default: false }
    }
  },

  subscription: {
    plan: {
      type: String,
      enum: ['free_trial', 'pro'],
      default: 'free_trial'
    },
    trialStartedAt: {
      type: Date,
      default: Date.now
    },
    trialEndsAt: {
      type: Date
    },
    proActivatedAt: {
      type: Date
    },
    proExpiresAt: {
      type: Date
    },
    websiteOrderConfirmationLimit: {
      type: Number,
      default: 100
    },
    websiteOrderConfirmationSent: {
      type: Number,
      default: 0
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', null],
      default: null
    },
    razorpay: {
      orderId: String,
      paymentId: String,
      signature: String,
      amount: Number,
      currency: { type: String, default: 'INR' },
      status: String,
      createdAt: Date,
      paidAt: Date
    },
    stripe: {
      sessionId: String,
      paymentIntentId: String,
      amount: Number,
      currency: String,
      status: String,
      createdAt: Date,
      paidAt: Date
    },
    shopify: {
      subscriptionId: String,
      name: String,
      amount: Number,
      currency: String,
      status: String,
      test: { type: Boolean, default: false },
      currentPeriodEnd: Date,
      createdAt: Date,
      activatedAt: Date
    },
    history: [{
      provider: { type: String, default: 'manual' },
      event: { type: String, default: 'payment_recorded' },
      plan: {
        type: String,
        enum: ['free_trial', 'pro'],
        default: 'free_trial'
      },
      paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', null],
        default: null
      },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
      referenceId: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now },
      paidAt: { type: Date, default: null },
      notes: { type: String, default: '' }
    }],
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },

  referral: {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReferralPartner',
      default: null
    },
    partnerBusinessName: {
      type: String,
      default: ''
    },
    referralCode: {
      type: String,
      default: ''
    },
    linkedAt: {
      type: Date,
      default: null
    }
  },

  // 👇 MOVED TO ROOT LEVEL AND SET DEFAULT TO FALSE
  deviceSecurity: {
    enabled: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
  }

});

module.exports = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
