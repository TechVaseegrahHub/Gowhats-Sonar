// models/AbandonedCart.js
const mongoose = require('mongoose');

const abandonedCartSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  platform: { type: String, enum: ['shopify', 'woocommerce'], required: true },
  cartId: { type: String, required: true },
  orderId: { type: String, default: null },
  customerPhone: { type: String },
  customerName: { type: String, default: 'Valued Customer' },
  cartDetails: { type: mongoose.Schema.Types.Mixed },
  status: {
    type: String,
    enum: ['pending', 'sent', 'converted', 'failed', 'awaiting_phone', 'expired'],  // ✅ Added 'awaiting_phone' and 'expired'
    default: 'pending',
    index: true
  },
  reminderAt: { type: Date, index: true },
  convertedAt: { type: Date }
}, { timestamps: true });

// ✅ Compound index for efficient queries
abandonedCartSchema.index({ tenantId: 1, cartId: 1, platform: 1 }, { unique: true });
abandonedCartSchema.index({ tenantId: 1, status: 1, reminderAt: 1 });

module.exports = mongoose.model('AbandonedCart', abandonedCartSchema);
