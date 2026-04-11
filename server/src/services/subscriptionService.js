const Tenant = require('../models/Tenant');
const Message = require('../models/Message');

const FREE_TRIAL_PLAN = 'free_trial';
const PRO_PLAN = 'pro';
const FREE_TRIAL_WEBSITE_ORDER_CONFIRMATION_LIMIT = 100;
const PRO_ONLY_MODULES = ['broadcast', 'packing', 'tracking', 'holding'];
const TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || 14);
const BILLING_DAYS = Number(process.env.SUBSCRIPTION_BILLING_DAYS || 30);
const SUBSCRIPTION_CURRENCY = String(process.env.SUBSCRIPTION_CURRENCY || 'INR').toUpperCase();
const SUBSCRIPTION_DEFAULT_COUNTRY = String(
  process.env.SUBSCRIPTION_DEFAULT_COUNTRY || (SUBSCRIPTION_CURRENCY === 'INR' ? 'IN' : '')
).toUpperCase();
const SUBSCRIPTION_PRICE = Number(
  process.env[`SUBSCRIPTION_PRICE_${SUBSCRIPTION_DEFAULT_COUNTRY}`] ||
  process.env[`SUBSCRIPTION_PRICE_${SUBSCRIPTION_CURRENCY}`] ||
  process.env.SUBSCRIPTION_PRICE_INR ||
  process.env.SUBSCRIPTION_PRO_PRICE ||
  999
);
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

const normalizePlan = (plan) => (plan === PRO_PLAN ? PRO_PLAN : FREE_TRIAL_PLAN);
const normalizeCurrency = (currency) => String(currency || SUBSCRIPTION_CURRENCY || 'INR').toUpperCase();
const getCurrencyDivisor = (currency) => (
  ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toLowerCase()) ? 1 : 100
);
const toCurrencyAmount = (amount, currency, { fromMinorUnits = false } = {}) => {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount)) return 0;

  const majorAmount = fromMinorUnits
    ? numericAmount / getCurrencyDivisor(currency)
    : numericAmount;

  return Number(majorAmount.toFixed(2));
};

const createSubscriptionHistoryEntry = ({
  provider = 'manual',
  event = 'payment_recorded',
  plan = FREE_TRIAL_PLAN,
  paymentStatus = null,
  amount = 0,
  currency = SUBSCRIPTION_CURRENCY,
  referenceId = '',
  createdAt = new Date(),
  paidAt = null,
  notes = ''
} = {}) => ({
  provider: String(provider || 'manual'),
  event: String(event || 'payment_recorded'),
  plan: normalizePlan(plan),
  paymentStatus: paymentStatus ? String(paymentStatus) : null,
  amount: toCurrencyAmount(amount, currency),
  currency: normalizeCurrency(currency),
  referenceId: String(referenceId || ''),
  createdAt: createdAt ? new Date(createdAt) : new Date(),
  paidAt: paidAt ? new Date(paidAt) : null,
  notes: String(notes || '')
});

const buildSubscriptionBillingSnapshot = (
  tenant,
  { priceOverride = null, currencyOverride = null } = {}
) => {
  const subscription = buildSubscriptionState(tenant);
  const stripe = tenant?.subscription?.stripe || {};
  const razorpay = tenant?.subscription?.razorpay || {};
  const historyEntries = Array.isArray(tenant?.subscription?.history)
    ? tenant.subscription.history.map((entry) => createSubscriptionHistoryEntry(entry))
    : [];
  const latestHistoryEntry = [...historyEntries].sort((left, right) => {
    const leftTs = new Date(left.paidAt || left.createdAt || 0).getTime();
    const rightTs = new Date(right.paidAt || right.createdAt || 0).getTime();
    return rightTs - leftTs;
  })[0] || null;

  const latestSource = [
    stripe.sessionId || stripe.paymentIntentId || stripe.amount
      ? {
          provider: 'stripe',
          amount: toCurrencyAmount(stripe.amount, stripe.currency, { fromMinorUnits: true }),
          currency: normalizeCurrency(stripe.currency || currencyOverride || subscription.pricing.currency),
          referenceId: stripe.paymentIntentId || stripe.sessionId || '',
          status: stripe.status || null,
          createdAt: stripe.createdAt || null,
          paidAt: stripe.paidAt || null
        }
      : null,
    razorpay.orderId || razorpay.paymentId || razorpay.amount
      ? {
          provider: 'razorpay',
          amount: toCurrencyAmount(razorpay.amount, razorpay.currency, { fromMinorUnits: true }),
          currency: normalizeCurrency(razorpay.currency || currencyOverride || subscription.pricing.currency),
          referenceId: razorpay.paymentId || razorpay.orderId || '',
          status: razorpay.status || null,
          createdAt: razorpay.createdAt || null,
          paidAt: razorpay.paidAt || null
        }
       : null,
    latestHistoryEntry
      ? {
          provider: latestHistoryEntry.provider || 'manual',
          amount: toCurrencyAmount(latestHistoryEntry.amount, latestHistoryEntry.currency),
          currency: normalizeCurrency(latestHistoryEntry.currency || currencyOverride || subscription.pricing.currency),
          referenceId: latestHistoryEntry.referenceId || '',
          status: latestHistoryEntry.paymentStatus || null,
          createdAt: latestHistoryEntry.createdAt || null,
          paidAt: latestHistoryEntry.paidAt || null
        }
      : null
  ]
    .filter(Boolean)
    .sort((left, right) => {
      const leftTs = new Date(left.paidAt || left.createdAt || 0).getTime();
      const rightTs = new Date(right.paidAt || right.createdAt || 0).getTime();
      return rightTs - leftTs;
    })[0] || null;

  const resolvedCurrency = normalizeCurrency(
    currencyOverride ||
    latestSource?.currency ||
    subscription.pricing?.currency
  );
  const overriddenAmount = Number(priceOverride);
  const resolvedAmount = Number.isFinite(overriddenAmount) && overriddenAmount > 0
     ? toCurrencyAmount(overriddenAmount, resolvedCurrency)
      : (latestSource?.amount > 0
        ? toCurrencyAmount(latestSource.amount, resolvedCurrency)
        : toCurrencyAmount(subscription.pricing?.proPrice || 0, resolvedCurrency));

  const paymentStatus = tenant?.subscription?.paymentStatus || latestSource?.status || null;
  const amountPaid = paymentStatus === 'paid' ? resolvedAmount : 0;
  const amountDue = paymentStatus === 'paid' ? 0 : resolvedAmount;

  return {
    paymentStatus,
    amount: resolvedAmount,
    currency: resolvedCurrency,
    amountPaid,
    amountDue,
    provider: latestSource?.provider || 'manual',
    referenceId: latestSource?.referenceId || '',
    lastChargeAt: latestSource?.createdAt || tenant?.subscription?.updatedAt || null,
    lastPaidAt:
      latestSource?.paidAt ||
      (paymentStatus === 'paid' ? tenant?.subscription?.proActivatedAt || null : null)
  };
};

const buildSubscriptionHistory = (
  tenant,
  { priceOverride = null, currencyOverride = null } = {}
) => {
  const subscription = buildSubscriptionState(tenant);
  const billing = buildSubscriptionBillingSnapshot(tenant, { priceOverride, currencyOverride });
  const storedHistory = Array.isArray(tenant?.subscription?.history)
    ? tenant.subscription.history.map((entry) => createSubscriptionHistoryEntry(entry))
    : [];
  const legacyEntries = [];
  const stripe = tenant?.subscription?.stripe || {};
  const razorpay = tenant?.subscription?.razorpay || {};

  if (stripe.sessionId || stripe.paymentIntentId || stripe.amount) {
    legacyEntries.push(createSubscriptionHistoryEntry({
      provider: 'stripe',
      event: stripe.status === 'paid' ? 'payment_paid' : 'payment_pending',
      plan: PRO_PLAN,
      paymentStatus: stripe.status === 'paid'
        ? 'paid'
        : (tenant?.subscription?.paymentStatus || 'pending'),
      amount: toCurrencyAmount(stripe.amount, stripe.currency, { fromMinorUnits: true }) || billing.amount,
      currency: stripe.currency || billing.currency,
      referenceId: stripe.paymentIntentId || stripe.sessionId || '',
      createdAt: stripe.createdAt || stripe.paidAt || tenant?.subscription?.updatedAt,
      paidAt: stripe.paidAt || null,
      notes: 'Stripe subscription payment'
    }));
  }

  if (razorpay.orderId || razorpay.paymentId || razorpay.amount) {
    legacyEntries.push(createSubscriptionHistoryEntry({
      provider: 'razorpay',
      event: razorpay.status === 'paid' ? 'payment_paid' : 'payment_pending',
      plan: PRO_PLAN,
      paymentStatus: razorpay.status === 'paid'
        ? 'paid'
        : (tenant?.subscription?.paymentStatus || 'pending'),
      amount: toCurrencyAmount(razorpay.amount, razorpay.currency, { fromMinorUnits: true }) || billing.amount,
      currency: razorpay.currency || billing.currency,
      referenceId: razorpay.paymentId || razorpay.orderId || '',
      createdAt: razorpay.createdAt || razorpay.paidAt || tenant?.subscription?.updatedAt,
      paidAt: razorpay.paidAt || null,
      notes: 'Razorpay subscription payment'
    }));
  }

  if (
    storedHistory.length === 0 &&
    legacyEntries.length === 0 &&
    (subscription.isPro || billing.paymentStatus === 'paid')
  ) {
    legacyEntries.push(createSubscriptionHistoryEntry({
      provider: 'manual',
      event: 'plan_changed',
      plan: subscription.plan,
      paymentStatus: billing.paymentStatus,
      amount: billing.amount,
      currency: billing.currency,
      createdAt: tenant?.subscription?.proActivatedAt || tenant?.subscription?.updatedAt || tenant?.createdAt,
      paidAt: billing.paymentStatus === 'paid'
        ? (tenant?.subscription?.proActivatedAt || tenant?.subscription?.updatedAt || null)
        : null,
      notes: 'Subscription plan updated manually'
    }));
  }

  const deduped = [...storedHistory, ...legacyEntries].reduce((accumulator, entry) => {
    const key = [
      entry.provider,
      entry.event,
      entry.plan,
      entry.paymentStatus,
      entry.referenceId,
      entry.amount,
      entry.currency,
      entry.createdAt ? new Date(entry.createdAt).toISOString() : '',
      entry.paidAt ? new Date(entry.paidAt).toISOString() : ''
    ].join('|');

    if (!accumulator.seen.has(key)) {
      accumulator.seen.add(key);
      accumulator.items.push(entry);
    }

    return accumulator;
  }, { seen: new Set(), items: [] }).items;

  return deduped.sort((left, right) => {
    const leftTs = new Date(left.paidAt || left.createdAt || 0).getTime();
    const rightTs = new Date(right.paidAt || right.createdAt || 0).getTime();
    return rightTs - leftTs;
  });
};

const buildSubscriptionState = (tenant) => {
  const plan = normalizePlan(tenant?.subscription?.plan);
  const websiteOrderConfirmationLimit = Number(
    tenant?.subscription?.websiteOrderConfirmationLimit || FREE_TRIAL_WEBSITE_ORDER_CONFIRMATION_LIMIT
  );
  const websiteOrderConfirmationSent = Number(tenant?.subscription?.websiteOrderConfirmationSent || 0);
  const remaining = Math.max(websiteOrderConfirmationLimit - websiteOrderConfirmationSent, 0);

  const now = new Date();
  const trialStartedAt = tenant?.subscription?.trialStartedAt || tenant?.createdAt || now;
  const trialEndsAt = tenant?.subscription?.trialEndsAt
    ? new Date(tenant.subscription.trialEndsAt)
    : new Date(new Date(trialStartedAt).getTime() + TRIAL_DAYS * DAY_IN_MS);
  const trialMsLeft = trialEndsAt.getTime() - now.getTime();
  const trialDaysLeft = Math.max(Math.ceil(trialMsLeft / DAY_IN_MS), 0);
  const isTrialActive = plan === FREE_TRIAL_PLAN && trialMsLeft > 0;
  const isTrialExpired = plan === FREE_TRIAL_PLAN && trialMsLeft <= 0;

  const proActivatedAt = tenant?.subscription?.proActivatedAt || null;
  const storedProExpiresAt = tenant?.subscription?.proExpiresAt || null;
  const computedProExpiresAt = !storedProExpiresAt && proActivatedAt
    ? new Date(new Date(proActivatedAt).getTime() + BILLING_DAYS * DAY_IN_MS)
    : null;
  const proExpiresAt = storedProExpiresAt || computedProExpiresAt;
  const proMsLeft = proExpiresAt ? proExpiresAt.getTime() - now.getTime() : null;
  const proDaysLeft = proMsLeft !== null ? Math.max(Math.ceil(proMsLeft / DAY_IN_MS), 0) : null;
  const isProExpired = plan === PRO_PLAN && proExpiresAt && proMsLeft <= 0;
  const isProActive = plan === PRO_PLAN && (!proExpiresAt || proMsLeft > 0);

  const hasProAccess = isProActive;

  return {
    plan,
    isPro: plan === PRO_PLAN,
    hasProAccess,
    trial: {
      totalDays: TRIAL_DAYS,
      startsAt: trialStartedAt,
      endsAt: trialEndsAt,
      daysLeft: trialDaysLeft,
      isActive: isTrialActive,
      isExpired: isTrialExpired
    },
    pro: {
      totalDays: BILLING_DAYS,
      startsAt: proActivatedAt,
      endsAt: proExpiresAt,
      daysLeft: proDaysLeft,
      isActive: isProActive,
      isExpired: isProExpired
    },
    pricing: {
      proPrice: SUBSCRIPTION_PRICE,
      currency: SUBSCRIPTION_CURRENCY,
      billingCycleDays: BILLING_DAYS
    },
    websiteOrderConfirmationLimit,
    websiteOrderConfirmationSent,
    websiteOrderConfirmationRemaining: remaining,
    proOnlyModules: PRO_ONLY_MODULES
  };
};

const getTenantSubscriptionById = async (tenantId) => {
  if (!tenantId) {
    return buildSubscriptionState(null);
  }

  const tenant = await Tenant.findById(tenantId).lean();
  return buildSubscriptionState(tenant);
};

const canAccessModule = (tenant, moduleKey) => {
  const subscription = buildSubscriptionState(tenant);

  if (!PRO_ONLY_MODULES.includes(moduleKey)) {
    return { allowed: true, subscription };
  }

  return {
    allowed: subscription.hasProAccess,
    subscription
  };
};

const canSendWebsiteOrderConfirmation = (tenant) => {
  const subscription = buildSubscriptionState(tenant);

  if (subscription.hasProAccess) {
    return { allowed: true, subscription };
  }

  return {
    allowed: subscription.websiteOrderConfirmationRemaining > 0,
    subscription
  };
};

const syncWebsiteOrderConfirmationUsage = async (tenantId) => {
  if (!tenantId) return buildSubscriptionState(null);

  const actualCount = await Message.countDocuments({
    tenantId: tenantId,
    isOrderConfirmation: true,
    status: { $in: ['sent', 'delivered', 'read'] },
    $or: [
      { 'orderData.platform': { $in: ['shopify', 'woocommerce'] } },
      { 'orderDetails.platform': { $in: ['shopify', 'woocommerce'] } }
    ]
  });

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: {
        'subscription.websiteOrderConfirmationSent': actualCount,
        'subscription.updatedAt': new Date()
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  return buildSubscriptionState(tenant);
};

const getGlobalFreeTrialDays = async () => TRIAL_DAYS;

module.exports = {
  FREE_TRIAL_PLAN,
  PRO_PLAN,
  FREE_TRIAL_WEBSITE_ORDER_CONFIRMATION_LIMIT,
  PRO_ONLY_MODULES,
  TRIAL_DAYS,
  BILLING_DAYS,
  normalizePlan,
  normalizeCurrency,
  toCurrencyAmount,
  createSubscriptionHistoryEntry,
  buildSubscriptionBillingSnapshot,
  buildSubscriptionHistory,
  buildSubscriptionState,
  getTenantSubscriptionById,
  getGlobalFreeTrialDays,
  canAccessModule,
  canSendWebsiteOrderConfirmation,
  syncWebsiteOrderConfirmationUsage
};

