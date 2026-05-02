const webPush = require('web-push');
const WebPushSubscription = require('../models/WebPushSubscription');

let cachedConfigState = null;

const DEFAULT_ICON = '/icons/icon-192.png';
const DEFAULT_BADGE = '/icons/icon-192.png';

function normalizeSubject(subject) {
  if (!subject) {
    return 'mailto:support@gowhats.in';
  }

  if (subject.startsWith('mailto:') || subject.startsWith('https://')) {
    return subject;
  }

  if (subject.includes('@')) {
    return `mailto:${subject}`;
  }

  return subject;
}

function configureWebPush() {
  if (cachedConfigState !== null) {
    return cachedConfigState;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = normalizeSubject(process.env.VAPID_SUBJECT);

  if (!publicKey || !privateKey) {
    cachedConfigState = false;
    return cachedConfigState;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  cachedConfigState = true;
  return cachedConfigState;
}

function isConfigured() {
  return configureWebPush();
}

function getPublicKey() {
  if (!configureWebPush()) {
    throw new Error('Web push is not configured');
  }

  return process.env.VAPID_PUBLIC_KEY;
}

function normalizePhone(phone = '') {
  return String(phone || '').replace(/\D/g, '').replace(/^91/, '');
}

function buildPhoneVariations(phone = '') {
  const raw = String(phone || '').trim();
  const clean = raw.replace(/\D/g, '');
  const local10 = clean.slice(-10);

  const variations = new Set([raw, clean]);

  if (clean) {
    variations.add(`+${clean}`);
  }

  if (local10) {
    variations.add(local10);
    variations.add(`91${local10}`);
    variations.add(`+91${local10}`);
  }

  return Array.from(variations).filter(Boolean);
}

function formatPhoneDisplay(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    return 'Unknown';
  }

  if (digits.length >= 10) {
    const local = digits.slice(-10);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }

  return phone;
}

function truncate(text = '', maxLength = 120) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function getMessagePreview(message) {
  if (message?.text) {
    return truncate(message.text, 140);
  }

  switch (message?.type) {
    case 'image':
      return message?.caption ? truncate(message.caption, 140) : 'Sent an image';
    case 'video':
      return message?.caption ? truncate(message.caption, 140) : 'Sent a video';
    case 'audio':
      return 'Sent a voice message';
    case 'document':
      return message?.filename ? `Sent ${message.filename}` : 'Sent a document';
    case 'sticker':
      return 'Sent a sticker';
    case 'location':
      return 'Shared a location';
    case 'interactive':
      return 'Sent an interactive message';
    case 'reaction':
      return 'Reacted to a message';
    default:
      return 'You have a new message';
  }
}

function buildNotificationPayload(payload = {}) {
  const title = payload.title || 'GoWhats';

  return {
    title,
    body: payload.body || 'You have a new update.',
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: payload.tag || 'gowhats-notification',
    renotify: false,
    requireInteraction: false,
    data: {
      url: payload.url || '/admin',
      phoneNumber: payload.phoneNumber || null,
      messageId: payload.messageId || null,
      tenantId: payload.tenantId || null,
      appName: 'GoWhats',
      ...payload.data
    },
    actions: Array.isArray(payload.actions) && payload.actions.length > 0
      ? payload.actions
      : [{ action: 'open', title: 'Open GoWhats' }]
  };
}

async function markSubscriptionFailure(subscriptionId, error) {
  const statusCode = Number(error?.statusCode || error?.status);
  const shouldRemove = statusCode === 404 || statusCode === 410;

  if (shouldRemove) {
    await WebPushSubscription.deleteOne({ _id: subscriptionId });
    return { removed: true };
  }

  await WebPushSubscription.updateOne(
    { _id: subscriptionId },
    {
      $set: {
        enabled: true,
        lastFailureAt: new Date(),
        lastError: error?.body || error?.message || 'Failed to send push notification'
      }
    }
  );

  return { removed: false };
}

async function sendNotificationToSubscription(record, payload) {
  try {
    await webPush.sendNotification(
      record.subscription,
      JSON.stringify(buildNotificationPayload(payload)),
      {
        TTL: 60,
        urgency: 'high'
      }
    );

    await WebPushSubscription.updateOne(
      { _id: record._id },
      {
        $set: {
          enabled: true,
          lastSeenAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null
        }
      }
    );

    return { success: true, removed: false };
  } catch (error) {
    const failure = await markSubscriptionFailure(record._id, error);
    return {
      success: false,
      removed: failure.removed,
      error
    };
  }
}

async function sendNotificationToQuery(query, payload) {
  if (!configureWebPush()) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      removed: 0,
      skipped: true,
      reason: 'not_configured'
    };
  }

  const subscriptions = await WebPushSubscription.find({
    enabled: true,
    permission: 'granted',
    ...query
  }).lean();

  if (!subscriptions.length) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      removed: 0
    };
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const record of subscriptions) {
    const result = await sendNotificationToSubscription(record, payload);
    if (result.success) {
      sent += 1;
      continue;
    }

    failed += 1;
    if (result.removed) {
      removed += 1;
    }
  }

  return {
    total: subscriptions.length,
    sent,
    failed,
    removed
  };
}

async function sendTestNotification({ tenantId, userId }) {
  return sendNotificationToQuery(
    {
      tenantId: String(tenantId),
      userId: String(userId)
    },
    {
      title: 'GoWhats',
      body: 'Push notifications are working on this device.',
      tag: 'gowhats-test-notification',
      url: '/admin/settings?section=push-notifications',
      data: {
        kind: 'test'
      }
    }
  );
}

async function sendInboundMessageNotification(message) {
  if (!configureWebPush()) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      removed: 0,
      skipped: true,
      reason: 'not_configured'
    };
  }

  const tenantId = String(message.tenantId);
  const Contact = require('../models/Contact');
  const Tenant = require('../models/Tenant');

  const phoneVariations = buildPhoneVariations(message.from);

  const [contact, tenant] = await Promise.all([
    Contact.findOne({
      tenantId,
      phone_number: { $in: phoneVariations }
    })
      .select('alias profile_name name phone_number')
      .lean(),
    Tenant.findById(tenantId).select('name').lean()
  ]);

  const senderName =
    contact?.alias ||
    contact?.profile_name ||
    contact?.name ||
    formatPhoneDisplay(message.from);
  const preview = getMessagePreview(message);
  const phoneNumber = contact?.phone_number || message.from;

  return sendNotificationToQuery(
    { tenantId },
    {
      title: 'GoWhats',
      body: `${senderName}: ${preview}`,
      tag: `gowhats-chat-${normalizePhone(phoneNumber) || 'inbox'}`,
      phoneNumber,
      messageId: message.messageId || null,
      tenantId,
      url: `/admin/chats?phone=${encodeURIComponent(phoneNumber)}`,
      data: {
        kind: 'message',
        senderName,
        tenantName: tenant?.name || 'GoWhats'
      }
    }
  );
}

module.exports = {
  getPublicKey,
  isConfigured,
  sendInboundMessageNotification,
  sendNotificationToQuery,
  sendTestNotification
};

