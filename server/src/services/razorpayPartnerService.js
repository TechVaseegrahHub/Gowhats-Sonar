const axios = require('axios');
const RazorpayIntegration = require('../models/RazorpayIntegration');

class RazorpayPartnerService {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.baseURL = 'https://api.razorpay.com/v1';
  }

  async getClient() {
    const integration = await RazorpayIntegration.findOne({ tenantId: this.tenantId });
    
    if (!integration || !integration.accessToken) {
      throw new Error('Razorpay integration not found or inactive');
    }

    // Check if token needs refresh
    if (integration.expiresSoon()) {
      console.log('⚠️ Razorpay token expires soon, refreshing...');
      await this.refreshToken(integration);
    }

    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async refreshToken(integration) {
    try {
      const refreshResponse = await axios.post('https://auth.razorpay.com/token', {
        client_id: process.env.RAZORPAY_PARTNER_CLIENT_ID,
        client_secret: process.env.RAZORPAY_PARTNER_CLIENT_SECRET,
        refresh_token: integration.refreshToken,
        grant_type: 'refresh_token'
      });

      const { access_token, refresh_token, expires_in, token_type } = refreshResponse.data;

      integration.accessToken = access_token;
      integration.refreshToken = refresh_token;
      integration.expiresIn = expires_in;
      integration.tokenType = token_type;
      
      await integration.save();

      console.log('✅ Razorpay token refreshed successfully');
      return integration;

    } catch (error) {
      console.error('❌ Token refresh failed:', error.response?.data || error.message);
      integration.isActive = false;
      await integration.save();
      throw new Error('Token refresh failed');
    }
  }

  // ✅ Create Payment Link
  async createPaymentLink(paymentData) {
    const client = await this.getClient();
    
    const payload = {
      amount: Math.round(paymentData.amount * 100), // Convert to paise
      currency: paymentData.currency || 'INR',
      description: paymentData.description || 'Payment via GoWhats',
      customer: {
        name: paymentData.customerName,
        email: paymentData.customerEmail,
        contact: paymentData.customerPhone
      },
      notes: {
        order_id: paymentData.orderId,
        tenant_id: this.tenantId.toString(),
        source: 'gowhats'
      },
      reminder_enable: true,
      callback_url: paymentData.callbackUrl,
      callback_method: 'get'
    };

    const response = await client.post('/payment_links', payload);
    return response.data;
  }

  // ✅ Fetch Account Details
  async getAccountDetails() {
    const client = await this.getClient();
    const response = await client.get('/account');
    return response.data;
  }

  // ✅ Fetch Payments
  async fetchPayments(filters = {}) {
    const client = await this.getClient();
    const response = await client.get('/payments', { params: filters });
    return response.data;
  }

  // ✅ Create Payout
  async createPayout(payoutData) {
    const client = await this.getClient();
    
    const payload = {
      account_number: payoutData.accountNumber,
      amount: Math.round(payoutData.amount * 100),
      currency: payoutData.currency || 'INR',
      mode: payoutData.mode || 'IMPS',
      purpose: payoutData.purpose || 'payout',
      fund_account: {
        account_type: payoutData.accountType || 'bank_account',
        bank_account: {
          name: payoutData.bankAccountName,
          ifsc: payoutData.ifscCode,
          account_number: payoutData.bankAccountNumber
        }
      },
      queue_if_low_balance: true,
      notes: {
        tenant_id: this.tenantId.toString(),
        purpose: payoutData.note || 'GoWhats payout'
      }
    };

    const response = await client.post('/payouts', payload);
    return response.data;
  }

  // ✅ Setup Webhooks for Account
  async setupWebhooks(webhookUrl) {
    const client = await this.getClient();
    
    const webhookPayload = {
      url: webhookUrl,
      events: [
        'payment.captured',
        'payment.failed',
        'payment.link.paid',
        'refund.processed'
      ],
      secret: process.env.RAZORPAY_WEBHOOK_SECRET
    };

    const response = await client.post('/webhooks', webhookPayload);
    return response.data;
  }

  // ✅ Check Balance
  async getBalance() {
    const client = await this.getClient();
    const response = await client.get('/fund_accounts/balance');
    return response.data;
  }
}

module.exports = RazorpayPartnerService;
