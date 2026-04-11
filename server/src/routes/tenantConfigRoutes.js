// routes/tenantConfigRoutes.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const Stripe = require('stripe');
const router = express.Router();
const TenantConfig = require('../models/TenantConfig');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Message = require('../models/Message');
const ReferralClient = require('../models/ReferralClient');
const authenticateToken = require('../middleware/auth');
const {
  buildSubscriptionState,
  normalizePlan,
  TRIAL_DAYS,
  toCurrencyAmount,
  createSubscriptionHistoryEntry
} = require('../services/subscriptionService');
const { resolveSubscriptionPricing } = require('../services/referralPricingService');
const {
  markReferralPaymentPending,
  recordReferralPaymentSuccess,
  syncReferralClientPricing
} = require('../services/referralService');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const resolveStripePricing = async (req, tenantId = '') => {
  let phoneNumber = req.user?.phone_number || '';
  if (!phoneNumber && req.user?.id) {
    const user = await User.findById(req.user.id).select('phone_number').lean();
    phoneNumber = user?.phone_number || '';
  }

  const pricing = resolveSubscriptionPricing({ phoneNumber });
  const referralClient = tenantId
    ? await ReferralClient.findOne({ tenantId: String(tenantId) })
        .select('partnerId sharePercent clientPhone countryCode currency paymentStatus')
        .lean()
    : null;

  const resolvedReferralClient = referralClient
    ? await syncReferralClientPricing(referralClient, { persist: true })
    : null;

  return {
    currency: String(resolvedReferralClient?.currency || pricing.currency || 'INR').toLowerCase(),
    price: Number(resolvedReferralClient?.subscriptionAmount || pricing.price || 0),
    country: resolvedReferralClient?.countryCode || pricing.countryCode || ''
  };
};

const applyDynamicPricing = async (req, subscription, tenantId = '') => {
  try {
    const pricing = await resolveStripePricing(req, tenantId);
    const referralClient = tenantId
      ? await ReferralClient.findOne({ tenantId: String(tenantId) }).lean()
      : null;
    const resolvedReferralClient = referralClient
      ? await syncReferralClientPricing(referralClient, { persist: true })
      : null;

    const referral = resolvedReferralClient
      ? {
          hasReferral: true,
          referralCode: resolvedReferralClient.referralCode,
          partnerBusinessName: resolvedReferralClient.partnerBusinessName,
          baseSubscriptionAmount: Number(resolvedReferralClient.baseSubscriptionAmount || 0),
          referralAddonAmount: Number(resolvedReferralClient.referralAddonAmount || 0),
          subscriptionAmount: Number(resolvedReferralClient.subscriptionAmount || pricing.price || 0),
          partnerShareAmount: Number(resolvedReferralClient.partnerShareAmount || 0),
          gowhatsShareAmount: Number(resolvedReferralClient.gowhatsShareAmount || 0),
          sharePercent: Number(resolvedReferralClient.sharePercent || 0),
          paymentStatus: resolvedReferralClient.paymentStatus,
          status: resolvedReferralClient.status
        }
      : { hasReferral: false };

    if (!pricing?.currency && !referral.hasReferral) return subscription;

    const resolvedPrice = referral.hasReferral
      ? Number(referral.subscriptionAmount || pricing.price || 0)
      : Number(pricing.price || subscription?.pricing?.proPrice || 0);

    const resolvedCurrency = resolvedReferralClient?.currency || pricing.currency || subscription?.pricing?.currency || 'INR';

    return {
      ...subscription,
      pricing: {
        ...subscription.pricing,
        proPrice: resolvedPrice,
        currency: String(resolvedCurrency).toUpperCase()
      },
      referral
    };
  } catch (_error) {
    return subscription;
  }
};

const resolveTenantId = (req) =>
  req.user?.tenant_id ||
  req.user?.tenantId ||
  req.query?.tenantId ||
  req.body?.tenantId;

const buildSubscriptionPayload = (subscription) => ({
  plan: subscription.plan,
  isPro: subscription.isPro,
  hasProAccess: subscription.hasProAccess,
  trial: subscription.trial,
  pro: subscription.pro,
  pricing: subscription.pricing,
  referral: subscription.referral || { hasReferral: false },
  proOnlyModules: subscription.proOnlyModules,
  websiteIntegration: {
    orderConfirmationLimit: subscription.websiteOrderConfirmationLimit,
    orderConfirmationSent: subscription.websiteOrderConfirmationSent,
    orderConfirmationRemaining: subscription.websiteOrderConfirmationRemaining
  }
});

// Get tenant configuration
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.query.tenantId || req.user.id;

    let config = await TenantConfig.findOne({ tenantId });

    if (!config) {
      config = new TenantConfig({
        tenantId,
        businessName: 'My Business',
        businessType: 'ecommerce'
      });
      await config.save();
    }

    res.json({
      success: true,
      config: config
    });

  } catch (error) {
    console.error('Error fetching tenant config:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update tenant configuration
router.put('/config', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.body.tenantId || req.user.id;
    const updateData = req.body;

    let config = await TenantConfig.findOne({ tenantId });

    if (!config) {
      config = new TenantConfig({
        tenantId,
        ...updateData
      });
    } else {
      if (updateData.businessName) config.businessName = updateData.businessName;
      if (updateData.businessType) config.businessType = updateData.businessType;
      if (updateData.businessIndustry) config.businessIndustry = updateData.businessIndustry;
      
      if (updateData.botConfig) {
        config.botConfig = { ...config.botConfig, ...updateData.botConfig };
      }
      
      if (updateData.terminology) {
        config.terminology = { ...config.terminology, ...updateData.terminology };
      }
      
      if (updateData.responseConfig) {
        config.responseConfig = { ...config.responseConfig, ...updateData.responseConfig };
      }
      
      if (updateData.contactInfo) {
        config.contactInfo = { ...config.contactInfo, ...updateData.contactInfo };
      }
      
      if (updateData.customInstructions !== undefined) {
        config.customInstructions = updateData.customInstructions;
      }
    }

    await config.save();

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: config
    });

  } catch (error) {
    console.error('Error updating tenant config:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get business type templates
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const templates = {
      ecommerce: {
        businessType: 'ecommerce',
        terminology: { itemName: 'products', catalogName: 'catalog', pricingTerm: 'price' },
        botConfig: {
          greetingMessage: 'I\'m here to help you find products. What would you like to know?',
          fallbackMessage: 'I can help you with information about our products. Could you rephrase your question?'
        }
      },
      service: {
        businessType: 'service',
        terminology: { itemName: 'services', catalogName: 'services list', pricingTerm: 'fee' },
        botConfig: {
          greetingMessage: 'I\'m here to help you with our services. What would you like to know?',
          fallbackMessage: 'I can help you with information about our services. Could you rephrase your question?'
        }
      },
      restaurant: {
        businessType: 'restaurant',
        terminology: { itemName: 'dishes', catalogName: 'menu', pricingTerm: 'price' },
        botConfig: {
          greetingMessage: 'Welcome! I\'m here to help you with our menu. What would you like to order?',
          fallbackMessage: 'I can help you with our menu items. Could you ask about a specific dish?'
        }
      }
    };

    res.json({ success: true, templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Apply business template
router.post('/apply-template', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.body.tenantId || req.user.id;
    const { businessType, businessName } = req.body;

    if (!businessType) {
      return res.status(400).json({ success: false, message: 'Business type is required' });
    }

    const templates = {
      ecommerce: {
        terminology: { itemName: 'products', catalogName: 'catalog', pricingTerm: 'price' },
        botConfig: {
          greetingMessage: 'I\'m here to help you find products. What would you like to know?',
          fallbackMessage: 'I can help you with information about our products. Could you rephrase your question?'
        }
      },
      service: {
        terminology: { itemName: 'services', catalogName: 'services list', pricingTerm: 'fee' },
        botConfig: {
          greetingMessage: 'I\'m here to help you with our services. What would you like to know?',
          fallbackMessage: 'I can help you with information about our services. Could you rephrase your question?'
        }
      },
      restaurant: {
        terminology: { itemName: 'dishes', catalogName: 'menu', pricingTerm: 'price' },
        botConfig: {
          greetingMessage: 'Welcome! I\'m here to help you with our menu. What would you like to order?',
          fallbackMessage: 'I can help you with our menu items. Could you ask about a specific dish?'
        }
      }
    };

    const template = templates[businessType];
    if (!template) {
      return res.status(400).json({ success: false, message: 'Invalid business type' });
    }

    let config = await TenantConfig.findOne({ tenantId });

    if (!config) {
      config = new TenantConfig({
        tenantId,
        businessName: businessName || 'My Business',
        businessType: businessType,
        terminology: template.terminology,
        botConfig: { ...template.botConfig, botName: 'Assistant', botPersonality: 'professional' }
      });
    } else {
      if (businessName) config.businessName = businessName;
      config.businessType = businessType;
      config.terminology = template.terminology;
      config.botConfig = { ...config.botConfig, ...template.botConfig };
    }

    await config.save();

    res.json({
      success: true,
      message: `Template for ${businessType} applied successfully`,
      config: config
    });

  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/subscription', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    let tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      tenant = await Tenant.create({
        _id: tenantId,
        name: `Tenant ${String(tenantId).slice(0, 8)}`,
        subscription: {
          plan: 'free_trial',
          trialStartedAt: now,
          trialEndsAt
        }
      });
    }

    let subscription = buildSubscriptionState(tenant);

    const websiteOrderConfirmationSentActual = await Message.countDocuments({
      tenantId: tenantId,
      isOrderConfirmation: true,
      status: { $in: ['sent', 'delivered', 'read'] },
      $or: [
        { 'orderData.platform': { $in: ['shopify', 'woocommerce'] } },
        { 'orderDetails.platform': { $in: ['shopify', 'woocommerce'] } }
      ]
    });

    if (websiteOrderConfirmationSentActual !== subscription.websiteOrderConfirmationSent) {
      tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        {
          $set: {
            'subscription.websiteOrderConfirmationSent': websiteOrderConfirmationSentActual,
            'subscription.updatedAt': new Date()
          }
        },
        { new: true }
      );
      subscription = buildSubscriptionState(tenant);
    }

    subscription = await applyDynamicPricing(req, subscription, tenantId);

    return res.json({
      success: true,
      subscription: buildSubscriptionPayload(subscription)
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.patch('/subscription', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { plan } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    if (!['free_trial', 'pro'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan. Supported values: free_trial, pro'
      });
    }

   const nextPlan = normalizePlan(plan);
const basePricing = buildSubscriptionState(null).pricing;
const historyEntry = createSubscriptionHistoryEntry({
  provider: 'manual',
  event: 'plan_changed',
  plan: nextPlan,
  paymentStatus: nextPlan === 'pro' ? 'paid' : null,
  amount: basePricing.proPrice,
  currency: basePricing.currency,
  createdAt: new Date(),
  paidAt: nextPlan === 'pro' ? new Date() : null,
  notes: `Plan changed to ${nextPlan === 'pro' ? 'Pro' : 'Free Trial'}`
});
const updatePayload = {
  'subscription.plan': nextPlan,
  'subscription.updatedAt': new Date(),
  'subscription.websiteOrderConfirmationLimit': 100
};

if (nextPlan === 'pro') {
  const billingDays = Number(process.env.SUBSCRIPTION_BILLING_DAYS || 30);
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + billingDays * 24 * 60 * 60 * 1000);
  updatePayload['subscription.proActivatedAt'] = now;
  updatePayload['subscription.proExpiresAt'] = newExpiresAt;
  updatePayload['subscription.paymentStatus'] = 'paid';
} else {
  updatePayload['subscription.paymentStatus'] = null;
}

const updatedTenant = await Tenant.findByIdAndUpdate(
  tenantId,
  {
    $set: updatePayload,
    $push: {
      'subscription.history': {
        $each: [historyEntry],
        $slice: -100
      }
    }
  },
  {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true
  }
);
    
    const subscription = await applyDynamicPricing(req, buildSubscriptionState(updatedTenant), tenantId);

    return res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: buildSubscriptionPayload(subscription)
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create Razorpay order for Pro subscription
router.post('/subscription/razorpay/order', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const pricing = await resolveStripePricing(req, tenantId);
    const currency = String(pricing.currency || process.env.SUBSCRIPTION_CURRENCY || 'INR').toUpperCase();
    const priceInRupees = Number(pricing.price || process.env.SUBSCRIPTION_PRICE_INR || process.env.SUBSCRIPTION_PRO_PRICE || 999);

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required' });
    }
    if (!keyId || !keySecret) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }

    const amount = Math.round(priceInRupees * 100);
    const tenantSuffix = String(tenantId).replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'tenant';
    const ts = Date.now().toString(36).slice(-6);
    const receipt = `gwpro_${tenantSuffix}_${ts}`;
    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const orderPayload = {
      amount,
      currency,
      receipt,
      payment_capture: 1,
      notes: {
        plan: 'pro',
        tenant_id: String(tenantId),
        source: 'gowhats_subscription'
      }
    };

    const response = await axios.post('https://api.razorpay.com/v1/orders', orderPayload, {
      headers: { Authorization: `Basic ${authHeader}` }
    });

    const order = response.data;

    await Tenant.findByIdAndUpdate(
  tenantId,
  {
    $set: {
      'subscription.paymentStatus': 'pending',
      'subscription.updatedAt': new Date(),
      'subscription.razorpay': {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status: 'created',
        createdAt: new Date()
      }
    },
    $push: {
      'subscription.history': {
        $each: [createSubscriptionHistoryEntry({
          provider: 'razorpay',
          event: 'payment_pending',
          plan: 'pro',
          paymentStatus: 'pending',
          amount: priceInRupees,
          currency,
          referenceId: order.id,
          createdAt: new Date(),
          notes: 'Razorpay order created for Pro subscription'
        })],
        $slice: -100
      }
    }
  },
  { new: true, upsert: true, setDefaultsOnInsert: true }
);


    await markReferralPaymentPending(tenantId);

    return res.json({
      success: true,
      keyId,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency
      },
      name: 'GoWhats',
      description: `GoWhats Pro Subscription (${currency} ${priceInRupees})`,
      prefill: {
        name: req.user?.name || req.user?.company_name || 'GoWhats User',
        email: req.user?.email || '',
        contact: req.user?.phone_number || ''
      }
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create Razorpay order'
    });
  }
});

// Verify Razorpay payment and activate Pro plan
router.post('/subscription/razorpay/verify', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required' });
    }
    if (!keySecret) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification data' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    if (tenant?.subscription?.razorpay?.orderId && tenant.subscription.razorpay.orderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Payment order mismatch' });
    }

    const billingDays = Number(process.env.SUBSCRIPTION_BILLING_DAYS || 30);
    const now = new Date();
    const currentExpiry = tenant?.subscription?.proExpiresAt ? new Date(tenant.subscription.proExpiresAt) : null;
    const baseDate = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
    const newExpiresAt = new Date(baseDate.getTime() + billingDays * 24 * 60 * 60 * 1000);
    const paidAmount = toCurrencyAmount(
  tenant?.subscription?.razorpay?.amount,
  tenant?.subscription?.razorpay?.currency || 'INR',
  { fromMinorUnits: true }
) || Number(buildSubscriptionState(tenant).pricing.proPrice || 0);
const paidCurrency = tenant?.subscription?.razorpay?.currency || buildSubscriptionState(tenant).pricing.currency || 'INR';

    const updatedTenant = await Tenant.findByIdAndUpdate(
  tenantId,
  {
    $set: {
      'subscription.plan': 'pro',
      'subscription.proActivatedAt': now,
      'subscription.proExpiresAt': newExpiresAt,
      'subscription.paymentStatus': 'paid',
      'subscription.updatedAt': now,
      'subscription.razorpay.orderId': razorpay_order_id,
      'subscription.razorpay.paymentId': razorpay_payment_id,
      'subscription.razorpay.signature': razorpay_signature,
      'subscription.razorpay.status': 'paid',
      'subscription.razorpay.paidAt': now
    },
    $push: {
      'subscription.history': {
        $each: [createSubscriptionHistoryEntry({
          provider: 'razorpay',
          event: 'payment_paid',
          plan: 'pro',
          paymentStatus: 'paid',
          amount: paidAmount,
          currency: paidCurrency,
          referenceId: razorpay_payment_id || razorpay_order_id,
          createdAt: tenant?.subscription?.razorpay?.createdAt || now,
          paidAt: now,
          notes: 'Razorpay payment verified and Pro activated'
        })],
        $slice: -100
      }
    }
  },
  { new: true }
);

    await recordReferralPaymentSuccess({ tenantId, paidAt: now });

    const subscription = await applyDynamicPricing(req, buildSubscriptionState(updatedTenant), tenantId);

    if (global.io) {
      global.io.to(String(tenantId)).emit('subscription_plan_updated', {
        source: 'razorpay',
        subscription: buildSubscriptionPayload(subscription)
      });
    }

    return res.json({
      success: true,
      message: 'Pro plan activated successfully',
      subscription: buildSubscriptionPayload(subscription)
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
});

// Create Stripe Checkout Session for Pro subscription
router.post('/subscription/stripe/checkout', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required' });
    }
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const pricing = await resolveStripePricing(req, tenantId);
    const currency = pricing.currency;
    const price = pricing.price;
    const zeroDecimalCurrencies = new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']);
    const multiplier = zeroDecimalCurrencies.has(currency) ? 1 : 100;
    const amount = Math.round(price * multiplier);
    const minAmountByCurrency = {
      usd: 50,
      eur: 50,
      gbp: 50,
      inr: 50,
      aud: 50,
      cad: 50,
      sgd: 50,
      myr: 50,
      nzd: 50
    };
    const minAmount = minAmountByCurrency[currency] ?? 50;
    if (amount < minAmount) {
      const minDisplay = (minAmount / multiplier).toFixed(zeroDecimalCurrencies.has(currency) ? 0 : 2);
      return res.status(400).json({
        success: false,
        message: `Stripe amount too small. Set STRIPE_PRO_PRICE to at least ${minDisplay} ${currency.toUpperCase()}.`
      });
    }

    const origin = req.headers.origin || process.env.CLIENT_URL || process.env.FRONTEND_URL || 'https://bot.gowhats.in';
    const baseSuccess = process.env.STRIPE_SUCCESS_URL || `${origin}/admin`;
    const baseCancel = process.env.STRIPE_CANCEL_URL || `${origin}/admin`;
    const successUrl = baseSuccess.includes('?')
      ? `${baseSuccess}&stripe_session_id={CHECKOUT_SESSION_ID}`
      : `${baseSuccess}?stripe_session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      adaptive_pricing: { enabled: false },
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amount,
            product_data: { name: 'GoWhats Pro Subscription' }
          },
          quantity: 1
        }
      ],
      client_reference_id: String(tenantId),
      metadata: {
        plan: 'pro',
        tenant_id: String(tenantId),
        source: 'gowhats_subscription'
      },
      success_url: successUrl,
      cancel_url: baseCancel
    });

    await Tenant.findByIdAndUpdate(
  tenantId,
  {
    $set: {
      'subscription.paymentStatus': 'pending',
      'subscription.updatedAt': new Date(),
      'subscription.stripe': {
        sessionId: session.id,
        amount: session.amount_total,
        currency: session.currency,
        status: session.payment_status,
        createdAt: new Date()
      }
    },
    $push: {
      'subscription.history': {
        $each: [createSubscriptionHistoryEntry({
          provider: 'stripe',
          event: 'payment_pending',
          plan: 'pro',
          paymentStatus: 'pending',
          amount: price,
          currency,
          referenceId: session.id,
          createdAt: new Date(),
          notes: 'Stripe checkout session created for Pro subscription'
        })],
        $slice: -100
      }
    }
  },
  { new: true, upsert: true, setDefaultsOnInsert: true }
);



    await markReferralPaymentPending(tenantId);

    return res.json({
      success: true,
      provider: 'stripe',
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Error creating Stripe checkout:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create Stripe checkout session'
    });
  }
});

// Verify Stripe payment and activate Pro plan
router.post('/subscription/stripe/verify', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { session_id } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required' });
    }
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }
    if (!session_id) {
      return res.status(400).json({ success: false, message: 'Missing Stripe session id' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session || session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Stripe payment not completed' });
    }

    if (session.client_reference_id && session.client_reference_id !== String(tenantId)) {
      return res.status(400).json({ success: false, message: 'Stripe session mismatch' });
    }

    const billingDays = Number(process.env.SUBSCRIPTION_BILLING_DAYS || 30);
    const now = new Date();
    const currentExpiry = tenant?.subscription?.proExpiresAt ? new Date(tenant.subscription.proExpiresAt) : null;
    const baseDate = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
    const newExpiresAt = new Date(baseDate.getTime() + billingDays * 24 * 60 * 60 * 1000);
    const paidAmount = toCurrencyAmount(session.amount_total, session.currency, { fromMinorUnits: true });

    const updatedTenant = await Tenant.findByIdAndUpdate(
  tenantId,
  {
    $set: {
      'subscription.plan': 'pro',
      'subscription.proActivatedAt': now,
      'subscription.proExpiresAt': newExpiresAt,
      'subscription.paymentStatus': 'paid',
      'subscription.updatedAt': now,
      'subscription.stripe.sessionId': session.id,
      'subscription.stripe.paymentIntentId': session.payment_intent,
      'subscription.stripe.amount': session.amount_total,
      'subscription.stripe.currency': session.currency,
      'subscription.stripe.status': session.payment_status,
      'subscription.stripe.paidAt': now
    },
    $push: {
      'subscription.history': {
        $each: [createSubscriptionHistoryEntry({
          provider: 'stripe',
          event: 'payment_paid',
          plan: 'pro',
          paymentStatus: 'paid',
          amount: paidAmount,
          currency: session.currency,
          referenceId: session.payment_intent || session.id,
          createdAt: tenant?.subscription?.stripe?.createdAt || now,
          paidAt: now,
          notes: 'Stripe payment verified and Pro activated'
        })],
        $slice: -100
      }
    }
  },
  { new: true }
);

    await recordReferralPaymentSuccess({ tenantId, paidAt: now });

    const subscription = await applyDynamicPricing(req, buildSubscriptionState(updatedTenant), tenantId);

    if (global.io) { 
      global.io.to(String(tenantId)).emit('subscription_plan_updated', {
        source: 'stripe',
        subscription: buildSubscriptionPayload(subscription)
      });
    }

    return res.json({
      success: true,
      message: 'Pro plan activated successfully',
      subscription: buildSubscriptionPayload(subscription)
    });
  } catch (error) {
    console.error('Stripe verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Stripe verification failed'
    });
  }
});
module.exports = router;

