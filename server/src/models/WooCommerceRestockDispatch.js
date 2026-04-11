const mongoose = require('mongoose');

const wooCommerceRestockDispatchSchema = new mongoose.Schema({
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
  wooProductId: {
    type: String,
    required: true,
    index: true
  },
  wooVariationId: {
    type: String,
    default: '',
    index: true
  },
  productTitle: {
    type: String,
    default: ''
  },
  variationTitle: {
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
  status: {
    type: String,
    enum: ['active', 'processing', 'waiting_restock', 'completed', 'disabled'],
    default: 'waiting_restock',
    index: true
  },
  dispatchIntervalMinutes: {
    type: Number,
    default: 30
  },
  nextCheckAt: {
    type: Date,
    default: null,
    index: true
  },
  lastCheckAt: {
    type: Date,
    default: null
  },
  lastDispatchAt: {
    type: Date,
    default: null
  },
  lastDetectedStockQuantity: {
    type: Number,
    default: 0
  },
  lastNotifyCount: {
    type: Number,
    default: 0
  },
  pendingRequestCount: {
    type: Number,
    default: 0
  },
  totalSentCount: {
    type: Number,
    default: 0
  },
  totalFailedCount: {
    type: Number,
    default: 0
  },
  totalCycles: {
    type: Number,
    default: 0
  },
  lastBatchId: {
    type: String,
    default: null
  },
  lastError: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

wooCommerceRestockDispatchSchema.index(
  {
    tenantId: 1,
    integrationId: 1,
    wooProductId: 1,
    wooVariationId: 1
  },
  {
    unique: true
  }
);

module.exports =
  mongoose.models.WooCommerceRestockDispatch ||
  mongoose.model('WooCommerceRestockDispatch', wooCommerceRestockDispatchSchema);

