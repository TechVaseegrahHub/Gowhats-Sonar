const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  tenant_id: {
    type: String,
    required: true,
    index: true
  },
  retailer_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  color: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: ''
  },
  variant_group: {
    type: String,
    default: ''
  },
  variant_label: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    required: true,
  },
  condition: {
    type: String,
    default: 'new'
  },
  url: {
    type: String,
  },
  price: {
    type: Number, // ✅ Changed from String to Number
    required: true,
  },
  availability: {
    type: String,
    required: true,
    default: 'in stock'
  },
  image_url: {
    type: String,
    required: true,
  },
  additional_images: {
    type: [String], // Array of strings for extra images
    default: []
  }, 
 currency: {
    type: String,
    default: "INR"
  },
  inventory: {
    type: Number,
    default: null
  },
   low_stock_alertt_sent: {
    type: Boolean,
    default: false
  },
  low_stock_alertt_sent_at: {
    type: Date,
    default: null
  },
  low_stock_alertt_recipients: {
    type: [String],
    default: []
  },
  low_stock_alertt_threshold: {
    type: Number,
    default: null
  },
  synced: {
    type: Boolean,
    default: false,
    index: true // ✅ Added index for faster queries
  },
  // WhatsApp sync information
  whatsapp_sync_status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'deleted'],
    default: 'pending'
  },
  whatsapp_sync_details: {
    syncedAt: Date,
    updatedAt: Date,
    productId: String,
    catalogId: String
  },
  whatsapp_sync_error: {
    message: String,
    details: mongoose.Schema.Types.Mixed,
    attemptedAt: Date
  },
  isBillzzySynced: {
    type: Boolean,
    default: false // Default to false so existing products aren't locked
  },
}, {
  timestamps: true // ✅ Added timestamps
});

// Compound index for unique retailer_id per tenant
inventoryItemSchema.index({ tenant_id: 1, retailer_id: 1 }, { unique: true });

// Index for querying unsynced products
inventoryItemSchema.index({ tenant_id: 1, synced: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
