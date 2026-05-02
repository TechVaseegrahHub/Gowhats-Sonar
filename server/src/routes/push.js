const express = require('express');
const WebPushSubscription = require('../models/WebPushSubscription');
const {
  getPublicKey,
  isConfigured,
  sendTestNotification
} = require('../services/webPushService');

const router = express.Router();

function getRequestContext(req) {
  return {
    tenantId: String(req.user?.tenant_id || req.user?.tenantId || req.tenantId || ''),
    userId: String(req.user?.id || req.user?._id || '')
  };
}

function isValidSubscription(subscription) {
  return Boolean(
    subscription &&
      typeof subscription.endpoint === 'string' &&
      subscription.endpoint &&
      subscription.keys &&
      typeof subscription.keys.p256dh === 'string' &&
      typeof subscription.keys.auth === 'string'
  );
}

router.get('/public-key', async (_req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Web push is not configured on the server'
    });
  }

  return res.json({
    success: true,
    publicKey: getPublicKey()
  });
});

router.post('/subscribe', async (req, res) => {
  try {
    const subscription = req.body?.subscription;
    const permission = String(req.body?.permission || 'granted');
    const deviceLabel = String(req.body?.deviceLabel || '').trim();

    if (!isValidSubscription(subscription)) {
      return res.status(400).json({
        success: false,
        message: 'A valid push subscription is required'
      });
    }

    const { tenantId, userId } = getRequestContext(req);

    const record = await WebPushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          tenantId,
          userId,
          endpoint: subscription.endpoint,
          subscription: {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime || null,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth
            }
          },
          enabled: true,
          permission: ['default', 'denied', 'granted'].includes(permission) ? permission : 'granted',
          userAgent: req.get('user-agent') || '',
          deviceLabel,
          lastSeenAt: new Date(),
          lastError: null
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    return res.json({
      success: true,
      subscriptionId: record._id,
      endpoint: record.endpoint
    });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save push subscription'
    });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const endpoint =
      req.body?.endpoint ||
      req.body?.subscription?.endpoint ||
      '';

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Subscription endpoint is required'
      });
    }

    const { tenantId, userId } = getRequestContext(req);

    const deleted = await WebPushSubscription.findOneAndDelete({
      tenantId,
      userId,
      endpoint
    });

    return res.json({
      success: true,
      removed: Boolean(deleted)
    });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove push subscription'
    });
  }
});

router.post('/test', async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Web push is not configured on the server'
      });
    }

    const { tenantId, userId } = getRequestContext(req);
    const result = await sendTestNotification({ tenantId, userId });

    if (!result.total) {
      return res.status(404).json({
        success: false,
        message: 'No active push subscriptions found for this user',
        result
      });
    }

    return res.json({
      success: true,
      message: 'Test notification sent',
      result
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send test notification'
    });
  }
});

module.exports = router;

