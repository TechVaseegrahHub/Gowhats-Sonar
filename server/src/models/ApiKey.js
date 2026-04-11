const mongoose = require('mongoose');
const crypto = require('crypto');

const apiKeySchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    ref: 'Tenant',
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  hashedKey: {
    type: String,
    required: true
  },
  prefix: {
    type: String,
    required: true
  },
  permissions: [{
    type: String,
    enum: [
      'orders.read',
      'orders.write',
      'orders.update',
      'messages.read',
      'messages.send',
      'contacts.read',
      'contacts.write',
      'inventory.read',
      'inventory.write',
      'templates.read',
      'broadcasts.send',
      'webhooks.manage'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  usageCount: {
    type: Number,
    default: 0
  },
  rateLimit: {
    requestsPerMinute: {
      type: Number,
      default: 60
    },
    requestsPerDay: {
      type: Number,
      default: 10000
    }
  },
  ipWhitelist: [{
    type: String
  }],
  webhookUrl: {
    type: String,
    trim: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
  createdBy: {
    type: String,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  revokedAt: {
    type: Date,
    default: null
  },
  revokedBy: {
    type: String,
    ref: 'User'
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Generate API key
apiKeySchema.statics.generateKey = function() {
  const prefix = 'gw'; // GoWhats prefix
  const randomPart = crypto.randomBytes(32).toString('hex');
  const key = `${prefix}_${randomPart}`;
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  
  return { key, hashedKey, prefix };
};

// Verify API key
apiKeySchema.statics.verifyKey = async function(key) {
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  
  const apiKey = await this.findOne({
    hashedKey: hashedKey,
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
  
  if (!apiKey) {
    return null;
  }
  
  // Update usage stats
  apiKey.lastUsedAt = new Date();
  apiKey.usageCount += 1;
  await apiKey.save();
  
  return apiKey;
};

// Check rate limit
apiKeySchema.methods.checkRateLimit = async function() {
  const now = new Date();
  const oneMinuteAgo = new Date(now - 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  
  // Count recent requests
  const ApiKeyUsage = require('./ApiKeyUsage');
  
  const [minuteCount, dayCount] = await Promise.all([
    ApiKeyUsage.countDocuments({
      apiKeyId: this._id,
      createdAt: { $gte: oneMinuteAgo }
    }),
    ApiKeyUsage.countDocuments({
      apiKeyId: this._id,
      createdAt: { $gte: oneDayAgo }
    })
  ]);
  
  if (minuteCount >= this.rateLimit.requestsPerMinute) {
    return { allowed: false, reason: 'Rate limit exceeded (per minute)' };
  }
  
  if (dayCount >= this.rateLimit.requestsPerDay) {
    return { allowed: false, reason: 'Rate limit exceeded (daily)' };
  }
  
  return { allowed: true };
};

// Check permission
apiKeySchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
