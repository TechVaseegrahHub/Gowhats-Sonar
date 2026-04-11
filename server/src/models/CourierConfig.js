const mongoose = require('mongoose');

const courierConfigSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  couriers: [{
    name: { type: String, required: true },
    trackingUrlBase: { type: String, default: '' }, // Optional URL prefix
    active: { type: Boolean, default: true }
  }]
}, { timestamps: true });

module.exports = mongoose.model('CourierConfig', courierConfigSchema);
