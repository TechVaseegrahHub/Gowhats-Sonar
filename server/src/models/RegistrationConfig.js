// models/RegistrationConfig.js
const mongoose = require('mongoose');

const registrationConfigSchema = new mongoose.Schema({
  tenantId: { type: String, ref: 'Tenant', required: true, index: true },
  whatsappNumber: { type: String, required: false, trim: true, default: '' },

  // ✅ UPDATED: Support multiple trigger words as array - KEEP ORIGINAL CASE
  triggerWord: {
    type: [String],
    required: false,
    default: [],
    set: function(val) {
      // ✅ Keep original case - removed toLowerCase()
      if (typeof val === 'string') {
        return val.split(',')
          .map(w => w.trim())
          .filter(w => w.length > 0);
      }
      if (Array.isArray(val)) {
        return val.map(w => w.trim())
          .filter(w => w.length > 0);
      }
      return [];
    }
  },

  registrationFlowId: { type: String, required: false, trim: true, default: '' },

  fieldMapping: {
    customerName: { type: String, default: 'name' },
    location: { type: String, default: 'location' },
    email: { type: String, default: 'email' },
    participants: { type: String, default: 'participants' },
    customFields: [{ flowField: String, label: String }]
  },

  ticketConfig: {
    prefix: { type: String, default: 'EV' },
    startNumber: { type: Number, default: 100 },
    currentSequence: { type: Number, default: 0 }
  },

  paymentRequired: { type: Boolean, default: false },
  registrationFee: { type: Number, default: 0, min: 0 },
  paymentGateway: { type: String, enum: ['razorpay', 'stripe'], default: 'razorpay' },
  paymentConfigurationName: { type: String, trim: true, default: '' },

  stripeConfig: {
    enabled: { type: Boolean, default: false },
    publicKey: { type: String, default: '', trim: true },
    secretKey: { type: String, default: '', trim: true },
    webhookSecret: { type: String, default: '', trim: true }
  },

  flowMessage: {
    header: { type: String, default: '📝 Event Registration', trim: true, maxlength: 60 },
    body: { type: String, default: 'Please fill out the registration form.', trim: true, maxlength: 1024 },
    footer: { type: String, default: 'Powered by GoWhats!', trim: true, maxlength: 60 },
    ctaButtonText: { type: String, default: 'Start Registration', trim: true, maxlength: 20 }
  },

  paymentMessage: {
    header: { type: String, default: '💳 Complete Your Payment', trim: true, maxlength: 60 },
    body: { type: String, default: 'Please review your order details.', trim: true, maxlength: 1024 },
    footer: { type: String, default: 'Secure Payment', trim: true, maxlength: 60 }
  },

  confirmationMessage: { type: String, default: "🎉 Booking Confirmed! Here are your tickets." },
  qrCodeData: { type: String, required: false },
  isActive: { type: Boolean, default: true },

  stats: {
    totalScans: { type: Number, default: 0 },
    totalRegistrations: { type: Number, default: 0 },
    totalPayments: { type: Number, default: 0 },
    lastUsed: { type: Date, default: null }
  }
}, { timestamps: true });

// ✅ Index for array field
registrationConfigSchema.index({ triggerWord: 1, tenantId: 1 });

// Virtual property to get currency based on gateway
registrationConfigSchema.virtual('currency').get(function() {
  return this.paymentGateway === 'stripe' ? 'SGD' : 'INR';
});

// Helper method to get currency symbol
registrationConfigSchema.methods.getCurrencySymbol = function() {
  return this.paymentGateway === 'stripe' ? 'S$' : '₹';
};

// Helper method to get currency code
registrationConfigSchema.methods.getCurrencyCode = function() {
  return this.paymentGateway === 'stripe' ? 'SGD' : 'INR';
};

// ✅ Pre-save validation
registrationConfigSchema.pre('save', function(next) {
  if (this.isNew) {
    if (!this.whatsappNumber) return next(new Error('WhatsApp number required'));
    if (!this.triggerWord || this.triggerWord.length === 0) return next(new Error('At least one trigger word required'));
    if (!this.registrationFlowId) return next(new Error('Flow ID required'));
  }
  next();
});

// Generate next ticket ID
registrationConfigSchema.methods.generateNextTicketId = async function() {
  try {
    const OrderCounter = require('./OrderCounter');

    let counter = await OrderCounter.findOne({
        tenantId: this.tenantId.toString(),
        counterType: 'ticket'
    });

    const startFrom = this.ticketConfig?.startNumber || 100;

    if (!counter || counter.nextOrderNumber < startFrom) {
        counter = await OrderCounter.findOneAndUpdate(
            { tenantId: this.tenantId.toString(), counterType: 'ticket' },
            {
                $set: { nextOrderNumber: startFrom + 1, lastUpdated: new Date() }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const prefix = this.ticketConfig?.prefix || '';
        return `${prefix}${startFrom}`;
    }

    const rawNumber = await OrderCounter.getNextOrderNumber(this.tenantId.toString(), 'ticket');
    const prefix = this.ticketConfig?.prefix || '';

    return `${prefix}${rawNumber}`;

  } catch (error) {
    console.error('Error generating ticket ID:', error);
    const fallback = `EVT-${1000 + Math.floor(Math.random() * 8999)}`;
    return fallback;
  }
};

// ✅ Use first trigger word for QR code
registrationConfigSchema.methods.generateQRCodeData = function() {
  if (!this.whatsappNumber || !this.triggerWord || this.triggerWord.length === 0) return null;
  const firstTrigger = this.triggerWord[0] || 'BOOK';
  const encodedTrigger = encodeURIComponent(firstTrigger); // ✅ Keep original case
  this.qrCodeData = `https://wa.me/${this.whatsappNumber}?text=${encodedTrigger}`;
  return this.qrCodeData;
};

// Increment registration count
registrationConfigSchema.methods.incrementRegistrationCount = async function() {
  this.stats.totalRegistrations = (this.stats.totalRegistrations || 0) + 1;
  this.stats.lastUsed = new Date();
  await this.save();
};

// Increment payment count
registrationConfigSchema.methods.incrementPaymentCount = async function() {
  this.stats.totalPayments = (this.stats.totalPayments || 0) + 1;
  await this.save();
};

// Increment scan count
registrationConfigSchema.methods.incrementScanCount = async function() {
    this.stats.totalScans = (this.stats.totalScans || 0) + 1;
    this.stats.lastUsed = new Date();
    await this.save();
};

module.exports = mongoose.model('RegistrationConfig', registrationConfigSchema);
