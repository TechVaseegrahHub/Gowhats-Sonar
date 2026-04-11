const crypto = require('crypto');

const Contact = require('../models/Contact');
const Integration = require('../models/Integration');
const Message = require('../models/Message');
const Tenant = require('../models/Tenant');
const WooCommerceRestockDispatch = require('../models/WooCommerceRestockDispatch');
const WooCommerceRestockRequest = require('../models/WooCommerceRestockRequest');
const WhatsAppService = require('./whatsappServices');
const redisService = require('./redisService');
const WooCommerceApiService = require('./woocommerceApiService');

const DEFAULT_RESTOCK_DISPATCH_INTERVAL_MINUTES = 30;
const MAX_DUE_DISPATCHES_PER_TICK = 20;

function getDispatchIntervalMinutes() {
  const configuredValue = Number(process.env.WOOCOMMERCE_RESTOCK_DISPATCH_INTERVAL_MINUTES);

  if (Number.isFinite(configuredValue) && configuredValue > 0) {
    return configuredValue;
  }

  return DEFAULT_RESTOCK_DISPATCH_INTERVAL_MINUTES;
}

function getNextDispatchTime(fromDate = new Date()) {
  return new Date(fromDate.getTime() + (getDispatchIntervalMinutes() * 60 * 1000));
}

function toTrimmedString(value = '') {
  return String(value || '').trim();
}

function normalizeVariationId(value) {
  const trimmed = toTrimmedString(value);
  if (!trimmed || trimmed === '0' || trimmed.toLowerCase() === 'null') {
    return '';
  }
  return trimmed;
}

function buildRestockLabel(productTitle, variationTitle) {
  const cleanProduct = toTrimmedString(productTitle);
  const cleanVariation = toTrimmedString(variationTitle);

  if (!cleanProduct && !cleanVariation) {
    return 'Requested product';
  }

  if (!cleanVariation) {
    return cleanProduct || cleanVariation;
  }

  if (!cleanProduct) {
    return cleanVariation;
  }

  return `${cleanProduct} (${cleanVariation})`;
}

function buildProductDispatchKey(productId, variationId) {
  return `${toTrimmedString(productId)}:${normalizeVariationId(variationId)}`;
}

function getTemplatePlaceholderCount(text = '') {
  return (String(text || '').match(/\{\{\d+\}\}/g) || []).length;
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
  variationTitle,
  lastMessage
}) {
  const tenantId = String(tenant._id);
  const existingContact = await Contact.findOne({
    tenantId,
    phone_number: normalizedPhoneNumber
  }).lean();

  const label = buildRestockLabel(productTitle, variationTitle);
  const contact = await Contact.safeUpsert(tenantId, normalizedPhoneNumber, {
    name: customerName || existingContact?.name || '',
    profile_name: customerName || existingContact?.profile_name || '',
    lastMessage: lastMessage || `Restock request: ${label}`,
    lastMessageType: 'system',
    timestamp: new Date(),
    lastInteractionAt: new Date(),
    source: 'woocommerce',
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
    templateData.variationTitle || templateData.productTitle || 'Default',
    templateData.shopName || templateData.storeUrl || '',
    String(templateData.availableQuantity || 0)
  ];

  const headerValues = [
    templateData.productTitle || 'Requested product',
    templateData.variationTitle || templateData.productTitle || 'Default',
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
  productId,
  variationId,
  limit,
  batchId,
  templateName,
  templateLanguage
}) {
  const reserved = [];

  for (let index = 0; index < limit; index += 1) {
    const request = await WooCommerceRestockRequest.findOneAndUpdate(
      {
        tenantId,
        integrationId,
        wooProductId: String(productId),
        wooVariationId: normalizeVariationId(variationId),
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

async function countPendingRequestsForProduct({
  tenantId,
  integrationId,
  productId,
  variationId
}) {
  return WooCommerceRestockRequest.countDocuments({
    tenantId,
    integrationId,
    wooProductId: String(productId),
    wooVariationId: normalizeVariationId(variationId),
    status: 'pending'
  });
}

async function queueRestockRequest({
  integration,
  tenant,
  storeUrl,
  productId,
  variationId,
  productTitle,
  variationTitle,
  productUrl,
  productImageUrl,
  phoneNumber,
  customerName,
  requestContext
}) {
  const whatsappService = new WhatsAppService(tenant);
  const normalizedPhoneNumber = whatsappService.formatPhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    throw new Error('Invalid WhatsApp phone number');
  }

  const normalizedVariationId = normalizeVariationId(variationId);
  const tenantId = String(tenant._id);
  const existingRequest = await WooCommerceRestockRequest.findOne({
    tenantId,
    integrationId: integration._id,
    storeUrl,
    wooProductId: String(productId),
    wooVariationId: normalizedVariationId,
    normalizedPhoneNumber,
    status: { $in: ['pending', 'processing'] }
  });

  await ensureRestockContact({
    tenant,
    normalizedPhoneNumber,
    customerName,
    productTitle,
    variationTitle
  });

  if (existingRequest) {
    await syncDispatchForPendingRequests({
      integration,
      tenant,
      storeUrl,
      productId,
      variationId: normalizedVariationId,
      metadataDefaults: {
        productTitle,
        variationTitle,
        productUrl,
        productImageUrl
      }
    });

    return {
      request: existingRequest,
      alreadySubscribed: true,
      normalizedPhoneNumber
    };
  }

  const request = await WooCommerceRestockRequest.create({
    tenantId,
    integrationId: integration._id,
    storeUrl,
    wooProductId: String(productId),
    wooVariationId: normalizedVariationId,
    productTitle: toTrimmedString(productTitle),
    variationTitle: toTrimmedString(variationTitle),
    productUrl: toTrimmedString(productUrl),
    productImageUrl: toTrimmedString(productImageUrl),
    customerName: toTrimmedString(customerName),
    rawPhoneNumber: toTrimmedString(phoneNumber),
    normalizedPhoneNumber,
    status: 'pending',
    source: 'woocommerce_plugin',
    requestedAt: new Date(),
    requestContext: {
      siteUrl: toTrimmedString(requestContext?.siteUrl),
      pluginVersion: toTrimmedString(requestContext?.pluginVersion),
      ipAddress: toTrimmedString(requestContext?.ipAddress),
      userAgent: toTrimmedString(requestContext?.userAgent)
    }
  });

  await syncDispatchForPendingRequests({
    integration,
    tenant,
    storeUrl,
    productId,
    variationId: normalizedVariationId,
    metadataDefaults: {
      productTitle,
      variationTitle,
      productUrl,
      productImageUrl
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

function buildVariationTitleFromAttributes(variation = {}) {
  const attributes = Array.isArray(variation?.attributes) ? variation.attributes : [];
  const parts = attributes
    .map((attribute) => toTrimmedString(attribute?.option))
    .filter(Boolean);

  return parts.join(' / ');
}

function extractPrimaryImageUrl(product = {}, variation = {}) {
  if (variation?.image?.src) {
    return variation.image.src;
  }

  const productImages = Array.isArray(product?.images) ? product.images : [];
  if (productImages[0]?.src) {
    return productImages[0].src;
  }

  return '';
}

async function fetchProductContext(integration, webhookData) {
  if (!integration?.apiKey || !integration?.apiSecret || !webhookData?.productId) {
    return {
      product: null,
      variation: null
    };
  }

  const wooApi = new WooCommerceApiService(
    integration.storeUrl,
    integration.apiKey,
    integration.apiSecret
  );

  try {
    const product = await wooApi.getProduct(webhookData.productId);
    const variationId = normalizeVariationId(webhookData.variationId);
    const variation = variationId
      ? await wooApi.getVariation(webhookData.productId, variationId)
      : null;

    return {
      product,
      variation
    };
  } catch (error) {
    console.error('[WooCommerce Restock] Failed to fetch product context:', error.message);
    return {
      product: null,
      variation: null
    };
  }
}

function getAvailableQuantity(webhookData = {}) {
  const stockQuantity = Number(webhookData?.stockQuantity);
  if (Number.isFinite(stockQuantity)) {
    return Math.max(stockQuantity, 0);
  }

  return webhookData?.inStock ? 1 : 0;
}

function getAvailableQuantityFromProductContext(product = null, variation = null) {
  const stockQuantity = Number(variation?.stock_quantity ?? product?.stock_quantity);
  if (Number.isFinite(stockQuantity)) {
    return Math.max(stockQuantity, 0);
  }

  return (variation?.in_stock ?? product?.in_stock) ? 1 : 0;
}

function buildDispatchMetadata(defaults = {}, product = null, variation = null) {
  return {
    productTitle:
      toTrimmedString(defaults.productTitle) ||
      toTrimmedString(product?.name) ||
      'Requested product',
    variationTitle:
      toTrimmedString(defaults.variationTitle) ||
      buildVariationTitleFromAttributes(variation),
    productUrl:
      toTrimmedString(defaults.productUrl) ||
      variation?.permalink ||
      product?.permalink ||
      '',
    productImageUrl:
      toTrimmedString(defaults.productImageUrl) ||
      extractPrimaryImageUrl(product, variation)
  };
}

async function updateDispatchRecord({
  tenantId,
  integrationId,
  storeUrl,
  productId,
  variationId,
  status,
  nextCheckAt = null,
  stockQuantity = 0,
  notifyCount = 0,
  pendingRequestCount = 0,
  lastError = '',
  metadata = {},
  increment = {},
  lastBatchId = null,
  lastDispatchAt = null
}) {
  const normalizedVariationId = normalizeVariationId(variationId);

  return WooCommerceRestockDispatch.findOneAndUpdate(
    {
      tenantId,
      integrationId,
      wooProductId: String(productId),
      wooVariationId: normalizedVariationId
    },
    {
      $set: {
        storeUrl,
        status,
        dispatchIntervalMinutes: getDispatchIntervalMinutes(),
        nextCheckAt,
        lastCheckAt: new Date(),
        lastDetectedStockQuantity: Math.max(Number(stockQuantity) || 0, 0),
        lastNotifyCount: Math.max(Number(notifyCount) || 0, 0),
        pendingRequestCount: Math.max(Number(pendingRequestCount) || 0, 0),
        lastError: toTrimmedString(lastError).slice(0, 1000),
        productTitle: toTrimmedString(metadata.productTitle),
        variationTitle: toTrimmedString(metadata.variationTitle),
        productUrl: toTrimmedString(metadata.productUrl),
        productImageUrl: toTrimmedString(metadata.productImageUrl),
        ...(lastBatchId ? { lastBatchId } : {}),
        ...(lastDispatchAt ? { lastDispatchAt } : {})
      },
      $inc: {
        totalCycles: Math.max(Number(increment.totalCycles) || 0, 0),
        totalSentCount: Math.max(Number(increment.totalSentCount) || 0, 0),
        totalFailedCount: Math.max(Number(increment.totalFailedCount) || 0, 0)
      },
      $setOnInsert: {
        tenantId,
        integrationId,
        wooProductId: String(productId),
        wooVariationId: normalizedVariationId
      }
    },
    {
      new: true,
      upsert: true
    }
  );
}

async function clearDispatchRecord({
  tenantId,
  integrationId,
  storeUrl,
  productId,
  variationId,
  metadata = {}
}) {
  return updateDispatchRecord({
    tenantId,
    integrationId,
    storeUrl,
    productId,
    variationId,
    status: 'completed',
    nextCheckAt: null,
    stockQuantity: 0,
    notifyCount: 0,
    pendingRequestCount: 0,
    metadata
  });
}

async function syncDispatchForPendingRequests({
  integration,
  tenant,
  storeUrl,
  productId,
  variationId,
  metadataDefaults = {}
}) {
  const tenantId = String(tenant._id);
  const normalizedVariationId = normalizeVariationId(variationId);

  const [pendingRequestCount, existingDispatch, productContext] = await Promise.all([
    countPendingRequestsForProduct({
      tenantId,
      integrationId: integration._id,
      productId,
      variationId: normalizedVariationId
    }),
    WooCommerceRestockDispatch.findOne({
      tenantId,
      integrationId: integration._id,
      wooProductId: String(productId),
      wooVariationId: normalizedVariationId
    }),
    fetchProductContext(integration, {
      productId,
      variationId: normalizedVariationId
    })
  ]);

  const product = productContext?.product || null;
  const variation = productContext?.variation || null;
  const metadata = buildDispatchMetadata(metadataDefaults, product, variation);

  if (!integration?.isRestockEnabled) {
    await updateDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl,
      productId,
      variationId: normalizedVariationId,
      status: 'disabled',
      nextCheckAt: null,
      stockQuantity: getAvailableQuantityFromProductContext(product, variation),
      notifyCount: 0,
      pendingRequestCount,
      metadata
    });

    return;
  }

  if (pendingRequestCount === 0) {
    await clearDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl,
      productId,
      variationId: normalizedVariationId,
      metadata
    });

    return;
  }

  if (existingDispatch?.status === 'processing') {
    await WooCommerceRestockDispatch.findByIdAndUpdate(existingDispatch._id, {
      $set: {
        storeUrl,
        pendingRequestCount,
        productTitle: toTrimmedString(metadata.productTitle),
        variationTitle: toTrimmedString(metadata.variationTitle),
        productUrl: toTrimmedString(metadata.productUrl),
        productImageUrl: toTrimmedString(metadata.productImageUrl)
      }
    });

    return;
  }

  const stockQuantity = getAvailableQuantityFromProductContext(product, variation);
  const notifyCount = computeNotifyCount(integration, stockQuantity);
  const now = new Date();
  const preservedNextCheckAt = existingDispatch?.nextCheckAt && existingDispatch.nextCheckAt > now
    ? existingDispatch.nextCheckAt
    : getNextDispatchTime();

  if (stockQuantity > 0 && notifyCount > 0) {
    await updateDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl,
      productId,
      variationId: normalizedVariationId,
      status: 'active',
      nextCheckAt: preservedNextCheckAt,
      stockQuantity,
      notifyCount,
      pendingRequestCount,
      metadata,
      lastError: ''
    });

    return;
  }

  await updateDispatchRecord({
    tenantId,
    integrationId: integration._id,
    storeUrl,
    productId,
    variationId: normalizedVariationId,
    status: 'waiting_restock',
    nextCheckAt: preservedNextCheckAt,
    stockQuantity,
    notifyCount,
    pendingRequestCount,
    metadata,
    lastError: ''
  });
}

async function processProductBackInStock({ integration, tenant, webhookData }) {
  const productId = toTrimmedString(webhookData?.productId);
  if (!productId) {
    throw new Error('productId is required for WooCommerce restock processing');
  }

  const tenantId = String(tenant._id);
  const variationId = normalizeVariationId(webhookData?.variationId);
  const availableQuantity = getAvailableQuantity(webhookData);
  const notifyCount = computeNotifyCount(integration, availableQuantity);
  const pendingRequestCount = await countPendingRequestsForProduct({
    tenantId,
    integrationId: integration._id,
    productId,
    variationId
  });

  const metadata = buildDispatchMetadata({
    productTitle: webhookData?.productTitle,
    variationTitle: webhookData?.variationTitle,
    productUrl: webhookData?.productUrl,
    productImageUrl: webhookData?.productImageUrl
  });

  if (!integration?.isRestockEnabled) {
    await updateDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl: integration.storeUrl,
      productId,
      variationId,
      status: 'disabled',
      nextCheckAt: null,
      stockQuantity: availableQuantity,
      notifyCount,
      pendingRequestCount,
      metadata
    });

    return {
      queued: 0,
      sent: 0,
      failed: 0,
      notifyCount,
      scheduled: false,
      pendingRequestCount
    };
  }

  if (pendingRequestCount === 0) {
    await clearDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl: integration.storeUrl,
      productId,
      variationId,
      metadata
    });

    return {
      queued: 0,
      sent: 0,
      failed: 0,
      notifyCount,
      scheduled: false,
      pendingRequestCount: 0
    };
  }

  if (availableQuantity <= 0 || notifyCount <= 0) {
    await updateDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl: integration.storeUrl,
      productId,
      variationId,
      status: 'waiting_restock',
      nextCheckAt: getNextDispatchTime(),
      stockQuantity: availableQuantity,
      notifyCount,
      pendingRequestCount,
      metadata
    });

    return {
      queued: 0,
      sent: 0,
      failed: 0,
      notifyCount,
      scheduled: false,
      pendingRequestCount
    };
  }

  const nextCheckAt = getNextDispatchTime();

  await updateDispatchRecord({
    tenantId,
    integrationId: integration._id,
    storeUrl: integration.storeUrl,
    productId,
    variationId,
    status: 'active',
    nextCheckAt,
    stockQuantity: availableQuantity,
    notifyCount,
    pendingRequestCount,
    metadata,
    lastError: ''
  });

  return {
    queued: 0,
    sent: 0,
    failed: 0,
    notifyCount,
    scheduled: true,
    nextCheckAt,
    pendingRequestCount
  };
}

async function getPendingSubscriptionStatus({
  integrationId,
  tenantId,
  productId,
  variationId,
  normalizedPhoneNumber = null
}) {
  const baseFilter = {
    tenantId,
    integrationId,
    wooProductId: String(productId),
    wooVariationId: normalizeVariationId(variationId),
    status: { $in: ['pending', 'processing'] }
  };

  const [pendingCount, existingRequest] = await Promise.all([
    WooCommerceRestockRequest.countDocuments(baseFilter),
    normalizedPhoneNumber
      ? WooCommerceRestockRequest.findOne({
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

async function sendRestockRequests({
  integration,
  tenant,
  reservedRequests,
  template,
  availableQuantity = null,
  defaultProductContext = null
}) {
  const tenantId = String(tenant._id);
  const whatsappService = new WhatsAppService(tenant);
  const productContextCache = new Map();
  let sent = 0;
  let failed = 0;

  for (const request of reservedRequests) {
    const productKey = buildProductDispatchKey(request.wooProductId, request.wooVariationId);

    let cachedContext = productContextCache.get(productKey);
    if (!cachedContext) {
      if (
        defaultProductContext &&
        String(request.wooProductId) === String(defaultProductContext?.webhookData?.productId || '') &&
        normalizeVariationId(request.wooVariationId) === normalizeVariationId(defaultProductContext?.webhookData?.variationId)
      ) {
        cachedContext = defaultProductContext;
      } else {
        const fetchedContext = await fetchProductContext(integration, {
          productId: request.wooProductId,
          variationId: request.wooVariationId
        });
        cachedContext = {
          product: fetchedContext.product,
          variation: fetchedContext.variation,
          webhookData: {}
        };
      }

      productContextCache.set(productKey, cachedContext);
    }

    const { product, variation, webhookData } = cachedContext;
    const resolvedQuantity =
      Number.isFinite(Number(availableQuantity))
        ? Math.max(Number(availableQuantity), 0)
        : getAvailableQuantity({
            stockQuantity: variation?.stock_quantity ?? product?.stock_quantity,
            inStock: variation?.in_stock ?? product?.in_stock
          });

    const productTitle =
      request.productTitle ||
      product?.name ||
      toTrimmedString(webhookData?.productTitle) ||
      'Requested product';
    const variationTitle =
      request.variationTitle ||
      toTrimmedString(webhookData?.variationTitle) ||
      buildVariationTitleFromAttributes(variation);
    const productUrl =
      request.productUrl ||
      variation?.permalink ||
      product?.permalink ||
      toTrimmedString(webhookData?.productUrl);
    const productImageUrl =
      request.productImageUrl ||
      toTrimmedString(webhookData?.productImageUrl) ||
      extractPrimaryImageUrl(product, variation);

    try {
      const contact = await ensureRestockContact({
        tenant,
        normalizedPhoneNumber: request.normalizedPhoneNumber,
        customerName: request.customerName,
        productTitle,
        variationTitle,
        lastMessage: `Back in stock: ${buildRestockLabel(productTitle, variationTitle)}`
      });

      const templateComponents = buildRestockTemplateComponents(template, {
        customerName:
          contact?.profile_name ||
          contact?.name ||
          request.customerName ||
          'Customer',
        productTitle,
        variationTitle,
        productUrl,
        productImageUrl,
        availableQuantity: resolvedQuantity,
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
        text: `Back in stock: ${buildRestockLabel(productTitle, variationTitle)}`,
        timestamp: new Date(),
        status: 'sent',
        messageId: whatsappResponse?.messages?.[0]?.id
      });

      emitMessageEvent(tenantId, message, contact);

      await WooCommerceRestockRequest.findByIdAndUpdate(request._id, {
        $set: {
          status: 'notified',
          notifiedAt: new Date(),
          messageId: whatsappResponse?.messages?.[0]?.id || null,
          lastError: '',
          productTitle,
          variationTitle,
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

      await WooCommerceRestockRequest.findByIdAndUpdate(request._id, {
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
    sent,
    failed
  };
}

async function claimDueDispatches(limit = MAX_DUE_DISPATCHES_PER_TICK) {
  const claimedDispatches = [];
  const now = new Date();

  for (let index = 0; index < limit; index += 1) {
    const dispatch = await WooCommerceRestockDispatch.findOneAndUpdate(
      {
        status: { $in: ['active', 'waiting_restock'] },
        $or: [
          { nextCheckAt: { $lte: now } },
          { status: 'waiting_restock', nextCheckAt: null }
        ]
      },
      {
        $set: {
          status: 'processing',
          lastCheckAt: now,
          lastError: ''
        }
      },
      {
        sort: { nextCheckAt: 1, updatedAt: 1, _id: 1 },
        new: true
      }
    );

    if (!dispatch) {
      break;
    }

    claimedDispatches.push(dispatch);
  }

  return claimedDispatches;
}

async function processScheduledDispatch(dispatch) {
  const tenantId = String(dispatch.tenantId);
  const integration = await Integration.findOne({
    _id: dispatch.integrationId,
    tenantId,
    storeType: 'woocommerce'
  });

  if (!integration) {
    await WooCommerceRestockDispatch.findByIdAndUpdate(dispatch._id, {
      $set: {
        status: 'completed',
        nextCheckAt: null,
        lastError: 'Integration not found'
      }
    });

    return {
      processed: false,
      reason: 'integration_not_found'
    };
  }

  const tenant = await Tenant.findById(dispatch.tenantId);
  if (!tenant) {
    await WooCommerceRestockDispatch.findByIdAndUpdate(dispatch._id, {
      $set: {
        status: 'completed',
        nextCheckAt: null,
        lastError: 'Tenant not found'
      }
    });

    return {
      processed: false,
      reason: 'tenant_not_found'
    };
  }

  const productId = dispatch.wooProductId;
  const variationId = normalizeVariationId(dispatch.wooVariationId);
  const pendingRequestCount = await countPendingRequestsForProduct({
    tenantId,
    integrationId: integration._id,
    productId,
    variationId
  });

  const defaultMetadata = {
    productTitle: dispatch.productTitle,
    variationTitle: dispatch.variationTitle,
    productUrl: dispatch.productUrl,
    productImageUrl: dispatch.productImageUrl
  };

  if (!integration.isRestockEnabled) {
    await updateDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl: integration.storeUrl,
      productId,
      variationId,
      status: 'disabled',
      nextCheckAt: null,
      stockQuantity: dispatch.lastDetectedStockQuantity,
      notifyCount: 0,
      pendingRequestCount,
      metadata: defaultMetadata
    });

    return {
      processed: false,
      reason: 'restock_disabled'
    };
  }

  if (pendingRequestCount === 0) {
    await clearDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl: integration.storeUrl,
      productId,
      variationId,
      metadata: defaultMetadata
    });

    return {
      processed: false,
      reason: 'no_pending_requests'
    };
  }

  try {
    const { product, variation } = await fetchProductContext(integration, {
      productId,
      variationId
    });

    const stockQuantity = getAvailableQuantityFromProductContext(product, variation);
    const notifyCount = computeNotifyCount(integration, stockQuantity);
    const metadata = buildDispatchMetadata(defaultMetadata, product, variation);

    if (!tenant?.whatsappConfig?.accessToken || !tenant?.whatsappConfig?.phoneNumberId) {
      const nextCheckAt = getNextDispatchTime();

      await updateDispatchRecord({
        tenantId,
        integrationId: integration._id,
        storeUrl: integration.storeUrl,
        productId,
        variationId,
        status: 'active',
        nextCheckAt,
        stockQuantity,
        notifyCount,
        pendingRequestCount,
        metadata,
        lastError: 'Tenant WhatsApp configuration is incomplete'
      });

      return {
        processed: false,
        reason: 'tenant_whatsapp_incomplete'
      };
    }

     if (stockQuantity <= 0 || notifyCount <= 0) {
      await updateDispatchRecord({
        tenantId,
        integrationId: integration._id,
        storeUrl: integration.storeUrl,
        productId,
        variationId,
        status: 'waiting_restock',
        nextCheckAt: getNextDispatchTime(),
        stockQuantity,
        notifyCount,
        pendingRequestCount,
        metadata
      });

      return {
        processed: false,
        reason: 'waiting_for_restock'
      };
    }

    const template = await loadRestockTemplate(new WhatsAppService(tenant), integration);
    const batchId = crypto.randomUUID();
    const reservedRequests = await reservePendingRequests({
      tenantId,
      integrationId: integration._id,
      productId,
      variationId,
      limit: notifyCount,
      batchId,
      templateName: integration.restockTemplateName,
      templateLanguage: integration.restockTemplateLanguage || 'en'
    });

    if (!reservedRequests.length) {
      const remainingPendingCount = await countPendingRequestsForProduct({
        tenantId,
        integrationId: integration._id,
        productId,
        variationId
      });

      await updateDispatchRecord({
        tenantId,
        integrationId: integration._id,
        storeUrl: integration.storeUrl,
        productId,
        variationId,
        status: remainingPendingCount > 0 ? 'active' : 'completed',
        nextCheckAt: remainingPendingCount > 0 ? getNextDispatchTime() : null,
        stockQuantity,
        notifyCount,
        pendingRequestCount: remainingPendingCount,
        metadata,
        lastBatchId: batchId
      });

      return {
        processed: false,
        reason: 'nothing_reserved'
      };
    }

    const dispatchResult = await sendRestockRequests({
      integration,
      tenant,
      reservedRequests,
      template,
      availableQuantity: stockQuantity,
      defaultProductContext: {
        product,
        variation,
        webhookData: {
          productId,
          variationId,
          productTitle: metadata.productTitle,
          variationTitle: metadata.variationTitle,
          productUrl: metadata.productUrl,
          productImageUrl: metadata.productImageUrl
        }
      }
    });

    const remainingPendingCount = await countPendingRequestsForProduct({
      tenantId,
      integrationId: integration._id,
      productId,
      variationId
    });

    const hasRemainingPending = remainingPendingCount > 0;
    const nextCheckAt = hasRemainingPending && stockQuantity > 0
      ? getNextDispatchTime()
      : null;
    const nextStatus = hasRemainingPending
      ? (stockQuantity > 0 ? 'active' : 'waiting_restock')
      : 'completed';

    await updateDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl: integration.storeUrl,
      productId,
      variationId,
      status: nextStatus,
      nextCheckAt,
      stockQuantity,
      notifyCount,
      pendingRequestCount: remainingPendingCount,
      metadata,
      increment: {
        totalCycles: 1,
        totalSentCount: dispatchResult.sent,
        totalFailedCount: dispatchResult.failed
      },
      lastBatchId: batchId,
      lastDispatchAt: new Date()
    });

    return {
      processed: true,
      sent: dispatchResult.sent,
      failed: dispatchResult.failed,
      reserved: reservedRequests.length,
      remainingPendingCount,
      stockQuantity
    };
  } catch (error) {
    const nextCheckAt = getNextDispatchTime();

    await updateDispatchRecord({
      tenantId,
      integrationId: integration._id,
      storeUrl: integration.storeUrl,
      productId,
      variationId,
      status: 'active',
      nextCheckAt,
      stockQuantity: dispatch.lastDetectedStockQuantity,
      notifyCount: dispatch.lastNotifyCount,
      pendingRequestCount,
      metadata: defaultMetadata,
      lastError: error.message || 'Failed to process scheduled restock dispatch'
    });

    console.error('[WooCommerce Restock] Scheduled dispatch failed:', {
      dispatchId: String(dispatch._id),
      productId,
      variationId,
      error: error.message
    });

    return {
      processed: false,
      reason: 'dispatch_error',
      error: error.message
    };
  }
}

async function processDueWooCommerceRestockDispatches() {
  const claimedDispatches = await claimDueDispatches();

  if (!claimedDispatches.length) {
    return {
      processed: 0
    };
  }

  let processed = 0;

  for (const dispatch of claimedDispatches) {
    await processScheduledDispatch(dispatch);
    processed += 1;
  }

  return {
    processed
  };
}

async function listPendingRestockRequests({ integration, tenantId }) {
  const [requests, dispatches] = await Promise.all([
    WooCommerceRestockRequest.find({
      tenantId,
      integrationId: integration._id,
      status: { $in: ['pending', 'processing'] }
    })
      .sort({ requestedAt: 1, _id: 1 })
      .lean(),
    WooCommerceRestockDispatch.find({
      tenantId,
      integrationId: integration._id
    }).lean()
  ]);

  const groupedMap = new Map();
  const productContextCache = new Map();
  const dispatchByKey = new Map(
    dispatches.map((dispatch) => ([
      buildProductDispatchKey(dispatch.wooProductId, dispatch.wooVariationId),
      dispatch
    ]))
  );

  for (const request of requests) {
    const productKey = buildProductDispatchKey(request.wooProductId, request.wooVariationId);

    if (!groupedMap.has(productKey)) {
      const dispatch = dispatchByKey.get(productKey);

      groupedMap.set(productKey, {
        productKey,
        productId: request.wooProductId,
        variationId: normalizeVariationId(request.wooVariationId),
        productTitle: request.productTitle || dispatch?.productTitle || 'Requested product',
        variationTitle: request.variationTitle || dispatch?.variationTitle || '',
        productUrl: request.productUrl || dispatch?.productUrl || '',
        productImageUrl: request.productImageUrl || dispatch?.productImageUrl || '',
        totalCount: 0,
        pendingCount: 0,
        processingCount: 0,
        automationStatus: dispatch?.status || 'waiting_restock',
        nextCheckAt: dispatch?.nextCheckAt || null,
        lastCheckAt: dispatch?.lastCheckAt || null,
        lastDispatchAt: dispatch?.lastDispatchAt || null,
        lastDetectedStockQuantity: dispatch?.lastDetectedStockQuantity ?? null,
        lastNotifyCount: dispatch?.lastNotifyCount ?? 0,
        totalSentCount: dispatch?.totalSentCount || 0,
        totalFailedCount: dispatch?.totalFailedCount || 0,
        totalCycles: dispatch?.totalCycles || 0,
        automationError: dispatch?.lastError || '',
        requests: []
      });
    }

    const group = groupedMap.get(productKey);
    group.totalCount += 1;

    if (request.status === 'processing') {
      group.processingCount += 1;
    } else {
      group.pendingCount += 1;
    }

    group.requests.push({
      id: String(request._id),
      customerName: request.customerName || '',
      rawPhoneNumber: request.rawPhoneNumber || '',
      normalizedPhoneNumber: request.normalizedPhoneNumber || '',
      status: request.status,
      source: request.source,
      requestedAt: request.requestedAt,
      attemptCount: request.attemptCount || 0,
      lastError: request.lastError || ''
    });

    if (!productContextCache.has(productKey)) {
      productContextCache.set(productKey, fetchProductContext(integration, {
        productId: request.wooProductId,
        variationId: request.wooVariationId
      }));
    }
  }

  const groups = [];

  for (const [productKey, group] of groupedMap.entries()) {
    const context = await productContextCache.get(productKey);
    const product = context?.product || null;
    const variation = context?.variation || null;
    const inStock = Boolean(variation?.in_stock ?? product?.in_stock ?? false);
    const stockQuantity = getAvailableQuantityFromProductContext(product, variation);

    groups.push({
      ...group,
      productTitle: group.productTitle || product?.name || 'Requested product',
      variationTitle: group.variationTitle || buildVariationTitleFromAttributes(variation),
      productUrl: group.productUrl || variation?.permalink || product?.permalink || '',
      productImageUrl: group.productImageUrl || extractPrimaryImageUrl(product, variation),
      isInStock: inStock,
      stockQuantity
    });
  }

  groups.sort((left, right) => {
    if (left.isInStock !== right.isInStock) {
      return left.isInStock ? 1 : -1;
    }

    return right.totalCount - left.totalCount;
  });

  return groups;
}

async function sendManualRestockRequests({ integration, tenant, requestIds }) {
  const tenantId = String(tenant._id);
  const uniqueRequestIds = [...new Set((Array.isArray(requestIds) ? requestIds : []).map((id) => String(id || '').trim()).filter(Boolean))];

  if (uniqueRequestIds.length === 0) {
    throw new Error('Select at least one restock request');
  }

  if (!tenant?.whatsappConfig?.accessToken || !tenant?.whatsappConfig?.phoneNumberId) {
    throw new Error('Tenant WhatsApp configuration is incomplete');
  }

  const template = await loadRestockTemplate(new WhatsAppService(tenant), integration);
  const batchId = crypto.randomUUID();

  await WooCommerceRestockRequest.updateMany(
    {
      _id: { $in: uniqueRequestIds },
      tenantId,
      integrationId: integration._id,
      status: 'pending'
    },
    {
      $set: {
        status: 'processing',
        dispatchBatchId: batchId,
        processingStartedAt: new Date(),
        templateName: integration.restockTemplateName,
        templateLanguage: integration.restockTemplateLanguage || 'en',
        lastAttemptAt: new Date()
      },
      $inc: {
        attemptCount: 1
      }
    }
  );

  const reservedRequests = await WooCommerceRestockRequest.find({
    _id: { $in: uniqueRequestIds },
    tenantId,
    integrationId: integration._id,
    status: 'processing',
    dispatchBatchId: batchId
  }).sort({ requestedAt: 1, _id: 1 });

  if (reservedRequests.length === 0) {
    throw new Error('No pending restock requests found for manual send');
  }

  const dispatchResult = await sendRestockRequests({
    integration,
    tenant,
    reservedRequests,
    template
  });

  return {
    selected: reservedRequests.length,
    sent: dispatchResult.sent,
    failed: dispatchResult.failed
  };
}

module.exports = {
  getPendingSubscriptionStatus,
  listPendingRestockRequests,
  processDueWooCommerceRestockDispatches,
  processProductBackInStock,
  queueRestockRequest,
  sendManualRestockRequests
};

