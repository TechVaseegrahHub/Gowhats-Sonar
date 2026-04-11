const COUNTRY_CURRENCY_MAP = [
  { dialCode: '91', code: 'IN', currency: 'INR' },
  { dialCode: '1', code: 'US', currency: 'USD' },
  { dialCode: '44', code: 'GB', currency: 'GBP' },
  { dialCode: '971', code: 'AE', currency: 'AED' },
  { dialCode: '65', code: 'SG', currency: 'SGD' },
  { dialCode: '61', code: 'AU', currency: 'AUD' },
  { dialCode: '1', code: 'CA', currency: 'CAD' },
  { dialCode: '49', code: 'DE', currency: 'EUR' },
  { dialCode: '33', code: 'FR', currency: 'EUR' },
  { dialCode: '39', code: 'IT', currency: 'EUR' },
  { dialCode: '34', code: 'ES', currency: 'EUR' },
  { dialCode: '55', code: 'BR', currency: 'BRL' },
  { dialCode: '52', code: 'MX', currency: 'MXN' },
  { dialCode: '27', code: 'ZA', currency: 'ZAR' },
  { dialCode: '234', code: 'NG', currency: 'NGN' },
  { dialCode: '254', code: 'KE', currency: 'KES' },
  { dialCode: '92', code: 'PK', currency: 'PKR' },
  { dialCode: '880', code: 'BD', currency: 'BDT' },
  { dialCode: '94', code: 'LK', currency: 'LKR' },
  { dialCode: '977', code: 'NP', currency: 'NPR' },
  { dialCode: '62', code: 'ID', currency: 'IDR' },
  { dialCode: '63', code: 'PH', currency: 'PHP' },
  { dialCode: '60', code: 'MY', currency: 'MYR' },
  { dialCode: '66', code: 'TH', currency: 'THB' },
  { dialCode: '84', code: 'VN', currency: 'VND' },
  { dialCode: '966', code: 'SA', currency: 'SAR' },
  { dialCode: '90', code: 'TR', currency: 'TRY' },
  { dialCode: '7', code: 'RU', currency: 'RUB' },
  { dialCode: '81', code: 'JP', currency: 'JPY' },
  { dialCode: '82', code: 'KR', currency: 'KRW' }
];

const normalizePhone = (value) =>
  String(value || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');

const resolveCountryFromPhone = (phoneNumber) => {
  const cleaned = normalizePhone(phoneNumber).replace(/^\+/, '');
  if (!cleaned) return null;

  const sorted = [...COUNTRY_CURRENCY_MAP].sort((a, b) => b.dialCode.length - a.dialCode.length);
  return sorted.find((entry) => cleaned.startsWith(entry.dialCode)) || null;
};

const roundAmount = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
};

const normalizeSharePercent = (value, fallback = 50) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, roundAmount(numeric)));
};

const resolveSubscriptionPricing = ({ phoneNumber = '', countryCode = '', currency = '' } = {}) => {
  const phoneCountry = countryCode
    ? COUNTRY_CURRENCY_MAP.find((entry) => entry.code === countryCode)
    : resolveCountryFromPhone(phoneNumber);

  const currencyKey = String(currency || phoneCountry?.currency || process.env.SUBSCRIPTION_CURRENCY || 'INR').toUpperCase();
  const effectiveCountryCode =
    String(countryCode || phoneCountry?.code || process.env.SUBSCRIPTION_DEFAULT_COUNTRY || '').toUpperCase() ||
    (currencyKey === 'INR' ? 'IN' : '');

  const isIndia = effectiveCountryCode === 'IN' || currencyKey === 'INR';

  const fallbackPrice = isIndia
    ? (process.env.SUBSCRIPTION_PRICE_INR || process.env.SUBSCRIPTION_PRO_PRICE || 0)
    : (
      process.env[`SUBSCRIPTION_PRICE_${currencyKey}`] ||
      process.env[`STRIPE_PRICE_${currencyKey}`] ||
      process.env.STRIPE_PRO_PRICE ||
      process.env.SUBSCRIPTION_PRO_PRICE ||
      0
    );

  const price = roundAmount(
    process.env[`SUBSCRIPTION_PRICE_${effectiveCountryCode}`] ||
    process.env[`SUBSCRIPTION_PRICE_${currencyKey}`] ||
    process.env[`STRIPE_PRICE_${effectiveCountryCode}`] ||
    process.env[`STRIPE_PRICE_${currencyKey}`] ||
    fallbackPrice
  );

  return {
    countryCode: effectiveCountryCode,
    currency: currencyKey,
    price
  };
};

const resolveReferralShare = ({ countryCode = '', currency = '', sharePercent = 50 } = {}) => {
  const normalizedSharePercent = normalizeSharePercent(sharePercent, 50);
  const referralAddon = roundAmount(
    process.env[`REFERRAL_AMOUNT_${String(countryCode || '').toUpperCase()}`] ||
    process.env[`REFERRAL_AMOUNT_${String(currency || '').toUpperCase()}`] ||
    process.env[`REFERRAL_SHARE_${String(countryCode || '').toUpperCase()}`] ||
    process.env[`REFERRAL_SHARE_${String(currency || '').toUpperCase()}`] ||
    0
  );
  const partnerShare = roundAmount((referralAddon * normalizedSharePercent) / 100);
  const gowhatsShare = roundAmount(referralAddon - partnerShare);

  return {
    sharePercent: normalizedSharePercent,
    referralAddon,
    partnerShare: roundAmount(partnerShare),
    gowhatsShare
  };
};

const buildReferralPricingSnapshot = ({
  phoneNumber = '',
  countryCode = '',
  currency = '',
  sharePercent = 50
} = {}) => {
  const subscription = resolveSubscriptionPricing({ phoneNumber, countryCode, currency });
  const share = resolveReferralShare({
    countryCode: subscription.countryCode,
    currency: subscription.currency,
    sharePercent
  });

  return {
    countryCode: subscription.countryCode,
    currency: subscription.currency,
    baseSubscriptionAmount: subscription.price,
    referralAddonAmount: share.referralAddon,
    subscriptionAmount: roundAmount(subscription.price + share.referralAddon),
    partnerShareAmount: share.partnerShare,
    gowhatsShareAmount: share.gowhatsShare,
    sharePercent: share.sharePercent
  };
};

module.exports = {
  COUNTRY_CURRENCY_MAP,
  normalizePhone,
  resolveCountryFromPhone,
  resolveSubscriptionPricing,
  resolveReferralShare,
  normalizeSharePercent,
  buildReferralPricingSnapshot
};

