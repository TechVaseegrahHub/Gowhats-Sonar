// models/Payment.js - New Payment model
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  orderNumber: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true,
    index: true
  },
  customerDetails: {
    name: String,
    email: String,
    phone: String
  },
  
  // WhatsApp Payment Details
  referenceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  whatsappMessageId: String,
  
  // Payment Configuration
  paymentGateway: {
    type: String,
    enum: ['razorpay', 'billdesk', 'payu', 'zaakpay'],
    default: 'razorpay'
  },
  paymentConfigurationName: String,
  
  // Amount Details
  orderAmount: {
    type: Number,
    required: true
  },
  shippingAmount: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  
  // Payment Status
  status: {
    type: String,
    enum: ['pending', 'captured', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // Transaction Details
  transactions: [{
    id: String, // Payment gateway order ID
    pgTransactionId: String, // Payment gateway payment ID
    type: String, // razorpay, billdesk, etc.
    status: String, // success, failed, pending
    method: {
      type: String // upi, card, netbanking, wallet
    },
    createdTimestamp: Date,
    updatedTimestamp: Date,
    error: {
      code: String,
      reason: String
    }
  }],
  
  // Razorpay Specific Fields
  razorpayDetails: {
    receipt: String,
    notes: mongoose.Schema.Types.Mixed,
    orderId: String,
    paymentId: String
  },
  
  // Refund Details
  refunds: [{
    id: String,
    amount: Number,
    speedProcessed: String, // instant, normal
    status: String, // pending, success, failed
    createdTimestamp: Date,
    updatedTimestamp: Date
  }],
  
  // Order Items
  items: [{
    name: String,
    quantity: Number,
    amount: Number,
    retailerId: String,
    countryOfOrigin: String,
    importerName: String,
    importerAddress: mongoose.Schema.Types.Mixed
  }],
  
  // Shipping Address (for physical goods)
  shippingAddress: {
    name: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  
  // Payment Completion Details
  paidAt: Date,
  paidAmount: Number,
  paymentMethod: String,
  
  // Webhook Processing
  webhookProcessed: {
    type: Boolean,
    default: false
  },
  lastWebhookAt: Date,
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed,
  
}, {
  timestamps: true
});

// Indexes for efficient querying
paymentSchema.index({ tenantId: 1, customerPhone: 1 });
paymentSchema.index({ tenantId: 1, status: 1 });
paymentSchema.index({ tenantId: 1, orderId: 1 });
paymentSchema.index({ referenceId: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);