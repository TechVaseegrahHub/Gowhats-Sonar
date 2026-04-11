// models/FlowToken.js
const mongoose = require('mongoose');

const flowTokenSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  flowId: {
    type: String,
    required: true
  },
  flowConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FlowConfiguration',
    index: true
  },
  phoneNumber: {
    type: String,
    required: true,
    index: true
  },
  flowType: {
    type: String,
    enum: ['order_completion', 'registration', 'appointment', 'survey', 'feedback', 'lead_capture', 'custom'],
    default: 'custom',
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'used', 'expired', 'failed'],
    default: 'active',
    index: true
  },
  contextData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  usedAt: Date,
  completionData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  orderId: {
    type: String,
    index: true
  },
  leadId: {
    type: String,
    index: true
  },
  errorDetails: {
    message: String,
    stack: String,
    occurredAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // 24 hours TTL
  }
}, {
  timestamps: true
});

// Indexes
flowTokenSchema.index({ tenantId: 1, phoneNumber: 1, status: 1 });
flowTokenSchema.index({ token: 1, status: 1 });
flowTokenSchema.index({ flowConfigId: 1, status: 1 });
flowTokenSchema.index({ tenantId: 1, flowType: 1, status: 1 });

// Statics
flowTokenSchema.statics.markAsUsed = async function(tenantId, token, completionData, orderId = null) {
  try {
    const update = {
      $set: {
        status: 'used',
        usedAt: new Date(),
        completionData: completionData
      }
    };

    if (orderId && typeof orderId === 'string') {
      update.$set.orderId = orderId;
    }

    const updatedToken = await this.findOneAndUpdate({
        tenantId: tenantId,
        token: token,
        status: 'active'
      },
      update, {
        new: true
      }
    );

    if (updatedToken) {
      console.log(`✅ Flow token marked as used. Linked to Order ID: ${updatedToken.orderId || 'N/A'}`);
    } else {
      console.warn(`⚠️ Attempted to mark token as used, but it was not found for this tenant or was already used.`);
    }

    return updatedToken;
  } catch (error) {
    console.error('❌ Error in FlowToken.markAsUsed:', error);
    return null;
  }
};

flowTokenSchema.statics.findActiveToken = function(token) {
  return this.findOne({
    token: token,
    status: 'active'
  }).populate('flowConfigId');
};

flowTokenSchema.statics.markAsFailed = function(token, errorDetails) {
  return this.findOneAndUpdate({
    token: token,
    status: 'active'
  }, {
    status: 'failed',
    errorDetails: {
      message: errorDetails.message || 'Unknown error',
      stack: errorDetails.stack,
      occurredAt: new Date()
    }
  }, {
    new: true
  });
};

flowTokenSchema.methods.markUsed = function(completionData = {}, relatedId = null) {
  this.status = 'used';
  this.usedAt = new Date();
  this.completionData = completionData;
  if (relatedId) this.orderId = relatedId;
  return this.save();
};

flowTokenSchema.methods.markFailed = function(errorDetails) {
  this.status = 'failed';
  this.errorDetails = {
    message: errorDetails.message || 'Unknown error',
    stack: errorDetails.stack,
    occurredAt: new Date()
  };
  return this.save();
};

// ✅ FIX: Check if model exists before compiling
module.exports = mongoose.models.FlowToken || mongoose.model('FlowToken', flowTokenSchema);
