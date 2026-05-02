const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const net = require('net');
const Settings = require('../models/settings');

const DEFAULT_PRINTER_CONNECTION = {
  type: 'browser',
  network: { host: '', port: 9100 },
  paperWidth: '4x4',
  autoPrintOnSale: false,
  printMode: 'pdf',
  lastSelectedAt: null,
  status: 'Not configured',
  deviceLabel: '',
  lastTestedAt: null
};

function normalizeLabelFormat(labelFormat) {
  return ['thermal', 'thermal6', 'a4'].includes(labelFormat) ? labelFormat : 'thermal';
}

function normalizePrinterConnection(connection = {}) {
  return {
    ...DEFAULT_PRINTER_CONNECTION,
    ...connection,
    network: {
      ...DEFAULT_PRINTER_CONNECTION.network,
      ...(connection.network || {})
    }
  };
}

function normalizeFromAddress(fromAddress = {}) {
  const source = fromAddress?.toObject?.() || fromAddress || {};
  return {
    name: source.name || '',
    address1: source.address1 || '',
    address2: source.address2 || '',
    city: source.city || '',
    state: source.state || '',
    zipCode: source.zipCode || '',
    phone: source.phone || ''
  };
}

function normalizePrintingConfig(printingConfig = {}) {
  const source = printingConfig?.toObject?.() || printingConfig || {};
  return {
    fromAddress: normalizeFromAddress(source.fromAddress),
    labelFormat: normalizeLabelFormat(source.labelFormat),
    printerConnection: normalizePrinterConnection(source.printerConnection)
  };
}

function normalizePrinterPayload(body = {}) {
  const allowedTypes = new Set(['browser', 'network', 'bluetooth', 'usb']);
  const allowedPaperWidths = new Set(['58mm', '80mm', '4x4', 'a4']);
  const allowedPrintModes = new Set(['pdf', 'graphical', 'text']);
  const type = allowedTypes.has(body.type) ? body.type : 'browser';
  const port = Number.parseInt(body.network?.port, 10);

  return {
    type,
    network: {
      host: String(body.network?.host || '').trim(),
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 9100
    },
    paperWidth: allowedPaperWidths.has(body.paperWidth) ? body.paperWidth : '4x4',
    autoPrintOnSale: Boolean(body.autoPrintOnSale),
    printMode: allowedPrintModes.has(body.printMode) ? body.printMode : 'pdf',
    lastSelectedAt: new Date(),
    status: body.status || (type === 'browser' ? 'Configured' : 'Not configured'),
    deviceLabel: String(body.deviceLabel || '').slice(0, 120),
    lastTestedAt: body.lastTestedAt || null
  };
}

function validateNetworkTarget({ host, port }) {
  const cleanHost = String(host || '').trim();
  const cleanPort = Number.parseInt(port, 10);

  if (!cleanHost) return { error: 'Network printer IP is required.' };
  if (/^https?:\/\//i.test(cleanHost)) return { error: 'Enter only the printer IP or hostname, without http:// or https://.' };
  if (!Number.isInteger(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
    return { error: 'Network printer port must be between 1 and 65535.' };
  }

  return { host: cleanHost, port: cleanPort };
}

function isPrivateNetworkHost(host) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|127\.|localhost$)/i.test(host);
}

function testNetworkSocket({ host, port, payload }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback(value);
    };

    socket.setTimeout(5000);
    socket.once('connect', () => {
      if (payload) {
        socket.write(payload, () => finish(resolve, true));
      } else {
        finish(resolve, true);
      }
    });
    socket.once('timeout', () => finish(reject, new Error('Connection timed out')));
    socket.once('error', (error) => finish(reject, error));
    socket.connect(port, host);
  });
}

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

router.get('/printers/settings', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id || req.user.tenantId;
    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
      await settings.save();
    }

    res.json({
      success: true,
      printerConnection: normalizePrinterConnection(settings.printingConfig?.printerConnection),
      printingConfig: normalizePrintingConfig(settings.printingConfig)
    });
  } catch (error) {
    console.error('Error fetching printer settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/printers/settings', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id || req.user.tenantId;
    const printerConnection = normalizePrinterPayload(req.body);

    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) settings = new Settings({ tenant_id: tenantId });

    const currentPrintingConfig = normalizePrintingConfig(settings.printingConfig);
    settings.set('printingConfig.fromAddress', currentPrintingConfig.fromAddress);
    settings.set('printingConfig.labelFormat', currentPrintingConfig.labelFormat);
    settings.set('printingConfig.printerConnection', printerConnection);
    settings.markModified('printingConfig');
    await settings.save();

    res.json({
      success: true,
      message: 'Printer settings saved successfully',
      printerConnection
    });
  } catch (error) {
    console.error('Error saving printer settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/printers/test-network', auth, async (req, res) => {
  try {
    const target = validateNetworkTarget(req.body.network || req.body);
    if (target.error) return res.status(400).json({ success: false, error: target.error });

    await testNetworkSocket(target);

    res.json({
      success: true,
      status: 'Connection test passed',
      message: `Network printer is reachable at ${target.host}:${target.port}.`
    });
  } catch (error) {
    const host = String(req.body.network?.host || req.body.host || '').trim();
    const localHint = isPrivateNetworkHost(host)
      ? ' If GoWhats is running on a cloud server, it cannot reach a local LAN printer directly. Use browser PDF printing or add a local print gateway on the same network as the printer.'
      : '';

    res.status(502).json({
      success: false,
      status: 'Printer not reachable',
      error: `Printer not reachable: ${error.message}.${localHint}`
    });
  }
});

router.post('/printers/test-print', auth, async (req, res) => {
  try {
    const target = validateNetworkTarget(req.body.network || req.body);
    if (target.error) return res.status(400).json({ success: false, error: target.error });

    const testPayload = Buffer.from(
      '\x1B@GoWhats Printer Test\nShipping label printing stays in browser PDF mode.\n\n\x1DVA\x00',
      'binary'
    );

    await testNetworkSocket({ ...target, payload: testPayload });

    res.json({
      success: true,
      status: 'Connection test passed',
      message: 'Test print command sent to the network printer.'
    });
  } catch (error) {
    const host = String(req.body.network?.host || req.body.host || '').trim();
    const localHint = isPrivateNetworkHost(host)
      ? ' If GoWhats is running on a cloud server, it cannot reach a local LAN printer directly. Use browser PDF printing or add a local print gateway on the same network as the printer.'
      : '';

    res.status(502).json({
      success: false,
      status: 'Printer not reachable',
      error: `Test print failed: ${error.message}.${localHint}`
    });
  }
});

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
        printingConfig: normalizePrintingConfig()
      });
    }

    res.json({
      success: true,
      printingConfig: normalizePrintingConfig(settings.printingConfig)
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
    const { fromAddress, labelFormat, printerConnection } = req.body;

    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
    }

    const currentPrintingConfig = normalizePrintingConfig(settings.printingConfig);
    settings.set('printingConfig.fromAddress', normalizeFromAddress(fromAddress || currentPrintingConfig.fromAddress));
    settings.set('printingConfig.labelFormat', normalizeLabelFormat(labelFormat || currentPrintingConfig.labelFormat));
    settings.set(
      'printingConfig.printerConnection',
      printerConnection ? normalizePrinterPayload(printerConnection) : currentPrintingConfig.printerConnection
    );

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
