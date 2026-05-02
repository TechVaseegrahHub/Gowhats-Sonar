const mongoose = require('mongoose');

const webPushSubscriptionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    endpoint: {
      type: String,
      required: true,
      unique: true
    },
    subscription: {
      endpoint: {
        type: String,
        required: true
      },
      expirationTime: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      },
      keys: {
        p256dh: {
          type: String,
          required: true
        },
        auth: {
          type: String,
          required: true
        }
      }
    },
    enabled: {
      type: Boolean,
      default: true
    },
    permission: {
      type: String,
      enum: ['default', 'denied', 'granted'],
      default: 'granted'
    },
    userAgent: {
      type: String,
      default: ''
    },
    deviceLabel: {
      type: String,
      default: ''
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    lastSuccessAt: {
      type: Date,
      default: null
    },
    lastFailureAt: {
      type: Date,
      default: null
    },
    lastError: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

webPushSubscriptionSchema.index({ tenantId: 1, userId: 1, enabled: 1 });

module.exports =
  mongoose.models.WebPushSubscription ||
  mongoose.model('WebPushSubscription', webPushSubscriptionSchema);
