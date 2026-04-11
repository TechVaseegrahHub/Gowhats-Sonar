const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const OrderCounter = require('../models/OrderCounter');
const ShippingMethod = require('../models/ShippingMethod');
const { generateOrderId } = require('../utils/orderUtils');
const auth = require('../middleware/auth');
const { isEncryptionEnabled, hashPhone, normalizePhone, decryptFields, ORDER_ENCRYPTION_FIELDS } = require('../utils/encryption');

// Helper function to get tenant ID safely
const getTenantId = (req) => {
  return req.user?.tenant_id || req.user?.tenantId || req.user?.id;
};

const parseCurrencyValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const PAYMENT_STATUSES = ['pending', 'processing', 'completed', 'failed', 'refunded', 'tested'];

const normalizeManualPaymentStatus = (status) => {
  const normalized = String(status || '').toLowerCase().trim();
  if (normalized === 'paid' || normalized === 'complete' || normalized === 'completed') return 'completed';
  if (PAYMENT_STATUSES.includes(normalized)) return normalized;
  return null;
};

// ==========================================
// 1. ORDER LISTING & MANAGEMENT ROUTES
// ==========================================

// Get all orders for tenant (ENHANCED VERSION - ONLY ONE!)
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      customerPhone,
      source,
      includeRegistrations = false
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

    if (source) {
      if (source === 'all') {
        delete filter.source;
      } else {
        filter.source = source;
      }
    } else if (includeRegistrations === 'false' || !includeRegistrations) {
      filter.source = { $ne: 'registration_flow' };
    }

    console.log('📊 Fetching orders with filter:', filter);

    let orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()
      .exec();

      orders = orders.map((order) => {
      decryptFields(order, ORDER_ENCRYPTION_FIELDS);
      return order;
    });
   
    const total = await Order.countDocuments(filter);

    console.log(`✅ Found ${orders.length} orders out of ${total} total`);

    res.json({
      success: true,
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      limit: parseInt(limit),
      filter: filter
    });
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      details: error.message
    });
  }
});

// Get registrations only
router.get('/registrations', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, customerPhone } = req.query;

    const filter = {
      tenantId: req.user.tenant_id,
      source: 'registration_flow'
    };

    if (status) filter.status = status;
    if (customerPhone) {
      if (isEncryptionEnabled()) {
        filter.customerPhoneHash = hashPhone(normalizePhone(customerPhone));
      } else {
        filter.customerPhone = customerPhone;
      }
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('metadata.registrationConfigId', 'ticketConfig confirmationMessage')
      .exec();

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      registrations: orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch registrations'
    });
  }
});

// Get single order
router.get('/:orderId', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      tenantId: req.user.tenant_id,
      orderId: req.params.orderId
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update order status
router.patch('/:orderId/status', auth, async (req, res) => {
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

    res.json({ message: 'Order status updated', order });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});


// ==========================================
// 2. ORDER COUNTER MANAGEMENT ROUTES
// ==========================================

router.get('/counter/current', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const counter = await OrderCounter.findOne({ tenantId: tenantId.toString() });
    res.json({
      success: true,
      tenantId: tenantId,
      currentCounter: counter?.nextOrderNumber || 1000,
      lastUpdated: counter?.lastUpdated,
      nextOrderId: counter ? counter.nextOrderNumber : 1000
    });
  } catch (error) {
    console.error('Error fetching order counter:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order counter', details: error.message });
  }
});

router.put('/counter/set', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { counterValue } = req.body;
    const nextVal = parseInt(counterValue);

    if (!nextVal || isNaN(nextVal) || nextVal < 1) {
      return res.status(400).json({ success: false, error: 'Counter value must be a positive number (1 or higher)' });
    }

    const counter = await OrderCounter.findOneAndUpdate(
      { tenantId: tenantId.toString() },
      { nextOrderNumber: nextVal, lastUpdated: new Date() },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Order counter set to ${nextVal}`,
      counter: { tenantId: counter.tenantId, nextOrderNumber: counter.nextOrderNumber, lastUpdated: counter.lastUpdated }
    });
  } catch (error) {
    console.error('Error setting order counter:', error);
    res.status(500).json({ success: false, error: 'Failed to set order counter', details: error.message });
  }
});

router.post('/counter/reset', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { startFrom = 1000 } = req.body;

    if (startFrom < 1) {
      return res.status(400).json({ success: false, error: 'Order counter must start from 1 or higher' });
    }

    const counter = await OrderCounter.resetCounter(tenantId.toString(), startFrom);

    res.json({
      success: true,
      message: `Order counter reset to ${startFrom}`,
      counter: { tenantId: counter.tenantId, nextOrderNumber: counter.nextOrderNumber, lastUpdated: counter.lastUpdated }
    });
  } catch (error) {
    console.error('Error resetting order counter:', error);
    res.status(500).json({ success: false, error: 'Failed to reset order counter', details: error.message });
  }
});

router.post('/counter/generate', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const orderNumber = await generateOrderId(tenantId.toString());
    res.json({ success: true, orderNumber, tenantId, message: `Generated order ID: ${orderNumber}` });
  } catch (error) {
    console.error('Error generating order ID:', error);
    res.status(500).json({ success: false, error: 'Failed to generate order ID', details: error.message });
  }
});

router.get('/counter/stats', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const counter = await OrderCounter.findOne({ tenantId: tenantId.toString() });
    const totalOrders = await Order.countDocuments({ tenantId: tenantId.toString() });
    const ordersByStatus = await Order.aggregate([
      { $match: { tenantId: tenantId.toString() } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const recentOrders = await Order.find({ tenantId: tenantId.toString() })
      .sort({ createdAt: -1 }).limit(5)
      .select('orderId status customerPhone orderAmount createdAt');

    res.json({
      success: true,
      stats: {
        currentCounter: counter?.nextOrderNumber || 1000,
        totalOrders,
        ordersByStatus: ordersByStatus.reduce((acc, item) => { acc[item._id] = item.count; return acc; }, {}),
        recentOrders,
        counterLastUpdated: counter?.lastUpdated,
        nextOrderId: counter ? counter.nextOrderNumber : 1000
      }
    });
  } catch (error) {
    console.error('Error fetching order counter stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order counter statistics', details: error.message });
  }
});


// ==========================================
// 3. ORDER CREATION & UPDATES
// ==========================================

router.post('/create', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const orderData = req.body;
    const orderId = await generateOrderId(tenantId.toString());
    const order = new Order({ ...orderData, orderId, tenantId: tenantId.toString() });
    await order.save();
    res.status(201).json({ success: true, message: 'Order created successfully', order });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, error: 'Failed to create order', details: error.message });
  }
});

router.post('/manual', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const payload = req.body || {};

    const customerDetails = payload.customerDetails || {};
    const shippingAddress = payload.shippingAddress || {};
    const salesPersonName = String(payload.salesPersonName || '').trim();
    const rawShippingMethodId = String(payload.shippingMethodId || '').trim();
    let shippingMethodName = String(payload.shippingMethodName || '').trim();
    const customerName = String(customerDetails.name || '').trim();
    const customerPhone = String(
      customerDetails.phone || shippingAddress.phone || payload.customerPhone || ''
    ).trim();
    const customerEmail = String(customerDetails.email || '').trim();

    if (!customerName) {
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    }

    if (!customerPhone) {
      return res.status(400).json({ success: false, error: 'Customer phone is required' });
    }

    if (!salesPersonName) {
      return res.status(400).json({ success: false, error: 'Sales person name is required' });
    }

    const shippingLine1 = String(shippingAddress.addressLine1 || '').trim();
    const shippingCity = String(shippingAddress.city || '').trim();
    const shippingState = String(shippingAddress.state || '').trim();
    const shippingPincode = String(shippingAddress.pincode || '').trim();

    if (!shippingLine1 || !shippingCity || !shippingState || !shippingPincode) {
      return res.status(400).json({
        success: false,
        error: 'Shipping address line 1, city, state and pincode are required'
      });
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one product is required' });
    }

    let shippingMethodId = '';
    if (rawShippingMethodId) {
      if (!/^[0-9a-fA-F]{24}$/.test(rawShippingMethodId)) {
        return res.status(400).json({ success: false, error: 'Invalid shipping method selected' });
      }

      const method = await ShippingMethod.findOne({
        _id: rawShippingMethodId,
        tenantId: tenantId.toString(),
        isActive: true
      }).select('methodName').lean();

      if (!method) {
        return res.status(400).json({ success: false, error: 'Invalid shipping method selected' });
      }

      shippingMethodId = String(rawShippingMethodId);
      if (!shippingMethodName) {
        shippingMethodName = method.methodName;
      }
    }

    const sanitizedItems = payload.items.map((item, index) => {
      const name = String(item?.name || '').trim();
      const quantity = parseCurrencyValue(item?.quantity, 0);
      const price = parseCurrencyValue(item?.price, -1);

      if (!name) {
        throw new Error(`Product name is required for item #${index + 1}`);
      }
      if (quantity <= 0) {
        throw new Error(`Quantity must be greater than 0 for item #${index + 1}`);
      }
      if (price < 0) {
        throw new Error(`Price must be 0 or greater for item #${index + 1}`);
      }

      return {
        name,
        quantity,
        price,
        totalPrice: quantity * price,
        sku: String(item?.sku || '').trim(),
        retailerId: String(item?.retailerId || item?.sku || '').trim(),
        inventoryItemId: (typeof item?.inventoryItemId === 'string' && /^[0-9a-fA-F]{24}$/.test(item.inventoryItemId))
          ? item.inventoryItemId
          : undefined,
        currency: 'INR'
      };
    });

    const orderAmount = sanitizedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const shippingCost = Math.max(parseCurrencyValue(payload.shippingCost, 0), 0);
    const taxAmount = Math.max(parseCurrencyValue(payload.taxAmount, 0), 0);
    const discountAmount = Math.max(parseCurrencyValue(payload.discountAmount, 0), 0);
    const totalAmount = Math.max(orderAmount + shippingCost + taxAmount - discountAmount, 0);

    const paymentStatus = normalizeManualPaymentStatus(payload.paymentStatus) || 'pending';
    const paymentMethod = ['cod', 'online', 'whatsapp_pay'].includes(payload.paymentMethod)
      ? payload.paymentMethod
      : 'cod';

    const orderId = await generateOrderId(tenantId.toString());

    const newOrder = new Order({
      tenantId: tenantId.toString(),
      orderId,
      orderNumber: orderId,
      customerPhone,
      customerDetails: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail
      },
      shippingAddress: {
        name: String(shippingAddress.name || customerName).trim(),
        phone: String(shippingAddress.phone || customerPhone).trim(),
        addressLine1: shippingLine1,
        addressLine2: String(shippingAddress.addressLine2 || '').trim(),
        city: shippingCity,
        state: shippingState,
        pincode: shippingPincode,
        country: String(shippingAddress.country || 'India').trim()
      },
      billingAddress: {
        name: String(shippingAddress.name || customerName).trim(),
        phone: String(shippingAddress.phone || customerPhone).trim(),
        addressLine1: shippingLine1,
        addressLine2: String(shippingAddress.addressLine2 || '').trim(),
        city: shippingCity,
        state: shippingState,
        pincode: shippingPincode,
        country: String(shippingAddress.country || 'India').trim()
      },
      items: sanitizedItems,
      orderAmount,
      shippingCost,
      taxAmount,
      discountAmount,
      totalAmount,
      currency: 'INR',
      status: payload.status || 'pending',
      paymentMethod,
      paymentStatus,
      paymentDetails: {
        status: paymentStatus,
        paymentMethod,
        paidAmount: paymentStatus === 'completed' ? totalAmount : undefined,
        paidAt: paymentStatus === 'completed' ? new Date() : undefined
      },
      source: 'manual',
      salesPersonName,
      notes: String(payload.notes || '').trim(),
      internalNotes: String(payload.internalNotes || '').trim()
    });

    if (shippingMethodId) {
      newOrder.metadata = newOrder.metadata || {};
      newOrder.metadata.shippingMethodId = shippingMethodId;
      newOrder.metadata.shippingMethodSelected = shippingMethodName || '';
    }

    await newOrder.save();

    return res.status(201).json({
      success: true,
      message: 'Manual order created successfully',
      order: newOrder
    });
  } catch (error) {
    console.error('Error creating manual order:', error);
    const isValidationError = /required|greater than|at least|must/.test(
      String(error.message || '').toLowerCase()
    );
    return res.status(isValidationError ? 400 : 500).json({
      success: false,
      error: error.message || 'Failed to create manual order'
    });
  }
});

// ✅ FIXED: Accepts BOTH { status } (old) and { paymentStatus } (new from RegistrationList)
router.patch('/:orderId/payment-status', auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const tenantId = getTenantId(req);

    // Accept either field name and normalize paid/complete => completed
    const rawStatus = req.body.paymentStatus || req.body.status;
    const newStatus = normalizeManualPaymentStatus(rawStatus);

    if (!newStatus) {
      return res.status(400).json({
        success: false,
        error: `Invalid payment status. Allowed: ${PAYMENT_STATUSES.join(', ')}`
      });
    }

    const order = await Order.findOne({
      tenantId: tenantId.toString(),
      $or: [
        { orderId: orderId },
        { orderNumber: orderId }
      ]
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    order.paymentStatus = newStatus;
    if (!order.paymentDetails) order.paymentDetails = {};
    order.paymentDetails.status = newStatus;

    if (newStatus === 'completed') {
      if (!order.paymentDetails.paidAt) order.paymentDetails.paidAt = new Date();
      if (order.status === 'pending') {
        order.status = 'confirmed';
        order.confirmedAt = new Date();
      }
    }

    await order.save();
    console.log(`💰 Payment status updated for Order ${orderId}: ${newStatus}`);

    res.json({ success: true, message: 'Payment status updated', order });

  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update shipping address
router.patch('/:orderId/address', auth, async (req, res) => {
  try {
    const { shippingAddress } = req.body;
    const orderId = req.params.orderId;
    const tenantId = getTenantId(req);

    const order = await Order.findOneAndUpdate(
      { orderId, tenantId },
      { $set: { shippingAddress } },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

