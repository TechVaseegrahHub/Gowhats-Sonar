const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const TenantConfig = require('../models/TenantConfig');
const User = require('../models/User');
const Broadcast = require('../models/Broadcast');
const Template = require('../models/Template');
const Contact = require('../models/Contact');
const Settings = require('../models/settings');
const ReferralPartner = require('../models/ReferralPartner');
const ReferralClient = require('../models/ReferralClient');
const ReferralPayout = require('../models/ReferralPayout');
const jwt = require('jsonwebtoken');
const {
  buildSubscriptionState,
  normalizePlan,
  createSubscriptionHistoryEntry,
  buildSubscriptionBillingSnapshot,
  buildSubscriptionHistory
} = require('../services/subscriptionService');
const {
  buildPartnerDashboardPayload,
  formatMonthKey,
  syncReferralClientPricing
} = require('../services/referralService');

// Dedicated auth for super admin routes
const adminAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Super admin access required'
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired admin token'
    });
  }
};

const toAdminSubscriptionPayload = (tenantDoc, { referralClient = null } = {}) => {
  const sub = buildSubscriptionState(tenantDoc);
  const referralPrice = Number(referralClient?.subscriptionAmount || 0);
  const priceOverride = Number.isFinite(referralPrice) && referralPrice > 0 ? referralPrice : null;
  const currencyOverride = referralClient?.currency || null;
  const billing = buildSubscriptionBillingSnapshot(tenantDoc, { priceOverride, currencyOverride });

  return {
    plan: sub.plan,
    isPro: sub.isPro,
    hasProAccess: sub.hasProAccess,
    trial: sub.trial,
    pro: sub.pro,
    pricing: {
      ...sub.pricing,
      proPrice: billing.amount,
      currency: billing.currency
    },
    paymentStatus: billing.paymentStatus,
    amount: billing.amount,
    currency: billing.currency,
    amountPaid: billing.amountPaid,
    amountDue: billing.amountDue,
    provider: billing.provider,
    referenceId: billing.referenceId,
    lastChargeAt: billing.lastChargeAt,
    lastPaidAt: billing.lastPaidAt,
    history: buildSubscriptionHistory(tenantDoc, { priceOverride, currencyOverride }),
    websiteOrderConfirmationLimit: sub.websiteOrderConfirmationLimit,
    websiteOrderConfirmationSent: sub.websiteOrderConfirmationSent,
    websiteOrderConfirmationRemaining: sub.websiteOrderConfirmationRemaining,
    proOnlyModules: sub.proOnlyModules
  };
};

// Admin Dashboard Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const adminEmail = process.env.ADMIN_DASHBOARD_EMAIL;
    const adminPassword = process.env.ADMIN_DASHBOARD_PASSWORD;

    if (email === adminEmail && password === adminPassword) {
      // Create a special admin token
      const token = jwt.sign(
        { role: 'super_admin', email: adminEmail },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        success: true,
        token
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get all tenants with their users and business name from config
router.get('/all-tenants', adminAuth, async (req, res) => {
  try {
    const tenants = await Tenant.find({}).lean();
    const tenantsWithDetails = await Promise.all(tenants.map(async (tenant) => {
      // Fetch business name from TenantConfig
      const config = await TenantConfig.findOne({ tenantId: tenant._id }).lean();
      const referralClientDoc = await ReferralClient.findOne({ tenantId: String(tenant._id) }).lean();
      const referralClient = referralClientDoc
        ? await syncReferralClientPricing(referralClientDoc, { persist: true })
        : null;

      // Fetch users
      const users = await User.find({ tenant_id: tenant._id }).select('-password').lean();

      // Find the admin user to get the company_name from onboarding
      const adminUser = users.find(u => u.role === 'admin') || users[0];

      // Fetch analytics data
      const Message = require('../models/Message');
      const WhatsAppService = require('../services/whatsappServices');

      const [broadcastCount, contactCount, sentTemplatesCount, cachedTemplateCount] = await Promise.all([
        Broadcast.countDocuments({ tenantId: tenant._id }),
        Contact.countDocuments({ tenantId: tenant._id }),
        Message.countDocuments({
          tenantId: tenant._id,
          type: 'template',
          status: 'sent'
        }),
        Template.countDocuments({ tenantId: tenant._id })
      ]);

      let templateCount = cachedTemplateCount;
      const canFetchMetaTemplates = !!(
        tenant.whatsappConfig?.accessToken &&
        (tenant.whatsappConfig?.businessAccountId || tenant.whatsappConfig?.phoneNumberId)
      );

      // Hit Meta only when local cache is empty to avoid repeated 400/403 noise.
      if (templateCount === 0 && canFetchMetaTemplates) {
        const whatsapp = new WhatsAppService(tenant);
        const metaTemplates = await whatsapp.getTemplates();
        const metaTemplateList = Array.isArray(metaTemplates?.data) ? metaTemplates.data : [];

        if (metaTemplateList.length > 0) {
          templateCount = metaTemplateList.length;

          const allowedStatus = new Set(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
          await Promise.all(
            metaTemplateList.map((tpl) =>
              Template.updateOne(
                {
                  tenantId: String(tenant._id),
                  name: tpl.name,
                  language: tpl.language || 'en'
                },
                {
                  $set: {
                    category: tpl.category || 'UTILITY',
                    components: Array.isArray(tpl.components) ? tpl.components : [],
                    whatsappTemplateId: tpl.id || tpl.whatsappTemplateId || null,
                    status: allowedStatus.has(tpl.status) ? tpl.status : 'PENDING'
                  }
                },
                { upsert: true }
              )
            )
          );
        }
      }

      return {
        ...tenant,
        name: config?.businessName || adminUser?.company_name || tenant.name || `Tenant ${tenant._id.substring(0, 8)}`,
        users,
        config: config || null,
        subscription: toAdminSubscriptionPayload(tenant, { referralClient }),
        analytics: {
          broadcasts: broadcastCount,
          templatesCreated: templateCount,
          templatesSent: sentTemplatesCount,
          contacts: contactCount
        }
      };
    }));

    res.json({
      success: true,
      tenants: tenantsWithDetails
    });
  } catch (error) {
    console.error('Error fetching all tenants:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update tenant subscription plan (free_trial / pro)
router.patch('/tenant/:tenantId/subscription', adminAuth, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { plan } = req.body || {};

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
    const referralClientDoc = await ReferralClient.findOne({ tenantId: String(tenantId) }).lean();
    const referralClient = referralClientDoc
      ? await syncReferralClientPricing(referralClientDoc, { persist: true })
      : null;
    const manualAmount = Number(referralClient?.subscriptionAmount || 0);
    const resolvedAmount = Number.isFinite(manualAmount) && manualAmount > 0
      ? manualAmount
      : Number(buildSubscriptionState({ subscription: { plan: nextPlan } }).pricing.proPrice || 0);
    const resolvedCurrency = String(referralClient?.currency || buildSubscriptionState({ subscription: { plan: nextPlan } }).pricing.currency || 'INR').toUpperCase();
    const historyEntry = createSubscriptionHistoryEntry({
      provider: 'manual',
      event: 'plan_changed',
      plan: nextPlan,
      paymentStatus: nextPlan === 'pro' ? 'paid' : null,
      amount: resolvedAmount,
      currency: resolvedCurrency,
      createdAt: new Date(),
      paidAt: nextPlan === 'pro' ? new Date() : null,
      notes: `Plan changed from Admin Dashboard to ${nextPlan === 'pro' ? 'Pro' : 'Free Trial'}`
    });
    const updatePayload = {
      'subscription.plan': nextPlan,
      'subscription.websiteOrderConfirmationLimit': 100,
      'subscription.updatedAt': new Date()
    };

    if (nextPlan === 'pro') {
      const billingDays = Number(process.env.SUBSCRIPTION_BILLING_DAYS || 30);
      const now = new Date();
      updatePayload['subscription.proActivatedAt'] = now;
      updatePayload['subscription.proExpiresAt'] = new Date(now.getTime() + billingDays * 24 * 60 * 60 * 1000);
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
      { new: true }
    ).lean();

    if (!updatedTenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const updatedReferralClientDoc = await ReferralClient.findOne({ tenantId: String(tenantId) }).lean();
    const updatedReferralClient = updatedReferralClientDoc
      ? await syncReferralClientPricing(updatedReferralClientDoc, { persist: true })
      : null;
    const subscription = toAdminSubscriptionPayload(updatedTenant, { referralClient: updatedReferralClient });

    if (global.io) {
      global.io.to(String(tenantId)).emit('subscription_plan_updated', {
        source: 'admin_dashboard',
        subscription: {
          plan: subscription.plan,
          isPro: subscription.isPro,
          hasProAccess: subscription.hasProAccess,
          trial: subscription.trial,
          pro: subscription.pro,
          pricing: subscription.pricing,
          proOnlyModules: subscription.proOnlyModules,
          websiteIntegration: {
            orderConfirmationLimit: subscription.websiteOrderConfirmationLimit,
            orderConfirmationSent: subscription.websiteOrderConfirmationSent,
            orderConfirmationRemaining: subscription.websiteOrderConfirmationRemaining
          }
        }
      });
    }

    return res.json({
      success: true,
      message: `Tenant plan updated to ${nextPlan}`,
      tenantId,
      subscription
    });
  } catch (error) {
    console.error('Error updating tenant subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.patch('/tenant/:tenantId/payment-status', adminAuth, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { paymentStatus } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    if (!['paid', 'unpaid'].includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status. Supported values: paid, unpaid'
      });
    }

    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const referralClientDoc = await ReferralClient.findOne({ tenantId: String(tenantId) }).lean();
    const referralClient = referralClientDoc
      ? await syncReferralClientPricing(referralClientDoc, { persist: true })
      : null;
    const subscriptionState = buildSubscriptionState(tenant);
    const manualAmount = Number(referralClient?.subscriptionAmount || 0);
    const resolvedAmount = Number.isFinite(manualAmount) && manualAmount > 0
      ? manualAmount
      : Number(subscriptionState.pricing?.proPrice || 0);
    const resolvedCurrency = String(
      referralClient?.currency ||
      subscriptionState.pricing?.currency ||
      'INR'
    ).toUpperCase();
    const nextPaymentStatus = paymentStatus === 'paid' ? 'paid' : null;
    const now = new Date();
    const billingDays = Number(process.env.SUBSCRIPTION_BILLING_DAYS || 30);
    const updatePayload = {
      'subscription.paymentStatus': nextPaymentStatus,
      'subscription.updatedAt': now
    };

    if (subscriptionState.plan === 'pro') {
      if (nextPaymentStatus === 'paid') {
        const currentExpiry = tenant?.subscription?.proExpiresAt
          ? new Date(tenant.subscription.proExpiresAt)
          : null;
        const baseDate = currentExpiry && currentExpiry.getTime() > now.getTime()
          ? currentExpiry
          : now;

        updatePayload['subscription.proActivatedAt'] = now;
        updatePayload['subscription.proExpiresAt'] = new Date(
          baseDate.getTime() + billingDays * 24 * 60 * 60 * 1000
        );
      } else {
        updatePayload['subscription.proExpiresAt'] = new Date(now.getTime() - 1000);
      }
    }

    const historyEntry = createSubscriptionHistoryEntry({
      provider: 'manual',
      event: nextPaymentStatus === 'paid' ? 'payment_paid' : 'payment_unpaid',
      plan: subscriptionState.plan,
      paymentStatus: nextPaymentStatus,
      amount: resolvedAmount,
      currency: resolvedCurrency,
      referenceId: '',
      createdAt: now,
      paidAt: nextPaymentStatus === 'paid' ? now : null,
      notes: `Payment status manually changed to ${nextPaymentStatus === 'paid' ? 'Paid' : 'Unpaid'} from Admin Dashboard`
    });

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
      { new: true }
    ).lean();

    const updatedReferralClientDoc = await ReferralClient.findOne({ tenantId: String(tenantId) }).lean();
    const updatedReferralClient = updatedReferralClientDoc
      ? await syncReferralClientPricing(updatedReferralClientDoc, { persist: true })
      : null;
    const subscription = toAdminSubscriptionPayload(updatedTenant, { referralClient: updatedReferralClient });

    if (global.io) {
      global.io.to(String(tenantId)).emit('subscription_plan_updated', {
        source: 'admin_dashboard_payment_status',
        subscription: {
          plan: subscription.plan,
          isPro: subscription.isPro,
          hasProAccess: subscription.hasProAccess,
          trial: subscription.trial,
          pro: subscription.pro,
          pricing: subscription.pricing,
          paymentStatus: subscription.paymentStatus,
          amount: subscription.amount,
          amountPaid: subscription.amountPaid,
          amountDue: subscription.amountDue,
          proOnlyModules: subscription.proOnlyModules,
          websiteIntegration: {
            orderConfirmationLimit: subscription.websiteOrderConfirmationLimit,
            orderConfirmationSent: subscription.websiteOrderConfirmationSent,
            orderConfirmationRemaining: subscription.websiteOrderConfirmationRemaining
          }
        }
      });
    }

    return res.json({
      success: true,
      message: `Tenant payment status updated to ${paymentStatus}`,
      tenantId,
      subscription
    });
  } catch (error) {
    console.error('Error updating tenant payment status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/tenant/:tenantId/product-image-module', adminAuth, async (req, res) => {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const tenantExists = await Tenant.exists({ _id: tenantId });
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) {
      settings = await Settings.create({ tenant_id: tenantId });
    }

    const enabled = Boolean(settings?.aiConfig?.productImageFetchEnabled);

    return res.json({
      success: true,
      tenantId,
      enabled,
      module: 'product_image_fetch_ai'
    });
  } catch (error) {
    console.error('Error fetching tenant product image AI module status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Product Image AI module status'
    });
  }
});

router.patch('/tenant/:tenantId/product-image-module', adminAuth, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { enabled } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean value'
      });
    }

    const tenantExists = await Tenant.exists({ _id: tenantId });
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
    }

    if (!settings.aiConfig) {
      settings.aiConfig = {};
    }

    settings.aiConfig.productImageFetchEnabled = enabled;
    settings.markModified('aiConfig');
    await settings.save();

    return res.json({
      success: true,
      tenantId,
      enabled: settings.aiConfig.productImageFetchEnabled,
      module: 'product_image_fetch_ai',
      message: `Product image fetching AI ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Error updating tenant product image AI module status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update Product Image AI module status'
    });
  }
});

router.get('/referrals/overview', adminAuth, async (req, res) => {
  try {
    const month = String(req.query.month || formatMonthKey()).trim();
    const partners = await ReferralPartner.find({}).sort({ createdAt: -1 }).lean();

    const partnerPayloads = await Promise.all(
      partners.map(async (partner) => {
        const payload = await buildPartnerDashboardPayload({
          partnerId: partner._id,
          monthKey: month
        });

        return {
          partner: payload?.partner || {
            id: String(partner._id),
            businessName: partner.businessName,
            email: partner.email,
            phoneNumber: partner.phoneNumber,
            referralCode: partner.referralCode,
            sharePercent: Number(partner.sharePercent ?? 50)
          },
          summary: payload?.summary || {
            totalClients: 0,
            paidClients: 0,
            pendingPayouts: 0,
            currentMonth: month,
            currencyTotals: []
          },
          monthlySummary: payload?.monthlySummary || [],
          clients: payload?.clients || []
        };
      })
    );

    const totals = partnerPayloads.reduce(
      (acc, item) => {
        acc.totalPartners += 1;
        acc.totalClients += Number(item.summary?.totalClients || 0);
        acc.totalPaidClients += Number(item.summary?.paidClients || 0);
        return acc;
      },
      {
        totalPartners: 0,
        totalClients: 0,
        totalPaidClients: 0
      }
    );

    return res.json({
      success: true,
      month,
      totals,
      partners: partnerPayloads
    });
  } catch (error) {
    console.error('Error fetching referral overview:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch referral overview'
    });
  }
});

router.patch('/referrals/partner/:partnerId/share-percent', adminAuth, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const sharePercent = Number(req.body?.sharePercent);

    if (!Number.isFinite(sharePercent) || sharePercent < 0 || sharePercent > 100) {
      return res.status(400).json({
        success: false,
        message: 'Share percent must be a number between 0 and 100'
      });
    }

    const normalizedSharePercent = Number(sharePercent.toFixed(2));
    const partner = await ReferralPartner.findByIdAndUpdate(
      partnerId,
      {
        $set: {
          sharePercent: normalizedSharePercent
        }
      },
      { new: true }
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Referral company not found'
      });
    }

    const unpaidClients = await ReferralClient.find({
      partnerId,
      paymentStatus: { $ne: 'paid' }
    });

    await Promise.all(
      unpaidClients.map((client) =>
        syncReferralClientPricing(client, {
          persist: true,
          partner
        })
      )
    );

    return res.json({
      success: true,
      message: `Partner share percent updated to ${normalizedSharePercent}%`,
      partner: {
        id: String(partner._id),
        sharePercent: normalizedSharePercent
      }
    });
  } catch (error) {
    console.error('Error updating referral partner share percent:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update partner share percent'
    });
  }
});

router.post('/referrals/partner/:partnerId/mark-paid', adminAuth, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const month = String(req.body?.month || formatMonthKey()).trim();
    const currency = String(req.body?.currency || 'INR').toUpperCase();

    const partner = await ReferralPartner.findById(partnerId).lean();
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Referral company not found'
      });
    }

    const pendingPayouts = await ReferralPayout.find({
      partnerId,
      batchMonth: month,
      currency,
      status: { $in: ['pending', 'failed', 'processing'] }
    }).lean();

    if (!pendingPayouts.length) {
      return res.status(404).json({
        success: false,
        message: `No unpaid ${currency} commissions found for ${month}`
      });
    }

    const payoutIds = pendingPayouts.map((item) => item._id);
    const now = new Date();

    await ReferralPayout.updateMany(
      { _id: { $in: payoutIds } },
      {
        $set: {
          status: 'paid',
          providerStatus: 'manual_settlement',
          paidAt: now,
          failedAt: null,
          failureReason: '',
          responsePayload: {
            mode: 'manual',
            settledBy: req.admin?.email || 'admin',
            settledAt: now
          }
        }
      }
    );

    await ReferralClient.updateMany(
      { lastPayoutId: { $in: payoutIds } },
      {
        $set: {
          status: 'payout_paid',
          lastActivityAt: now
        }
      }
    );

    return res.json({
      success: true,
      message: `Marked ${currency} referral commissions as paid for ${month}`
    });
  } catch (error) {
    console.error('Error marking referral commission as paid:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update referral payment status'
    });
  }
});

module.exports = router;

