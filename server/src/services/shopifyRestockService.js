const crypto = require('crypto');

const Contact = require('../models/Contact');
const Message = require('../models/Message');
const ShopifyRestockRequest = require('../models/ShopifyRestockRequest');
const ShopifyApiService = require('./shopifyApiService');
const WhatsAppService = require('./whatsappServices');
const redisService = require('./redisService');

function toTrimmedString(value = '') {
  return String(value || '').trim();
}

function buildRestockLabel(productTitle, variantTitle) {
  const cleanProduct = toTrimmedString(productTitle);
  const cleanVariant = toTrimmedString(variantTitle);

  if (!cleanProduct && !cleanVariant) {
    return 'Requested product';
  }

  if (!cleanVariant || cleanVariant.toLowerCase() === 'default title') {
    return cleanProduct || cleanVariant;
  }

  if (!cleanProduct) {
    return cleanVariant;
  }

  return `${cleanProduct} (${cleanVariant})`;
}

function buildProductUrl(storeUrl, handle, variantId) {
  const normalizedStore = toTrimmedString(storeUrl).replace(/^https?:\/\//i, '');
  const cleanHandle = toTrimmedString(handle);
  const cleanVariantId = toTrimmedString(variantId);

  if (!normalizedStore || !cleanHandle) {
    return '';
  }

  const baseUrl = `https://${normalizedStore}/products/${cleanHandle}`;
  return cleanVariantId ? `${baseUrl}?variant=${cleanVariantId}` : baseUrl;
}

function getTemplatePlaceholderCount(text = '') {
  return (String(text || '').match(/\{\{\d+\}\}/g) || []).length;
}

function getPrimaryProductImage(product = {}) {
  if (product?.image?.src) {
    return product.image.src;
  }

  if (Array.isArray(product?.images) && product.images[0]?.src) {
    return product.images[0].src;
  }

  return '';
}

function computeNotifyCount(integration, availableQuantity) {
  const quantity = Math.max(Number(availableQuantity) || 0, 0);
  if (quantity <= 0) {
    return 0;
  }

  const mode = integration?.restockNotificationMode || 'available_quantity';
  const fixedCap = Math.max(Number(integration?.restockFixedCap) || 0, 0);

  if (mode === 'fixed_cap' && fixedCap > 0) {
    return Math.min(quantity, fixedCap);
  }

  return quantity;
}

async function invalidateContactCaches(tenantId) {
  await redisService.deletePattern(`contacts:${tenantId}:*`);
  await redisService.deletePattern(`contacts:counts:${tenantId}`);
}

function emitContactEvent(tenantId, contact, isNew) {
  if (!global.io) return;

  const payload = {
    contact,
    tenantId,
    timestamp: new Date()
  };

  if (isNew) {
    global.io.to(String(tenantId)).emit('new_contact', payload);
    return;
  }

  global.io.to(String(tenantId)).emit('contact_updated', {
    ...payload,
    action: 'restock_request'
  });
}

function emitMessageEvent(tenantId, message, contact) {
  if (!global.io) return;

  global.io.to(String(tenantId)).emit('message_sent', {
    ...message.toObject(),
    contact: {
      phone_number: contact?.phone_number || message.to,
      name: contact?.name || contact?.profile_name || message.to,
      profile_name: contact?.profile_name || contact?.name || null
    }
  });
}

async function ensureRestockContact({
  tenant,
  normalizedPhoneNumber,
  customerName,
  productTitle,
  variantTitle,
  lastMessage
}) {
  const tenantId = String(tenant._id);
  const existingContact = await Contact.findOne({
    tenantId,
    phone_number: normalizedPhoneNumber
  }).lean();

  const label = buildRestockLabel(productTitle, variantTitle);
  const contact = await Contact.safeUpsert(tenantId, normalizedPhoneNumber, {
    name: customerName || existingContact?.name || '',
    profile_name: customerName || existingContact?.profile_name || '',
    lastMessage: lastMessage || `Restock request: ${label}`,
    lastMessageType: 'system',
    timestamp: new Date(),
    lastInteractionAt: new Date(),
    source: 'shopify',
    status: existingContact?.status || 'active'
  });

  await invalidateContactCaches(tenantId);
  emitContactEvent(tenantId, contact, !existingContact);

  return contact;
}

function buildRestockTemplateComponents(template, templateData) {
  const components = [];

  const bodyValues = [
    templateData.customerName || 'Customer',
    templateData.productTitle || 'Requested product',
    templateData.productUrl || templateData.storeUrl || '',
    templateData.variantTitle || templateData.productTitle || 'Default',
    templateData.shopName || templateData.storeUrl || '',
    String(templateData.availableQuantity || 0)
  ];

  const headerValues = [
    templateData.productTitle || 'Requested product',
    templateData.variantTitle || templateData.productTitle || 'Default',
    templateData.shopName || templateData.storeUrl || ''
  ];

  for (const component of template?.components || []) {
    const componentType = String(component?.type || '').toUpperCase();
    const componentFormat = String(component?.format || '').toUpperCase();

    if (componentType === 'BODY' && component.text) {
      const placeholderCount = getTemplatePlaceholderCount(component.text);

      if (placeholderCount > 0) {
        components.push({
          type: 'body',
          parameters: bodyValues.slice(0, placeholderCount).map((value) => ({
            type: 'text',
            text: toTrimmedString(value) || '-'
          }))
        });
      }
    }

    if (componentType === 'HEADER' && componentFormat === 'TEXT' && component.text) {
      const placeholderCount = getTemplatePlaceholderCount(component.text);

      if (placeholderCount > 0) {
        components.push({
          type: 'header',
          parameters: headerValues.slice(0, placeholderCount).map((value) => ({
            type: 'text',
            text: toTrimmedString(value) || '-'
          }))
        });
      }
    }

    if (componentType === 'HEADER' && componentFormat === 'IMAGE' && templateData.productImageUrl) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: {
              link: templateData.productImageUrl
            }
          }
        ]
      });
    }
  }

  return components;
}

async function reservePendingRequests({
  tenantId,
  integrationId,
  variantId,
  limit,
  batchId,
  templateName,
  templateLanguage
}) {
  const reserved = [];

  for (let index = 0; index < limit; index += 1) {
    const request = await ShopifyRestockRequest.findOneAndUpdate(
      {
        tenantId,
        integrationId,
        shopifyVariantId: String(variantId),
        status: 'pending'
      },
      {
        $set: {
          status: 'processing',
          dispatchBatchId: batchId,
          processingStartedAt: new Date(),
          templateName,
          templateLanguage,
          lastAttemptAt: new Date()
        },
        $inc: {
          attemptCount: 1
        }
      },
      {
        sort: { requestedAt: 1, _id: 1 },
        new: true
      }
    );

    if (!request) {
      break;
    }

    reserved.push(request);
  }

  return reserved;
}

async function queueRestockRequest({
  integration,
  tenant,
  storeUrl,
  productId,
  variantId,
  productTitle,
  variantTitle,
  productUrl,
  productImageUrl,
  phoneNumber,
  customerName,
  proxyContext
}) {
  const whatsappService = new WhatsAppService(tenant);
  const normalizedPhoneNumber = whatsappService.formatPhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    throw new Error('Invalid WhatsApp phone number');
  }

  const tenantId = String(tenant._id);
  const existingRequest = await ShopifyRestockRequest.findOne({
    tenantId,
    integrationId: integration._id,
    storeUrl,
    shopifyVariantId: String(variantId),
    normalizedPhoneNumber,
    status: { $in: ['pending', 'processing'] }
  });

  await ensureRestockContact({
    tenant,
    normalizedPhoneNumber,
    customerName,
    productTitle,
    variantTitle
  });

  if (existingRequest) {
    return {
      request: existingRequest,
      alreadySubscribed: true,
      normalizedPhoneNumber
    };
  }

  const request = await ShopifyRestockRequest.create({
    tenantId,
    integrationId: integration._id,
    storeUrl,
    shopifyProductId: String(productId),
    shopifyVariantId: String(variantId),
    productTitle: toTrimmedString(productTitle),
    variantTitle: toTrimmedString(variantTitle),
    productUrl: toTrimmedString(productUrl),
    productImageUrl: toTrimmedString(productImageUrl),
    customerName: toTrimmedString(customerName),
    rawPhoneNumber: toTrimmedString(phoneNumber),
    normalizedPhoneNumber,
    status: 'pending',
    source: 'shopify_app_proxy',
    requestedAt: new Date(),
    proxyContext: {
      shop: toTrimmedString(proxyContext?.shop),
      loggedInCustomerId: toTrimmedString(proxyContext?.loggedInCustomerId),
      pathPrefix: toTrimmedString(proxyContext?.pathPrefix),
      ipAddress: toTrimmedString(proxyContext?.ipAddress),
      userAgent: toTrimmedString(proxyContext?.userAgent)
    }
  });

  return {
    request,
    alreadySubscribed: false,
    normalizedPhoneNumber
  };
}

async function loadRestockTemplate(whatsappService, integration) {
  if (!integration?.restockTemplateName) {
    throw new Error('Restock template is not configured');
  }

  const templateResponse = await whatsappService.getTemplates();
  const templates = Array.isArray(templateResponse?.data) ? templateResponse.data : [];

  const template = templates.find(
    (item) => item.name === integration.restockTemplateName && item.status === 'APPROVED'
  );

  if (!template) {
    throw new Error(`Approved restock template "${integration.restockTemplateName}" was not found`);
  }

  return template;
}

async function fetchProductContext(integration, webhookData) {
  if (!integration?.adminAccessToken || !webhookData?.product_id) {
    return {
      product: null,
      variant: null
    };
  }

  const shopifyApi = new ShopifyApiService(
    integration.storeUrl,
    integration.adminAccessToken,
    integration.apiConfig?.version || '2024-10'
  );

  try {
    const product = await shopifyApi.getProduct(webhookData.product_id);
    const variant = Array.isArray(product?.variants)
      ? product.variants.find((item) => String(item.id) === String(webhookData.id))
      : null;

    return {
      product,
      variant
    };
  } catch (error) {
    console.error('[Shopify Restock] Failed to fetch product context:', error.message);
    return {
      product: null,
      variant: null
    };
  }
}

async function processVariantBackInStock({ integration, tenant, webhookData }) {
  const availableQuantity = Math.max(Number(webhookData?.inventory_quantity) || 0, 0);
  const notifyCount = computeNotifyCount(integration, availableQuantity);

  if (!integration?.isRestockEnabled || notifyCount <= 0) {
    return {
      queued: 0,
      sent: 0,
      failed: 0,
      notifyCount
    };
  }

  if (!tenant?.whatsappConfig?.accessToken || !tenant?.whatsappConfig?.phoneNumberId) {
    throw new Error('Tenant WhatsApp configuration is incomplete');
  }

  const whatsappService = new WhatsAppService(tenant);
  const template = await loadRestockTemplate(whatsappService, integration);
  const { product, variant } = await fetchProductContext(integration, webhookData);
  const batchId = crypto.randomUUID();
  const tenantId = String(tenant._id);
  const reservedRequests = await reservePendingRequests({
    tenantId,
    integrationId: integration._id,
    variantId: webhookData?.id,
    limit: notifyCount,
    batchId,
    templateName: integration.restockTemplateName,
    templateLanguage: integration.restockTemplateLanguage || 'en'
  });

  if (reservedRequests.length === 0) {
    return {
      queued: 0,
      sent: 0,
      failed: 0,
      notifyCount
    };
  }

  let sent = 0;
  let failed = 0;

  for (const request of reservedRequests) {
    const productTitle = request.productTitle || product?.title || 'Requested product';
    const variantTitle = request.variantTitle || variant?.title || webhookData?.title || '';
    const productUrl =
      request.productUrl ||
      buildProductUrl(integration.storeUrl, product?.handle, webhookData?.id);
    const productImageUrl =
      request.productImageUrl ||
      getPrimaryProductImage(product);

    try {
      const contact = await ensureRestockContact({
        tenant,
        normalizedPhoneNumber: request.normalizedPhoneNumber,
        customerName: request.customerName,
        productTitle,
        variantTitle,
        lastMessage: `Back in stock: ${buildRestockLabel(productTitle, variantTitle)}`
      });

      const templateComponents = buildRestockTemplateComponents(template, {
        customerName:
          contact?.profile_name ||
          contact?.name ||
          request.customerName ||
          'Customer',
        productTitle,
        variantTitle,
        productUrl,
        productImageUrl,
        availableQuantity,
        shopName: tenant?.name || integration.storeUrl,
        storeUrl: integration.storeUrl
      });

      const whatsappResponse = await whatsappService.sendTemplateMessage(
        integration.restockTemplateName,
        request.normalizedPhoneNumber,
        templateComponents,
        integration.restockTemplateLanguage || 'en'
      );

      const message = await Message.create({
        tenantId,
        from: tenant.whatsappConfig.phoneNumberId,
        to: request.normalizedPhoneNumber,
        type: 'template',
        templateName: integration.restockTemplateName,
        text: `Back in stock: ${buildRestockLabel(productTitle, variantTitle)}`,
        timestamp: new Date(),
        status: 'sent',
        messageId: whatsappResponse?.messages?.[0]?.id
      });

      emitMessageEvent(tenantId, message, contact);

      await ShopifyRestockRequest.findByIdAndUpdate(request._id, {
        $set: {
          status: 'notified',
          notifiedAt: new Date(),
          messageId: whatsappResponse?.messages?.[0]?.id || null,
          lastError: '',
          productTitle,
          variantTitle,
          productUrl,
          productImageUrl
        },
        $unset: {
          processingStartedAt: '',
          dispatchBatchId: ''
        }
      });

      sent += 1;
    } catch (error) {
      failed += 1;

      await ShopifyRestockRequest.findByIdAndUpdate(request._id, {
        $set: {
          status: 'pending',
          lastError: toTrimmedString(error?.message).slice(0, 1000),
          processingStartedAt: null
        },
        $unset: {
          dispatchBatchId: ''
        }
      });
    }
  }

  return {
    queued: reservedRequests.length,
    sent,
    failed,
    notifyCount
  };
}

async function getPendingSubscriptionStatus({
  integrationId,
  tenantId,
  variantId,
  normalizedPhoneNumber = null
}) {
  const baseFilter = {
    tenantId,
    integrationId,
    shopifyVariantId: String(variantId),
    status: { $in: ['pending', 'processing'] }
  };

  const [pendingCount, existingRequest] = await Promise.all([
    ShopifyRestockRequest.countDocuments(baseFilter),
    normalizedPhoneNumber
      ? ShopifyRestockRequest.findOne({
          ...baseFilter,
          normalizedPhoneNumber
        }).lean()
      : Promise.resolve(null)
  ]);

  return {
    pendingCount,
    alreadySubscribed: !!existingRequest
  };
}

module.exports = {
  getPendingSubscriptionStatus,
  processVariantBackInStock,
  queueRestockRequest
};

