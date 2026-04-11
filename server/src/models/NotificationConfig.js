const mongoose = require('mongoose');

const notificationConfigSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Packing Settings
  packing: {
    enabled: { type: Boolean, default: true },
    customContent: {
      header: { type: String, default: '' },
      body: { type: String, default: '' },
      footer: { type: String, default: '' }
    }
  },
  // Tracking Settings
  tracking: {
    enabled: { type: Boolean, default: true },
    customContent: {
      header: { type: String, default: '' },
      body: { type: String, default: '' },
      footer: { type: String, default: '' }
    }
  },
  // Holding Settings
  holding: {
    enabled: { type: Boolean, default: true },
    customContent: {
      header: { type: String, default: '' },
      body: { type: String, default: '' },
      footer: { type: String, default: '' }
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('NotificationConfig', notificationConfigSchema);
