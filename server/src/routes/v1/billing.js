const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const Tenant = require('../../models/Tenant');
const stripeService = require('../../services/stripeService');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// GET /api/v1/billing/subscription
router.get('/subscription', apiKeyAuth(['billing.read']), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    res.json({
      success: true,
      subscription: {
        plan: tenant.subscription?.plan,
        status: tenant.subscription?.status,
        trialEndsAt: tenant.subscription?.trialEndsAt,
        currentPeriodEnd: tenant.subscription?.currentPeriodEnd
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// GET /api/v1/billing/transactions
router.get('/transactions', apiKeyAuth(['transactions.read']), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    // Fetch Razorpay payments
    let razorpayPayments = [];
    try {
      const rpResponse = await razorpay.payments.all({ count: 20 });
      razorpayPayments = rpResponse.items.map(p => ({
        id: p.id,
        gateway: 'razorpay',
        amount: p.amount / 100,
        currency: p.currency,
        status: p.status,
        createdAt: new Date(p.created_at * 1000)
      }));
    } catch (e) {
      console.error('Razorpay fetch error:', e.message);
    }

    // Fetch Stripe payments
    let stripePayments = [];
    try {
      const stripeSession = await stripeService.stripe.checkout.sessions.list({ limit: 20 });
      stripePayments = stripeSession.data.map(s => ({
        id: s.id,
        gateway: 'stripe',
        amount: s.amount_total / 100,
        currency: s.currency,
        status: s.payment_status,
        createdAt: new Date(s.created * 1000)
      }));
    } catch (e) {
      console.error('Stripe fetch error:', e.message);
    }

    res.json({
      success: true,
      transactions: [...razorpayPayments, ...stripePayments]
        .sort((a, b) => b.createdAt - a.createdAt)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
