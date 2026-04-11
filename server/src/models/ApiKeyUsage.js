const mongoose = require('mongoose');

const apiKeyUsageSchema = new mongoose.Schema({
  apiKeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApiKey',
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true
  },
  method: {
    type: String,
    required: true
  },
  statusCode: {
    type: Number,
    required: true
  },
  ipAddress: String,
  userAgent: String,
  responseTime: Number,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // 30 days TTL
  }
});

// Indexes for efficient querying
apiKeyUsageSchema.index({ apiKeyId: 1, createdAt: -1 });

module.exports = mongoose.model('ApiKeyUsage', apiKeyUsageSchema);
