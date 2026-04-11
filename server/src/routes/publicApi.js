const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const Order = require('../models/Order');
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const WhatsAppService = require('../services/whatsappServices');
const Tenant = require('../models/Tenant');
const { isEncryptionEnabled, hashPhone, normalizePhone, decryptFields, ORDER_ENCRYPTION_FIELDS } = require('../utils/encryption');

// ==========================================
// ORDER ENDPOINTS
// ==========================================

// Get all orders
router.get('/orders', apiKeyAuth(['orders.read']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      startDate,
      endDate,
      customerPhone
    } = req.query;
    
    const filter = { tenantId: req.user.tenant_id };
    
    if (status) filter.status = status;
    if (customerPhone) {
      if (isEncryptionEnabled()) {
        filter.customerPhoneHash = hashPhone(normalizePhone(customerPhone));
      } else {
        filter.customerPhone = customerPhone;
      }
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    let orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();


     orders = orders.map((order) => {
      decryptFields(order, ORDER_ENCRYPTION_FIELDS);
      return order;
    });
    
    const total = await Order.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Public API - Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
router.get('/orders/:orderId', apiKeyAuth(['orders.read']), async (req, res) => {
  try {
    const order = await Order.findOne({
      tenantId: req.user.tenant_id,
      orderId: req.params.orderId
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Public API - Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order
router.post('/orders', apiKeyAuth(['orders.write']), async (req, res) => {
  try {
    const orderData = req.body;
    
    // Generate order ID
    const { generateOrderId } = require('../utils/orderUtils');
    const orderId = await generateOrderId(req.user.tenant_id);
    
    const order = new Order({
      ...orderData,
      orderId,
      tenantId: req.user.tenant_id,
      source: 'api'
    });
    
    await order.save();
    
    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Public API - Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Update order status
router.patch('/orders/:orderId/status', apiKeyAuth(['orders.update']), async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const order = await Order.findOne({
      tenantId: req.user.tenant_id,
      orderId: req.params.orderId
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await order.updateStatus(status, notes);
    
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Public API - Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ==========================================
// MESSAGE ENDPOINTS
// ==========================================

// Send message
router.post('/messages/send', apiKeyAuth(['messages.send']), async (req, res) => {
  try {
    const { to, text, type = 'text' } = req.body;
    
    if (!to || !text) {
      return res.status(400).json({ error: 'Phone number and message text are required' });
    }
    
    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const whatsappService = new WhatsAppService(tenant);
    const response = await whatsappService.sendMessage(to, text);
    
    const message = new Message({
      tenantId: req.user.tenant_id,
      from: tenant.whatsappConfig.phoneNumberId,
      to,
      text,
      type,
      timestamp: new Date(),
      status: 'sent',
      messageId: response.messages?.[0]?.id,
      source: 'api'
    });
    
    await message.save();
    
    res.json({
      success: true,
      data: {
        messageId: message.messageId,
        status: message.status,
        timestamp: message.timestamp
      }
    });
  } catch (error) {
    console.error('Public API - Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get messages for a contact
router.get('/messages', apiKeyAuth(['messages.read']), async (req, res) => {
  try {
    const { phoneNumber, limit = 50, page = 1 } = req.query;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const messages = await Message.find({
      tenantId: req.user.tenant_id,
      $or: [
        { from: phoneNumber },
        { to: phoneNumber }
      ]
    })
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Public API - Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ==========================================
// CONTACT ENDPOINTS
// ==========================================

// Get all contacts
router.get('/contacts', apiKeyAuth(['contacts.read']), async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    
    const filter = { tenantId: req.user.tenant_id };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone_number: { $regex: search, $options: 'i' } }
      ];
    }
    
    const contacts = await Contact.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Contact.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        contacts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Public API - Get contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get single contact
router.get('/contacts/:phoneNumber', apiKeyAuth(['contacts.read']), async (req, res) => {
  try {
    const contact = await Contact.findOne({
      tenantId: req.user.tenant_id,
      phone_number: req.params.phoneNumber
    });
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Public API - Get contact error:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// ==========================================
// WEBHOOK TEST ENDPOINT
// ==========================================

// Test webhook configuration
router.post('/webhook/test', apiKeyAuth(['webhooks.manage']), async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }
    
    const axios = require('axios');
    
    const testPayload = {
      event: 'test',
      tenantId: req.user.tenant_id,
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from GoWhats API'
      }
    };
    
    const response = await axios.post(webhookUrl, testPayload, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-GoWhats-Signature': require('crypto')
          .createHmac('sha256', req.apiKey.key)
          .update(JSON.stringify(testPayload))
          .digest('hex')
      }
    });
    
    res.json({
      success: true,
      message: 'Webhook test successful',
      response: {
        status: response.status,
        data: response.data
      }
    });
  } catch (error) {
    console.error('Webhook test error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook test failed',
      details: error.message
    });
  }
});

module.exports = router;

