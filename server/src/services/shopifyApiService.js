// services/shopifyApiService.js
const axios = require('axios');
const DEFAULT_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/paid',
  'checkouts/create',
  'checkouts/update',
  'fulfillments/create',
  'fulfillments/update',
   'fulfillments/update',
  'variants/in_stock'
];

class ShopifyApiService {
  constructor(storeUrl, adminAccessToken, apiVersion = '2024-10') {
    this.shopDomain = ShopifyApiService.normalizeShopDomain(storeUrl);

    if (!this.shopDomain) {
      throw new Error('Invalid Shopify shop domain');
    }

    this.storeUrl = `https://${this.shopDomain}`;
    this.adminAccessToken = adminAccessToken;
    this.apiVersion = apiVersion;
    this.baseUrl = `${this.storeUrl}/admin/api/${this.apiVersion}`;
  }

  static normalizeShopDomain(input = '') {
    const trimmed = String(input || '').trim().toLowerCase();
    if (!trimmed || trimmed.includes('@')) return null;

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      const parsed = new URL(withProtocol);
      const host = parsed.hostname.replace(/^www\./, '');
      if (!host.endsWith('.myshopify.com')) return null;
      return host;
    } catch (_error) {
      return null;
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    const fullUrl = `${this.baseUrl}${endpoint}`;
    console.log(`   [Shopify API Service] Making request: ${method} ${fullUrl}`);

    try {
      const config = {
        method,
        url: fullUrl,
        headers: {
          'X-Shopify-Access-Token': this.adminAccessToken,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      console.log(`   [Shopify API Service] Request successful. Status: ${response.status}`);
      return response.data;
    } catch (error) {
      console.error('   [Shopify API Service] Request failed');

      if (error.response) {
        console.error(`   - Status: ${error.response.status} ${error.response.statusText}`);
        console.error(`   - Data: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        console.error('   - No response was received.');
      } else {
        console.error('   - Error setting up the request:', error.message);
      }

      throw error;
    }
  }

  async makeGraphQLRequest(query, variables = {}) {
    const fullUrl = `${this.baseUrl}/graphql.json`;
    console.log(`   [Shopify API Service] Making GraphQL request: ${fullUrl}`);

    try {
      const response = await axios({
        method: 'POST',
        url: fullUrl,
        headers: {
          'X-Shopify-Access-Token': this.adminAccessToken,
          'Content-Type': 'application/json'
        },
        data: { query, variables }
      });

      if (Array.isArray(response.data?.errors) && response.data.errors.length > 0) {
        const error = new Error(response.data.errors.map((item) => item.message).join('; '));
        error.response = { data: response.data, status: response.status };
        throw error;
      }

      return response.data?.data || {};
    } catch (error) {
      console.error('   [Shopify API Service] GraphQL request failed');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Data: ${JSON.stringify(error.response.data)}`);
      } else {
        console.error('   - Error:', error.message);
      }
      throw error;
    }
  }

  async getActiveAppSubscriptions() {
    const data = await this.makeGraphQLRequest(`
      query GoWhatsActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
            trialDays
            createdAt
            currentPeriodEnd
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    interval
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    return data?.currentAppInstallation?.activeSubscriptions || [];
  }

  async createRecurringAppSubscription({
    name,
    amount,
    currencyCode = 'USD',
    returnUrl,
    interval = 'EVERY_30_DAYS',
    test = false,
    trialDays = 0
  }) {
    const data = await this.makeGraphQLRequest(`
      mutation GoWhatsAppSubscriptionCreate(
        $name: String!,
        $returnUrl: URL!,
        $lineItems: [AppSubscriptionLineItemInput!]!,
        $test: Boolean,
        $trialDays: Int
      ) {
        appSubscriptionCreate(
          name: $name,
          returnUrl: $returnUrl,
          lineItems: $lineItems,
          test: $test,
          trialDays: $trialDays,
          replacementBehavior: APPLY_IMMEDIATELY
        ) {
          userErrors {
            field
            message
          }
          confirmationUrl
          appSubscription {
            id
            status
          }
        }
      }
    `, {
      name,
      returnUrl,
      test: Boolean(test),
      trialDays: Number(trialDays || 0),
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: Number(amount),
                currencyCode: String(currencyCode || 'USD').toUpperCase()
              },
              interval
            }
          }
        }
      ]
    });

    const payload = data?.appSubscriptionCreate || {};
    if (Array.isArray(payload.userErrors) && payload.userErrors.length > 0) {
      throw new Error(payload.userErrors.map((item) => item.message).join('; '));
    }

    return payload;
  }

  async verifyConnection() {
    const response = await this.makeRequest('/shop.json');
    return response.shop;
  }

  async getOrder(orderId) {
   const response = await this.makeRequest(`/orders/${orderId}.json`);
    return response.order;
  }

  async getProduct(productId) {
    const response = await this.makeRequest(`/products/${productId}.json`);
    return response.product;
  }

  async listWebhooks() {
    const response = await this.makeRequest('/webhooks.json');
    return Array.isArray(response?.webhooks) ? response.webhooks : [];
  }

  async createWebhook(topic, address) {
    const response = await this.makeRequest('/webhooks.json', 'POST', {
      webhook: {
        topic,
        address,
        format: 'json'
      }
    });

    return response?.webhook || null;
  }

  async deleteWebhook(webhookId) {
    if (!webhookId) return;
    await this.makeRequest(`/webhooks/${webhookId}.json`, 'DELETE');
  }

  getManagedWebhookPrefix(address) {
    try {
      const parsed = new URL(address);
      const managedPathPrefix = '/api/webhooks/shopify/';

      if (!parsed.pathname.startsWith(managedPathPrefix)) {
        return '';
      }

      return `${parsed.origin}${managedPathPrefix}`;
    } catch (_error) {
      return '';
    }
  }

  async ensureWebhooks(address, topics = DEFAULT_WEBHOOK_TOPICS) {
    let existingWebhooks = await this.listWebhooks();
    const ensuredWebhooks = [];
    const errors = [];
    const managedWebhookPrefix = this.getManagedWebhookPrefix(address);

    if (managedWebhookPrefix) {
      const staleManagedWebhooks = existingWebhooks.filter((webhook) => (
        topics.includes(webhook.topic) &&
        webhook.address !== address &&
        typeof webhook.address === 'string' &&
        webhook.address.startsWith(managedWebhookPrefix)
      ));

      for (const staleWebhook of staleManagedWebhooks) {
        try {
          await this.deleteWebhook(staleWebhook.id);
          console.log(
            `   [Shopify API Service] Removed stale GoWhats webhook ${staleWebhook.id} for ${staleWebhook.topic}: ${staleWebhook.address}`
          );
        } catch (error) {
          console.error(
            `   [Shopify API Service] Failed to remove stale GoWhats webhook ${staleWebhook.id}: ${error.message}`
          );
        }
      }

      if (staleManagedWebhooks.length > 0) {
        const removedIds = new Set(staleManagedWebhooks.map((webhook) => String(webhook.id)));
        existingWebhooks = existingWebhooks.filter((webhook) => !removedIds.has(String(webhook.id)));
      }
    }

    for (const topic of topics) {
      const existing = existingWebhooks.find(
        (webhook) => webhook.topic === topic && webhook.address === address
      );

      if (existing) {
        ensuredWebhooks.push(existing);
        continue;
      }

      try {
        const created = await this.createWebhook(topic, address);
        if (created) {
          ensuredWebhooks.push(created);
        }
      } catch (error) {
       const alreadyTakenMessage = JSON.stringify(error.response?.data || '');
        const isAlreadyTakenError =
          error.response?.status === 422 &&
          /already been taken/i.test(alreadyTakenMessage);

        if (isAlreadyTakenError) {
          try {
            const refreshedWebhooks = await this.listWebhooks();
            const existingAfterConflict = refreshedWebhooks.find(
              (webhook) => webhook.topic === topic && webhook.address === address
            );

            if (existingAfterConflict) {
              ensuredWebhooks.push(existingAfterConflict);
              existingWebhooks = refreshedWebhooks;
              console.log(
                `   [Shopify API Service] Reused existing webhook ${existingAfterConflict.id} for ${topic}: ${address}`
              );
              continue;
            }
          } catch (refreshError) {
            console.error(
              `   [Shopify API Service] Failed to refresh webhook list after duplicate-address error for ${topic}: ${refreshError.message}`
            );
          }
        }

        errors.push({
          topic,
          address,
          status: error.response?.status || null,
          message: error.response?.data?.errors || error.message || 'Unknown Shopify webhook error'
        });
      }
    }

    return {
           subscriptions: ensuredWebhooks
        .filter((webhook, index, collection) => {
          const webhookId = String(webhook.id);
          return collection.findIndex((candidate) => String(candidate.id) === webhookId) === index;
        })
        .map((webhook) => ({
          topic: webhook.topic,
          webhookId: String(webhook.id),
          address: webhook.address
        })),

      errors
    };
  }
  
  extractOrderDetails(order) {
    if (!order) return null;


    let phone = null;

if (order.phone) {
      phone = order.phone;
    } else if (order.shipping_address?.phone) {
      phone = order.shipping_address.phone;
    } else if (order.customer?.phone) {
      phone = order.customer.phone;
    } else if (order.billing_address?.phone) {
      phone = order.billing_address.phone;
    } else if (order.customer?.default_address?.phone) {
      phone = order.customer.default_address.phone;
    }

    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (phone.length === 10) {
        phone = `91${phone}`;
      }
      if (!phone.startsWith('+')) {
        phone = `+${phone}`;
      }
    }

    const customerName = order.shipping_address?.first_name ||
      order.customer?.first_name ||
      order.billing_address?.first_name ||
      'Valued Customer';

    const orderNumber = order.order_number || order.name || order.id?.toString();
    const currency = order.currency || 'INR';
    const totalPrice = order.total_price || '0.00';

    const items = (order.line_items || []).map((item) => ({
      name: item.name || item.title,
      quantity: item.quantity || 1,
      price: item.price || '0.00'
    }));

    const formattedProducts = items.map((item) =>
      `- ${item.name} x${item.quantity} (${currency} ${item.price})`
    ).join('\n');

    const formattedTotal = `${currency} ${totalPrice}`;

    return {
      phone,
      name: customerName,
      orderNumber,
      formattedTotal,
      formattedProducts,
      items,
      shippingAddress: order.shipping_address || {},
      billingAddress: order.billing_address || {},
      email: order.email || order.customer?.email || order.contact_email || '',
      financialStatus: order.financial_status || 'pending',
      fulfillmentStatus: order.fulfillment_status || 'unfulfilled'
    };
  }

  async getOrderDetailsForDispatch(orderId) {
    try {
      console.log(`Fetching order ${orderId} from Shopify...`);
      const order = await this.getOrder(orderId);
      return this.extractOrderDetails(order);
    } catch (error) {
      console.error('Error getting order details for dispatch:', error);
      return null;
    }
  }
}

ShopifyApiService.DEFAULT_WEBHOOK_TOPICS = DEFAULT_WEBHOOK_TOPICS;

module.exports = ShopifyApiService;
