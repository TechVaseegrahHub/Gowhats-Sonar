// routes/payments.js - New payment management routes

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Tenant = require('../models/Tenant');
const WhatsAppService = require('../services/whatsappServices');

/**
 * Get all payments for a tenant
 */
router.get('/', auth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      customerPhone, 
      orderId,
      startDate,
      endDate 
    } = req.query;

    const query = { tenantId: req.user.tenant_id };

    // Add filters
    if (status) query.status = status;
    if (customerPhone) query.customerPhone = new RegExp(customerPhone, 'i');
    if (orderId) query.orderId = new RegExp(orderId, 'i');
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      payments: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments',
      details: error.message
    });
  }
});

/**
 * Lookup payment status from WhatsApp
 */
router.post('/:orderId/lookup', auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }

    const whatsappService = new WhatsAppService(tenant);
    
    try {
      const paymentStatus = await whatsappService.lookupPaymentStatus(orderId);
      
      res.json({
        success: true,
        paymentStatus: paymentStatus
      });

    } catch (lookupError) {
      console.error('WhatsApp payment lookup error:', lookupError);
      res.status(400).json({
        success: false,
        error: 'Failed to lookup payment status from WhatsApp',
        details: lookupError.message
      });
    }

  } catch (error) {
    console.error('Error in payment lookup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup payment status',
      details: error.message
    });
  }
});

/**
 * Resend payment message to customer
 */
router.post('/:orderId/resend', auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }

    // Find the order
    const order = await Order.findOne({
      tenantId: req.user.tenant_id,
      orderId: orderId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (order.paymentStatus === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Payment already completed for this order'
      });
    }

    const whatsappService = new WhatsAppService(tenant);
    
    // Get order summary for payment
    const paymentOrderData = order.getPaymentSummary();

    // Send payment order details
    const paymentResponse = await whatsappService.sendPaymentOrderDetails(
      order.customerPhone,
      paymentOrderData
    );

    if (paymentResponse) {
      res.json({
        success: true,
        message: 'Payment message resent successfully',
        messageId: paymentResponse.messages?.[0]?.id,
        whatsappResponse: paymentResponse
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send payment message'
      });
    }

  } catch (error) {
    console.error('Error resending payment message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend payment message',
      details: error.message
    });
  }
});

module.exports = router;