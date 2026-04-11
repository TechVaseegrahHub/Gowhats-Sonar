const WhatsAppService = require('./whatsappServices');
const Tenant = require('../models/Tenant');
const Order = require('../models/Order');
const Message = require('../models/Message');
const Contact = require('../models/Contact');

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function generateTrackingLink(trackingNumber) {
  const t = normalizeText(trackingNumber).toUpperCase();

  if (!t) return '';

  if (t.startsWith('ST')) return `https://stcourier.com/track/shipment?awbNo=${t}`;
  if (t.match(/^[A-Z]{2}[0-9]{9}IN$/)) return 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx';
  if (t.match(/^[D|K|Z|V][0-9]{8,}$/) || t.match(/^[0-9]{9}$/)) return `https://www.dtdc.in/tracking/shipment-tracking.asp?token=${t}`;
  if (t.startsWith('15') && t.length > 8) return `https://trackon.in/data/SingleShipment/${t}`;
  if (t.match(/^[0-9]{12,}$/)) return `https://www.delhivery.com/track/package/${t}`;
  if (t.startsWith('SR')) return `https://www.shiprocket.in/shipment-tracking/${t}`;
  if (t.startsWith('SF') || t.length === 14) return `https://www.xpressbees.com/track?awb=${t}`;
  if (t.match(/^[0-9]{9,10}$/)) return `https://ecomexpress.in/tracking/?awb_field=${t}`;
  if (t.startsWith('FMPC')) return `https://ekartlogistics.com/track/${t}`;
  if (t.startsWith('FR')) return `https://franchexpress.com/courier-tracking?awb=${t}`;

  return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

async function findOrderByOrderId(tenantId, orderId) {
  const normalizedOrderId = normalizeText(orderId);
  if (!normalizedOrderId) return null;

  return Order.findOne({
    tenantId,
    $or: [{ orderId: normalizedOrderId }, { orderNumber: normalizedOrderId }]
  });
}

async function createManualOrderIfRequired(tenantId, payload) {
  const normalizedOrderId = normalizeText(payload.orderId);
  const normalizedCustomerPhone = normalizeText(payload.customerPhone);
  const normalizedCustomerName = normalizeText(payload.customerName) || 'Customer';

  if (!payload.allowCreateMissingOrder) return null;
  if (!normalizedOrderId) throw new Error('Order ID is required');
  if (!normalizedCustomerPhone) {
    throw new Error(`Order "${normalizedOrderId}" not found. customer_phone is required to auto-create order.`);
  }

  try {
    return await Order.create({
      tenantId,
      orderId: normalizedOrderId,
      orderNumber: normalizedOrderId,
      customerPhone: normalizedCustomerPhone,
      customerDetails: {
        name: normalizedCustomerName,
        phone: normalizedCustomerPhone
      },
      orderAmount: 0,
      totalAmount: 0,
      source: 'manual',
      status: 'processing',
      paymentStatus: 'pending'
    });
  } catch (error) {
    if (error?.code === 11000) {
      return findOrderByOrderId(tenantId, normalizedOrderId);
    }
    throw error;
  }
}

async function sendTrackingNotification(payload) {
  const tenantId = normalizeText(payload.tenantId);
  const normalizedOrderId = normalizeText(payload.orderId);
  const normalizedTrackingNumber = normalizeText(payload.trackingNumber);
  const normalizedWeight = normalizeText(payload.weight);
  const normalizedCourierService = normalizeText(payload.courierService);
  const normalizedTrackingUrl = normalizeText(payload.trackingUrl);
  const normalizedCustomerName = normalizeText(payload.customerName);
  const normalizedCustomerPhone = normalizeText(payload.customerPhone);
  const normalizedNotes = normalizeText(payload.notes);
  const silent = payload.silent === true;
  const templateName = normalizeText(payload.templateName) || 'order_tracked';

  if (!tenantId) throw new Error('tenantId is required');
  if (!normalizedOrderId) throw new Error('Order ID is required');
  if (!normalizedTrackingNumber) throw new Error('Tracking Number is required');

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');
  if (!tenant.whatsappConfig?.accessToken || !tenant.whatsappConfig?.phoneNumberId) {
    throw new Error('WhatsApp is not configured for this tenant');
  }

  let order = await findOrderByOrderId(tenantId, normalizedOrderId);
  if (!order) {
    order = await createManualOrderIfRequired(tenantId, {
      orderId: normalizedOrderId,
      customerName: normalizedCustomerName,
      customerPhone: normalizedCustomerPhone,
      allowCreateMissingOrder: !!payload.allowCreateMissingOrder
    });
  }

  if (!order) {
    throw new Error(`Order "${normalizedOrderId}" not found`);
  }

  const existingTrackingInfo = order.metadata?.trackingInfo || {};
  if (
    payload.dedupeByTracking &&
    existingTrackingInfo.notificationSent === true &&
    normalizeText(existingTrackingInfo.trackingNumber) === normalizedTrackingNumber
  ) {
    const existingUrl = normalizeText(existingTrackingInfo.trackingUrl);
    if (!normalizedTrackingUrl || normalizedTrackingUrl === existingUrl) {
      return {
        success: true,
        skipped: true,
        reason: 'already_sent',
        orderId: normalizedOrderId,
        trackingNumber: normalizedTrackingNumber,
        trackingUrl: existingUrl || normalizedTrackingUrl
      };
    }
  }

  const whatsappService = new WhatsAppService(tenant);
  const finalTrackingUrl = normalizedTrackingUrl || generateTrackingLink(normalizedTrackingNumber);
  const finalCustomerName =
    normalizedCustomerName ||
    normalizeText(order.customerDetails?.name) ||
    normalizeText(order.shippingAddress?.name) ||
    'Customer';

  const rawPhone =
    normalizedCustomerPhone ||
    normalizeText(order.customerPhone) ||
    normalizeText(order.customerDetails?.phone) ||
    normalizeText(order.shippingAddress?.phone);

  const formattedPhone = whatsappService.formatPhoneNumber(rawPhone);
  if (!formattedPhone) {
    throw new Error(`Invalid or missing customer phone for order "${normalizedOrderId}"`);
  }

  const templateParamFour = normalizedWeight || normalizedCourierService || '-';
  const now = new Date();

  await Order.findByIdAndUpdate(order._id, {
    $set: {
      status: 'tracked',
      trackedAt: now,
      'metadata.trackingInfo': {
        trackingNumber: normalizedTrackingNumber,
        weight: normalizedWeight || '-',
        courierName: normalizedCourierService || 'Standard',
        courierService: normalizedCourierService || 'Standard',
        trackingUrl: finalTrackingUrl,
        notificationSent: false,
        lastUpdatedAt: now
      }
    }
  });

  const templateBodyParameters =
    templateName === 'order_track_update'
      ? [
          { type: 'text', text: finalCustomerName },
          { type: 'text', text: normalizedOrderId },
          { type: 'text', text: normalizedTrackingNumber },
          { type: 'text', text: normalizedWeight || '-' },
          { type: 'text', text: finalTrackingUrl || '-' },
          { type: 'text', text: normalizedCourierService || 'Standard' },
          { type: 'text', text: normalizedNotes || '-' }
        ]
      : [
          { type: 'text', text: finalCustomerName },
          { type: 'text', text: normalizedOrderId },
          { type: 'text', text: normalizedTrackingNumber },
          { type: 'text', text: templateParamFour },
          { type: 'text', text: finalTrackingUrl || '-' }
        ];

  const templateResponse = await whatsappService.sendTemplateMessage(
    templateName,
    formattedPhone,
    [
      {
        type: 'body',
        parameters: templateBodyParameters
      }
    ],
    'en',
    { silent }
  );

  const messageId = templateResponse?.messages?.[0]?.id || null;

  await Order.findByIdAndUpdate(order._id, {
    $set: {
      'metadata.trackingInfo.notificationSent': true,
      'metadata.trackingInfo.notificationSentAt': new Date(),
      'metadata.trackingInfo.messageId': messageId || null,
      'metadata.trackingInfo.lastUpdatedAt': new Date()
    }
  });

  await Message.create({
    tenantId: tenant._id,
    from: 'system',
    to: formattedPhone,
    type: 'template',
    templateName,
    status: 'sent',
    messageId,
    trackingInfo: {
      orderId: normalizedOrderId,
      trackingNumber: normalizedTrackingNumber,
      trackingUrl: finalTrackingUrl
    }
  });

  await Contact.findOneAndUpdate(
    { tenantId: tenant._id, phone_number: formattedPhone },
    { $set: { lastMessage: `Tracking sent: ${normalizedOrderId}`, timestamp: new Date() } }
  );

  return {
    success: true,
    skipped: false,
    orderId: normalizedOrderId,
    trackingNumber: normalizedTrackingNumber,
    trackingUrl: finalTrackingUrl,
    messageId
  };
}

module.exports = {
  generateTrackingLink,
  sendTrackingNotification
};

