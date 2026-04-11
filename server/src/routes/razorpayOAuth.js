const express = require('express');
const router = express.Router();
const axios = require('axios');
const RazorpayIntegration = require('../models/RazorpayIntegration');
const Tenant = require('../models/Tenant');
const authMiddleware = require('../middleware/auth');
const razorpayController = require('../controllers/razorpayController');

// --- CONTROLLER ROUTES ---
router.get('/status', authMiddleware, razorpayController.getStatus);
router.get('/stats', authMiddleware, razorpayController.getStats);
router.get('/payments', authMiddleware, razorpayController.getPayments);
router.post('/create-payment-link', authMiddleware, razorpayController.createPaymentLink);
router.get('/account-details', authMiddleware, razorpayController.getAccountDetails);
router.get('/balance', authMiddleware, razorpayController.getBalance);

// --- OAUTH ROUTES ---

// 1. Initiate OAuth
router.get('/auth/initiate', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

    const scope = 'read_write';
    const redirectUri = process.env.RAZORPAY_PARTNER_REDIRECT_URI;
    const clientId = process.env.RAZORPAY_PARTNER_CLIENT_ID;

    if (!redirectUri || !clientId) {
      throw new Error('Missing Razorpay Env Configuration');
    }

    const authUrl = `https://auth.razorpay.com/authorize` +
      `?client_id=${clientId.trim()}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri.trim())}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${tenantId}`;

    console.log('🔐 OAuth URL Generated:', authUrl);
    res.json({ success: true, authUrl, redirect: true });

  } catch (error) {
    console.error('❌ OAuth Init Error:', error.message);
    res.status(500).json({ error: 'Failed to initiate connection' });
  }
});

// 2. OAuth Callback
router.get('/oauth/callback', async (req, res) => {
  // Configurable Frontend URL and Redirect Path
  const frontendUrl = process.env.CLIENT_URL || 'https://bot.gowhats.in';
  const redirectPath = '/admin/settings'; 

  try {
    const { code, state: tenantId, error, error_description } = req.query;

    console.log('📥 Callback received:', { code: code ? '***' : 'missing', tenantId, error });

    if (error) {
      console.error('❌ Razorpay Error:', error);
      return res.redirect(`${frontendUrl}${redirectPath}?error=${encodeURIComponent(error_description || error)}`);
    }

    // Prepare Variables
    const clientId = process.env.RAZORPAY_PARTNER_CLIENT_ID.trim();
    const clientSecret = process.env.RAZORPAY_PARTNER_CLIENT_SECRET.trim();
    const redirectUri = process.env.RAZORPAY_PARTNER_REDIRECT_URI.trim();

    console.log('🔄 Exchanging code for token (Body Auth Method)...');

    // ✅ FIX: Send Credentials in Body (remove Basic Auth Header)
    // This fixes the "Incident reported to admins" 500 error caused by header conflicts
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const tokenResponse = await axios.post(
      'https://auth.razorpay.com/token',
      params.toString(), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ Token exchange successful');
    const { access_token, refresh_token, expires_in, razorpay_account_id } = tokenResponse.data;

    // Fetch Merchant Name
    let accountName = 'Razorpay Merchant';
    let accountEmail = '';

    try {
      const accountRes = await axios.get('https://api.razorpay.com/v1/account', {
        headers: { 'Authorization': `Bearer ${access_token}` }
      });
      accountName = accountRes.data.legal_business_name || accountRes.data.business_name || accountName;
      accountEmail = accountRes.data.email || '';
    } catch (e) {
      console.warn('⚠️ Name fetch failed:', e.message);
    }

    // Save to Database
    await RazorpayIntegration.findOneAndUpdate(
      { tenantId: tenantId.toString() },
      {
        $set: {
          accountId: razorpay_account_id,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresIn: expires_in,
          accountName: accountName,
          accountEmail: accountEmail,
          isActive: true,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    await Tenant.findByIdAndUpdate(tenantId, {
      $set: {
        'razorpayConfig.connected': true,
        'razorpayConfig.accountId': razorpay_account_id
      }
    });

    console.log('✅ Success. Redirecting...');
    res.redirect(`${frontendUrl}${redirectPath}?connected=true`);

  } catch (error) {
    console.error('❌ Callback Error:', error.response?.data || error.message);

    const errorData = error.response?.data;
    const errorMsg = errorData?.error?.description 
                  || errorData?.error_description 
                  || errorData?.error 
                  || error.message 
                  || 'Connection_failed';

    res.redirect(`${frontendUrl}${redirectPath}?error=${encodeURIComponent(errorMsg)}`);
  }
});

// 3. Disconnect
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.user;

    await RazorpayIntegration.deleteOne({ tenantId: tenantId.toString() });
    await Tenant.findByIdAndUpdate(tenantId, {
      $unset: { 'razorpayConfig': '' }
    });

    console.log('✅ Disconnected tenant:', tenantId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Disconnect Error:', error);
    res.status(500).json({ error: 'Disconnect failed' });
  }
});

// 4. Webhook Listener
router.post('/webhook', razorpayController.handleWebhook);

module.exports = router;
