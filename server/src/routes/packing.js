const express = require('express');
const router = express.Router();
const InventoryItem = require('../models/inventory');
const Order = require('../models/Order');
const Tenant = require('../models/Tenant');
const Settings = require('../models/settings'); 
const WhatsAppService = require('../services/whatsappServices');
const { requireProModule } = require('../middleware/subscriptionMiddleware');

router.use(requireProModule('packing'));

// Fetch products
router.post('/fetch-products/:orderNumber', async (req, res) => {
  try {
    const orderNumber = req.params.orderNumber;
    const { tenantId } = req.body;

    if (!tenantId) return res.status(400).json({ error: 'Tenant ID is required' });

    const order = await Order.findOne({ orderId: orderNumber, tenantId: tenantId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.isPacked) {
      return res.status(400).json({
        error: 'This order has already been packed',
        isPacked: true,
        packedAt: order.packedAt
      });
    }

    const transformedProducts = await Promise.all(order.items?.map(async (item, index) => {
      let finalSku = item.sku || item.retailerId;
      if (!finalSku) {
        try {
          const inventoryItem = await InventoryItem.findOne({
            tenant_id: tenantId,
            name: item.name
          });
          if (inventoryItem && inventoryItem.retailer_id) {
            finalSku = inventoryItem.retailer_id;
          }
        } catch (err) {}
      }
      if (!finalSku) {
         finalSku = item.name ? item.name.trim().toUpperCase().replace(/\s+/g, '-') : `ITEM-${index+1}`;
      }
      return {
        name: item.name || 'Unknown Product',
        sku: finalSku,
        retailerId: item.retailerId || finalSku,
        quantity: item.quantity || 1,
        image: { src: item.imageUrl || item.image_url || '/default-product-image.png' },
        id: item._id || `temp_${index}`,
        price: item.price || 0,
        initialQuantity: item.quantity
      };
    }));

    res.json({
      products: transformedProducts,
      customerNote: order.notes || order.internalNotes || '',
      orderDetails: {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        customerName: order.customerDetails?.name || order.shippingAddress?.name,
        customerPhone: order.customerPhone,
        totalAmount: order.totalAmount,
        status: order.status,
        itemCount: transformedProducts.length
      }
    });

  } catch (error) {
    console.error('Error in fetch-products:', error.message);
    res.status(500).json({ error: 'Error fetching data. Please try again later.' });
  }
});

// Verify SKU and Pack
router.post('/verify-sku/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    let { skus, skuInputs, tenantId, sendNotification } = req.body; 

    if (!tenantId) return res.status(400).json({ error: 'Tenant ID is required' });

    let rawSkuData = skus || skuInputs || req.body.sku;
    if (!rawSkuData || !Array.isArray(rawSkuData)) {
      return res.status(400).json({ error: 'SKUs array is required' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const order = await Order.findOne({ orderId: orderNumber, tenantId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.isPacked) {
      return res.status(400).json({ error: 'Order already packed', packedAt: order.packedAt });
    }

    const skuInputsProcessed = rawSkuData.map(item =>
      typeof item === 'string' ? { sku: item, quantity: 1 } : item
    ).filter(Boolean);

    const packingNote = `Packed on ${new Date().toISOString()}. ${skuInputsProcessed.length} SKUs verified.`;
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId: orderNumber, tenantId },
      {
        isPacked: true,
        packedAt: new Date(),
        status: 'packed',
        $push: {
          relatedMessages: {
            messageId: `packing_${Date.now()}`,
            messageType: 'packing_note',
            sentAt: new Date(),
            content: packingNote
          }
        },
        'metadata.packingInfo': {
          packedBy: 'system',
          packedAt: new Date(),
          skusScanned: skuInputsProcessed.length
        }
      },
      { new: true }
    );

    // 4. Send WhatsApp Notification
    try {
        const settings = await Settings.findOne({ tenant_id: tenantId });
        const isPackingEnabledInDB = settings?.automationConfig?.packing?.enabled === true;
        const shouldSend = isPackingEnabledInDB || sendNotification === true;

        if (shouldSend && order.customerPhone) {
            console.log(`📦 Notification ENABLED. Sending 'order_packed' template to ${order.customerPhone}`);

            const whatsappService = new WhatsAppService(tenant);

            // ✅ FIX: Use 'en' language code explicitly (matches your working requirement)
            await whatsappService.sendStandardTemplate(
                'order_packed', 
                order.customerPhone, 
                { orderNumber: orderNumber },
                'en' 
            );

            console.log(`✅ Packing template sent successfully.`);
        } else {
            console.log(`🔕 Packing notification is OFF (DB: ${isPackingEnabledInDB}, UI: ${sendNotification}).`);
        }
    } catch (waError) {
        console.error('❌ Failed to send packing WhatsApp:', waError.message);
    }

    if (global.io) {
      global.io.to(tenantId).emit('order_packed', {
        orderNumber,
        status: 'packed',
        packedAt: updatedOrder.packedAt
      });
    }

    res.json({
      success: true,
      message: 'Order packed successfully',
      order: updatedOrder
    });

  } catch (error) {
    console.error(`❌ Error in verify-sku:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/packing-stats', async (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

    const totalOrders = await Order.countDocuments({ tenantId });
    const packedOrders = await Order.countDocuments({ tenantId, isPacked: true });
    const pendingOrders = await Order.countDocuments({ tenantId, status: 'pending', isPacked: false });

    res.json({ totalOrders, packedOrders, completedOrders: pendingOrders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/orders-for-packing', async (req, res) => {
  try {
    const { tenantId, page = 1, per_page = 50 } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

    const skip = (page - 1) * per_page;
    const orders = await Order.find({
      tenantId,
      status: 'pending',
      $or: [{ isPacked: { $exists: false } }, { isPacked: false }]
    })
    .select('orderId orderNumber customerDetails shippingAddress items totalAmount status createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(per_page));

    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
