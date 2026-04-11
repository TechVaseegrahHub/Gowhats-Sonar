const mongoose = require('mongoose');
const OrderCounter = require('./OrderCounter');
const { applyInventoryDeductionForOrder } = require('../services/orderInventoryService');
const {
  encryptValue,
  decryptFields,
  decryptDocumentFields,
  ORDER_ENCRYPTION_FIELDS,
  hashPhone,
  decryptValue,
  isEncryptedValue
} = require('../utils/encryption');

const INVENTORY_DEDUCTION_PAYMENT_STATUSES = new Set(['completed']);

const normalizeStatus = (value) => String(value || '').toLowerCase().trim();

const getEffectivePaymentStatus = (paymentStatus, paymentDetailsStatus) => {
  const primary = normalizeStatus(paymentStatus);
  const fallback = normalizeStatus(paymentDetailsStatus);

  if (primary === 'completed' || fallback === 'completed') {
    return 'completed';
  }

  return primary || fallback;
};

// ==========================================
// 1. Sub-Schemas
// ==========================================

const orderItemSchema = new mongoose.Schema({
  name: String,
  quantity: Number,
  price: Number,
  totalPrice: Number,
  currency: String,
  retailerId: String,
  catalogId: String,
  sku: String,
  imageUrl: String,
  description: String,
  countryOfOrigin: { type: String, default: 'India' },
  importerName: String,
  importerAddress: {
    addressLine1: String,
    addressLine2: String,
    city: String,
    zone_code: String,
    postal_code: String,
    country_code: String
  },
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' }
}, { _id: false });

const paymentDetailsSchema = new mongoose.Schema({
  status: {
    type: String,
    // ✅ ADDED 'tested' here
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'tested'],
    default: 'pending'
  },
  referenceId: String,
  whatsappMessageId: String,
  paymentConfigurationName: String,
  transactionId: String,
  pgTransactionId: String,
  paymentMethod: String,
  paidAmount: Number,
  currency: { type: String, default: 'INR' },
  paidAt: Date,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  receipt: String,
  notes: mongoose.Schema.Types.Mixed,
  failureReason: String,
  failureCode: String,
  failedAt: Date,
  refunds: [{
    refundId: String,
    amount: Number,
    status: String,
    processedAt: Date,
    reason: String
  }],
  lastWebhookAt: Date,
  webhookProcessed: { type: Boolean, default: false }
}, { _id: false });

const holdingInfoSchema = new mongoose.Schema({
  productName: String,
  expectedDeliveryDate: Date,
  timeframe: String,
  notificationSent: { type: Boolean, default: false },
  notificationSentAt: Date,
  holdReason: { type: String, default: 'Preparation in progress' },
  messageId: String,
  lastUpdatedAt: { type: Date, default: Date.now },
  addedViaUpdate: { type: Boolean, default: false }
}, { _id: false });

const holdingHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['hold_set', 'hold_released', 'hold_updated'], required: true },
  productName: String,
  expectedDeliveryDate: Date,
  timeframe: String,
  sentAt: Date,
  releasedAt: Date,
  messageId: String,
  customerName: String,
  releasedBy: String,
  reason: String,
  notes: String
}, { _id: false });

const trackingInfoSchema = new mongoose.Schema({
  trackingNumber: String,
  courierService: String,
  courierName: String,
  trackingUrl: String,
  weight: String,
  lastUpdatedAt: Date,
  notificationSent: { type: Boolean, default: false },
  notificationSentAt: Date,
  messageId: String,
  addedViaUpdate: { type: Boolean, default: false }
}, { _id: false });

const trackingHistorySchema = new mongoose.Schema({
  trackingNumber: String,
  courierService: String,
  courierName: String,
  trackingUrl: String,
  weight: String,
  sentAt: Date,
  messageId: String,
  isUpdate: { type: Boolean, default: false },
  previousTrackingNumber: String
}, { _id: false });

// ==========================================
// 2. Main Order Schema
// ==========================================

const orderSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },

  // ✅ No "unique: true" here. Handled by compound index.
  orderId: { type: String, required: true, index: true },

  orderNumber: { type: String, required: true },
  customerPhone: { type: String, required: true, index: true },
  customerPhoneHash: { type: String, index: true },

  customerDetails: {
    name: String,
    email: String,
    phone: String
  },

  shippingAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },

  billingAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },

  registrationDetails: { type: Object },
  items: [orderItemSchema],
  participantCount: { type: Number, default: 1, min: 1 },

  orderAmount: { type: Number, required: true, default: 0 },
  shippingCost: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true, default: 0 },
  currency: { type: String, default: 'INR' },

  status: {
    type: String,
    enum: [
      'pending', 'confirmed', 'processing', 'printed', 'packed',
      'on_hold', 'shipped', 'tracked', 'delivered', 'cancelled',
      'refunded', 'returned', 'shipping_selected'
    ],
    default: 'pending'
  },

  paymentMethod: { type: String, enum: ['cod', 'online', 'whatsapp_pay'], default: 'whatsapp_pay' },
  
  // ✅ ADDED 'tested' here as well
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'tested'], 
    default: 'pending' 
  },
  
  paymentDetails: paymentDetailsSchema,

  source: {
    type: String,
    enum: ['whatsapp_flow', 'whatsapp_catalog', 'manual', 'api', 'shopify', 'woocommerce', 'registration_flow'],
    default: 'whatsapp_flow'
  },

  salesPersonName: {
    type: String,
    trim: true,
    default: ''
  },

  flowToken: String,
  catalogId: String,

  isPrinted: { type: Boolean, default: false },
  isPacked: { type: Boolean, default: false },
  confirmedAt: Date,
  processedAt: Date,
  printedAt: Date,
  packedAt: Date,
  onHoldAt: Date,
  holdReleasedAt: Date,
  shippedAt: Date,
  trackedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,

  notes: String,
  internalNotes: String,

  metadata: {
    abandonedCartSent: { type: Boolean, default: false },
    holdingInfo: holdingInfoSchema,
    holdingHistory: [holdingHistorySchema],
    trackingInfo: trackingInfoSchema,
    trackingHistory: [trackingHistorySchema],
    flowCompletedAt: Date,
    originalItemCount: Number,
    originalCatalogId: String,
    paymentLinkSent: { type: Boolean, default: false },
    paymentLinkSentAt: Date,
    paymentLinkMessageId: String,
    inventoryDeductedAt: Date,
    inventoryDeductionPaymentStatus: String,
    shippingMethodSelected: String,
    shippingMethodId: String,
    freeShippingApplied: { type: Boolean, default: false },
    ticketId: String,
    lastStatusUpdate: { type: Date, default: Date.now },
    statusHistory: [{
      from: String,
      to: String,
      changedAt: { type: Date, default: Date.now },
      changedBy: String,
      reason: String
    }]
  },

  shippingCalculationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingCalculation' },

  relatedMessages: [{
    messageId: String,
    messageType: String,
    sentAt: Date,
    content: String,
    templateName: String,
    statusUpdate: {
      oldStatus: String,
      newStatus: String,
      updatedAt: Date
    }
  }]

}, { timestamps: true });

// ✅ Compound index ensures orderId is unique per tenant
orderSchema.index({ tenantId: 1, orderId: 1 }, { unique: true });

orderSchema.index({ tenantId: 1, customerPhone: 1 });
orderSchema.index({ tenantId: 1, customerPhoneHash: 1 });
orderSchema.index({ tenantId: 1, status: 1 });
orderSchema.index({ tenantId: 1, paymentStatus: 1 });
orderSchema.index({ tenantId: 1, createdAt: -1 });
orderSchema.index({ 'metadata.abandonedCartSent': 1 });

const getPlainPhone = (value) => {
  if (!value || typeof value !== 'string') return '';
  if (isEncryptedValue(value)) {
    return decryptValue(value);
  }
  return value;
};

const encryptOrderFields = (doc) => {
  ORDER_ENCRYPTION_FIELDS.forEach((path) => {
    const value = doc.get(path);
    if (typeof value === 'string' && value.length > 0) {
      doc.set(path, encryptValue(value));
    }
  });
};

const encryptOrderUpdateFields = (update) => {
  if (!update) return update;
  const target = update.$set ? { ...update.$set } : { ...update };

  ORDER_ENCRYPTION_FIELDS.forEach((path) => {
    if (Object.prototype.hasOwnProperty.call(target, path)) {
      target[path] = encryptValue(target[path]);
    }
  });

  if (Object.prototype.hasOwnProperty.call(target, 'customerPhone')) {
    const phonePlain = getPlainPhone(target.customerPhone);
    target.customerPhoneHash = hashPhone(phonePlain);
  }

  if (update.$set) {
    update.$set = target;
  } else {
    Object.assign(update, target);
  }
  return update;
};

orderSchema.pre('save', function(next) {
  const phonePlain = getPlainPhone(this.customerPhone);
  this.customerPhoneHash = hashPhone(phonePlain);
  encryptOrderFields(this);
  next();
});

orderSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  encryptOrderUpdateFields(update);
  this.setUpdate(update);
  next();
});

orderSchema.post('init', function(doc) {
  decryptDocumentFields(doc, ORDER_ENCRYPTION_FIELDS);
});

orderSchema.pre('save', async function(next) {
  try {
    this.$locals = this.$locals || {};

    const currentPaymentStatus = getEffectivePaymentStatus(
      this.paymentStatus,
      this.paymentDetails?.status
    );

    const currentAlreadyDeducted = Boolean(this.metadata?.inventoryDeductedAt);
    const currentIsCompleted = INVENTORY_DEDUCTION_PAYMENT_STATUSES.has(currentPaymentStatus);

    if (this.isNew) {
      this.$locals.shouldRunInventoryDeduction = currentIsCompleted && !currentAlreadyDeducted;
      this.$locals.inventoryDeductionPaymentStatus = currentPaymentStatus;
      return next();
    }

    if (currentAlreadyDeducted) {
      this.$locals.shouldRunInventoryDeduction = false;
      return next();
    }

    const paymentStatusChanged =
      this.isModified('paymentStatus') ||
      this.isModified('paymentDetails') ||
      this.isModified('paymentDetails.status');

    if (!paymentStatusChanged) {
      this.$locals.shouldRunInventoryDeduction = false;
      return next();
    }

    const existingOrder = await this.constructor.findById(this._id)
      .select('paymentStatus paymentDetails.status metadata.inventoryDeductedAt')
      .lean();

    const previousPaymentStatus = getEffectivePaymentStatus(
      existingOrder?.paymentStatus,
      existingOrder?.paymentDetails?.status
    );

    const previousAlreadyDeducted = Boolean(existingOrder?.metadata?.inventoryDeductedAt);
    const movedToCompleted =
      !INVENTORY_DEDUCTION_PAYMENT_STATUSES.has(previousPaymentStatus) && currentIsCompleted;

    this.$locals.shouldRunInventoryDeduction = movedToCompleted && !previousAlreadyDeducted;
    this.$locals.inventoryDeductionPaymentStatus = currentPaymentStatus;
    return next();
  } catch (error) {
    console.error('Order pre-save inventory trigger check failed:', error.message);
    this.$locals = this.$locals || {};
    this.$locals.shouldRunInventoryDeduction = false;
    return next();
  }
});

orderSchema.post('save', async function(doc, next) {
  try {
    if (!this.$locals?.shouldRunInventoryDeduction) {
      return next();
    }

    await applyInventoryDeductionForOrder(doc);

    await this.constructor.updateOne(
      { _id: doc._id },
      {
        $set: {
          'metadata.inventoryDeductedAt': new Date(),
          'metadata.inventoryDeductionPaymentStatus':
            this.$locals.inventoryDeductionPaymentStatus || 'completed'
        }
      }
    );

    return next();
  } catch (error) {
    console.error('Order post-save inventory handler failed:', error.message);
    return next();
  }
});

// ✅ FIXED: Return ID as string without prefix
orderSchema.statics.generateOrderId = async function(tenantId) {
  try {
    const orderNumber = await OrderCounter.getNextOrderNumber(tenantId);
    return { orderId: orderNumber.toString(), orderNumber: orderNumber.toString() };
  } catch (error) {
    const fallbackId = 1000 + Math.floor(Math.random() * 8999);
    return { orderId: fallbackId.toString(), orderNumber: fallbackId.toString() };
  }
};

orderSchema.methods.getPaymentSummary = function() {
  return {
    orderId: this.orderId,
    orderNumber: this.orderNumber,
    items: this.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      retailer_id: item.retailerId
    })),
    orderAmount: this.orderAmount,
    shippingCost: this.shippingCost,
    totalAmount: this.totalAmount,
    customerDetails: this.customerDetails,
    shippingAddress: this.shippingAddress
  };
};

orderSchema.methods.updateStatus = function(newStatus, notes = '', changedBy = 'system') {
  const oldStatus = this.status;
  if (!this.metadata) this.metadata = {};
  if (!this.metadata.statusHistory) this.metadata.statusHistory = [];

  this.metadata.statusHistory.push({
    from: oldStatus,
    to: newStatus,
    changedAt: new Date(),
    changedBy: changedBy,
    reason: notes
  });

  this.status = newStatus;
  this.metadata.lastStatusUpdate = new Date();

  const timestampMap = {
    'confirmed': 'confirmedAt',
    'processing': 'processedAt',
    'printed': 'printedAt',
    'packed': 'packedAt',
    'on_hold': 'onHoldAt',
    'shipped': 'shippedAt',
    'tracked': 'trackedAt',
    'delivered': 'deliveredAt',
    'cancelled': 'cancelledAt'
  };

  if (timestampMap[newStatus]) {
    this[timestampMap[newStatus]] = new Date();
  }

  if (newStatus === 'printed') this.isPrinted = true;
  if (newStatus === 'packed') this.isPacked = true;

  return this.save();
};

orderSchema.virtual('orderAge').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

orderSchema.virtual('summary').get(function() {
  return {
    orderId: this.orderId,
    customerName: this.customerDetails?.name || this.shippingAddress?.name || 'Unknown',
    totalAmount: this.totalAmount,
    status: this.status,
    paymentStatus: this.paymentStatus
  };
});

orderSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    decryptFields(ret, ORDER_ENCRYPTION_FIELDS);
    return ret;
  }
});
orderSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret) => {
    decryptFields(ret, ORDER_ENCRYPTION_FIELDS);
    return ret;
  }
});

module.exports = mongoose.model('Order', orderSchema);

