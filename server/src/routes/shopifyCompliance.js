const express = require('express');
const crypto = require('crypto');
const {
  handleCustomerDataRequest,
  redactCustomerData,
  redactShopData
} = require('../services/shopifyComplianceService');

const router = express.Router();
const COMPLIANCE_TOPIC_HANDLERS = {
  'customers/data_request': handleCustomerDataRequest,
  'customers/redact': redactCustomerData,
  'shop/redact': redactShopData
};

function getShopifyWebhookSecret() {
  return process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || '';
}

function verifyShopifyWebhookSignature(req) {
  const secret = getShopifyWebhookSecret();
  const hmac = String(req.headers['x-shopify-hmac-sha256'] || '').trim();
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.isBuffer(req.body)
      ? req.body
      : null;

  if (!secret || !hmac || !rawBody?.length) {
    return false;
  }

  const calculatedDigest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest();

  let providedDigest;
  try {
    providedDigest = Buffer.from(hmac, 'base64');
  } catch (_error) {
    return false;
  }

  if (!providedDigest.length || providedDigest.length !== calculatedDigest.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedDigest, providedDigest);
}

function parsePayload(req) {
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.isBuffer(req.body)
      ? req.body
      : null;

  if (rawBody?.length) {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch (_error) {
      return {};
    }
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      return {};
    }
  }

  return req.body || {};
}

function inferTopicFromRequest(req) {
  const headerTopic = String(req.headers['x-shopify-topic'] || '').trim();
  if (headerTopic) return headerTopic;

  const normalizedPath = String(req.path || '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (normalizedPath === 'customers/data_request') return 'customers/data_request';
  if (normalizedPath === 'customers/redact') return 'customers/redact';
  if (normalizedPath === 'shop/redact') return 'shop/redact';

  return '';
}

async function processComplianceWebhook(topic, payload) {
  const handler = COMPLIANCE_TOPIC_HANDLERS[topic];

  if (!handler) {
    throw new Error(`Unsupported Shopify compliance topic: ${topic}`);
  }

  await handler(payload);
}

function dispatchComplianceWebhook(topic, payload) {
  setImmediate(async () => {
    try {
      await processComplianceWebhook(topic, payload);
    } catch (error) {
      console.error(`[Shopify GDPR] ${topic} processing failed after acknowledgement:`, error);
    }
  });
}

function handleComplianceWebhook(req, res) {
  if (!verifyShopifyWebhookSignature(req)) {
    return res.status(401).json({ success: false, message: 'Invalid Shopify HMAC signature' });
  }

  const topic = inferTopicFromRequest(req);

  if (!topic) {
    return res.status(400).json({ success: false, message: 'Missing Shopify compliance topic' });
  }

  const payload = parsePayload(req);
  dispatchComplianceWebhook(topic, payload);

  return res.status(200).json({ success: true, topic, accepted: true });
}

router.post('/', handleComplianceWebhook);
router.post('/customers/data_request', handleComplianceWebhook);
router.post('/customers/redact', handleComplianceWebhook);
router.post('/shop/redact', handleComplianceWebhook);

module.exports = router;

