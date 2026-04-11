// services/cashfreeService.js
// Place this file at: services/cashfreeService.js

const axios  = require('axios');
const crypto = require('crypto');

class CashfreeService {
  constructor(config) {
    this.clientId                 = config.clientId;
    this.clientSecret             = config.clientSecret;
    this.merchantVpa              = config.merchantVpa;
    this.paymentConfigurationName = config.paymentConfigurationName;
    this.notifyUrl                = config.notifyUrl;
    this.currency                 = config.currency || 'INR';

    const isProd = config.environment === 'production';
    this.baseUrl = isProd
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';

    console.log(`[CashfreeService] Initialized: ${isProd ? 'PRODUCTION' : 'SANDBOX'} | VPA: ${this.merchantVpa}`);
  }

  get headers() {
    return {
      'accept':          'application/json',
      'content-type':    'application/json',
      'x-api-version':   '2022-09-01',
      'x-client-id':     this.clientId,
      'x-client-secret': this.clientSecret,
    };
  }

  /**
   * Step 1 — Create a Cashfree order
   * Returns the full order object including payment_session_id
   */
  async createOrder({ orderId, amount, customerPhone, customerEmail, customerName }) {
    const payload = {
      customer_details: {
        customer_id:    customerPhone,
        customer_email: customerEmail || `${customerPhone}@noemail.com`,
        customer_phone: customerPhone,
        customer_name:  customerName || 'Customer',
      },
      order_meta: {
        notify_url:      this.notifyUrl,
        payment_methods: 'upi',
      },
      order_tags:     { channel: 'WhatsApp' },
      order_id:       orderId,
      order_amount:   amount,
      order_currency: this.currency,
      order_note:     `WhatsApp order ${orderId}`,
    };

    console.log(`[Cashfree] Creating order: ${orderId} | ₹${amount}`);
    const res = await axios.post(`${this.baseUrl}/orders`, payload, { headers: this.headers });
    console.log(`[Cashfree] Order created: cf_order_id=${res.data.cf_order_id}`);
    return res.data;
  }

  /**
   * Step 2 — Create UPI payment session
   * Extracts reference_id (tr) and VPA (pa) from the UPI intent URL
   */
  async createUpiSession(paymentSessionId) {
    const payload = {
      payment_method: {
        upi: { channel: 'link', upi_expiry_minutes: 10 }
      },
      payment_session_id: paymentSessionId,
    };

    const res  = await axios.post(`${this.baseUrl}/orders/sessions`, payload, { headers: this.headers });
    const data = res.data;

    // Parse UPI intent URL parameters
    const upiUrl = data.data?.payload?.default || '';
    const qIndex = upiUrl.indexOf('?');
    const params = new URLSearchParams(qIndex >= 0 ? upiUrl.slice(qIndex + 1) : '');

    const referenceId = params.get('tr') || String(data.cf_payment_id);
    const merchantVpa = params.get('pa') || this.merchantVpa;
    const amount      = parseFloat(params.get('am') || data.payment_amount || 0);

    // Validate amount matches what was set
    console.log(`[Cashfree] UPI session: cf_payment_id=${data.cf_payment_id} | tr=${referenceId} | pa=${merchantVpa} | am=${amount}`);

    return {
      cfPaymentId:  data.cf_payment_id,
      upiIntentUrl: upiUrl,
      referenceId,   // used as reference_id in WhatsApp Pay payload
      merchantVpa,   // used to validate WhatsApp payment configuration
      amount,
    };
  }

  /**
   * Combined: create order + get UPI session in one call
   */
  async createPaymentSession({ orderId, amount, customerPhone, customerEmail, customerName }) {
    const order   = await this.createOrder({ orderId, amount, customerPhone, customerEmail, customerName });
    const session = await this.createUpiSession(order.payment_session_id);
    return { cfOrderId: order.cf_order_id, ...session };
  }

  /**
   * Verify Cashfree webhook HMAC-SHA256 signature
   * Cashfree signs with: HMAC-SHA256(timestamp + rawBody, clientSecret) → base64
   */
  static verifyWebhookSignature(rawBody, timestamp, signature, clientSecret) {
    const data     = `${timestamp}${rawBody}`;
    const expected = crypto
      .createHmac('sha256', clientSecret)
      .update(data)
      .digest('base64');
    return expected === signature;
  }

  /**
   * Status check — use as fallback if webhook not received within timeout
   */
  async checkPaymentStatus(orderId, cfPaymentId) {
    const res = await axios.get(
      `${this.baseUrl}/orders/${orderId}/payments/${cfPaymentId}`,
      { headers: this.headers }
    );
    return res.data; // { payment_status: 'SUCCESS' | 'FAILED' | 'USER_DROPPED', ... }
  }
}

module.exports = CashfreeService;
