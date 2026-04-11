const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Integration = require('../models/Integration');
const Tenant = require('../models/Tenant');
const crypto = require('crypto');
const abandonedCartService = require('../services/abandonedCartService');
const ShopifyApiService = require('../services/shopifyApiService');
const WooCommerceApiService = require('../services/woocommerceApiService');
const {
  handleOrderConfirmation,
  handleOrderDispatched
} = require('../services/integrationService');
const {
  processVariantBackInStock
} = require('../services/shopifyRestockService');
const {
  listPendingRestockRequests,
  sendManualRestockRequests
} = require('../services/woocommerceRestockService');

function getBaseUrl() {
  return (process.env.BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL || 'http://bot.gowhats.in')
    .replace(/\/$/, '');
}

function buildWebhookUrl(integration) {
  return `${getBaseUrl()}/api/webhooks/${integration.storeType}/${integration._id}`;
}

function buildWooCommerceRestockUrl(integration, action) {
  return `${getBaseUrl()}/api/woocommerce-restock/${integration._id}/${action}`;
}

function normalizeWooCommerceStoreUrl(value = '') {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname && parsed.pathname !== '/'
      ? parsed.pathname.replace(/\/+$/, '')
      : '';

    return `${parsed.protocol}//${host}${pathname}`;
  } catch (_error) {
    return trimmed.replace(/\/+$/, '');
  }
}

function normalizeStoreUrlByType(storeType, value = '') {
  if (storeType === 'woocommerce') {
    return normalizeWooCommerceStoreUrl(value);
  }

  const trimmed = String(value || '').trim().toLowerCase();

  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/^www\./, '');
  } catch (_error) {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
}

function getIntegrationStoreKey(integration) {
  const storeType = integration?.storeType || 'unknown';
  const normalizedStoreUrl = normalizeStoreUrlByType(storeType, integration?.storeUrl);

  return `${storeType}:${normalizedStoreUrl || String(integration?._id || '')}`;
}

function getVisibleIntegrations(integrations = []) {
  const visibleByStoreKey = new Map();

  [...integrations]
    .filter((integration) => integration?.isActive !== false)
    .sort((left, right) => {
      const leftTime = new Date(left?.updatedAt || left?.createdAt || 0).getTime();
      const rightTime = new Date(right?.updatedAt || right?.createdAt || 0).getTime();
      return rightTime - leftTime;
    })
    .forEach((integration) => {
      const storeKey = getIntegrationStoreKey(integration);

      if (!visibleByStoreKey.has(storeKey)) {
        visibleByStoreKey.set(storeKey, integration);
      }
    });

  return Array.from(visibleByStoreKey.values());
}

function getWooCommercePluginZipCandidates() {
  return [
    path.resolve(__dirname, '../../../wordpress-plugin/gowhats-woocommerce-restock.zip'),
    path.resolve(__dirname, '../../wordpress-plugin/gowhats-woocommerce-restock.zip'),
    path.resolve(process.cwd(), 'wordpress-plugin/gowhats-woocommerce-restock.zip'),
    path.resolve(process.cwd(), 'server/wordpress-plugin/gowhats-woocommerce-restock.zip')
  ];
}

function resolveWooCommercePluginZipPath() {
  return getWooCommercePluginZipCandidates().find((candidatePath) => fs.existsSync(candidatePath)) || '';
}

function getWooCommerceOrderStatus(orderData = {}) {
  return String(orderData?.status || '').trim().toLowerCase();
}

function isWooCommerceOrderConfirmationEvent(topic, orderData = {}) {
  const normalizedTopic = String(topic || '').trim().toLowerCase();
  const currentStatus = getWooCommerceOrderStatus(orderData);
  const supportedStatuses = new Set(['processing', 'completed']);
  const isExplicitOrderWebhook = normalizedTopic === 'order.created' || normalizedTopic === 'order.updated';
  const looksLikeOrderPayload = Boolean(orderData?.id) && (
    Array.isArray(orderData?.line_items) ||
    Boolean(orderData?.billing) ||
    Boolean(orderData?.shipping) ||
    Boolean(orderData?.billing_phone)
  );

  if (!supportedStatuses.has(currentStatus)) {
    return false;
  }

  if (isExplicitOrderWebhook) {
    return true;
  }

  return normalizedTopic === 'unknown' && looksLikeOrderPayload;
}

async function syncWooCommerceWebhooks(integration) {
  if (
    !integration ||
    integration.storeType !== 'woocommerce' ||
    !integration.apiKey ||
    !integration.apiSecret
  ) {
    return integration;
  }

  try {
    const wooApi = new WooCommerceApiService(
      integration.storeUrl,
      integration.apiKey,
      integration.apiSecret
    );

    const ensuredWebhooks = await wooApi.ensureWebhooks(
      buildWebhookUrl(integration),
      WooCommerceApiService.DEFAULT_WEBHOOK_TOPICS,
      {
        namePrefix: 'GoWhats',
        secret: integration.webhookSecret
      }
    );

    console.log('[WooCommerce Webhook Sync] Active webhooks ensured:', {
      integrationId: String(integration._id),
      storeUrl: integration.storeUrl,
      topics: ensuredWebhooks.map((webhook) => webhook?.topic).filter(Boolean)
    });
  } catch (error) {
    console.error('[WooCommerce Webhook Sync] Failed to ensure WooCommerce webhooks:', {
      integrationId: String(integration?._id || ''),
      storeUrl: integration?.storeUrl || '',
      error: error.response?.data || error.message
    });
  }

  return integration;
}

async function resolveTenantWooCommerceIntegration(tenantId, integrationId) {
  if (!tenantId) {
    return { error: 'Unauthorized', status: 401 };
  }

  const integration = await Integration.findOne({
    _id: integrationId,
    tenantId,
    storeType: 'woocommerce'
  });

  if (!integration) {
    return { error: 'WooCommerce integration not found', status: 404 };
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    return { error: 'Tenant not found', status: 404 };
  }

  return { integration, tenant };
}

function formatIntegration(integration) {
  return {
    id: integration._id,
    storeType: integration.storeType,
    storeUrl: integration.storeUrl,
    isActive: integration.isActive,
    isMessageEnabled: integration.isMessageEnabled,
    isAbandonedCartEnabled: integration.isAbandonedCartEnabled,
    isDispatchedMessageEnabled: integration.isDispatchedMessageEnabled || false,
    isRestockEnabled: integration.isRestockEnabled || false,
    restockTemplateName: integration.restockTemplateName || '',
    restockTemplateLanguage: integration.restockTemplateLanguage || 'en',
    restockNotificationMode: integration.restockNotificationMode || 'available_quantity',
    restockFixedCap: integration.restockFixedCap || 30,
    restockCtaLabel: integration.restockCtaLabel || 'Request stock',
    restockPhonePlaceholder: integration.restockPhonePlaceholder || 'Enter your WhatsApp number',
    restockSuccessDescription: integration.restockSuccessDescription || 'Get notified on WhatsApp when the product comes back in stock',
    restockDefaultCountry: integration.restockDefaultCountry || 'IN',
    hasAdminToken: !!integration.adminAccessToken,
    connectedVia: integration.connectedVia || 'admin_token',
    shopifyWebhookStatus: integration.shopifyWebhookStatus || {
      status: 'pending',
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastErrorCode: '',
      lastErrorMessage: '',
      requiresProtectedCustomerData: false
    },
    webhookUrl: buildWebhookUrl(integration),
    restockSubscribeUrl: integration.storeType === 'woocommerce'
      ? buildWooCommerceRestockUrl(integration, 'subscribe')
      : '',
    restockStatusUrl: integration.storeType === 'woocommerce'
      ? buildWooCommerceRestockUrl(integration, 'status')
      : '',
    restockStockUpdateUrl: integration.storeType === 'woocommerce'
      ? buildWooCommerceRestockUrl(integration, 'stock-update')
      : '',
    restockSharedSecret: integration.storeType === 'woocommerce'
      ? integration.webhookSecret
      : ''
  };
}

function verifyShopifyWebhookSignature(req, secret) {
  if (!secret) return true;

  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac || !req.rawBody) return false;

  const calculated = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('base64');

  const providedBuffer = Buffer.from(String(hmac), 'utf8');
  const calculatedBuffer = Buffer.from(calculated, 'utf8');

  if (providedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, calculatedBuffer);
}

function getShopifyWebhookSecret(integration) {
  const connectionMode = integration.connectedVia || 'admin_token';

  if (connectionMode === 'oauth') {
    return process.env.SHOPIFY_API_SECRET || '';
  }

  return integration.apiSecret || '';
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

async function syncShopifyWebhooks(integration) {
  if (!integration || integration.storeType !== 'shopify' || !integration.adminAccessToken) {
    return integration;
  }

  try {
    const shopifyApi = new ShopifyApiService(
      integration.storeUrl,
      integration.adminAccessToken,
      integration.apiConfig?.version || '2024-10'
    );

    const syncResult = await shopifyApi.ensureWebhooks(buildWebhookUrl(integration));
    integration.shopifyWebhookSubscriptions = syncResult.subscriptions;
    integration.shopifyWebhookStatus = buildShopifyWebhookStatus(
      syncResult.errors,
      syncResult.subscriptions,
      integration.shopifyWebhookStatus
    );
    integration.apiConfig = {
      ...(integration.apiConfig || {}),
      lastVerified: new Date()
    };

    await integration.save();
   
if (syncResult.errors.length > 0) {
      console.error('[Shopify Webhook Sync] Completed with webhook errors:', {
        integrationId: String(integration._id),
        shop: integration.storeUrl,
        errors: syncResult.errors
      });
    }
  } catch (error) {
    console.error('[Shopify Webhook Sync] Failed to refresh subscriptions:', error.message);
  
integration.shopifyWebhookStatus = buildShopifyWebhookStatus(
      [{
        status: error.response?.status || null,
        message: error.response?.data?.errors || error.message || 'Failed to sync Shopify webhooks'
      }],
      integration.shopifyWebhookSubscriptions || [],
      integration.shopifyWebhookStatus
    );
    await integration.save();

  }

  return integration;
}


// ============ AUTH-PROTECTED ROUTES ============

router.get('/', async (req, res) => {
  try {
      const integrations = await Integration.find({ tenantId: req.user.tenant_id })
      .sort({ updatedAt: -1, createdAt: -1 });

    const visibleIntegrations = getVisibleIntegrations(integrations);

    await Promise.all(
      visibleIntegrations
        .filter((integration) => integration.storeType === 'woocommerce')
        .map((integration) => syncWooCommerceWebhooks(integration))
    );

    res.json(visibleIntegrations.map(formatIntegration));

  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/woocommerce/plugin-download', async (req, res) => {
  try {
    if (!req.user?.tenant_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

   const pluginZipPath = resolveWooCommercePluginZipPath();

   if (!pluginZipPath) {
      const checkedPaths = getWooCommercePluginZipCandidates();
      console.error('[WooCommerce Plugin Download] ZIP file not found. Checked paths:', checkedPaths);
      return res.status(404).json({
        error: 'WooCommerce plugin zip not found on server',
        checkedPaths
      }); 
  }

    return res.download(pluginZipPath, 'gowhats-woocommerce-restock.zip');
  } catch (error) {
    console.error('Failed to download WooCommerce plugin zip:', error);
    return res.status(500).json({ error: 'Failed to download WooCommerce plugin zip' });
  }
});

router.get('/:integrationId/woocommerce-restock/requests', async (req, res) => {
  try {
    const resolved = await resolveTenantWooCommerceIntegration(req.user?.tenant_id, req.params.integrationId);

    if (resolved.error) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    const { integration, tenant } = resolved;
    const groups = await listPendingRestockRequests({
      integration,
      tenantId: String(req.user.tenant_id)
    });

    return res.json({
      success: true,
      integration: {
        id: String(integration._id),
        storeUrl: integration.storeUrl,
        isRestockEnabled: !!integration.isRestockEnabled,
        restockTemplateName: integration.restockTemplateName || '',
        restockTemplateLanguage: integration.restockTemplateLanguage || 'en',
        restockNotificationMode: integration.restockNotificationMode || 'available_quantity',
        restockFixedCap: integration.restockFixedCap || 30,
        restockDispatchIntervalMinutes: Number(process.env.WOOCOMMERCE_RESTOCK_DISPATCH_INTERVAL_MINUTES) || 30,
        brandName: tenant.businessName || tenant.name || 'GoWhats'
      },
      groups
    });
  } catch (error) {
    console.error('[WooCommerce Restock Admin] Failed to list requests:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load restock requests'
    });
  }
});

router.post('/:integrationId/woocommerce-restock/send', async (req, res) => {
  try {
    const resolved = await resolveTenantWooCommerceIntegration(req.user?.tenant_id, req.params.integrationId);

    if (resolved.error) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    const { integration, tenant } = resolved;
    const result = await sendManualRestockRequests({
      integration,
      tenant,
      requestIds: req.body?.requestIds
    });

    return res.json({
      success: true,
      message: result.failed > 0
        ? `Sent ${result.sent} restock alert${result.sent === 1 ? '' : 's'}. ${result.failed} failed.`
        : `Sent ${result.sent} restock alert${result.sent === 1 ? '' : 's'}.`,
      ...result
    });
  } catch (error) {
    console.error('[WooCommerce Restock Admin] Failed to send requests:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send restock alerts'
    });
  }
});

router.post('/connect', async (req, res) => {
  try {
    let { storeType, storeUrl, apiKey, apiSecret, adminAccessToken } = req.body;
    const tenantId = req.user?.tenant_id;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized - No tenant ID' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (storeType === 'shopify') {
      return res.status(400).json({
        success: false,
        message: 'Shopify now connects through the Shopify app install flow. Use the Shopify connect button instead of pasting an Admin API token.'
      });
    }

   if (storeType === 'woocommerce') {
      storeUrl = normalizeWooCommerceStoreUrl(storeUrl);

      if (!storeUrl) {
        return res.status(400).json({
          success: false,
          message: 'Enter a valid WooCommerce store URL.'
        });
      }

      if (!apiKey || !apiSecret) {
        return res.status(400).json({
          success: false,
          message: 'Consumer Key and Consumer Secret are required for WooCommerce.'
        });
      }

      const existingWooIntegrations = await Integration.find({
        tenantId: tenant._id,
        storeType: 'woocommerce'
      }).sort({ updatedAt: -1, createdAt: -1 });

      const existingIntegration = existingWooIntegrations.find((integration) => (
        normalizeWooCommerceStoreUrl(integration.storeUrl) === storeUrl
      ));

      if (existingIntegration) {
        existingIntegration.storeUrl = storeUrl;
        existingIntegration.apiKey = apiKey;
        existingIntegration.apiSecret = apiSecret;
        existingIntegration.adminAccessToken = adminAccessToken || existingIntegration.adminAccessToken || null;
        existingIntegration.isActive = true;
        existingIntegration.connectedVia = 'admin_token';

        await existingIntegration.save();
        await syncWooCommerceWebhooks(existingIntegration);

        return res.json({
          success: true,
          existing: true,
          webhookUrl: buildWebhookUrl(existingIntegration),
          message: 'This WooCommerce store is already connected. The existing integration was updated.',
          integration: formatIntegration(existingIntegration)
        });
      }
    }


    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const newIntegration = new Integration({
      tenantId: tenant._id,
      storeType,
      storeUrl,
      apiKey,
      apiSecret,
      adminAccessToken: adminAccessToken || null,
      webhookSecret,
      isActive: true,
      isMessageEnabled: true,
      isAbandonedCartEnabled: false,
      isDispatchedMessageEnabled: false,
      connectedVia: 'admin_token'
    });

    await newIntegration.save();
    if (storeType === 'woocommerce') {
      await syncWooCommerceWebhooks(newIntegration);
    }

    res.json({
      success: true,
      webhookUrl: buildWebhookUrl(newIntegration),
      message: 'Store connected successfully'
    });
  } catch (error) {
    console.error('Integration connect error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ FIXED: Better logging and proper response
router.patch('/:integrationId/update-setting', async (req, res) => {
    try {
        const { integrationId } = req.params;
        const settingsToUpdate = req.body;
        const touchedKeys = Object.keys(settingsToUpdate || {});

        console.log(`[Integration Update] 🔧 Updating integration ${integrationId}`);
        console.log(`[Integration Update] Settings to update:`, settingsToUpdate);

        const integration = await Integration.findOneAndUpdate(
            { _id: integrationId, tenantId: req.user.tenant_id },
            { 
                $set: {
                    ...settingsToUpdate,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );

        if (!integration) {
            console.error(`[Integration Update] ❌ Integration not found: ${integrationId}`);
            return res.status(404).json({ error: 'Integration not found' });
        }

        if (
          integration.storeType === 'shopify' &&
          touchedKeys.some((key) => key.startsWith('restock') || key === 'isRestockEnabled')
        ) {
          await syncShopifyWebhooks(integration);
        }

        console.log(`[Integration Update] ✅ Successfully updated:`, {
            id: integration._id,
            isMessageEnabled: integration.isMessageEnabled,
            isAbandonedCartEnabled: integration.isAbandonedCartEnabled,
            isDispatchedMessageEnabled: integration.isDispatchedMessageEnabled,
            isRestockEnabled: integration.isRestockEnabled,
            restockTemplateName: integration.restockTemplateName
        });

        // Return complete integration data
        res.json({
            success: true,
            message: 'Settings updated successfully',
            integration: formatIntegration(integration)
        });
    } catch (error) {
        console.error('[Integration Update] ❌ Error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

router.patch('/:integrationId/update-admin-token', async (req, res) => {
    try {
        const { integrationId } = req.params;
        const { adminAccessToken } = req.body;

        if (!adminAccessToken) {
            return res.status(400).json({ error: 'Admin access token is required' });
        }

        const integration = await Integration.findOneAndUpdate(
            { _id: integrationId, tenantId: req.user.tenant_id },
            { $set: { adminAccessToken: adminAccessToken } },
            { new: true }
        );

        if (!integration) {
            return res.status(404).json({ error: 'Integration not found' });
        }

        if (integration.storeType === 'shopify') {
            await syncShopifyWebhooks(integration);
        }

        console.log(`✅ Admin token updated for integration: ${integrationId}`);

        res.json({
            success: true,
            message: 'Admin access token updated successfully',
            integration: {
                id: integration._id,
                hasAdminToken: !!integration.adminAccessToken
            }
        });
    } catch (error) {
        console.error('Error updating admin token:', error);
        res.status(500).json({ error: 'Failed to update admin access token' });
    }
});


router.post('/:integrationId/retry-webhooks', async (req, res) => {
    try {
        const { integrationId } = req.params;

        const integration = await Integration.findOne({
            _id: integrationId,
            tenantId: req.user.tenant_id
        });

        if (!integration) {
            return res.status(404).json({ error: 'Integration not found' });
        }

        if (integration.storeType !== 'shopify') {
            return res.status(400).json({ error: 'Webhook retry is only available for Shopify integrations' });
        }

        if (!integration.adminAccessToken) {
            return res.status(400).json({ error: 'Shopify admin access token is missing for this integration' });
        }

        const updatedIntegration = await syncShopifyWebhooks(integration);

        return res.json({
            success: true,
            message: 'Shopify webhook sync completed',
            integration: formatIntegration(updatedIntegration)
        });
    } catch (error) {
        console.error('[Integration Retry] ❌ Error retrying Shopify webhooks:', error);
        return res.status(500).json({ error: 'Failed to retry Shopify webhooks' });
    }
});

 router.delete('/:integrationId', async (req, res) => {
    try {
        const { integrationId } = req.params;
        const integration = await Integration.findOne({ _id: integrationId, tenantId: req.user.tenant_id });

        if (!integration) {
            return res.status(404).json({ error: 'Integration not found' });
        }

             const storeKey = getIntegrationStoreKey(integration);
        const relatedIntegrations = await Integration.find({
          tenantId: req.user.tenant_id,
          storeType: integration.storeType
        });
        const integrationsToDelete = relatedIntegrations.filter((item) => getIntegrationStoreKey(item) === storeKey);
                for (const currentIntegration of integrationsToDelete) {
            if (
              currentIntegration.storeType === 'shopify' &&
              currentIntegration.adminAccessToken &&
              Array.isArray(currentIntegration.shopifyWebhookSubscriptions) &&
              currentIntegration.shopifyWebhookSubscriptions.length > 0
            ) {
                try {
                    const shopifyApi = new ShopifyApiService(
                      currentIntegration.storeUrl,
                      currentIntegration.adminAccessToken,
                      currentIntegration.apiConfig?.version || '2024-10'
                    );
                const uniqueWebhookIds = [...new Set(
                      currentIntegration.shopifyWebhookSubscriptions
                        .map((subscription) => subscription?.webhookId)
                        .filter(Boolean)
                    )];
                     for (const webhookId of uniqueWebhookIds) {
                        try {
                            await shopifyApi.deleteWebhook(webhookId);
                        } catch (webhookDeleteError) {
                            console.error(
                              `[Integration Delete] Failed to remove Shopify webhook ${webhookId}:`,
                              webhookDeleteError.response?.data || webhookDeleteError.message
                            );
                        }
                      
                     }
                     } catch (shopifyCleanupError) {
                    console.error(
                      '[Integration Delete] Failed to initialize Shopify webhook cleanup:',
                      shopifyCleanupError.response?.data || shopifyCleanupError.message
                    );

                }

            }
        }

     await Integration.deleteMany({
          _id: { $in: integrationsToDelete.map((item) => item._id) }
        });

        res.json({
          success: true,
          message: integrationsToDelete.length > 1
            ? 'Duplicate integrations removed'
            : 'Integration removed'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove integration' });
    }
});

// ============ PUBLIC WEBHOOK ROUTES ============

router.post('/woocommerce/:integrationId', async (req, res) => {
  try {
    const { integrationId } = req.params;
    const integration = await Integration.findById(integrationId);
    if (!integration) return res.status(404).send('Integration not found');

    const tenant = await Tenant.findById(integration.tenantId);
    if (!tenant) return res.status(404).send('Tenant not found');

    // Handle data parsing (Express might give us an object or a string)
    let data = req.body;
    if (Buffer.isBuffer(req.body)) data = JSON.parse(req.body.toString());
    if (typeof req.body === 'string') data = JSON.parse(req.body);

    // Identify Topic
    const topic = req.headers['x-wc-webhook-topic'] || data.topic || 'unknown';
    const orderStatus = getWooCommerceOrderStatus(data);
    
    // ✅ DEEP SEARCH FOR PHONE: Looks for every possible WooCommerce field name
    const phone = data.billing_phone || 
                  data.billing?.phone || 
                  data.shipping?.phone || 
                  (data.customer_details && data.customer_details.billing?.phone) ||
                  data.phone;

    console.log(`\n--- WooCommerce Incoming Webhook ---`);
    console.log(`Topic: ${topic}`);
    console.log(`Phone Found: ${phone || '❌ NOT FOUND'}`);
    console.log(`Order/Cart ID: ${data.id || data.cart_hash || 'N/A'}`);
    
    // If phone is missing, log the whole body to see what WooCommerce is sending
    if (!phone) {
        console.log(`DEBUG DATA keys:`, Object.keys(data));
    }

    // 🛒 Logic for Abandoned Cart (PHP Snippet OR Pending Orders)
    if ((topic === 'cart.updated' || topic === 'order.created') && integration.isAbandonedCartEnabled) {
      if (phone) {
        console.log(`✅ Triggering Abandoned Cart for: ${phone}`);
        await abandonedCartService.scheduleReminder('woocommerce', data, integration);
      }
    }

    // 💰 Logic for Paid Orders (Confirmation)
    if (isWooCommerceOrderConfirmationEvent(topic, data)) {
       if (integration.isMessageEnabled) {
         await handleOrderConfirmation(data, tenant, 'woocommerce');
       } else {
         console.log('[WooCommerce] Order confirmation skipped because messaging is disabled for this integration');
       }

       if (phone) {
         abandonedCartService.cancelTimer(tenant._id.toString(), phone);
       }
    } else if (topic === 'order.created' || topic === 'order.updated') {
       console.log(`[WooCommerce] Order confirmation not triggered for status "${orderStatus || 'unknown'}"`);

    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('💥 WooCommerce Error:', error.message);
    res.status(200).send('Error');
  }
});


router.post('/shopify/:integrationId', async (req, res) => {
  try {
    const { integrationId } = req.params;

        const integration = await Integration.findById(integrationId);
    if (!integration) {
      console.warn(`[Shopify Webhook] Stale webhook received for missing integration ${integrationId}. Acknowledging to stop Shopify retries.`);
      return res.status(200).send('Webhook received');
    }

    const shopifySecret = getShopifyWebhookSecret(integration);
    if (shopifySecret && !verifyShopifyWebhookSignature(req, shopifySecret)) {
      console.error(`[Shopify Webhook] ❌ Invalid webhook signature for integration ${integrationId}`);
      return res.status(401).send('Invalid webhook signature');
    }

    const tenant = await Tenant.findById(integration.tenantId);
    if (!tenant) {
      console.error(`[Shopify Webhook] ❌ Tenant not found: ${integration.tenantId}`);
      return res.status(404).send('Tenant not found');
    }

    // ✅ FIX: Safely parse webhook data (handles Buffers, Strings, and Objects)
    let webhookData;
    if (Buffer.isBuffer(req.body)) {
        webhookData = JSON.parse(req.body.toString());
    } else if (typeof req.body === 'string') {
        webhookData = JSON.parse(req.body);
    } else {
        webhookData = req.body; // It's already an object (express.json parsed it)
    }

    const topic = req.headers['x-shopify-topic'];

    console.log(`[Shopify Webhook] ═══════════════════════════════════════`);
    console.log(`[Shopify Webhook] 📨 Topic: ${topic}`);
    console.log(`[Shopify Webhook] 🔗 Integration ID: ${integrationId}`);
    console.log(`[Shopify Webhook] ⚙️  Current Settings:`, {
      isMessageEnabled: integration.isMessageEnabled,
      isAbandonedCartEnabled: integration.isAbandonedCartEnabled,
      isDispatchedMessageEnabled: integration.isDispatchedMessageEnabled,
      isRestockEnabled: integration.isRestockEnabled,
      restockTemplateName: integration.restockTemplateName,
      restockNotificationMode: integration.restockNotificationMode
    });

    // ✅ Handle Order Creation/Payment
    if (topic === 'orders/create' || topic === 'orders/paid') {
      console.log(`[Shopify Order] 🛍️  Processing order ${webhookData.id || webhookData.order_number}`);

      // Send order confirmation message
      if (integration.isMessageEnabled) {
        await handleOrderConfirmation(webhookData, tenant, 'shopify');
      }

      // ✅ Get phone number
      const phone = webhookData.customer?.phone ||
                    webhookData.shipping_address?.phone ||
                    webhookData.billing_address?.phone;

      if (!phone) {
        console.error(`[Shopify Order] ❌ No phone number found in order webhook!`);
        return res.status(200).send('Webhook received');
      }

      // Format phone number
      const cleanedPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanedPhone.startsWith('91') ? `+${cleanedPhone}` : `+91${cleanedPhone}`;

      console.log(`[Shopify Order] 📱 Customer phone: ${formattedPhone}`);

      // ✅ Try cart_token first (to stop abandoned cart timer)
      const cartToken = webhookData.cart_token || webhookData.token;

      if (cartToken) {
        console.log(`[Shopify Order] 🔄 Trying to mark cart by token: ${cartToken}`);
        try {
          const result = await abandonedCartService.markCartAsConverted(
            'shopify',
            cartToken,
            webhookData.id.toString()
          );
          console.log(`[Shopify Order] ✅ Cart mark result:`, result ? 'Success' : 'Not Found');
        } catch (error) {
          console.error(`[Shopify Order] ❌ Error marking cart:`, error.message);
        }
      } else {
        // No cart token - use phone fallback
        console.log(`[Shopify Order] 🔄 No cart token - using phone fallback`);
        try {
          await abandonedCartService.markCartAsConvertedByPhone(
            integration.tenantId,
            formattedPhone,
            webhookData.id.toString()
          );
   
        } catch (error) {
          console.error(`[Shopify Order] ❌ Error marking by phone:`, error.message);
        }
      }
    }
    // ✅ Handle Abandoned Cart (Checkout webhooks)
    else if (topic === 'checkouts/create' || topic === 'checkouts/update') {
      // ✅ CRITICAL: Explicit boolean check
      if (integration.isAbandonedCartEnabled === true) {
        console.log(`[Shopify Checkout] ✅ Scheduling abandoned cart reminder...`);
        try {
          await abandonedCartService.scheduleReminder('shopify', webhookData, integration);
        } catch (reminderError) {
          console.error(`[Shopify Checkout] ❌ Failed to schedule reminder:`, reminderError.message);
        }
      } else {
        console.log(`[Shopify Checkout] ⚠️  Abandoned cart feature is DISABLED`);
      }
    }
    // ✅ Handle Order Fulfillment/Dispatch
    else if (topic === 'fulfillments/create' || topic === 'fulfillments/update') {
      console.log(`[Shopify Fulfillment] 📦 Processing fulfillment for order ${webhookData.order_id}`);
      if (integration.isDispatchedMessageEnabled) {
        try {
          await handleOrderDispatched(webhookData, tenant, integration, 'shopify');
          console.log(`[Shopify Fulfillment] ✅ Dispatch message sent successfully`);
        } catch (dispatchError) {
          console.error(`[Shopify Fulfillment] ❌ Error sending dispatch:`, dispatchError.message);
        }
      } else {
        console.log(`[Shopify Fulfillment] Dispatch messages disabled`);
      }
    }

    // ✅ Handle Shopify restock alerts
    else if (topic === 'variants/in_stock') {
      console.log(`[Shopify Restock] 🔔 Variant ${webhookData.id} is back in stock`);

      if (integration.isRestockEnabled) {
        try {
          const restockResult = await processVariantBackInStock({
            integration,
            tenant,
            webhookData
          });

          console.log('[Shopify Restock] ✅ Processing complete:', restockResult);
        } catch (restockError) {
          console.error('[Shopify Restock] ❌ Failed to process restock webhook:', restockError.message);
        }
      } else {
        console.log('[Shopify Restock] Restock alerts disabled');
      }
    }
   
    console.log(`[Shopify Webhook] ═══════════════════════════════════════`);
    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('💥 SHOPIFY WEBHOOK ERROR:', error.message);
    console.error(error.stack);
    res.status(200).send('Webhook received with errors');
  }
});

module.exports = router;

