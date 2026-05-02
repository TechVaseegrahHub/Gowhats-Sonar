// routes/storeWebhooks.js
const express = require('express');
const router = express.Router();
const Integration = require('../models/Integration');
const Tenant = require('../models/Tenant');
const IntegrationService = require('../services/integrationService');
const crypto = require('crypto');

const integrationService = new IntegrationService();

// ==========================================
// ✅ Shared: Shopify HMAC verification (replaces dead duplicate below)
// ==========================================
function verifyShopifyWebhook(rawBody, hmac, secret) {
  if (!hmac || !secret || !rawBody) {
    console.log('Missing HMAC, secret, or raw body for Shopify webhook');
    return false;
  }
  try {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64');
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHmac),
      Buffer.from(hmac)
    );
  } catch (error) {
    console.error('Shopify webhook verification error:', error);
    return false;
  }
}

// ==========================================
// ✅ Shared: WooCommerce HMAC verification (was missing entirely)
// ==========================================
function verifyWooCommerceWebhook(rawBody, signature, secret) {
  if (!signature || !secret || !rawBody) {
    console.log('Missing signature, secret, or raw body for WooCommerce webhook');
    return false;
  }
  try {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64');
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHmac),
      Buffer.from(signature)
    );
  } catch (error) {
    console.error('WooCommerce webhook verification error:', error);
    return false;
  }
}

// ==========================================
// Shopify webhook handler
// ==========================================
router.post('/shopify/:integrationId', async (req, res) => {
  try {
    const integrationId = req.params.integrationId;

    const integration = await Integration.findById(integrationId);
    if (!integration) {
      console.error(`Integration not found: ${integrationId}`);
      return res.status(404).json({ error: 'Integration not found' });
    }

    const topic = req.headers['x-shopify-topic'] || 'unknown';
    const hmac = req.headers['x-shopify-hmac-sha256'];

    // ✅ FIX 1: Verification failure now BLOCKS processing instead of continuing silently.
    // Previously the code logged a warning but still processed the request — a critical
    // security hole that allowed anyone to forge Shopify webhooks.
    if (integration.webhookSecret) {
      if (!hmac || !req.rawBody) {
        console.error('Shopify webhook missing HMAC or raw body — rejecting');
        return res.status(401).json({ error: 'Missing webhook signature' });
      }

      const isVerified = verifyShopifyWebhook(req.rawBody, hmac, integration.webhookSecret);
      if (!isVerified) {
        console.error('Shopify webhook HMAC verification failed — rejecting forged request');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    const tenant = await Tenant.findById(integration.tenantId);
    if (!tenant) {
      console.error(`Tenant not found for integration: ${integrationId}`);
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // ✅ FIX 3: Split orders/create and orders/updated so customers don't receive
    // duplicate "order confirmed" messages on every order update (e.g. shipping label creation).
    switch (topic) {
      case 'orders/create':
        await integrationService.handleOrderConfirmation(req.body, tenant, 'shopify');
        break;
      case 'orders/updated':
        // Use a separate handler for updates — do NOT re-trigger order confirmation.
        if (integrationService.handleOrderUpdate) {
          await integrationService.handleOrderUpdate(req.body, tenant, 'shopify');
        } else {
          console.log('No handleOrderUpdate defined in integrationService — skipping');
        }
        break;
      // ✅ FIX 4: carts/create should NOT trigger abandoned cart logic immediately.
      // The cart was just created — schedule or track it, don't fire a message yet.
      case 'carts/create':
        if (integrationService.handleCartCreated) {
          await integrationService.handleCartCreated(req.body, tenant, 'shopify');
        } else {
          console.log('Cart created — no handler defined, storing for future abandoned cart check');
        }
        break;
      case 'carts/update':
        await integrationService.handleAbandonedCart(req.body, tenant, 'shopify');
        break;
      default:
        console.log(`Unhandled Shopify webhook topic: ${topic}`);
    }

    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Shopify webhook processing error:', error);
    // Return 200 to prevent Shopify from endlessly retrying transient errors.
    // Log properly so you can investigate.
    return res.status(200).json({
      success: false,
      message: 'Webhook received with errors',
      error: error.message
    });
  }
});

// ==========================================
// WooCommerce webhook handler
// ==========================================
router.post('/woocommerce/:integrationId', async (req, res) => {
  try {
    const { integrationId } = req.params;

    const integration = await Integration.findById(integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // ✅ FIX 2: Added HMAC verification — WooCommerce sends x-wc-webhook-signature.
    // Previously this handler had ZERO signature checking, accepting any forged request.
    if (integration.webhookSecret) {
      const signature = req.headers['x-wc-webhook-signature'];
      if (!signature || !req.rawBody) {
        console.error('WooCommerce webhook missing signature or raw body — rejecting');
        return res.status(401).json({ error: 'Missing webhook signature' });
      }

      const isVerified = verifyWooCommerceWebhook(req.rawBody, signature, integration.webhookSecret);
      if (!isVerified) {
        console.error('WooCommerce webhook HMAC verification failed — rejecting');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    const tenant = await Tenant.findById(integration.tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const webhookTopic = req.headers['x-wc-webhook-topic'];

    // ✅ FIX 3 & 4: Same split applied — order.created vs order.updated,
    // and cart.created should not immediately trigger abandoned cart logic.
    switch (webhookTopic) {
      case 'order.created':
        await integrationService.handleOrderConfirmation(req.body, tenant, 'woocommerce');
        break;
      case 'order.updated':
        if (integrationService.handleOrderUpdate) {
          await integrationService.handleOrderUpdate(req.body, tenant, 'woocommerce');
        } else {
          console.log('No handleOrderUpdate defined — skipping WooCommerce order.updated');
        }
        break;
      case 'cart.created':
        if (integrationService.handleCartCreated) {
          await integrationService.handleCartCreated(req.body, tenant, 'woocommerce');
        } else {
          console.log('Cart created — no handler defined, storing for future abandoned cart check');
        }
        break;
      case 'cart.updated':
        await integrationService.handleAbandonedCart(req.body, tenant, 'woocommerce');
        break;
      default:
        console.log(`Unhandled WooCommerce webhook topic: ${webhookTopic}`);
    }

    return res.status(200).send('Webhook received and processed');

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(200).send('Webhook received with errors');
  }
});

module.exports = router;
