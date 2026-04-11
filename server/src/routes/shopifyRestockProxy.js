const express = require('express');

const Integration = require('../models/Integration');
const Tenant = require('../models/Tenant');
const {
  getPendingSubscriptionStatus,
  queueRestockRequest
} = require('../services/shopifyRestockService');
const WhatsAppService = require('../services/whatsappServices');
const {
  getProxyShopDomain,
  verifyShopifyAppProxySignature
} = require('../utils/shopifyAppProxy');

const router = express.Router();

async function resolveRestockContext(req) {
  const storeUrl = getProxyShopDomain(req);

  if (!storeUrl) {
    return { error: 'Invalid Shopify shop domain', status: 400 };
  }

  const integration = await Integration.findOne({
    storeType: 'shopify',
    storeUrl,
    isActive: true
  });

  if (!integration) {
    return { error: 'Shopify integration not found for this shop', status: 404 };
  }

  const tenant = await Tenant.findById(integration.tenantId);

  if (!tenant) {
    return { error: 'Tenant not found for this Shopify store', status: 404 };
  }

  return { integration, storeUrl, tenant };
}

router.get('/status', async (req, res) => {
  try {
    if (!verifyShopifyAppProxySignature(req)) {
      return res.status(401).json({ success: false, error: 'Invalid app proxy signature' });
    }

    const resolved = await resolveRestockContext(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    const { integration, tenant } = resolved;
    const variantId = String(req.query?.variantId || req.query?.variant_id || '').trim();

    if (!variantId) {
      return res.status(400).json({ success: false, error: 'variantId is required' });
    }

    const phoneNumber = req.query?.phoneNumber || req.query?.phone || req.query?.whatsappNumber;
    const whatsappService = new WhatsAppService(tenant);
    const normalizedPhoneNumber = phoneNumber
      ? whatsappService.formatPhoneNumber(phoneNumber)
      : null;

    const status = await getPendingSubscriptionStatus({
      integrationId: integration._id,
      tenantId: String(tenant._id),
      variantId,
      normalizedPhoneNumber
    });

    return res.json({
      success: true,
      enabled: !!integration.isRestockEnabled,
      templateName: integration.restockTemplateName || '',
      pendingCount: status.pendingCount,
      alreadySubscribed: status.alreadySubscribed
    });
  } catch (error) {
    console.error('[Shopify Restock Proxy] Status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch restock status' });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    if (!verifyShopifyAppProxySignature(req)) {
      return res.status(401).json({ success: false, error: 'Invalid app proxy signature' });
    }

    const resolved = await resolveRestockContext(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    const { integration, storeUrl, tenant } = resolved;

    if (!integration.isRestockEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Restock alerts are disabled for this store'
      });
    }

    const phoneNumber =
      req.body?.phoneNumber ||
      req.body?.phone ||
      req.body?.whatsappNumber ||
      '';
    const productId =
      req.body?.productId ||
      req.body?.product_id ||
      '';
    const variantId =
      req.body?.variantId ||
      req.body?.variant_id ||
      '';

    if (!phoneNumber || !productId || !variantId) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber, productId, and variantId are required'
      });
    }

    const result = await queueRestockRequest({
      integration,
      tenant,
      storeUrl,
      productId,
      variantId,
      productTitle: req.body?.productTitle || req.body?.product_title || '',
      variantTitle: req.body?.variantTitle || req.body?.variant_title || '',
      productUrl: req.body?.productUrl || req.body?.product_url || '',
      productImageUrl: req.body?.productImageUrl || req.body?.product_image_url || '',
      phoneNumber,
      customerName: req.body?.customerName || req.body?.customer_name || '',
      proxyContext: {
        shop: req.query?.shop || '',
        loggedInCustomerId: req.query?.logged_in_customer_id || '',
        pathPrefix: req.query?.path_prefix || '',
        ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      }
    });

    return res.json({
      success: true,
      alreadySubscribed: result.alreadySubscribed,
      message: result.alreadySubscribed
        ? 'This number is already waiting for a restock alert'
        : 'Stock request saved successfully',
      subscriptionId: result.request?._id || null
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.json({
        success: true,
        alreadySubscribed: true,
        message: 'This number is already waiting for a restock alert'
      });
    }

    console.error('[Shopify Restock Proxy] Subscribe error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save restock request'
    });
  }
});

module.exports = router;

