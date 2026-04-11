const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WhatsAppService = require('../services/whatsappServices');
const Tenant = require('../models/Tenant');
const Order = require('../models/Order');
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const { requireProModule } = require('../middleware/subscriptionMiddleware');

router.use(requireProModule('tracking'));

// ✅ Smart Tracking Link Generator
function generateTrackingLink(trackingNumber) {
  const t = trackingNumber.trim().toUpperCase();

  // 1. ST Courier
  if (t.startsWith('ST')) return `https://stcourier.com/track/shipment?awbNo=${t}`;
  
  // 2. India Post
  if (t.match(/^[A-Z]{2}[0-9]{9}IN$/)) return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`;
  
  // 3. DTDC
  if (t.match(/^[D|K|Z|V][0-9]{8,}$/) || t.match(/^[0-9]{9}$/)) return `https://www.dtdc.in/tracking/shipment-tracking.asp?token=${t}`;
  
  // 4. Trackon
  if (t.startsWith('15') && t.length > 8) return `https://trackon.in/data/SingleShipment/${t}`;
  
  // 5. Delhivery
  if (t.match(/^[0-9]{12,}$/)) return `https://www.delhivery.com/track/package/${t}`;
  
  // 6. Ship Rocket
  if (t.startsWith('SR')) return `https://www.shiprocket.in/shipment-tracking/${t}`;
  
  // 7. Xpressbees
  if (t.startsWith('SF') || t.length === 14) return `https://www.xpressbees.com/track?awb=${t}`;
  
  // 8. Ecom Express
  if (t.match(/^[0-9]{9,10}$/)) return `https://ecomexpress.in/tracking/?awb_field=${t}`;
  
  // 9. Ekart
  if (t.startsWith('FMPC')) return `https://ekartlogistics.com/track/${t}`;
  
  // 10. Franch Express
  if (t.startsWith('FR')) return `https://franchexpress.com/courier-tracking?awb=${t}`;

  // 🔴 FALLBACK
  return `https://www.google.com/search?q=${t}`;
}

// Send tracking notification
router.post('/send-notification', auth, async (req, res) => {
  try {
    // ✅ FIX: Added 'courierService' to extraction
    const { orderId, trackingNumber, weight, courierService } = req.body;

    if (!orderId || !trackingNumber) {
      return res.status(400).json({ error: 'Order ID and Tracking Number are required' });
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const order = await Order.findOne({ 
        tenantId: req.user.tenant_id, 
        $or: [{ orderId: orderId }, { orderNumber: orderId }]
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const whatsappService = new WhatsAppService(tenant);

    // 1. Generate Smart URL
    const trackingUrl = generateTrackingLink(trackingNumber);
    console.log(`🔗 Generated URL for ${trackingNumber}: ${trackingUrl}`);

    // 2. Update Order in Database
    await Order.findOneAndUpdate(
        { _id: order._id }, 
        { 
            $set: {
                status: 'tracked',
                trackedAt: new Date(),
                'metadata.trackingInfo': {
                    trackingNumber,
                    weight: weight || '-', // ✅ Handle empty weight
                    courierName: courierService || 'Standard', // ✅ Uses variable or default
                    trackingUrl,
                    notificationSent: true,
                    lastUpdatedAt: new Date()
                }
            } 
        }
    );

    // 3. Send WhatsApp Message
    const formattedPhone = whatsappService.formatPhoneNumber(order.customerPhone);
    const customerName = order.customerDetails?.name || order.shippingAddress?.name || 'Customer';

    const templateResponse = await whatsappService.sendTemplateMessage(
      'order_tracked', 
      formattedPhone,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },    // {{1}}
            { type: 'text', text: orderId },         // {{2}}
            { type: 'text', text: trackingNumber },  // {{3}}
            { type: 'text', text: weight || '-' },   // {{4}} ✅ Handle empty weight
            { type: 'text', text: trackingUrl }      // {{5}}
          ]
        }
      ],
      'en'
    );

    // 4. Log Message
    if (templateResponse) {
        await Message.create({
            tenantId: tenant._id,
            from: 'system',
            to: formattedPhone,
            type: 'template',
            templateName: 'order_tracked',
            status: 'sent',
            messageId: templateResponse.messages?.[0]?.id,
            trackingInfo: { orderId, trackingNumber, trackingUrl }
        });
        
        // Update contact last message
        await Contact.findOneAndUpdate(
            { tenantId: tenant._id, phone_number: formattedPhone },
            { $set: { lastMessage: `Tracking sent: ${orderId}`, timestamp: new Date() } }
        );
    }

    res.json({
        success: true,
        message: 'Tracking notification sent successfully',
        trackingUrl: trackingUrl
    });

  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check eligibility
router.get('/check-eligibility/:orderId', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ 
        tenantId: req.user.tenant_id, 
        $or: [{ orderId: req.params.orderId }, { orderNumber: req.params.orderId }]
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({
      success: true,
      eligible: true, // Allow sending tracking for any existing order
      alreadyTracked: order.status === 'tracked',
      details: {
        paymentStatus: order.paymentStatus,
        customerName: order.customerDetails?.name || order.shippingAddress?.name,
        trackingInfo: order.metadata?.trackingInfo
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
