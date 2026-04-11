const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const auth = require('../middleware/auth');

// ==========================================
// HELPER: Transform Order Data for PDF Generation
// ==========================================
function buildDayRangeFromDateString(dateString) {
  if (!dateString || typeof dateString !== 'string') return null;

  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

  // Reject invalid calendar dates like 2026-02-31
  if (
    Number.isNaN(startOfDay.getTime()) ||
    startOfDay.getFullYear() !== year ||
    startOfDay.getMonth() !== month - 1 ||
    startOfDay.getDate() !== day
  ) {
    return null;
  }

  return { startOfDay, endOfDay };
}

function buildCreatedAtFilter({ date, startDate, endDate }) {
  if (date) {
    const singleDayRange = buildDayRangeFromDateString(date);
    if (!singleDayRange) {
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }

    return {
      filter: {
        $gte: singleDayRange.startOfDay,
        $lte: singleDayRange.endOfDay
      },
      label: date
    };
  }

  if (startDate || endDate) {
    if (!startDate || !endDate) {
      return { error: 'Both startDate and endDate are required for range filtering.' };
    }

    const startRange = buildDayRangeFromDateString(startDate);
    const endRange = buildDayRangeFromDateString(endDate);

    if (!startRange || !endRange) {
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }

    if (startRange.startOfDay > endRange.endOfDay) {
      return { error: 'startDate cannot be after endDate.' };
    }

    return {
      filter: {
        $gte: startRange.startOfDay,
        $lte: endRange.endOfDay
      },
      label: `${startDate} to ${endDate}`
    };
  }

  return { filter: null, label: 'all dates' };
}

// ==========================================
// HELPER: Transform Order Data for PDF Generation
// ==========================================
function transformOrderForPrinting(order) {
  // Determine primary name
  const customerName = order.customerDetails?.name || order.shippingAddress?.name || 'Customer';
  const nameParts = customerName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Determine primary phone
  const phone = order.customerPhone || order.shippingAddress?.phone || order.customerDetails?.phone || '';

  return {
    id: order.orderId,
    order_key: order.orderId,
    date_created: order.createdAt,
    status: order.status,
    payment_date: order.paymentDetails?.paidAt || order.confirmedAt,
    paymentStatus: order.paymentStatus,
    payment_method_title: order.paymentMethod?.toUpperCase().replace('_', ' ') || 'ONLINE',
    currency: order.currency,
    total: order.totalAmount?.toString() || '0',
    shipping_total: order.shippingCost?.toString() || '0',

    // Pass raw DB objects for frontend flexibility
    shippingAddress: order.shippingAddress || {},
    billingAddress: order.billingAddress || {},
    registrationDetails: order.registrationDetails || {},
    customerDetails: order.customerDetails || {},
    customerPhone: phone,

    // Standardized Billing Object (Safe Fallbacks)
    billing: {
      first_name: firstName,
      last_name: lastName,
      company: '',
      address_1: order.billingAddress?.addressLine1 || order.shippingAddress?.addressLine1 || '',
      address_2: order.billingAddress?.addressLine2 || order.shippingAddress?.addressLine2 || '',
      city: order.billingAddress?.city || order.shippingAddress?.city || '',
      state: order.billingAddress?.state || order.shippingAddress?.state || '',
      postcode: order.billingAddress?.pincode || order.shippingAddress?.pincode || '',
      country: order.billingAddress?.country || order.shippingAddress?.country || 'India',
      email: order.customerDetails?.email || '',
      phone: phone
    },

    // Standardized Shipping Object (Safe Fallbacks)
    shipping: {
      first_name: firstName,
      last_name: lastName,
      company: '',
      address_1: order.shippingAddress?.addressLine1 || '',
      address_2: order.shippingAddress?.addressLine2 || '',
      city: order.shippingAddress?.city || '',
      state: order.shippingAddress?.state || '',
      postcode: order.shippingAddress?.pincode || '',
      country: order.shippingAddress?.country || 'India',
      phone: phone
    },

    // Map Items
    line_items: order.items?.map(item => ({
    id: item._id || Math.random().toString(36).substr(2, 9),
    name: item.name || 'Product',
    product_id: item.inventoryItemId || item.retailerId,
    quantity: item.quantity || 1,
    price: item.price?.toString() || '0',
    total: item.totalPrice?.toString() || '0',
    sku: item.sku || item.retailer_id || item.retailerId || item.product_retailer_id || '-'  // ← CHANGE THIS
    })) || [],

     shipping_lines: [{
      id: 1,
      method_title: 'Standard Shipping',
      method_id: 'standard_shipping',
      total: order.shippingCost?.toString() || '0'
    }]
  };
}

// ==========================================
// 1. GET: Fetch Single Order for Printing
// ==========================================
router.get('/fetch-order/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const tenantId = req.user.tenant_id; // Securely get from token

    console.log(`📥 Fetching order for print: ${orderId}`);

    const order = await Order.findOne({
      tenantId: tenantId,
      $or: [
        { orderId: orderId },
        { orderId: `ORD-${orderId}` }, // Support legacy ORD- prefix
        { orderNumber: orderId }
      ]
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // ✅ CRITICAL FIX: Block non-completed payments
    if (order.paymentStatus !== 'completed') {
        console.warn(`⚠️ Print blocked for ${orderId}: Payment is ${order.paymentStatus}`);
        return res.status(400).json({ 
            error: `Payment is ${order.paymentStatus}. Only completed orders can be printed.` 
        });
    }

    const transformedOrder = transformOrderForPrinting(order);
    res.json(transformedOrder);
  } catch (error) {
    console.error('Error fetching single order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 2. GET: Fetch All Pending Orders (Batch)
// ==========================================
router.get('/fetch-processing-orders', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 100;
    const date = req.query.date;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const skip = (page - 1) * perPage;
    const { filter: createdAtFilter, label: filterLabel, error: dateError } = buildCreatedAtFilter({
      date,
      startDate,
      endDate
    });

    console.log(`📦 Fetching batch orders for tenant: ${tenantId}`);

    // Query: Completed Payment + Not Printed + Valid Status
    const query = {
      tenantId: tenantId,
      paymentStatus: 'completed', 
      isPrinted: false,
      status: { $nin: ['cancelled', 'refunded', 'failed'] },
      source: { $nin: ['registration_flow'] }   
  };

   if (createdAtFilter) {
      query.createdAt = createdAtFilter;
    }


    const orders = await Order.find(query)
      .sort({ createdAt: 1 }) // Oldest first (FIFO)
      .skip(skip)
      .limit(perPage);

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / perPage);

    // Transform all orders
    const transformedOrders = orders.map(order => transformOrderForPrinting(order));

    console.log(`✅ Found ${transformedOrders.length} orders ready for batch print`);

    res.json({
      orders: transformedOrders,
      page,
      perPage,
      totalOrders,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching batch orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. GET: Count Pending Orders
// ==========================================
router.get('/pending-orders-count', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const date = req.query.date;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const { filter: createdAtFilter, error: dateError } = buildCreatedAtFilter({
      date,
      startDate,
      endDate
    });

    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    const query = {
      tenantId: tenantId,
      paymentStatus: 'completed',
      isPrinted: false,
      status: { $nin: ['cancelled', 'refunded', 'failed'] },
      source: { $nin: ['registration_flow'] } 
   };

    if (createdAtFilter) {
      query.createdAt = createdAtFilter;
    }
 const count = await Order.countDocuments(query);

    res.json({ success: true, pendingOrders: count });
  } catch (error) {
    console.error('Error counting pending orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. POST: Mark Orders as Printed
// ==========================================
router.post('/mark-as-printed', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { orderIds, note = "Batch Printed" } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Valid order IDs array required' });
    }

    console.log(`📝 Marking ${orderIds.length} orders as printed...`);

    const result = await Order.updateMany(
      {
        tenantId: tenantId,
        orderId: { $in: orderIds }
      },
      {
        $set: {
          isPrinted: true,
          printedAt: new Date(),
          status: 'printed' // Move workflow forward
        },
        $push: {
          'metadata.statusHistory': {
            from: 'confirmed',
            to: 'printed',
            changedAt: new Date(),
            reason: note,
            changedBy: 'system'
          }
        }
      }
    );

    console.log(`✅ Marked ${result.modifiedCount} orders as printed.`);
    res.json({ success: true, modifiedCount: result.modifiedCount });

  } catch (error) {
    console.error('Error marking printed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. POST: Reset Print Status (Undo)
// ==========================================
router.post('/reset-print-status', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { resetType, date } = req.body; // 'recent' or 'date'

    let query = {
      tenantId: tenantId,
      isPrinted: true,
      paymentStatus: 'completed'
    };

    if (resetType === 'recent') {
      // Reset orders printed in the last 2 hours
      const timeThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 Hours
      query.printedAt = { $gte: timeThreshold };
    } else if (resetType === 'date' && date) {
      // Reset orders printed on a specific calendar date
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      
      query.printedAt = { $gte: startOfDay, $lte: endOfDay };
    } else {
      return res.status(400).json({ error: 'Invalid reset criteria' });
    }

    console.log(`🔄 Resetting print status. Query:`, query);

    const result = await Order.updateMany(query, {
      $set: {
        isPrinted: false,
        printedAt: null,
        status: 'confirmed' // Revert status so they appear in pending list
      },
      $push: {
        'metadata.statusHistory': {
          from: 'printed',
          to: 'confirmed',
          changedAt: new Date(),
          reason: 'Print Status Reset',
          changedBy: 'system'
        }
      }
    });

    console.log(`✅ Reset ${result.modifiedCount} orders.`);
    res.json({ success: true, modifiedCount: result.modifiedCount });

  } catch (error) {
    console.error('Error resetting print status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. GET: Fetch Printing Settings
// ==========================================
router.get('/settings', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const Settings = require('../models/settings');

    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings || !settings.printingConfig) {
      return res.json({
        success: true,
        printingConfig: {
          fromAddress: {},
          labelFormat: 'thermal'
        }
      });
    }

    res.json({
      success: true,
      printingConfig: settings.printingConfig
    });

  } catch (error) {
    console.error('Error fetching printing settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 7. POST: Save Printing Settings
// ==========================================
router.post('/settings', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { fromAddress, labelFormat } = req.body;
    const Settings = require('../models/settings');

    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
    }

    settings.printingConfig = {
      fromAddress: fromAddress || {},
      labelFormat: labelFormat || 'thermal'
    };

    settings.markModified('printingConfig');
    await settings.save();

    console.log('✅ Printing settings saved for tenant:', tenantId);

    res.json({
      success: true,
      message: 'Settings saved successfully',
      printingConfig: settings.printingConfig
    });

  } catch (error) {
    console.error('Error saving printing settings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
