const crypto = require('crypto');
const express = require('express');

const Integration = require('../models/Integration');
const Tenant = require('../models/Tenant');
const WhatsAppService = require('../services/whatsappServices');
const {
  getPendingSubscriptionStatus,
  processProductBackInStock,
  queueRestockRequest
} = require('../services/woocommerceRestockService');

const router = express.Router();

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function resolveWooCommerceContext(req) {
  const { integrationId } = req.params;

  const integration = await Integration.findOne({
    _id: integrationId,
    storeType: 'woocommerce',
    isActive: true
  });

  if (!integration) {
    return { error: 'WooCommerce integration not found', status: 404 };
  }

  const providedSecret = req.headers['x-gowhats-secret'];
  if (!safeCompare(providedSecret, integration.webhookSecret)) {
    return { error: 'Invalid WooCommerce restock secret', status: 401 };
  }

  const tenant = await Tenant.findById(integration.tenantId);
  if (!tenant) {
    return { error: 'Tenant not found for this WooCommerce store', status: 404 };
  }

  return {
    integration,
    tenant,
    storeUrl: integration.storeUrl
  };
}

async function resolvePublicWooCommerceContext(integrationId) {
  const integration = await Integration.findOne({
    _id: integrationId,
    storeType: 'woocommerce',
    isActive: true
  });

  if (!integration) {
    return { error: 'WooCommerce integration not found', status: 404 };
  }

  const tenant = await Tenant.findById(integration.tenantId);
  if (!tenant) {
    return { error: 'Tenant not found for this WooCommerce store', status: 404 };
  }

  return {
    integration,
    tenant,
    storeUrl: integration.storeUrl
  };
}

function buildPublicRestockConfig(integration, tenant) {
  return {
    success: true,
    enabled: !!integration?.isRestockEnabled,
    brandName: tenant?.businessName || tenant?.name || 'GoWhats',
    ctaLabel: integration?.restockCtaLabel || 'Request stock',
    phonePlaceholder: integration?.restockPhonePlaceholder || 'Enter your WhatsApp number',
    helperText: integration?.restockSuccessDescription || 'Get notified on WhatsApp when the product comes back in stock',
    defaultCountry: integration?.restockDefaultCountry || 'IN'
  };
}

router.get('/public/:integrationId/config', async (req, res) => {
  try {
    const resolved = await resolvePublicWooCommerceContext(req.params.integrationId);
    if (resolved.error) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    return res.json(buildPublicRestockConfig(resolved.integration, resolved.tenant));
  } catch (error) {
    console.error('[WooCommerce Restock] Public config error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load restock form' });
  }
});

router.post('/public/:integrationId/subscribe', async (req, res) => {
  try {
    const resolved = await resolvePublicWooCommerceContext(req.params.integrationId);
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
    const variationId =
      req.body?.variationId ||
      req.body?.variation_id ||
      '';

    if (!phoneNumber || !productId) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber and productId are required'
      });
    }

    const result = await queueRestockRequest({
      integration,
      tenant,
      storeUrl,
      productId,
      variationId,
      productTitle: req.body?.productTitle || req.body?.product_title || '',
      variationTitle: req.body?.variationTitle || req.body?.variation_title || '',
      productUrl: req.body?.productUrl || req.body?.product_url || '',
      productImageUrl: req.body?.productImageUrl || req.body?.product_image_url || '',
      phoneNumber,
      customerName: req.body?.customerName || req.body?.customer_name || '',
      requestContext: {
        siteUrl: req.body?.siteUrl || req.body?.site_url || '',
        pluginVersion: req.body?.pluginVersion || req.body?.plugin_version || '',
        ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        source: 'gowhats_public_page'
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

    console.error('[WooCommerce Restock] Public subscribe error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save restock request'
    });
  }
});


router.get('/:integrationId/status', async (req, res) => {
  try {
    const resolved = await resolveWooCommerceContext(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    const { integration, tenant } = resolved;
    const productId = String(req.query?.productId || req.query?.product_id || '').trim();
    const variationId = String(req.query?.variationId || req.query?.variation_id || '').trim();

    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId is required' });
    }

    const phoneNumber = req.query?.phoneNumber || req.query?.phone || req.query?.whatsappNumber;
    const whatsappService = new WhatsAppService(tenant);
    const normalizedPhoneNumber = phoneNumber
      ? whatsappService.formatPhoneNumber(phoneNumber)
      : null;

    const status = await getPendingSubscriptionStatus({
      integrationId: integration._id,
      tenantId: String(tenant._id),
      productId,
      variationId,
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
    console.error('[WooCommerce Restock] Status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch restock status' });
  }
});

router.post('/:integrationId/subscribe', async (req, res) => {
  try {
    const resolved = await resolveWooCommerceContext(req);
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
    const variationId =
      req.body?.variationId ||
      req.body?.variation_id ||
      '';

    if (!phoneNumber || !productId) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber and productId are required'
      });
    }

    const result = await queueRestockRequest({
      integration,
      tenant,
      storeUrl,
      productId,
      variationId,
      productTitle: req.body?.productTitle || req.body?.product_title || '',
      variationTitle: req.body?.variationTitle || req.body?.variation_title || '',
      productUrl: req.body?.productUrl || req.body?.product_url || '',
      productImageUrl: req.body?.productImageUrl || req.body?.product_image_url || '',
      phoneNumber,
      customerName: req.body?.customerName || req.body?.customer_name || '',
      requestContext: {
        siteUrl: req.body?.siteUrl || req.body?.site_url || '',
        pluginVersion: req.body?.pluginVersion || req.body?.plugin_version || '',
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

    console.error('[WooCommerce Restock] Subscribe error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save restock request'
    });
  }
});

router.post('/:integrationId/stock-update', async (req, res) => {
  try {
    const resolved = await resolveWooCommerceContext(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    const { integration, tenant } = resolved;

    const result = await processProductBackInStock({
      integration,
      tenant,
      webhookData: {
        productId: req.body?.productId || req.body?.product_id || '',
        variationId: req.body?.variationId || req.body?.variation_id || '',
        stockQuantity: req.body?.stockQuantity ?? req.body?.stock_quantity ?? 0,
        inStock: parseBoolean(req.body?.inStock ?? req.body?.in_stock),
        productTitle: req.body?.productTitle || req.body?.product_title || '',
        variationTitle: req.body?.variationTitle || req.body?.variation_title || '',
        productUrl: req.body?.productUrl || req.body?.product_url || '',
        productImageUrl: req.body?.productImageUrl || req.body?.product_image_url || ''
      }
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[WooCommerce Restock] Stock update error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process stock update'
    });
  }
});

module.exports = router;

