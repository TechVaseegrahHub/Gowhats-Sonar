const axios = require('axios');
const crypto = require('crypto');

class HitPayService {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.webhookSalt = config.webhookSalt;
    this.environment = config.environment || 'production';
    this.currency = config.currency || 'SGD';

    this.baseUrl = this.environment === 'sandbox'
      ? 'https://api.sandbox.hit-pay.com/v1'
      : 'https://api.hit-pay.com/v1';
  }

  // Create a HitPay payment request and return the checkout URL
  async createPaymentRequest({ orderId, amount, customerName, customerEmail, customerPhone, description, redirectUrl, webhookUrl }) {
    const payload = {
      amount: parseFloat(amount).toFixed(2),
      currency: this.currency,
      purpose: description || `Order #${orderId}`,
      reference_number: orderId,
      send_sms: false,
      send_email: false,
      ...(redirectUrl && { redirect_url: redirectUrl }),
      ...(webhookUrl && { webhook: webhookUrl }),
      ...(customerName && { name: customerName }),
      ...(customerEmail && { email: customerEmail }),
      ...(customerPhone && { phone: customerPhone }),
    };

    const response = await axios.post(
      `${this.baseUrl}/payment-requests`,
      payload,
      {
        headers: {
          'X-BUSINESS-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
      }
    );

    return {
      id: response.data.id,
      url: response.data.url,
      status: response.data.status,
      expiresAt: response.data.expires_at,
    };
  }

  // Verify incoming webhook HMAC signature
  verifyWebhook(payload, hmac) {
    if (!this.webhookSalt) return false;
    const fields = ['amount', 'currency', 'id', 'payment_id', 'reference_number', 'status'];
    const message = fields
      .sort()
      .map(f => `${f}${payload[f] ?? ''}`)
      .join('');
    const expected = crypto
      .createHmac('sha256', this.webhookSalt)
      .update(message)
      .digest('hex');
    return expected === hmac;
  }
}

module.exports = HitPayService;
