const Order = require('../models/Order');
const AbandonedCart = require('../models/AbandonedCart');
const { hashPhone, normalizePhone } = require('./encryption');

const INDIAN_STATE_OPTIONS = [
  { id: 'AP', title: 'Andhra Pradesh' },
  { id: 'AR', title: 'Arunachal Pradesh' },
  { id: 'AS', title: 'Assam' },
  { id: 'BR', title: 'Bihar' },
  { id: 'CT', title: 'Chhattisgarh' },
  { id: 'GA', title: 'Goa' },
  { id: 'GJ', title: 'Gujarat' },
  { id: 'HR', title: 'Haryana' },
  { id: 'HP', title: 'Himachal Pradesh' },
  { id: 'JH', title: 'Jharkhand' },
  { id: 'KA', title: 'Karnataka' },
  { id: 'KL', title: 'Kerala' },
  { id: 'MP', title: 'Madhya Pradesh' },
  { id: 'MH', title: 'Maharashtra' },
  { id: 'MN', title: 'Manipur' },
  { id: 'ML', title: 'Meghalaya' },
  { id: 'MZ', title: 'Mizoram' },
  { id: 'NL', title: 'Nagaland' },
  { id: 'OR', title: 'Odisha' },
  { id: 'PB', title: 'Punjab' },
  { id: 'RJ', title: 'Rajasthan' },
  { id: 'SK', title: 'Sikkim' },
  { id: 'TN', title: 'Tamil Nadu' },
  { id: 'TG', title: 'Telangana' },
  { id: 'TR', title: 'Tripura' },
  { id: 'UP', title: 'Uttar Pradesh' },
  { id: 'UT', title: 'Uttarakhand' },
  { id: 'WB', title: 'West Bengal' },
  { id: 'AN', title: 'Andaman and Nicobar Islands' },
  { id: 'CH', title: 'Chandigarh' },
  { id: 'DN', title: 'Dadra and Nagar Haveli and Daman and Diu' },
  { id: 'DL', title: 'Delhi' },
  { id: 'JK', title: 'Jammu and Kashmir' },
  { id: 'LA', title: 'Ladakh' },
  { id: 'LD', title: 'Lakshadweep' },
  { id: 'PY', title: 'Puducherry' }
];

const PREFILL_FIELDS = [
  'name',
  'address',
  'landmark',
  'city',
  'state',
  'zip_code',
  'country',
  'phone_number'
];

const stateCodeByName = new Map(
  INDIAN_STATE_OPTIONS.map((entry) => [
    String(entry.title || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' '),
    entry.id
  ])
);

const stateTitleByCode = new Map(
  INDIAN_STATE_OPTIONS.map((entry) => [entry.id, entry.title])
);

const asString = (value) => String(value ?? '').trim();

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized) return normalized;
  }
  return '';
};

const buildFullName = (firstName, lastName) =>
  [asString(firstName), asString(lastName)].filter(Boolean).join(' ').trim();

const uniqueObjects = (sources = []) =>
  sources.filter((source, index) => {
    if (!source || typeof source !== 'object') return false;
    return sources.indexOf(source) === index;
  });

const getPhoneVariants = (phoneNumber) => {
  const normalized = normalizePhone(phoneNumber);
  const variants = new Set();

  if (normalized) {
    variants.add(normalized);
    variants.add(`+${normalized}`);

    if (normalized.length > 10) {
      const local = normalized.slice(-10);
      variants.add(local);
      variants.add(`+${local}`);
    }
  }

  const raw = asString(phoneNumber);
  if (raw) variants.add(raw);

  return Array.from(variants);
};

const normalizeStateValue = (value) => {
  const raw = asString(value);
  if (!raw) return '';

  const upper = raw.toUpperCase();
  if (stateTitleByCode.has(upper)) {
    return upper;
  }

  const normalizedName = raw.toLowerCase().replace(/\s+/g, ' ');
  return stateCodeByName.get(normalizedName) || raw;
};

const normalizeCountryValue = (value) => {
  const raw = asString(value);
  if (!raw) return 'India';
  if (raw.toUpperCase() === 'IN') return 'India';
  return raw;
};

const decoratePrefill = (prefill = {}) => {
  const name = asString(prefill.name);
  const address = asString(prefill.address);
  const landmark = asString(prefill.landmark);
  const city = asString(prefill.city);
  const state = normalizeStateValue(prefill.state);
  const zipCode = asString(prefill.zip_code || prefill.pincode || prefill.postal_code);
  const country = normalizeCountryValue(prefill.country);
  const phoneNumber = normalizePhone(prefill.phone_number || prefill.phone) || '';

  return {
    name,
    address,
    address_1: address,
    addressLine1: address,
    landmark,
    address_2: landmark,
    addressLine2: landmark,
    city,
    state,
    zip_code: zipCode,
    pincode: zipCode,
    postal_code: zipCode,
    country,
    phone_number: phoneNumber
  };
};

const mergeOrderFlowPrefill = (primary = {}, fallback = {}) => {
  const merged = {};

  for (const field of PREFILL_FIELDS) {
    merged[field] = firstNonEmpty(primary[field], fallback[field]);
  }

  return decoratePrefill(merged);
};

const hasOrderFlowPrefill = (prefill = {}) =>
  PREFILL_FIELDS.some((field) => asString(prefill[field]));

const buildOrderFlowPrefill = (source = {}, options = {}) => {
  const fallbackSource =
    source?.raw_order_data && typeof source.raw_order_data === 'object'
      ? source.raw_order_data
      : source?.rawOrderData && typeof source.rawOrderData === 'object'
        ? source.rawOrderData
        : null;

  const sources = uniqueObjects([
    source?.prefill,
    source?.prefillData,
    source?.cartDetails?.prefill,
    source,
    source?.customerDetails,
    source?.customer_details,
    source?.customer,
    source?.shippingAddress,
    source?.billingAddress,
    source?.shipping_address,
    source?.billing_address,
    source?.shipping,
    source?.billing,
    source?.cartDetails,
    source?.cartDetails?.shippingAddress,
    source?.cartDetails?.billingAddress,
    fallbackSource?.prefill,
    fallbackSource,
    fallbackSource?.customerDetails,
    fallbackSource?.customer_details,
    fallbackSource?.customer,
    fallbackSource?.shippingAddress,
    fallbackSource?.billingAddress,
    fallbackSource?.shipping_address,
    fallbackSource?.billing_address,
    fallbackSource?.shipping,
    fallbackSource?.billing
  ]);

  const pick = (...fieldNames) =>
    firstNonEmpty(
      ...sources.flatMap((entry) => fieldNames.map((fieldName) => entry?.[fieldName]))
    );

  const fullName = buildFullName(pick('first_name'), pick('last_name'));
  const line1 = pick('address', 'addressLine1', 'address_1', 'address1', 'line1');
  const line2 = pick('landmark', 'addressLine2', 'address_2', 'address2', 'line2');
  const zipCode = pick('zip_code', 'pincode', 'postal_code', 'postcode', 'zip');
  const phoneRaw = firstNonEmpty(
    pick('phone_number', 'phone'),
    source?.customerPhone,
    source?.phone,
    options?.fallbackPhone
  );

  return decoratePrefill({
    name: firstNonEmpty(
      pick('name'),
      source?.customerName,
      source?.customerDetails?.name,
      source?.customer_details?.name,
      fullName,
      options?.fallbackName
    ),
    address: line1,
    landmark: line2,
    city: pick('city', 'town', 'district'),
    state: pick('state', 'state_code', 'province_code', 'province'),
    zip_code: zipCode,
    country: firstNonEmpty(
      pick('country', 'country_name', 'country_code'),
      options?.fallbackCountry,
      'India'
    ),
    phone_number: phoneRaw
  });
};

const buildInitValues = (prefill = {}) => {
  const initValues = {};

  if (prefill.name) initValues.name = prefill.name;
  if (prefill.address) initValues.address = prefill.address;
  if (prefill.landmark) initValues.landmark = prefill.landmark;
  if (prefill.city) initValues.city = prefill.city;
  if (prefill.state) initValues.state = prefill.state;
  if (prefill.zip_code) initValues.zip_code = prefill.zip_code;
  if (prefill.country) initValues.country = prefill.country;
  if (prefill.phone_number) initValues.phone_number = prefill.phone_number;

  return initValues;
};

const createOrderFlowPayloadData = (baseData = {}, prefill = {}) => {
  const normalizedPrefill = decoratePrefill(prefill);

  return {
    ...baseData,
    state: INDIAN_STATE_OPTIONS,
    states: INDIAN_STATE_OPTIONS,
    prefill: normalizedPrefill,
    init_values: buildInitValues(normalizedPrefill),
    name: normalizedPrefill.name || undefined,
    address: normalizedPrefill.address || undefined,
    landmark: normalizedPrefill.landmark || undefined,
    city: normalizedPrefill.city || undefined,
    zip_code: normalizedPrefill.zip_code || undefined,
    country: normalizedPrefill.country || undefined,
    phone_number: normalizedPrefill.phone_number || undefined,
    selected_state: normalizedPrefill.state || undefined,
    state_title: stateTitleByCode.get(normalizedPrefill.state) || normalizedPrefill.state || undefined
  };
};

const loadLatestOrderFlowPrefill = async ({ tenantId, phoneNumber }) => {
  const tenantKey = asString(tenantId);
  const normalizedPhone = normalizePhone(phoneNumber);

  if (!tenantKey || !normalizedPhone) {
    return decoratePrefill({});
  }

  const phoneHash = hashPhone(normalizedPhone);

  let latestOrder = null;
  if (phoneHash) {
    latestOrder = await Order.findOne({
      tenantId: tenantKey,
      customerPhoneHash: phoneHash
    })
      .sort({ createdAt: -1 })
      .select('customerDetails shippingAddress billingAddress source createdAt');
  } else {
    latestOrder = await Order.findOne({
      tenantId: tenantKey,
      customerPhone: { $in: getPhoneVariants(phoneNumber) }
    })
      .sort({ createdAt: -1 })
      .select('customerDetails shippingAddress billingAddress source createdAt');
  }

  const orderPrefill = buildOrderFlowPrefill(latestOrder || {}, {
    fallbackPhone: normalizedPhone
  });

  const latestCart = await AbandonedCart.findOne({
    tenantId: tenantKey,
    customerPhone: { $in: getPhoneVariants(phoneNumber) }
  })
    .sort({ updatedAt: -1 })
    .select('customerName cartDetails updatedAt')
    .lean();

  const cartPrefill = buildOrderFlowPrefill(latestCart?.cartDetails || latestCart || {}, {
    fallbackPhone: normalizedPhone,
    fallbackName: latestCart?.customerName
  });

  return mergeOrderFlowPrefill(orderPrefill, cartPrefill);
};

module.exports = {
  INDIAN_STATE_OPTIONS,
  buildOrderFlowPrefill,
  createOrderFlowPayloadData,
  hasOrderFlowPrefill,
  loadLatestOrderFlowPrefill,
  mergeOrderFlowPrefill
};

