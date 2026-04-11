const mongoose = require('mongoose');
const InventoryItem = require('../models/inventory');
const Settings = require('../models/settings');
const Tenant = require('../models/Tenant');
const WhatsAppService = require('./whatsappServices');

const DEFAULT_ALERT_CONFIG = {
  enabled: true,
  threshold: 10,
  templateName: 'low_stock_alertt',
  templateLanguage: 'en',
  messageTemplate:
    'Low stock alert: {{productName}} ({{retailerId}}) is now at {{currentStock}} units. Alert threshold is {{threshold}}. Please restock soon.',
  ceoPhone: '',
  adminPhone: ''
};

function asString(value) {
  return String(value ?? '').trim();
}

function asPositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

function sanitizePhone(phone) {
  const raw = asString(phone);
  if (!raw) return '';

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return '';
    return `+${digits}`;
  }

  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return '';
}

function normalizeInventoryAlertConfig(rawConfig = {}) {
  const threshold = asPositiveInt(rawConfig.threshold, DEFAULT_ALERT_CONFIG.threshold);

  return {
    enabled: rawConfig.enabled !== false,
    threshold,
    templateName: asString(rawConfig.templateName) || DEFAULT_ALERT_CONFIG.templateName,
    templateLanguage: asString(rawConfig.templateLanguage) || DEFAULT_ALERT_CONFIG.templateLanguage,
    messageTemplate: asString(rawConfig.messageTemplate) || DEFAULT_ALERT_CONFIG.messageTemplate,
    ceoPhone: sanitizePhone(rawConfig.ceoPhone),
    adminPhone: sanitizePhone(rawConfig.adminPhone)
  };
}

function getRecipientPhones(alertConfig) {
  const recipients = new Set();
  if (alertConfig.ceoPhone) recipients.add(alertConfig.ceoPhone);
  if (alertConfig.adminPhone) recipients.add(alertConfig.adminPhone);
  return Array.from(recipients);
}

function getOrderItemQuantity(item = {}) {
  return asPositiveInt(item.quantity, 0);
}

function getOrderItemRetailerIds(item = {}) {
  const candidates = [
    item.retailerId,
    item.retailer_id,
    item.sku,
    item.id,
    item.productRetailerId,
    item.product_retailer_id
  ]
    .map((value) => asString(value))
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

function getOrderItemName(item = {}) {
  return asString(item.name || item.title || item.product_name);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveInventoryItemForOrderItem(tenantId, item = {}) {
  const inventoryItemId = asString(item.inventoryItemId || item.inventory_item_id);
  if (inventoryItemId && mongoose.Types.ObjectId.isValid(inventoryItemId)) {
    const byObjectId = await InventoryItem.findOne({
      _id: inventoryItemId,
      tenant_id: tenantId
    });
    if (byObjectId) return byObjectId;
  }

  const retailerIds = getOrderItemRetailerIds(item);
  if (retailerIds.length > 0) {
    const byRetailer = await InventoryItem.findOne({
      tenant_id: tenantId,
      retailer_id: { $in: retailerIds }
    });
    if (byRetailer) return byRetailer;
  }

  const name = getOrderItemName(item);
  if (name) {
    return InventoryItem.findOne({
      tenant_id: tenantId,
      name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') }
    });
  }

  return null;
}

function buildAlertText(messageTemplate, variables) {
  return String(messageTemplate || DEFAULT_ALERT_CONFIG.messageTemplate).replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key) => {
      if (Object.prototype.hasOwnProperty.call(variables, key)) {
        return String(variables[key] ?? '');
      }
      return '';
    }
  );
}

async function sendLowStockAlerts({
  whatsappService,
  recipients,
  config,
  variables
}) {
  const sentRecipients = [];
  const messageText = buildAlertText(config.messageTemplate, variables);

  const templateComponents = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: String(variables.productName || '-') },
        { type: 'text', text: String(variables.retailerId || '-') },
        { type: 'text', text: String(variables.currentStock) },
        { type: 'text', text: String(variables.threshold) }
      ]
    }
  ];

  for (const recipient of recipients) {
    const formattedPhone = whatsappService.formatPhoneNumber(recipient);
    if (!formattedPhone) {
      continue;
    }

    let sent = false;

    if (config.templateName) {
      try {
        await whatsappService.sendTemplateMessage(
          config.templateName,
          formattedPhone,
          templateComponents,
          config.templateLanguage || 'en'
        );
        sent = true;
      } catch (templateError) {
        console.warn(
          `Low stock template send failed for ${formattedPhone}:`,
          templateError?.response?.data?.error?.message || templateError.message
        );
      }
    }

    if (!sent) {
      try {
        await whatsappService.sendMessage(formattedPhone, messageText);
        sent = true;
      } catch (textError) {
        console.error(
          `Low stock text alert failed for ${formattedPhone}:`,
          textError?.response?.data?.error?.message || textError.message
        );
      }
    }

    if (sent) {
      sentRecipients.push(formattedPhone);
    }
  }

  return sentRecipients;
}

async function applyInventoryDeductionForOrder(order) {
  try {
    const tenantId = asString(order?.tenantId);
    if (!tenantId) return;

    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) return;

    const settings = await Settings.findOne({ tenant_id: tenantId })
      .select('automationConfig.inventoryAlerts')
      .lean();

    const alertConfig = normalizeInventoryAlertConfig(
      settings?.automationConfig?.inventoryAlerts || DEFAULT_ALERT_CONFIG
    );

    const recipients = getRecipientPhones(alertConfig);
    const shouldAttemptAlerts = alertConfig.enabled && recipients.length > 0;

    let whatsappService = null;
    if (shouldAttemptAlerts) {
      const tenant = await Tenant.findById(tenantId).lean();
      if (tenant?.whatsappConfig?.accessToken && tenant?.whatsappConfig?.phoneNumberId) {
        whatsappService = new WhatsAppService(tenant);
      }
    }

    for (const item of items) {
      const quantity = getOrderItemQuantity(item);
      if (quantity <= 0) continue;

      const inventoryDoc = await resolveInventoryItemForOrderItem(tenantId, item);
      if (!inventoryDoc) continue;

      const currentStock = Number(inventoryDoc.inventory);
      if (!Number.isFinite(currentStock)) continue;

      const boundedCurrentStock = Math.max(Math.floor(currentStock), 0);
      const deduction = Math.min(quantity, boundedCurrentStock);
      const updatedStock = Math.max(boundedCurrentStock - deduction, 0);

      const updatedItem = await InventoryItem.findOneAndUpdate(
        {
          _id: inventoryDoc._id,
          tenant_id: tenantId
        },
        {
          $set: {
            inventory: updatedStock,
            availability: updatedStock > 0 ? 'in stock' : 'out of stock',
            synced: false
          }
        },
        { new: true }
      );

      if (!updatedItem) continue;

      if (updatedStock > alertConfig.threshold && updatedItem.low_stock_alertt_sent) {
        await InventoryItem.updateOne(
          { _id: updatedItem._id, tenant_id: tenantId },
          {
            $set: {
              low_stock_alertt_sent: false,
              low_stock_alertt_sent_at: null,
              low_stock_alertt_recipients: [],
              low_stock_alertt_threshold: null
            }
          }
        );
      }

      const isLowStock = updatedStock < alertConfig.threshold;
      if (
        isLowStock &&
        !updatedItem.low_stock_alertt_sent &&
        shouldAttemptAlerts &&
        whatsappService
      ) {
        const retailerId = asString(updatedItem.retailer_id || item.retailerId || item.retailer_id || '-');
        const variables = {
          productName: asString(updatedItem.name || item.name || 'Unnamed Product'),
          retailerId,
          currentStock: updatedStock,
          threshold: alertConfig.threshold
        };

        const sentRecipients = await sendLowStockAlerts({
          whatsappService,
          recipients,
          config: alertConfig,
          variables
        });

        if (sentRecipients.length > 0) {
          await InventoryItem.updateOne(
            { _id: updatedItem._id, tenant_id: tenantId },
            {
              $set: {
                low_stock_alertt_sent: true,
                low_stock_alertt_sent_at: new Date(),
                low_stock_alertt_recipients: sentRecipients,
                low_stock_alertt_threshold: alertConfig.threshold
              }
            }
          );
        }
      }
    }
  } catch (error) {
    console.error('Inventory deduction/low-stock alert error:', error.message);
  }
}

module.exports = {
  DEFAULT_ALERT_CONFIG,
  normalizeInventoryAlertConfig,
  applyInventoryDeductionForOrder
};

