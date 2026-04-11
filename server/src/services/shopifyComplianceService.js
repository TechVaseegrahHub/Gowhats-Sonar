const Integration = require('../models/Integration');
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const Order = require('../models/Order');
const AbandonedCart = require('../models/AbandonedCart');
const Broadcast = require('../models/Broadcast');
const FlowToken = require('../models/FlowToken');
const FlowRequest = require('../models/FlowRequest');
const EventTicket = require('../models/EventTicket');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const ShippingCalculation = require('../models/ShippingCalculation');
const ShopifyApiService = require('./shopifyApiService');
// const { hashPhone, normalizePhone } = require('../utils/encryption');

const ORDER_REDACTION_UPDATE = {
  $set: {
    customerPhone: '',
    customerPhoneHash: '',
    'customerDetails.name': 'Redacted',
    'customerDetails.email': '',
    'customerDetails.phone': '',
    'shippingAddress.name': '',
    'shippingAddress.phone': '',
    'shippingAddress.addressLine1': '',
    'shippingAddress.addressLine2': '',
    'shippingAddress.city': '',
    'shippingAddress.state': '',
    'shippingAddress.pincode': '',
    'shippingAddress.country': '',
    'billingAddress.name': '',
    'billingAddress.phone': '',
    'billingAddress.addressLine1': '',
    'billingAddress.addressLine2': '',
    'billingAddress.city': '',
    'billingAddress.state': '',
    'billingAddress.pincode': '',
    'billingAddress.country': ''
  }
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const toStringArray = (values = []) =>
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const uniqueStrings = (values = []) => [...new Set(values.filter(Boolean))];

const buildPhoneVariants = (phone) => {
  const raw = String(phone || '').trim();
  const digits = normalizePhone(raw);
  const variants = new Set();

  if (raw) variants.add(raw);
  if (!digits) return Array.from(variants);

  variants.add(digits);
  variants.add(`+${digits}`);

  if (digits.length === 10) {
    variants.add(`91${digits}`);
    variants.add(`+91${digits}`);
  }

  if (digits.startsWith('91') && digits.length > 10) {
    const localDigits = digits.slice(2);
    variants.add(localDigits);
    variants.add(`+91${localDigits}`);
    variants.add(`+${digits}`);
  }

  return Array.from(variants);
};

const buildPhoneMatch = (field, phoneVariants) => {
  if (!phoneVariants.length) return null;
  return { [field]: { $in: phoneVariants } };
};

async function resolveTenantIdsForShop(shopDomain) {
  const normalizedShop = ShopifyApiService.normalizeShopDomain(shopDomain);
  if (!normalizedShop) return [];

  const integrations = await Integration.find({
    storeType: 'shopify',
    storeUrl: normalizedShop
  })
    .select('tenantId')
    .lean();

  return uniqueStrings(integrations.map((integration) => String(integration.tenantId || '')));
}

async function scanOrderIdsByEmail(tenantId, email) {
  if (!email) return [];

  const matchingIds = [];
  const cursor = Order.find({ tenantId: String(tenantId) }).cursor();

  for await (const doc of cursor) {
    const plain = doc.toObject();
    const orderEmail = normalizeEmail(plain?.customerDetails?.email);

    if (orderEmail && orderEmail === email) {
      matchingIds.push(doc._id);
    }
  }

  return matchingIds;
}

async function scanMessageIdsByEmail(tenantId, email) {
  if (!email) return [];

  const matchingIds = [];
  const cursor = Message.find({ tenantId: String(tenantId) }).cursor();

  for await (const doc of cursor) {
    const plain = doc.toObject();
    const storedEmails = [
      normalizeEmail(plain?.orderData?.customerEmail),
      normalizeEmail(plain?.orderDetails?.customerEmail)
    ].filter(Boolean);

    if (storedEmails.includes(email)) {
      matchingIds.push(doc._id);
    }
  }

  return matchingIds;
}

function buildIdentifiers(payload = {}) {
  const customer = payload.customer || {};
  return {
    shopDomain: ShopifyApiService.normalizeShopDomain(payload.shop_domain || ''),
    customerId: customer.id ? String(customer.id) : null,
    email: normalizeEmail(customer.email),
    phone: normalizePhone(customer.phone),
    phoneVariants: buildPhoneVariants(customer.phone),
    requestedOrderIds: uniqueStrings([
      ...toStringArray(payload.orders_requested || []),
      ...toStringArray(payload.orders_to_redact || [])
    ])
  };
}

async function buildCustomerDataSummaryForTenant(tenantId, identifiers) {
  const contactPhoneMatch = buildPhoneMatch('phone_number', identifiers.phoneVariants);
  const customerPhoneMatch = buildPhoneMatch('customerPhone', identifiers.phoneVariants);
  const flowPhoneMatch = buildPhoneMatch('phoneNumber', identifiers.phoneVariants);

  const orderFilter = { tenantId: String(tenantId) };
  const orderOr = [];

  if (identifiers.phone) {
    orderOr.push({ customerPhoneHash: hashPhone(identifiers.phone) });
  }
  if (identifiers.requestedOrderIds.length) {
    orderOr.push({ orderId: { $in: identifiers.requestedOrderIds } });
  }
  if (orderOr.length) {
    orderFilter.$or = orderOr;
  }

  const [
    contacts,
    messages,
    carts,
    bookings,
    tickets,
    payments,
    flowTokens,
    flowRequests,
    shippingCalculations,
    directOrders
  ] = await Promise.all([
    contactPhoneMatch
      ? Contact.countDocuments({ tenantId: String(tenantId), ...contactPhoneMatch })
      : 0,
    identifiers.phoneVariants.length
      ? Message.countDocuments({
          tenantId: String(tenantId),
          $or: [
            buildPhoneMatch('from', identifiers.phoneVariants),
            buildPhoneMatch('to', identifiers.phoneVariants)
          ]
        })
      : 0,
    customerPhoneMatch
      ? AbandonedCart.countDocuments({ tenantId: String(tenantId), ...customerPhoneMatch })
      : 0,
    customerPhoneMatch
      ? Booking.countDocuments({ tenantId: String(tenantId), ...customerPhoneMatch })
      : 0,
    customerPhoneMatch
      ? EventTicket.countDocuments({ tenantId: String(tenantId), ...customerPhoneMatch })
      : 0,
    identifiers.phoneVariants.length || identifiers.email
      ? Payment.countDocuments({
          tenantId: String(tenantId),
          $or: [
            ...(identifiers.phoneVariants.length
              ? [buildPhoneMatch('customerPhone', identifiers.phoneVariants)]
              : []),
            ...(identifiers.email ? [{ 'customerDetails.email': identifiers.email }] : [])
          ]
        })
      : 0,
    flowPhoneMatch
      ? FlowToken.countDocuments({ tenantId: String(tenantId), ...flowPhoneMatch })
      : 0,
    flowPhoneMatch
      ? FlowRequest.countDocuments({ tenantId: String(tenantId), ...flowPhoneMatch })
      : 0,
    customerPhoneMatch
      ? ShippingCalculation.countDocuments({ tenantId: String(tenantId), ...customerPhoneMatch })
      : 0,
    orderOr.length ? Order.countDocuments(orderFilter) : 0
  ]);

  let orders = directOrders;
  if (!orders && identifiers.email) {
    const emailOrderIds = await scanOrderIdsByEmail(tenantId, identifiers.email);
    orders = emailOrderIds.length;
  }

  return {
    tenantId: String(tenantId),
    counts: {
      contacts,
      messages,
      orders,
      abandonedCarts: carts,
      bookings,
      tickets,
      payments,
      flowTokens,
      flowRequests,
      shippingCalculations
    }
  };
}

async function handleCustomerDataRequest(payload = {}) {
  const identifiers = buildIdentifiers(payload);
  const tenantIds = await resolveTenantIdsForShop(identifiers.shopDomain);
  const summaries = [];

  for (const tenantId of tenantIds) {
    summaries.push(await buildCustomerDataSummaryForTenant(tenantId, identifiers));
  }

  console.log('[Shopify GDPR] customers/data_request received:', {
    shopDomain: identifiers.shopDomain,
    customerId: identifiers.customerId,
    tenantCount: tenantIds.length,
    summaries
  });

  return {
    received: true,
    topic: 'customers/data_request',
    shopDomain: identifiers.shopDomain,
    tenantIds,
    summaries
  };
}

async function redactOrdersForCustomer(tenantId, identifiers) {
  const orderIds = new Set();

  if (identifiers.phone) {
    const phoneMatchedOrders = await Order.find({
      tenantId: String(tenantId),
      customerPhoneHash: hashPhone(identifiers.phone)
    })
      .select('_id')
      .lean();

    phoneMatchedOrders.forEach((order) => orderIds.add(String(order._id)));
  }

  if (identifiers.requestedOrderIds.length) {
    const requestedOrders = await Order.find({
      tenantId: String(tenantId),
      orderId: { $in: identifiers.requestedOrderIds }
    })
      .select('_id')
      .lean();

    requestedOrders.forEach((order) => orderIds.add(String(order._id)));
  }

  if (identifiers.email) {
    const emailMatchedIds = await scanOrderIdsByEmail(tenantId, identifiers.email);
    emailMatchedIds.forEach((id) => orderIds.add(String(id)));
  }

  if (!orderIds.size) return 0;

  const result = await Order.updateMany(
    { _id: { $in: Array.from(orderIds) } },
    ORDER_REDACTION_UPDATE
  );

  return result.modifiedCount || 0;
}

async function redactMessagesForCustomer(tenantId, identifiers) {
  const deleteConditions = [];

  if (identifiers.phoneVariants.length) {
    deleteConditions.push(buildPhoneMatch('from', identifiers.phoneVariants));
    deleteConditions.push(buildPhoneMatch('to', identifiers.phoneVariants));
  }

  const emailMatchedMessageIds = identifiers.email
    ? await scanMessageIdsByEmail(tenantId, identifiers.email)
    : [];

  if (emailMatchedMessageIds.length) {
    deleteConditions.push({ _id: { $in: emailMatchedMessageIds } });
  }

  if (!deleteConditions.length) return 0;

  const result = await Message.deleteMany({
    tenantId: String(tenantId),
    $or: deleteConditions
  });

  return result.deletedCount || 0;
}

async function redactCustomerData(payload = {}) {
  const identifiers = buildIdentifiers(payload);
  const tenantIds = await resolveTenantIdsForShop(identifiers.shopDomain);
  const results = [];

  for (const tenantId of tenantIds) {
    const phoneVariants = identifiers.phoneVariants;
    const customerPhoneMatch = buildPhoneMatch('customerPhone', phoneVariants);
    const phoneNumberMatch = buildPhoneMatch('phone_number', phoneVariants);
    const flowPhoneMatch = buildPhoneMatch('phoneNumber', phoneVariants);

    const [
      ordersRedacted,
      messagesDeleted,
      contactsDeleted,
      cartsDeleted,
      bookingsDeleted,
      ticketsDeleted,
      paymentsDeleted,
      flowTokensDeleted,
      flowRequestsDeleted,
      shippingDeleted
    ] = await Promise.all([
      redactOrdersForCustomer(tenantId, identifiers),
      redactMessagesForCustomer(tenantId, identifiers),
      phoneNumberMatch
        ? Contact.deleteMany({ tenantId: String(tenantId), ...phoneNumberMatch })
        : { deletedCount: 0 },
      customerPhoneMatch
        ? AbandonedCart.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 },
      customerPhoneMatch
        ? Booking.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 },
      customerPhoneMatch
        ? EventTicket.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 },
      identifiers.phoneVariants.length || identifiers.email
        ? Payment.deleteMany({
            tenantId: String(tenantId),
            $or: [
              ...(customerPhoneMatch ? [customerPhoneMatch] : []),
              ...(identifiers.email ? [{ 'customerDetails.email': identifiers.email }] : [])
            ]
          })
        : { deletedCount: 0 },
      flowPhoneMatch
        ? FlowToken.deleteMany({ tenantId: String(tenantId), ...flowPhoneMatch })
        : { deletedCount: 0 },
      flowPhoneMatch
        ? FlowRequest.deleteMany({ tenantId: String(tenantId), ...flowPhoneMatch })
        : { deletedCount: 0 },
      customerPhoneMatch
        ? ShippingCalculation.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 }
    ]);

    if (phoneVariants.length) {
      await Broadcast.updateMany(
        { tenantId: String(tenantId) },
        {
          $pull: {
            recipients: { $in: phoneVariants },
            conversions: { phone: { $in: phoneVariants } }
          }
        }
      );
    }

    results.push({
      tenantId: String(tenantId),
      ordersRedacted,
      messagesDeleted,
      contactsDeleted: contactsDeleted.deletedCount || 0,
      abandonedCartsDeleted: cartsDeleted.deletedCount || 0,
      bookingsDeleted: bookingsDeleted.deletedCount || 0,
      ticketsDeleted: ticketsDeleted.deletedCount || 0,
      paymentsDeleted: paymentsDeleted.deletedCount || 0,
      flowTokensDeleted: flowTokensDeleted.deletedCount || 0,
      flowRequestsDeleted: flowRequestsDeleted.deletedCount || 0,
      shippingCalculationsDeleted: shippingDeleted.deletedCount || 0
    });
  }

  console.log('[Shopify GDPR] customers/redact completed:', {
    shopDomain: identifiers.shopDomain,
    customerId: identifiers.customerId,
    tenantCount: tenantIds.length,
    results
  });

  return {
    received: true,
    topic: 'customers/redact',
    shopDomain: identifiers.shopDomain,
    tenantIds,
    results
  };
}

async function redactShopData(payload = {}) {
  const shopDomain = ShopifyApiService.normalizeShopDomain(payload.shop_domain || '');
  const tenantIds = await resolveTenantIdsForShop(shopDomain);
  const results = [];

  for (const tenantId of tenantIds) {
    const [shopifyContacts, shopifyMessageRecipients, integrations] = await Promise.all([
      Contact.find({ tenantId: String(tenantId), source: 'shopify' })
        .select('phone_number')
        .lean(),
      Message.find({
        tenantId: String(tenantId),
        $or: [
          { 'orderData.platform': 'shopify' },
          { 'orderDetails.platform': 'shopify' }
        ]
      })
        .select('to from')
        .lean(),
      Integration.find({
        tenantId: String(tenantId),
        storeType: 'shopify',
        storeUrl: shopDomain
      })
        .select('_id')
        .lean()
    ]);

    const shopifyPhones = uniqueStrings([
      ...shopifyContacts.map((contact) => contact.phone_number),
      ...shopifyMessageRecipients.map((message) => message.to)
    ]);

    const phoneVariants = uniqueStrings(shopifyPhones.flatMap((phone) => buildPhoneVariants(phone)));
    const customerPhoneMatch = buildPhoneMatch('customerPhone', phoneVariants);
    const flowPhoneMatch = buildPhoneMatch('phoneNumber', phoneVariants);

    const [
      contactsDeleted,
      ordersDeleted,
      cartsDeleted,
      messagesDeleted,
      paymentsDeleted,
      bookingsDeleted,
      ticketsDeleted,
      flowTokensDeleted,
      flowRequestsDeleted,
      shippingDeleted,
      integrationsDeleted
    ] = await Promise.all([
      Contact.deleteMany({ tenantId: String(tenantId), source: 'shopify' }),
      Order.deleteMany({ tenantId: String(tenantId), source: 'shopify' }),
      AbandonedCart.deleteMany({ tenantId: String(tenantId), platform: 'shopify' }),
      Message.deleteMany({
        tenantId: String(tenantId),
        $or: [
          { 'orderData.platform': 'shopify' },
          { 'orderDetails.platform': 'shopify' },
          ...(phoneVariants.length
            ? [
                buildPhoneMatch('from', phoneVariants),
                buildPhoneMatch('to', phoneVariants)
              ]
            : [])
        ]
      }),
      customerPhoneMatch
        ? Payment.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 },
      customerPhoneMatch
        ? Booking.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 },
      customerPhoneMatch
        ? EventTicket.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 },
      flowPhoneMatch
        ? FlowToken.deleteMany({ tenantId: String(tenantId), ...flowPhoneMatch })
        : { deletedCount: 0 },
      flowPhoneMatch
        ? FlowRequest.deleteMany({ tenantId: String(tenantId), ...flowPhoneMatch })
        : { deletedCount: 0 },
      customerPhoneMatch
        ? ShippingCalculation.deleteMany({ tenantId: String(tenantId), ...customerPhoneMatch })
        : { deletedCount: 0 },
      integrations.length
        ? Integration.deleteMany({ _id: { $in: integrations.map((integration) => integration._id) } })
        : { deletedCount: 0 }
    ]);

    if (phoneVariants.length) {
      await Broadcast.updateMany(
        { tenantId: String(tenantId) },
        {
          $pull: {
            recipients: { $in: phoneVariants },
            conversions: { phone: { $in: phoneVariants } }
          }
        }
      );
    }

    results.push({
      tenantId: String(tenantId),
      contactsDeleted: contactsDeleted.deletedCount || 0,
      ordersDeleted: ordersDeleted.deletedCount || 0,
      abandonedCartsDeleted: cartsDeleted.deletedCount || 0,
      messagesDeleted: messagesDeleted.deletedCount || 0,
      paymentsDeleted: paymentsDeleted.deletedCount || 0,
      bookingsDeleted: bookingsDeleted.deletedCount || 0,
      ticketsDeleted: ticketsDeleted.deletedCount || 0,
      flowTokensDeleted: flowTokensDeleted.deletedCount || 0,
      flowRequestsDeleted: flowRequestsDeleted.deletedCount || 0,
      shippingCalculationsDeleted: shippingDeleted.deletedCount || 0,
      integrationsDeleted: integrationsDeleted.deletedCount || 0
    });
  }

  console.log('[Shopify GDPR] shop/redact completed:', {
    shopDomain,
    tenantCount: tenantIds.length,
    results
  });

  return {
    received: true,
    topic: 'shop/redact',
    shopDomain,
    tenantIds,
    results
  };
}

module.exports = {
  handleCustomerDataRequest,
  redactCustomerData,
  redactShopData
};

