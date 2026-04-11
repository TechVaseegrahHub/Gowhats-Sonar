const axios = require('axios');
const DEFAULT_WOOCOMMERCE_WEBHOOK_TOPICS = [
  'order.created',
  'order.updated'
];

function normalizeStoreUrl(storeUrl = '') {
  const trimmed = String(storeUrl || '').trim();
  if (!trimmed) {
    throw new Error('Store URL is required');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, '');
}

class WooCommerceApiService {
  constructor(storeUrl, consumerKey, consumerSecret, apiVersion = 'wc/v3') {
    this.storeUrl = normalizeStoreUrl(storeUrl);
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.apiVersion = apiVersion;
  }

  async makeRequest(endpoint, method = 'GET', data = null, params = {}) {
    const url = `${this.storeUrl}/wp-json/${this.apiVersion}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const response = await axios({
      url,
      method,
      data,
      params: {
        ...params,
        consumer_key: this.consumerKey,
        consumer_secret: this.consumerSecret
      },
      timeout: 15000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  async getProduct(productId) {
    return this.makeRequest(`/products/${productId}`);
  }

  async getVariation(productId, variationId) {
    return this.makeRequest(`/products/${productId}/variations/${variationId}`);
  }
async listWebhooks() {
    const response = await this.makeRequest('/webhooks');
    return Array.isArray(response) ? response : [];
  }

  async createWebhook(topic, deliveryUrl, options = {}) {
    return this.makeRequest('/webhooks', 'POST', {
      name: options.name || `GoWhats ${topic}`,
      topic,
      delivery_url: deliveryUrl,
      status: options.status || 'active',
      secret: options.secret || undefined
    });
  }

  async updateWebhook(webhookId, data = {}) {
    if (!webhookId) {
      throw new Error('Webhook ID is required');
    }

    return this.makeRequest(`/webhooks/${webhookId}`, 'PUT', data);
  }

  async deleteWebhook(webhookId) {
    if (!webhookId) return null;
    return this.makeRequest(`/webhooks/${webhookId}`, 'DELETE', null, { force: true });
  }

  async ensureWebhooks(deliveryUrl, topics = DEFAULT_WOOCOMMERCE_WEBHOOK_TOPICS, options = {}) {
    const existingWebhooks = await this.listWebhooks();
    const ensuredWebhooks = [];

    for (const topic of topics) {
      const existingWebhook = existingWebhooks.find((webhook) => (
        webhook?.topic === topic &&
        webhook?.delivery_url === deliveryUrl
      ));

      if (existingWebhook) {
        const webhookStatus = String(existingWebhook?.status || '').toLowerCase();

        if (webhookStatus && webhookStatus !== 'active') {
          const reactivatedWebhook = await this.updateWebhook(existingWebhook.id, { status: 'active' });
          ensuredWebhooks.push(reactivatedWebhook || existingWebhook);
        } else {
          ensuredWebhooks.push(existingWebhook);
        }

        continue;
      }

      const createdWebhook = await this.createWebhook(topic, deliveryUrl, {
        name: options.namePrefix ? `${options.namePrefix} ${topic}` : `GoWhats ${topic}`,
        secret: options.secret
      });
      ensuredWebhooks.push(createdWebhook);
    }

    return ensuredWebhooks;
  }
}

WooCommerceApiService.DEFAULT_WEBHOOK_TOPICS = DEFAULT_WOOCOMMERCE_WEBHOOK_TOPICS;

module.exports = WooCommerceApiService;

