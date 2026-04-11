const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const querystring = require('querystring');
const axios = require('axios');

const auth = require('../middleware/auth');
const checkTenant = require('../middleware/tenantMiddleware');
const Integration = require('../models/Integration');
const User = require('../models/User');
const ShopifyApiService = require('../services/shopifyApiService');

const router = express.Router();
const MINIMUM_SHOPIFY_SCOPES = [
  'read_orders',
  'read_fulfillments',
  'read_products',
  'write_app_proxy'
];
const DEFAULT_SHOPIFY_CALLBACK_PATH = '/api/shopify/callback';

function getBackendBaseUrl() {
  return (process.env.BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL || 'https://bot.gowhats.in')
    .replace(/\/$/, '');
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_URL || process.env.APP_URL || process.env.BASE_URL || 'https://bot.gowhats.in')
    .replace(/\/$/, '');
}

function getShopifyApiKey() {
  return process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID || '';
}

function getShopifyApiSecret() {
  return process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || '';
}

function getRequestedScopes() {
  const configuredScopes = String(process.env.SHOPIFY_SCOPES || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (configuredScopes.length === 0) {
    return MINIMUM_SHOPIFY_SCOPES.join(',');
  }

  const filteredScopes = configuredScopes.filter((scope) =>
    MINIMUM_SHOPIFY_SCOPES.includes(scope)
  );

  const finalScopes = filteredScopes.length > 0
    ? filteredScopes
    : MINIMUM_SHOPIFY_SCOPES;

  return [...new Set(finalScopes)].join(',');
}

function getRedirectUri() {
  const configuredRedirectUri = String(process.env.SHOPIFY_REDIRECT_URI || '').trim();
  const backendBaseUrl = getBackendBaseUrl();
  const defaultRedirectUri = `${backendBaseUrl}${DEFAULT_SHOPIFY_CALLBACK_PATH}`;

  if (configuredRedirectUri) {
    const normalizedRedirectUri = configuredRedirectUri.replace(/\/$/, '');

    try {
      const parsedRedirectUri = new URL(normalizedRedirectUri);
      const isLegacyCallbackPath = [
        '/auth/callback',
        '/auth/shopify/callback',
        '/shopify/auth/callback'
      ].includes(parsedRedirectUri.pathname);

      if (isLegacyCallbackPath) {
        console.warn('[Shopify OAuth] Legacy redirect URI detected, using API callback instead:', {
          configuredRedirectUri: normalizedRedirectUri,
          effectiveRedirectUri: defaultRedirectUri
        });
        return defaultRedirectUri;
      }
    } catch (_error) {
      console.warn('[Shopify OAuth] Invalid configured redirect URI, falling back to API callback:', {
        configuredRedirectUri: normalizedRedirectUri,
        effectiveRedirectUri: defaultRedirectUri
      });
      return defaultRedirectUri;
    }

    return normalizedRedirectUri;
  }

  return defaultRedirectUri;
}

function buildInstallState(payload) {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || getShopifyApiSecret(),
    { expiresIn: '10m' }
  );
}

function verifyInstallState(state) {
  return jwt.verify(
    state,
    process.env.JWT_SECRET || getShopifyApiSecret()
  );
}

function validateOAuthHmac(query) {
  const secret = getShopifyApiSecret();
  const providedHmac = String(query.hmac || '');
  if (!secret || !providedHmac) return false;

  const queryWithoutHmac = { ...query };
  delete queryWithoutHmac.hmac;
  delete queryWithoutHmac.signature;

  const sortedQuery = Object.keys(queryWithoutHmac)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = queryWithoutHmac[key];
      return accumulator;
    }, {});

  const message = querystring.stringify(sortedQuery);
  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  const calculatedBuffer = Buffer.from(calculatedHmac, 'utf8');
  const providedBuffer = Buffer.from(providedHmac, 'utf8');

  if (calculatedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedBuffer, providedBuffer);
}

function normalizeHostParam(host) {
  const normalizedHost = String(host || '').trim();

  if (!normalizedHost) {
    return '';
  }

  return normalizedHost.replace(/ /g, '+');
}

function decodeShopifyHost(host) {
  const normalizedHost = normalizeHostParam(host);

  if (!normalizedHost) {
    return '';
  }

  try {
    const base64 = normalizedHost
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(normalizedHost.length / 4) * 4, '=');

    return Buffer.from(base64, 'base64')
      .toString('utf8')
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '');
  } catch (_error) {
    return '';
  }
}

function redirectWithStatus(res, status, message, shop = null, host = null) {
  const redirectUrl = new URL(`${getFrontendBaseUrl()}/admin/settings`);
  redirectUrl.searchParams.set('section', 'store');
  redirectUrl.searchParams.set('shopify', status);
  redirectUrl.searchParams.set('message', message);

  if (shop) {
    redirectUrl.searchParams.set('shop', shop);
  }

  if (host) {
    redirectUrl.searchParams.set('host', normalizeHostParam(host));
    redirectUrl.searchParams.set('embedded', '1');
  }

  return res.redirect(redirectUrl.toString());
}

function buildEmbeddedAdminAppUrl(host, params = {}) {
  const decodedHost = decodeShopifyHost(host);
  const apiKey = getShopifyApiKey();

  if (!decodedHost || !apiKey) {
    return null;
  }

  const redirectUrl = new URL(`https://${decodedHost}/apps/${apiKey}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      redirectUrl.searchParams.set(key, String(value));
    }
  });

  return redirectUrl.toString();
}

function buildShopifyWebhookStatus(errors = [], subscriptions = [], previousStatus = {}) {
  const now = new Date();
  const firstError = errors[0] || null;
  const firstErrorMessage = String(firstError?.message || '').trim();
  const requiresProtectedCustomerData = errors.some((error) =>
    /protected customer data/i.test(String(error?.message || ''))
  );

  if (errors.length === 0) {
    return {
      status: 'success',
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastErrorCode: '',
      lastErrorMessage: '',
      requiresProtectedCustomerData: false
    };
  }

  return {
    status: subscriptions.length > 0 ? 'partial' : 'error',
    lastAttemptAt: now,
    lastSuccessAt: subscriptions.length > 0 ? now : previousStatus?.lastSuccessAt || null,
    lastErrorCode: firstError?.status ? String(firstError.status) : '',
    lastErrorMessage: firstErrorMessage,
    requiresProtectedCustomerData
  };
}

function extractBearerToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();

  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice(7).trim();
}

function verifyShopifyEmbeddedToken(token) {
  const apiKey = getShopifyApiKey();
  const apiSecret = getShopifyApiSecret();

  if (!token || !apiKey || !apiSecret) {
    throw new Error('Shopify embedded authentication is not configured');
  }

  const decoded = jwt.verify(token, apiSecret, {
    algorithms: ['HS256']
  });

  const audience = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
  if (String(audience || '') !== apiKey) {
    throw new Error('Invalid Shopify embedded token audience');
  }

  const shopDomain = ShopifyApiService.normalizeShopDomain(decoded.dest || decoded.iss || '');
  if (!shopDomain) {
    throw new Error('Invalid Shopify shop domain in embedded token');
  }

  return {
    ...decoded,
    shopDomain
  };
}

async function resolveEmbeddedShopUser(shopDomain) {
  const integration = await Integration.findOne({
    storeType: 'shopify',
    storeUrl: shopDomain,
    isActive: { $ne: false }
  }).lean();

  if (!integration?.tenantId) {
    throw new Error('No active GoWhats Shopify integration found for this shop');
  }

  const user = await User.findOne({ tenant_id: String(integration.tenantId) })
    .sort({ role: 1, createdAt: 1 })
    .lean();

  if (!user) {
    throw new Error('No GoWhats user found for the connected Shopify store');
  }

  return {
    integration,
    user
  };
}

function issueEmbeddedAppToken(user, shopDomain) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing on the server');
  }

  return jwt.sign(
    {
      id: user._id,
      tenant_id: user.tenant_id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone_number: user.phone_number,
      company_name: user.company_name,
      shopify_shop: shopDomain,
      auth_source: 'shopify_embedded_session'
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

router.post('/install-link', auth, checkTenant, async (req, res) => {
  try {
    const { shop, storeUrl } = req.body || {};
    const normalizedShop = ShopifyApiService.normalizeShopDomain(shop || storeUrl);

    if (!normalizedShop) {
      return res.status(400).json({
        success: false,
        message: 'Enter your Shopify domain like your-store.myshopify.com'
      });
    }

    if (!getShopifyApiKey() || !getShopifyApiSecret()) {
      return res.status(500).json({
        success: false,
        message: 'Shopify app credentials are missing on the server'
      });
    }

    const state = buildInstallState({
      tenantId: req.user.tenant_id,
      shop: normalizedShop,
      source: 'store_integration'
    });

    const installUrl = new URL(`https://${normalizedShop}/admin/oauth/authorize`);
    installUrl.searchParams.set('client_id', getShopifyApiKey());
    installUrl.searchParams.set('redirect_uri', getRedirectUri());
    installUrl.searchParams.set('state', state);

    const requestedScopes = getRequestedScopes();
    if (requestedScopes) {
      installUrl.searchParams.set('scope', requestedScopes);
    }

    console.log('[Shopify OAuth] Generated install link:', {
      shop: normalizedShop,
      redirectUri: getRedirectUri(),
      scopes: requestedScopes
    });

    return res.json({
      success: true,
      shop: normalizedShop,
      installUrl: installUrl.toString()
    });
  } catch (error) {
    console.error('Failed to create Shopify install link:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start Shopify connection'
    });
  }
});

router.post('/embedded/session', async (req, res) => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Missing Shopify embedded session token'
      });
    }

    const embeddedSession = verifyShopifyEmbeddedToken(token);
    const { integration, user } = await resolveEmbeddedShopUser(embeddedSession.shopDomain);
    const appToken = issueEmbeddedAppToken(user, embeddedSession.shopDomain);

    console.log('[Shopify Embedded] Embedded session exchanged successfully:', {
      shop: embeddedSession.shopDomain,
      tenantId: integration.tenantId,
      userId: String(user._id)
    });

    return res.json({
      success: true,
      token: appToken,
      access_token: appToken,
      tenant_id: integration.tenantId,
      tenantId: integration.tenantId,
      shop: embeddedSession.shopDomain,
      embedded: true
    });
  } catch (error) {
    console.error('[Shopify Embedded] Failed to exchange embedded session:', error.message || error);
    return res.status(401).json({
      success: false,
      message: error.message || 'Failed to authenticate embedded Shopify session'
    });
  }
});

async function handleShopifyCallback(req, res) {
  const normalizedShop = ShopifyApiService.normalizeShopDomain(req.query.shop || '');
  const normalizedHost = normalizeHostParam(req.query.host);

  try {
    console.log('[Shopify OAuth] Callback started:', {
      shop: normalizedShop,
      host: normalizedHost,
      embedded: req.query.embedded,
      hasCode: Boolean(req.query.code),
      hasHmac: Boolean(req.query.hmac),
      statePresent: Boolean(req.query.state)
    });

    if (!normalizedShop) {
      console.error('[Shopify OAuth] Invalid shop domain in callback:', req.query.shop);
      return redirectWithStatus(res, 'error', 'Invalid Shopify shop domain', null, normalizedHost);
    }

    if (!validateOAuthHmac(req.query)) {
      console.error('[Shopify OAuth] Callback HMAC validation failed:', {
        shop: normalizedShop,
        host: normalizedHost,
        queryKeys: Object.keys(req.query || {})
      });
      return redirectWithStatus(res, 'error', 'Invalid Shopify callback signature', normalizedShop, normalizedHost);
    }

    if (!req.query.code || !req.query.state) {
      console.error('[Shopify OAuth] Missing callback data:', {
        hasCode: Boolean(req.query.code),
        hasState: Boolean(req.query.state),
        shop: normalizedShop
      });
      return redirectWithStatus(res, 'error', 'Missing Shopify callback data', normalizedShop, normalizedHost);
    }

    const stateData = verifyInstallState(req.query.state);

    if (!stateData?.tenantId) {
      console.error('[Shopify OAuth] State validation failed: tenantId missing');
      return redirectWithStatus(
        res,
        'error',
        'Please sign in to GoWhats first, then connect Shopify from Settings',
        normalizedShop,
        normalizedHost
      );
    }

    if (stateData.shop && stateData.shop !== normalizedShop) {
      console.error('[Shopify OAuth] Shop mismatch in callback state:', {
        stateShop: stateData.shop,
        callbackShop: normalizedShop
      });
      return redirectWithStatus(res, 'error', 'Shopify shop mismatch', normalizedShop, normalizedHost);
    }

    const tokenResponse = await axios.post(
      `https://${normalizedShop}/admin/oauth/access_token`,
      {
        client_id: getShopifyApiKey(),
        client_secret: getShopifyApiSecret(),
        code: req.query.code
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const accessToken = tokenResponse.data?.access_token;
    const grantedScopes = String(tokenResponse.data?.scope || '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);

    if (!accessToken) {
      console.error('[Shopify OAuth] Access token missing from token exchange response');
      return redirectWithStatus(res, 'error', 'Shopify access token exchange failed', normalizedShop, normalizedHost);
    }

    let integration = await Integration.findOne({
      tenantId: stateData.tenantId,
      storeType: 'shopify'
    });

    if (!integration) {
      integration = new Integration({
        tenantId: stateData.tenantId,
        storeType: 'shopify',
        storeUrl: normalizedShop,
        adminAccessToken: accessToken,
        webhookSecret: crypto.randomBytes(32).toString('hex'),
        isActive: true,
        isMessageEnabled: true,
        isAbandonedCartEnabled: false,
        isDispatchedMessageEnabled: false,
        connectedVia: 'oauth',
        shopifyScopes: grantedScopes,
        shopifyWebhookStatus: {
          status: 'pending',
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastErrorCode: '',
          lastErrorMessage: '',
          requiresProtectedCustomerData: false
        }
      });
    } else {
      integration.storeUrl = normalizedShop;
      integration.adminAccessToken = accessToken;
      integration.connectedVia = 'oauth';
      integration.shopifyScopes = grantedScopes;
      integration.shopifyWebhookStatus = {
        ...(integration.shopifyWebhookStatus || {}),
        status: 'pending',
        lastAttemptAt: null,
        lastErrorCode: '',
        lastErrorMessage: '',
        requiresProtectedCustomerData: false
      };
      integration.apiKey = null;
      integration.apiSecret = null;
      integration.apiConfig = {
        ...(integration.apiConfig || {}),
        lastVerified: new Date()
      };
    }

    await integration.save();

    console.log('[Shopify OAuth] Integration saved successfully:', {
      integrationId: String(integration._id),
      tenantId: stateData.tenantId,
      shop: normalizedShop,
      connectedVia: integration.connectedVia,
      scopesCount: grantedScopes.length
    });

    const shopifyApi = new ShopifyApiService(
      normalizedShop,
      accessToken,
      integration.apiConfig?.version || '2024-10'
    );

    await shopifyApi.verifyConnection();

    const webhookUrl = `${getBackendBaseUrl()}/api/webhooks/shopify/${integration._id}`;
    let webhookSubscriptions = [];
    let webhookErrors = [];

    try {
      const syncResult = await shopifyApi.ensureWebhooks(webhookUrl);
      webhookSubscriptions = syncResult.subscriptions;
      webhookErrors = syncResult.errors;

      if (webhookErrors.length > 0) {
        console.error('[Shopify OAuth] Webhook subscription setup completed with errors:', {
          integrationId: String(integration._id),
          shop: normalizedShop,
          errors: webhookErrors
        });
      }
    } catch (webhookError) {
      webhookErrors = [{
        status: webhookError.response?.status || null,
        message: webhookError.response?.data?.errors || webhookError.message || 'Failed to create Shopify webhooks'
      }];

      console.error('[Shopify OAuth] Webhook subscription setup failed:', {
        integrationId: String(integration._id),
        shop: normalizedShop,
        error: webhookError.response?.data || webhookError.message || webhookError
      });
    }

    integration.storeUrl = normalizedShop;
    integration.adminAccessToken = accessToken;
    integration.connectedVia = 'oauth';
    integration.shopifyScopes = grantedScopes;
    integration.shopifyWebhookSubscriptions = webhookSubscriptions;
    integration.shopifyWebhookStatus = buildShopifyWebhookStatus(
      webhookErrors,
      webhookSubscriptions,
      integration.shopifyWebhookStatus
    );
    integration.apiConfig = {
      ...(integration.apiConfig || {}),
      lastVerified: new Date()
    };

    await integration.save();

    const embeddedSuccessUrl = buildEmbeddedAdminAppUrl(normalizedHost, {
      embedded: '1',
      host: normalizedHost,
      section: 'store',
      shopify: 'connected',
      shop: normalizedShop
    });

    if (embeddedSuccessUrl) {
      console.log('[Shopify OAuth] Redirecting to embedded app URL:', embeddedSuccessUrl);
      return res.redirect(embeddedSuccessUrl);
    }

    const successUrl = new URL(`${getFrontendBaseUrl()}/admin/settings`);
    successUrl.searchParams.set('host', normalizedHost);
    successUrl.searchParams.set('embedded', '1');
    successUrl.searchParams.set('section', 'store');
    successUrl.searchParams.set('shopify', 'connected');
    successUrl.searchParams.set('shop', normalizedShop);

    console.log('[Shopify OAuth] Redirecting to frontend URL:', successUrl.toString());
    return res.redirect(successUrl.toString());
  } catch (error) {
    console.error('Shopify OAuth callback failed:', error.response?.data || error.message || error);
    return redirectWithStatus(
      res,
      'error',
      'Shopify connection failed. Check app credentials and redirect URL.',
      normalizedShop,
      normalizedHost
    );
  }
}

router.get('/callback', handleShopifyCallback);
router.get('/auth/callback', handleShopifyCallback);
router.get('/auth/shopify/callback', handleShopifyCallback);
router.get('/shopify/auth/callback', handleShopifyCallback);

module.exports = router;
module.exports.handleShopifyCallback = handleShopifyCallback;

