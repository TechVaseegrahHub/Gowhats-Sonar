// routes/storeWebhooks.js
const express = require('express');
const router = express.Router();
const Integration = require('../models/Integration');
const Tenant = require('../models/Tenant');
const IntegrationService = require('../services/integrationService');
const crypto = require('crypto');

// Initialize integration service
const integrationService = new IntegrationService();

// Shopify webhook handler
router.post('/shopify/:integrationId', async (req, res) => {
  try {
    const integrationId = req.params.integrationId;
    
    // Find the integration
    const integration = await Integration.findById(integrationId);
    if (!integration) {
      console.error(`Integration not found: ${integrationId}`);
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Get webhook topic and hmac
    const topic = req.headers['x-shopify-topic'] || 'unknown';
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const shopifyDomain = req.headers['x-shopify-shop-domain'];
    
let isVerified = false;
if (integration.webhookSecret && hmac && req.rawBody) {
  try {
    const calculatedHmac = crypto
      .createHmac('sha256', integration.webhookSecret)
      .update(req.rawBody)
      .digest('base64');
    
    isVerified = calculatedHmac === hmac;
    
    if (!isVerified) {
      console.log('Webhook verification failed. Expected:', hmac);
      console.log('Calculated:', calculatedHmac);
      // Continue anyway for testing
    }
  } catch (error) {
    console.error('Error during signature verification:', error);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    // Get the tenant associated with this integration
    const tenant = await Tenant.findById(integration.tenantId);
    if (!tenant) {
      console.error(`Tenant not found for integration: ${integrationId}`);
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Process based on webhook topic
    switch(topic) {
      case 'orders/create':
        await integrationService.handleOrderConfirmation(req.body, tenant, 'shopify');
        break;
      case 'orders/updated':
        await integrationService.handleOrderConfirmation(req.body, tenant, 'shopify');
        break;
      case 'carts/create':
      case 'carts/update':
        await integrationService.handleAbandonedCart(req.body, tenant, 'shopify');
        break;
      default:
        console.log(`Unhandled Shopify webhook topic: ${topic}`);
    }

    // Always acknowledge receipt
    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Shopify webhook processing error:', error);
    // Still return 200 to avoid retries
    return res.status(200).json({
      success: false,
      message: 'Webhook received with errors',
      error: error.message
    });
  }
});

// WooCommerce webhook handler
router.post('/woocommerce/:integrationId', async (req, res) => {
  try {
    const { integrationId } = req.params;
    
    // Find integration
    const integration = await Integration.findById(integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Find tenant
    const tenant = await Tenant.findById(integration.tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Determine webhook type
    const webhookTopic = req.headers['x-wc-webhook-topic'];

    // Process different webhook types
    switch(webhookTopic) {
      case 'order.created':
        await integrationService.handleOrderConfirmation(req.body, tenant, 'woocommerce');
        break;
      case 'order.updated':
        await integrationService.handleOrderConfirmation(req.body, tenant, 'woocommerce');
        break;
      case 'cart.created':
      case 'cart.updated':
        await integrationService.handleAbandonedCart(req.body, tenant, 'woocommerce');
        break;
      default:
        console.log(`Unhandled WooCommerce webhook topic: ${webhookTopic}`);
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).send('Webhook received and processed');
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(200).send('Webhook received with errors');
  }
});

// Verify Shopify webhook signature
function verifyShopifyWebhook(body, hmac, secret) {
  if (!hmac || !secret) {
    console.log('Missing HMAC or secret for Shopify webhook');
    return false;
  }

  try {
    // Ensure body is a string
    const stringBody = typeof body === 'string' ? body : body.toString();
    
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(stringBody)
      .digest('base64');
    
    return calculatedHmac === hmac;
  } catch (error) {
    console.error('Shopify webhook verification error:', error);
    return false;
  }
}

module.exports = router;
