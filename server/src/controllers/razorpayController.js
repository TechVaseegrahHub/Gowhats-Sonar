const RazorpayIntegration = require('../models/RazorpayIntegration');
const Tenant = require('../models/Tenant');
const axios = require('axios');
const crypto = require('crypto');

class RazorpayController {

  // ==========================================
  // 🔒 INTERNAL HELPERS (Auto-Refresh Logic)
  // ==========================================

  // ✅ Fixed: Using arrow function to prevent 'this' context loss
  getValidIntegration = async (tenantId) => {
    try {
      const integration = await RazorpayIntegration.findOne({ tenantId: tenantId.toString() });
      if (!integration || !integration.accessToken) return null;

      // Check Expiry (Current > Updated + Expires - 5min Buffer)
      const lastUpdate = new Date(integration.updatedAt).getTime();
      const expiryMs = (integration.expiresIn || 0) * 1000;
      const bufferMs = 5 * 60 * 1000; 

      if (Date.now() > (lastUpdate + expiryMs - bufferMs)) {
        console.log(`🔄 Refreshing Token for ${tenantId}...`);
        return await this.refreshAccessToken(integration);
      }
      return integration;
    } catch (e) { 
      console.error("Integration Check Error:", e.message);
      return null; 
    }
  }

  refreshAccessToken = async (integration) => {
    try {
      const credentials = `${process.env.RAZORPAY_PARTNER_CLIENT_ID}:${process.env.RAZORPAY_PARTNER_CLIENT_SECRET}`;
      const authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;

      const response = await axios.post('https://auth.razorpay.com/token', 
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: integration.refreshToken,
          client_id: process.env.RAZORPAY_PARTNER_CLIENT_ID
        }), {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      integration.accessToken = response.data.access_token;
      integration.refreshToken = response.data.refresh_token;
      integration.expiresIn = response.data.expires_in;
      integration.updatedAt = new Date();
      integration.isActive = true;
      await integration.save();
      
      return integration;
    } catch (error) {
      console.error('❌ Token Refresh Failed:', error.message);
      integration.isActive = false;
      await integration.save();
      throw new Error('Connection expired. Please reconnect.');
    }
  }

  // ==========================================
  // 🚀 PUBLIC ROUTE HANDLERS
  // ==========================================

  // 1. GET STATUS (Includes Name Fetch Fix)
  getStatus = async (req, res) => {
    try {
      const { tenantId } = req.user;
      
      const integration = await this.getValidIntegration(tenantId);

      if (!integration || !integration.isActive) {
        return res.json({ connected: false });
      }

      // ✅ Auto-Fetch Name if missing or generic
      const genericNames = ['Merchant', 'Razorpay Merchant', undefined, null, ''];
      
      if (genericNames.includes(integration.accountName)) {
        try {
          console.log(`🔄 Fetching Identity for Account: ${integration.accountId}`);
          
          // Use OIDC UserInfo endpoint (Requires 'openid profile' scope)
          const userRes = await axios.get('https://auth.razorpay.com/userinfo', {
            headers: { 'Authorization': `Bearer ${integration.accessToken}` }
          });

          // Razorpay returns 'name' (Merchant Name) and 'email'
          const realName = userRes.data.name;
          
          if (realName) {
            console.log(`✅ Identity Fetched: ${realName}`);
            integration.accountName = realName;
            if (userRes.data.email) integration.accountEmail = userRes.data.email;
            await integration.save();
          }
        } catch (err) {
          console.warn('⚠️ Name Sync Failed:', err.message);
        }
      }

      res.json({
        connected: true,
        accountId: integration.accountId,
        accountName: integration.accountName,
        accountEmail: integration.accountEmail,
        lastSynced: integration.updatedAt
      });
    } catch (error) {
      console.error('Get Status Error:', error);
      res.status(500).json({ error: 'Status check failed' });
    }
  }

  // 2. GET STATS
  getStats = async (req, res) => {
    try {
      const integration = await this.getValidIntegration(req.user.tenantId);
      if (!integration) return res.json({ connected: false });

      const response = await axios.get('https://api.razorpay.com/v1/payments', {
        headers: { 'Authorization': `Bearer ${integration.accessToken}` },
        params: { count: 50 }
      });

      const payments = response.data.items || [];
      const captured = payments.filter(p => p.status === 'captured');
      
      // Basic Stats Calculation
      const totalRevenue = captured.reduce((sum, p) => sum + (p.amount / 100), 0);
      const today = new Date().toISOString().split('T')[0];
      const todayRevenue = captured
        .filter(p => new Date(p.created_at * 1000).toISOString().split('T')[0] === today)
        .reduce((sum, p) => sum + (p.amount / 100), 0);

      res.json({
        connected: true,
        totalRevenue,
        todayRevenue,
        successRate: payments.length ? Math.round((captured.length / payments.length) * 100) : 0,
        recentPayments: payments.slice(0, 5)
      });
    } catch (error) {
      res.json({ connected: true, error: 'Stats fetch failed' });
    }
  }

  // 3. CREATE PAYMENT LINK
  createPaymentLink = async (req, res) => {
    try {
      const integration = await this.getValidIntegration(req.user.tenantId);
      if (!integration) return res.status(400).json({ error: 'Not connected' });

      const { amount, description, customerName, customerPhone, customerEmail } = req.body;

      const response = await axios.post('https://api.razorpay.com/v1/payment_links', {
        amount: Math.round(amount * 100),
        currency: "INR",
        description: description || 'Payment',
        customer: { name: customerName, email: customerEmail, contact: customerPhone },
        notify: { sms: true, email: true },
        notes: { source: 'GoWhats', tenant_id: req.user.tenantId.toString() }
      }, {
        headers: { 'Authorization': `Bearer ${integration.accessToken}` }
      });

      res.json({ success: true, link: response.data });
    } catch (error) {
      console.error('Create Link Error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to create link' });
    }
  }

  // 4. GET PAYMENTS
  getPayments = async (req, res) => {
    try {
      const integration = await this.getValidIntegration(req.user.tenantId);
      if (!integration) return res.status(400).json({ error: 'Not connected' });

      const { limit = 20, skip = 0 } = req.query;
      const response = await axios.get('https://api.razorpay.com/v1/payments', {
        headers: { 'Authorization': `Bearer ${integration.accessToken}` },
        params: { count: limit, skip }
      });

      res.json({ success: true, payments: response.data.items });
    } catch (error) {
      res.status(500).json({ error: 'Fetch failed' });
    }
  }

  // 5. ACCOUNT DETAILS
  getAccountDetails = async (req, res) => {
    try {
      const integration = await this.getValidIntegration(req.user.tenantId);
      if (!integration) return res.status(400).json({ error: 'Not connected' });

      const response = await axios.get('https://api.razorpay.com/v1/account', {
        headers: { 'Authorization': `Bearer ${integration.accessToken}` }
      });
      res.json({ success: true, account: response.data });
    } catch (error) {
      res.status(500).json({ error: 'Fetch failed' });
    }
  }

  // 6. BALANCE
  getBalance = async (req, res) => {
    try {
      const integration = await this.getValidIntegration(req.user.tenantId);
      if (!integration) return res.status(400).json({ error: 'Not connected' });

      const response = await axios.get('https://api.razorpay.com/v1/fund_accounts/balance', {
        headers: { 'Authorization': `Bearer ${integration.accessToken}` }
      });
      res.json({ success: true, balance: response.data });
    } catch (e) {
      res.json({ success: false, message: 'Balance API not enabled' });
    }
  }

  // 7. WEBHOOK
  handleWebhook = async (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers['x-razorpay-signature'];
      
      if (secret && signature) {
        const body = JSON.stringify(req.body);
        const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
        if (signature !== expected) return res.status(400).json({ error: 'Invalid signature' });
      }
      
      console.log(`🔔 Webhook: ${req.body.event}`);
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(200).json({ status: 'error' });
    }
  }
}

module.exports = new RazorpayController();
