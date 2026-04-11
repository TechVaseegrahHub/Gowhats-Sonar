const mongoose = require('mongoose');
const ReferralPartner = require('../models/ReferralPartner');
const ReferralClient = require('../models/ReferralClient');
const ReferralPayout = require('../models/ReferralPayout');
const Tenant = require('../models/Tenant');
const { buildReferralPricingSnapshot, normalizeSharePercent } = require('./referralPricingService');

const REFERRAL_PRICING_FIELDS = [
  'countryCode',
  'currency',
  'baseSubscriptionAmount',
  'referralAddonAmount',
  'subscriptionAmount',
  'partnerShareAmount',
  'gowhatsShareAmount',
  'sharePercent'
];

const normalizeReferralCode = (value) =>
  String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const formatMonthKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 7);
};

const createReferralCodeBase = (businessName = '') => {
  const cleaned = String(businessName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return (cleaned.slice(0, 5) || 'GOWHT').padEnd(5, 'X');
};

const generateUniqueReferralCode = async (businessName = '') => {
  const base = createReferralCodeBase(businessName);

  for (let index = 0; index < 20; index += 1) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const referralCode = `${base}${suffix}`;
    const exists = await ReferralPartner.exists({ referralCode });
    if (!exists) {
      return referralCode;
    }
  }

  return `${base}${Date.now().toString(36).slice(-4).toUpperCase()}`;
};

const getReferralPartnerByCode = async (referralCode) => {
  const normalizedCode = normalizeReferralCode(referralCode);
  if (!normalizedCode) return null;

  return ReferralPartner.findOne({
    referralCode: normalizedCode,
    isActive: true
  });
};

const resolvePartnerSharePercent = async (referralClient = {}, partnerOverride = null) => {
  if (partnerOverride && partnerOverride.sharePercent !== undefined && partnerOverride.sharePercent !== null) {
    return normalizeSharePercent(partnerOverride.sharePercent, 50);
  }

  if (referralClient.partnerId) {
    const partner = await ReferralPartner.findById(referralClient.partnerId).select('sharePercent').lean();
    if (partner && partner.sharePercent !== undefined && partner.sharePercent !== null) {
      return normalizeSharePercent(partner.sharePercent, 50);
    }
  }

  return normalizeSharePercent(referralClient.sharePercent, 50);
};

const buildLiveReferralPricing = async (referralClient = {}, partnerOverride = null) => {
  const sharePercent = await resolvePartnerSharePercent(referralClient, partnerOverride);

  return buildReferralPricingSnapshot({
    phoneNumber: referralClient.clientPhone || '',
    countryCode: referralClient.countryCode || '',
    currency: referralClient.currency || '',
    sharePercent
  });
};

const hasReferralPricingDrift = (referralClient = {}, pricing = {}) =>
  REFERRAL_PRICING_FIELDS.some((field) => {
    if (field === 'countryCode' || field === 'currency') {
      return String(referralClient?.[field] || '') !== String(pricing?.[field] || '');
    }

    return Number(referralClient?.[field] || 0) !== Number(pricing?.[field] || 0);
  });

const syncReferralClientPricing = async (
  referralClient,
  { persist = false, includePaid = false, partner = null } = {}
) => {
  if (!referralClient) return null;

  const baseClient =
    typeof referralClient.toObject === 'function' ? referralClient.toObject() : { ...referralClient };

  if (!includePaid && baseClient.paymentStatus === 'paid') {
    return baseClient;
  }

  const pricing = await buildLiveReferralPricing(baseClient, partner);
  const merged = {
    ...baseClient,
    ...pricing
  };

  if (persist && baseClient._id && hasReferralPricingDrift(baseClient, pricing)) {
    await ReferralClient.updateOne(
      { _id: baseClient._id },
      {
        $set: pricing
      }
    );

    if (typeof referralClient.set === 'function') {
      referralClient.set(pricing);
    } else {
      Object.assign(referralClient, pricing);
    }
  }

  return merged;
};

const ensureValidReferralCode = async (referralCode) => {
  if (!normalizeReferralCode(referralCode)) return null;

  const partner = await getReferralPartnerByCode(referralCode);
  if (!partner) {
    const error = new Error('Invalid referral code');
    error.statusCode = 400;
    throw error;
  }

  return partner;
};

const linkReferralToTenant = async ({
  referralCode,
  tenantId,
  clientName = '',
  clientEmail = '',
  clientPhone = '',
  clientBusinessName = '',
  signedUpAt = new Date()
}) => {
  const partner = await ensureValidReferralCode(referralCode);
  const pricing = buildReferralPricingSnapshot({
    phoneNumber: clientPhone,
    sharePercent: partner.sharePercent
  });
  const signupMonthKey = formatMonthKey(signedUpAt);

  const referralClient = await ReferralClient.findOneAndUpdate(
    { tenantId: String(tenantId) },
    {
      $set: {
        partnerId: partner._id,
        referralCode: partner.referralCode,
        partnerBusinessName: partner.businessName,
        clientName,
        clientEmail: String(clientEmail || '').toLowerCase(),
        clientPhone,
        clientBusinessName,
        countryCode: pricing.countryCode,
        currency: pricing.currency,
        baseSubscriptionAmount: pricing.baseSubscriptionAmount,
        referralAddonAmount: pricing.referralAddonAmount,
        subscriptionAmount: pricing.subscriptionAmount,
        partnerShareAmount: pricing.partnerShareAmount,
        gowhatsShareAmount: pricing.gowhatsShareAmount,
        sharePercent: pricing.sharePercent,
        lastActivityAt: new Date(),
        signupMonthKey
      },
      $setOnInsert: {
        signedUpAt,
        paymentStatus: 'not_started',
        status: 'signed_up',
        plan: 'free_trial'
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: {
        'referral.partnerId': partner._id,
        'referral.partnerBusinessName': partner.businessName,
        'referral.referralCode': partner.referralCode,
        'referral.linkedAt': signedUpAt
      }
    },
    { new: true }
  );

  return referralClient;
};

const markReferralPaymentPending = async (tenantId) => {
  if (!tenantId) return null;

  return ReferralClient.findOneAndUpdate(
    { tenantId: String(tenantId) },
    {
      $set: {
        paymentStatus: 'pending',
        status: 'payment_pending',
        lastActivityAt: new Date()
      }
    },
    { new: true }
  );
};

const markReferralPaymentFailed = async (tenantId) => {
  if (!tenantId) return null;

  return ReferralClient.findOneAndUpdate(
    { tenantId: String(tenantId) },
    {
      $set: {
        paymentStatus: 'failed',
        status: 'payout_failed',
        lastActivityAt: new Date()
      }
    },
    { new: true }
  );
};

const recordReferralPaymentSuccess = async ({ tenantId, paidAt = new Date() } = {}) => {
  if (!tenantId) return null;

  const referralClient = await ReferralClient.findOne({ tenantId: String(tenantId) });
  if (!referralClient) {
    return null;
  }

  await syncReferralClientPricing(referralClient, { persist: true });

  const paymentMonthKey = formatMonthKey(paidAt);

  referralClient.plan = 'pro';
  referralClient.paymentStatus = 'paid';
  referralClient.status = 'commission_pending';
  referralClient.paidAt = paidAt;
  referralClient.paymentMonthKey = paymentMonthKey;
  referralClient.lastActivityAt = new Date();
  await referralClient.save();

  const payout = await ReferralPayout.findOneAndUpdate(
    {
      clientId: referralClient._id,
      batchMonth: paymentMonthKey
    },
    {
      $setOnInsert: {
        partnerId: referralClient.partnerId,
        tenantId: referralClient.tenantId,
        amount: referralClient.partnerShareAmount,
        currency: referralClient.currency,
        note: `Referral commission for ${referralClient.clientBusinessName || referralClient.clientEmail || referralClient.tenantId}`
      },
      $set: {
        status: 'pending'
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  referralClient.lastPayoutId = payout._id;
  await referralClient.save();

  return { referralClient, payout };
};

const buildCurrencyTotals = (clients = [], payouts = []) => {
  const totals = new Map();

  const ensureCurrency = (currency) => {
    const key = String(currency || 'INR').toUpperCase();
    if (!totals.has(key)) {
      totals.set(key, {
        currency: key,
        earned: 0,
        pending: 0,
        paid: 0
      });
    }
    return totals.get(key);
  };

  clients.forEach((client) => {
    const bucket = ensureCurrency(client.currency);
    if (client.paymentStatus === 'paid') {
      bucket.earned += Number(client.partnerShareAmount || 0);
    }
  });

  payouts.forEach((payout) => {
    const bucket = ensureCurrency(payout.currency);
    if (payout.status === 'paid') {
      bucket.paid += Number(payout.amount || 0);
    } else {
      bucket.pending += Number(payout.amount || 0);
    }
  });

  return Array.from(totals.values()).map((item) => ({
    ...item,
    earned: Number(item.earned.toFixed(2)),
    pending: Number(item.pending.toFixed(2)),
    paid: Number(item.paid.toFixed(2))
  }));
};

const buildPartnerDashboardPayload = async ({ partnerId, monthKey = '' } = {}) => {
  const partner = await ReferralPartner.findById(partnerId).lean();
  if (!partner) return null;

  const clientQuery = { partnerId: partner._id };
  if (monthKey) {
    clientQuery.signupMonthKey = monthKey;
  }

  const clients = await ReferralClient.find(clientQuery)
    .sort({ signedUpAt: -1, createdAt: -1 })
    .lean();

  const payoutQuery = { partnerId: partner._id };
  if (monthKey) {
    payoutQuery.batchMonth = monthKey;
  }

  const payouts = await ReferralPayout.find(payoutQuery).lean();
  const allClients = await ReferralClient.find({ partnerId: partner._id }).lean();
  const allPayouts = await ReferralPayout.find({ partnerId: partner._id }).lean();

  const monthlySummary = await ReferralClient.aggregate([
    {
      $match: {
        partnerId: new mongoose.Types.ObjectId(partnerId)
      }
    },
    {
      $group: {
        _id: '$signupMonthKey',
        onboardedClients: { $sum: 1 },
        paidClients: {
          $sum: {
            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0]
          }
        },
        earnedAmount: {
          $sum: {
            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$partnerShareAmount', 0]
          }
        }
      }
    },
    { $sort: { _id: -1 } },
    { $limit: 12 }
  ]);

  const pendingPayouts = allPayouts.filter((item) => item.status === 'pending' || item.status === 'processing').length;

  const hydratedClients = await Promise.all(
    clients.map((client) => syncReferralClientPricing(client, { persist: true, partner }))
  );

  return {
    partner: {
      id: String(partner._id),
      businessName: partner.businessName,
      email: partner.email,
      phoneNumber: partner.phoneNumber,
      referralCode: partner.referralCode,
      countryCode: partner.countryCode,
      currency: partner.currency,
      sharePercent: normalizeSharePercent(partner.sharePercent, 50)
    },
    summary: {
      totalClients: allClients.length,
      paidClients: allClients.filter((item) => item.paymentStatus === 'paid').length,
      pendingPayouts,
      currentMonth: monthKey || formatMonthKey(),
      currencyTotals: buildCurrencyTotals(allClients, allPayouts)
    },
    monthlySummary: monthlySummary.map((item) => ({
      month: item._id,
      onboardedClients: item.onboardedClients,
      paidClients: item.paidClients,
      earnedAmount: Number(Number(item.earnedAmount || 0).toFixed(2))
    })),
    clients: hydratedClients.map((client) => ({
      id: String(client._id),
      tenantId: client.tenantId,
      clientName: client.clientName,
      clientBusinessName: client.clientBusinessName,
      clientEmail: client.clientEmail,
      clientPhone: client.clientPhone,
      countryCode: client.countryCode,
      currency: client.currency,
      baseSubscriptionAmount: client.baseSubscriptionAmount,
      referralAddonAmount: client.referralAddonAmount,
      subscriptionAmount: client.subscriptionAmount,
      partnerShareAmount: client.partnerShareAmount,
      plan: client.plan,
      status: client.status,
      paymentStatus: client.paymentStatus,
      signedUpAt: client.signedUpAt,
      paidAt: client.paidAt
    }))
  };
};

module.exports = {
  normalizeReferralCode,
  formatMonthKey,
  generateUniqueReferralCode,
  getReferralPartnerByCode,
  ensureValidReferralCode,
  linkReferralToTenant,
  markReferralPaymentPending,
  markReferralPaymentFailed,
  recordReferralPaymentSuccess,
  buildCurrencyTotals,
  buildPartnerDashboardPayload,
  buildLiveReferralPricing,
  syncReferralClientPricing
};

