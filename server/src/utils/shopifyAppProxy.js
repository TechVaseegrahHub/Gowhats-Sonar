const crypto = require('crypto');
const ShopifyApiService = require('../services/shopifyApiService');

function getShopifyAppSecret() {
  return process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || '';
}

function buildSortedSignaturePayload(searchParams) {
  const groupedParams = {};

  for (const [key, value] of searchParams.entries()) {
    if (key === 'signature') continue;

    if (!groupedParams[key]) {
      groupedParams[key] = [];
    }

    groupedParams[key].push(value);
  }

  return Object.keys(groupedParams)
    .sort()
    .map((key) => `${key}=${groupedParams[key].join(',')}`)
    .join('');
}

function verifyShopifyAppProxySignature(req, secret = getShopifyAppSecret()) {
  if (!secret) return false;

  const requestUrl = new URL(req.originalUrl || req.url, 'https://bot.gowhats.in');
  const signature = requestUrl.searchParams.get('signature') || '';

  if (!signature) {
    return false;
  }

  const payload = buildSortedSignaturePayload(requestUrl.searchParams);
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const providedBuffer = Buffer.from(signature, 'utf8');
  const digestBuffer = Buffer.from(digest, 'utf8');

  if (providedBuffer.length !== digestBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, digestBuffer);
}

function getProxyShopDomain(req) {
  return ShopifyApiService.normalizeShopDomain(req.query?.shop || '');
}

module.exports = {
  getProxyShopDomain,
  getShopifyAppSecret,
  verifyShopifyAppProxySignature
};

