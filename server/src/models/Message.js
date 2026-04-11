// models/Message.js
const mongoose = require('mongoose');

const {
  encryptValue,
  decryptFields,
  decryptDocumentFields,
  MESSAGE_ENCRYPTION_FIELDS
} = require('../utils/encryption');
const PRO_ONLY_MODULES = ['broadcast', 'packing', 'tracking', 'holding'];

const orderItemSchema = new mongoose.Schema({
  id: String,
  name: String,
  quantity: Number,
  price: String,
  subtotal: String,
  currency: String,
  sku: String,
  imageUrl: String
}, { _id: false });

const trackingInfoSchema = new mongoose.Schema({
  orderId: String,
  shippingCompany: String,
  trackingNumber: String,
  weight: String,
  trackingUrl: String
}, { _id: false });

// ✅ NEW: Location Schema
const locationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  name: String,
  address: String
}, { _id: false });

const messageSchema = new mongoose.Schema({
  tenantId: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String },

  animated: { type: Boolean, default: false },

  // ✅ Better unsupported message handling
  unsupportedType: {
    type: String,
    enum: ['edit', 'poll', 'button', 'unknown', null],
    default: null
  },
  errorDetails: { type: String },

  reactions: [{ type: String }],
  reaction: {
    messageId: String,
    emoji: String
  },

  type: {
    type: String,
    enum: [
      'text', 'template', 'image', 'video', 'audio', 'document',
      'interactive', 'contacts', 'location', 'flow', 'media',
      'order', 'unsupported', 'reaction', 'system', 'revoke',
      'sticker', 'button', 'edit'
    ],
    default: 'text'
  },

  // ✅ SYSTEM MESSAGE
  systemMessage: {
    type: {
      type: String,
      enum: ['user_changed_number', 'customer_identity_changed', 'user_identity_changed']
    },
    body: String,
    wa_id: String,
    identity: String,
    customer: String
  },

  // ✅ LOCATION DATA
  location: locationSchema, // ✅ ADDED: Location field

  // ✅ REACTION DATA
  reaction: {
    emoji: String,
    messageId: String
  },

  quotedMessageId: { type: String, default: null },
  quotedMessageText: { type: String, default: null },
  context: {
    id: String,
    from: String
  },

  isInteractionResponse: { type: Boolean, default: false },
  originalInteractionType: { type: String, enum: ['button_reply', 'list_reply', 'nfm_reply'] },
  isBotMessage: { type: Boolean, default: false },
  isWelcomeMessage: { type: Boolean, default: false },
  isCatalogMessage: { type: Boolean, default: false },
  isFlowMessage: { type: Boolean, default: false },
  isPaymentMessage: { type: Boolean, default: false },
  isOrderConfirmation: { type: Boolean, default: false },
  isHumanAgentRequest: { type: Boolean, default: false },
  isFlowAcknowledgment: { type: Boolean, default: false },

  // ✅ ABANDONED CART FIELDS
  isAbandonedCartReminder: { type: Boolean, default: false },
  customerName: { type: String },
  cartDetails: {
    items: [mongoose.Schema.Types.Mixed],
    total: String,
    currency: String,
    itemCount: Number
  },

  // ✅ ORDER DISPATCH FIELDS
  isOrderDispatched: { type: Boolean, default: false },
  orderDetails: {
    orderId: String,
    orderNumber: String,
    trackingNumber: String,
    trackingCompany: String,
    trackingUrl: String,
    products: String,
    total: String,
    platform: String,
    customerName: String
  },
  dispatchDetails: mongoose.Schema.Types.Mixed,

  // ✅ READ RECEIPT FIELDS
  readByUser: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null },
  markedAsReadViaAPI: { type: Boolean, default: false },

  // ✅ WABA SYNC FIELDS
  isHistorical: { type: Boolean, default: false, index: true },
  historicalPhase: { type: String, enum: ['initial', 'backfill', 'complete', null], default: null },
  historicalChunk: { type: Number, default: null },
  sentFromWABA: { type: Boolean, default: false, index: true },
  syncedFromWABA: { type: Boolean, default: false },
  syncedAt: { type: Date, default: null },

  flowToken: String,
  orderId: String,
  shippingCalculationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingCalculation' },
  subType: String,
  flowId: String,
  mediaUrl: { type: String },
  mediaId: { type: String },
  s3Key: { type: String },
  caption: { type: String },
  filename: { type: String },
  timestamp: { type: Date, default: Date.now },
  messageId: { type: String },
  status: { type: String, default: 'sent', enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'received'] },
  broadcastId: { type: mongoose.Schema.Types.ObjectId, ref: 'Broadcast' },
  isBroadcastMessage: { type: Boolean, default: false },
  isConversion: { type: Boolean, default: false },
  convertedAt: { type: Date, default: null },
  readCounted: { type: Boolean, default: false },
  templateName: String,
  templateParams: mongoose.Schema.Types.Mixed,
  trackingInfo: trackingInfoSchema,

  orderData: {
    type: {
      orderId: String,
      orderNumber: String,
      total: String,
      currency: { type: String, default: 'INR' },
      status: String,
      platform: {
        type: String,
        enum: ['shopify', 'woocommerce', 'whatsapp_catalog', 'whatsapp_payment']
      },
      items: [orderItemSchema],
      customerName: String,
      customerPhone: String,
      customerEmail: String,
      shippingAddress: String,
      trackingNumber: String,
      orderSource: {
        type: String,
        enum: ['catalog', 'confirmation', 'payment', 'status_update', 'order_confirmation'],
        default: 'catalog'
      },
      paymentDetails: {
        referenceId: String,
        paymentStatus: { type: String, enum: ['pending', 'captured', 'failed', 'refunded'] },
        transactionId: String,
        paymentMethod: String,
        paidAmount: Number,
        paidAt: Date
      }
    },
    required: function () {
      return ['order', 'order_details', 'order_status'].includes(this.type);
    }
  },

  // Kept for backward compatibility, but 'reaction' field above is preferred
  reactionData: {
    emoji: String,
    messageId: String
  }
}, {
  timestamps: true
});

const encryptMessageFields = (doc) => {
  MESSAGE_ENCRYPTION_FIELDS.forEach((path) => {
    const value = doc.get(path);
    if (typeof value === 'string' && value.length > 0) {
      doc.set(path, encryptValue(value));
    }
  });
};

const encryptUpdateFields = (update) => {
  if (!update) return update;
  const target = update.$set ? { ...update.$set } : { ...update };

  MESSAGE_ENCRYPTION_FIELDS.forEach((path) => {
    if (Object.prototype.hasOwnProperty.call(target, path)) {
      target[path] = encryptValue(target[path]);
    }
  });

  if (update.$set) {
    update.$set = target;
  } else {
    Object.assign(update, target);
  }
  return update;
};

messageSchema.pre('save', function(next) {
  encryptMessageFields(this);
  next();
});

messageSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  encryptUpdateFields(update);
  this.setUpdate(update);
  next();
});

messageSchema.post('init', function(doc) {
  decryptDocumentFields(doc, MESSAGE_ENCRYPTION_FIELDS);
});

messageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    decryptFields(ret, MESSAGE_ENCRYPTION_FIELDS);
    return ret;
  }
});

messageSchema.set('toObject', {
  transform: (_doc, ret) => {
    decryptFields(ret, MESSAGE_ENCRYPTION_FIELDS);
    return ret;
  }
});

messageSchema.pre('save', function(next) {
  this.$locals = this.$locals || {};
  this.$locals.wasNew = this.isNew;
  next();
});

messageSchema.post('save', async function(doc) {
  try {
    const wasNew = doc?.$locals?.wasNew;
    if (!wasNew) return;
    if (!doc?.isOrderConfirmation) return;
    if (doc?.status !== 'sent') return;

    const platform = doc?.orderData?.platform || doc?.orderDetails?.platform || null;
    if (!platform || !['shopify', 'woocommerce'].includes(platform)) return;

    const Tenant = require('./Tenant');
    const updatedTenant = await Tenant.findOneAndUpdate(
      {
        _id: String(doc.tenantId),
        $or: [
          { 'subscription.plan': { $exists: false } },
          { 'subscription.plan': 'free_trial' }
        ]
      },
      {
        $inc: { 'subscription.websiteOrderConfirmationSent': 1 },
        $set: { 'subscription.updatedAt': new Date() }
      },
      { new: true }
    );

    if (!updatedTenant || !global.io) return;

    const { buildSubscriptionState } = require('../services/subscriptionService');
    const subscription = buildSubscriptionState(updatedTenant);

     global.io.to(String(doc.tenantId)).emit('subscription_usage_updated', {
      source: 'website_order_confirmation',
      subscription: {
        plan: subscription.plan,
        isPro: subscription.isPro,
        hasProAccess: subscription.hasProAccess,
        trial: subscription.trial,
        pro: subscription.pro,
        pricing: subscription.pricing,
        proOnlyModules: subscription.proOnlyModules,
        websiteIntegration: {
          orderConfirmationLimit: subscription.websiteOrderConfirmationLimit,
          orderConfirmationSent: subscription.websiteOrderConfirmationSent,
          orderConfirmationRemaining: subscription.websiteOrderConfirmationRemaining
        }
      }
    });
  } catch (error) {
    console.error('Failed to update website order confirmation usage:', error);
  }
});

// ✅ INDEXES
messageSchema.index({ tenantId: 1, isPaymentMessage: 1 });
messageSchema.index({ tenantId: 1, 'orderData.paymentDetails.referenceId': 1 });
messageSchema.index({ tenantId: 1, isInteractionResponse: 1 });
messageSchema.index({ tenantId: 1, from: 1, timestamp: 1 });
messageSchema.index({ tenantId: 1, isAbandonedCartReminder: 1 });
messageSchema.index({ tenantId: 1, isOrderDispatched: 1 });
messageSchema.index({ tenantId: 1, readByUser: 1 });
messageSchema.index({ tenantId: 1, from: 1, readByUser: 1 });
messageSchema.index({ messageId: 1 });
messageSchema.index({ tenantId: 1, isHistorical: 1 });
messageSchema.index({ tenantId: 1, sentFromWABA: 1 });
messageSchema.index({ tenantId: 1, syncedFromWABA: 1 });
messageSchema.index({ tenantId: 1, from: 1, readByUser: 1, timestamp: -1 });
messageSchema.index({ tenantId: 1, to: 1, timestamp: -1 });
messageSchema.index({ tenantId: 1, type: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
