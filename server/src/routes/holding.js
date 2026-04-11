const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WhatsAppService = require('../services/whatsappServices');
const Tenant = require('../models/Tenant');
const Order = require('../models/Order');
const Message = require('../models/Message');
const { requireProModule } = require('../middleware/subscriptionMiddleware');

router.use(requireProModule('holding'));

router.get('/check-eligibility/:orderNumber', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ tenantId: req.user.tenant_id, orderId: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({
      success: true,
      eligible: order.paymentStatus === 'completed',
      alreadyOnHold: order.status === 'on_hold',
      details: {
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        customerName: order.customerDetails?.name,
        customerPhone: order.customerPhone,
        holdingInfo: order.metadata?.holdingInfo
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-notification', auth, async (req, res) => {
  try {
    const { orderNumber, productName, timeframe, customerName, customerPhone } = req.body;

    if (!orderNumber || !productName || !timeframe) return res.status(400).json({ error: 'Missing fields' });

    const tenant = await Tenant.findById(req.user.tenant_id);
    const order = await Order.findOne({ tenantId: req.user.tenant_id, orderId: orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const whatsappService = new WhatsAppService(tenant);

    // ✅ CHECK CONFIGURATION
    const isEnabled = await whatsappService.shouldSendNotification('holding');

    const updateData = {
        status: 'on_hold',
        onHoldAt: new Date(),
        'metadata.holdingInfo': {
            productName,
            timeframe,
            notificationSent: isEnabled
        }
    };

    await Order.findOneAndUpdate({ _id: order._id }, { $set: updateData });

    if (!isEnabled) {
        return res.json({ success: true, message: 'Order put on hold (WhatsApp disabled)', skipped: true });
    }

    const formattedPhone = whatsappService.formatPhoneNumber(customerPhone || order.customerPhone);
    const finalName = customerName || 'Customer';

    const templateResponse = await whatsappService.sendTemplateMessage(
      'holding',
      formattedPhone,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: finalName },
            { type: 'text', text: orderNumber },
            { type: 'text', text: productName },
            { type: 'text', text: timeframe }
          ]
        }
      ]
    );

    if (templateResponse) {
        await Message.create({
            tenantId: tenant._id,
            from: 'system',
            to: formattedPhone,
            type: 'template',
            templateName: 'holding',
            status: 'sent',
            messageId: templateResponse.messages?.[0]?.id,
            holdingInfo: { orderNumber, productName, timeframe }
        });
    }

    res.json({ success: true, message: 'Holding notification sent' });

  } catch (error) {
    console.error('Holding error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
