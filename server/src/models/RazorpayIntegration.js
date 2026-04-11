const mongoose = require('mongoose');

const razorpayIntegrationSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // OAuth Data
  accountId: { type: String, required: true }, // The Merchant's 'acc_...' ID
  accessToken: { type: String, required: true }, // The Bearer token
  refreshToken: { type: String, required: true }, // Used to get new access tokens
  expiresIn: { type: Number, required: true }, // Seconds until expiry
  tokenType: String,
  publicToken: String, // Sometimes returned, useful for frontend SDKs
  
  // Merchant Info
  accountName: String,
  accountEmail: String,
  
  // System Flags
  isActive: { type: Boolean, default: true },
  lastUsed: Date,
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save
razorpayIntegrationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('RazorpayIntegration', razorpayIntegrationSchema);
