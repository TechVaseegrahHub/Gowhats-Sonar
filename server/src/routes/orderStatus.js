// server/src/routes/orderStatus.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

/**
 * @route   PATCH /api/order-status/:orderId
 * @desc    Update order status from frontend dropdown
 * @access  Protected
 */
router.patch('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { newStatus, tenantId } = req.body;

    console.log(`🔄 Updating order ${orderId} to status: ${newStatus}`);

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    if (!newStatus) {
      return res.status(400).json({ error: 'New status is required' });
    }

    // Valid statuses
    const validStatuses = ['pending', 'printed', 'packed', 'tracked', 'on_hold'];
    
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses: validStatuses 
      });
    }

    // Find the order
    const order = await Order.findOne({ 
      orderId: orderId, 
      tenantId: tenantId 
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const oldStatus = order.status;

    // Update based on new status
    const updateData = {
      status: newStatus,
    };

    switch (newStatus) {
      case 'printed':
        updateData.isPrinted = true;
        updateData.printedAt = new Date();
        break;
      case 'packed':
        updateData.isPacked = true;
        updateData.packedAt = new Date();
        updateData.isPrinted = true;
        if (!order.printedAt) updateData.printedAt = new Date();
        break;
      case 'tracked':
        updateData.trackedAt = new Date();
        updateData.isPacked = true;
        updateData.isPrinted = true;
        if (!order.printedAt) updateData.printedAt = new Date();
        if (!order.packedAt) updateData.packedAt = new Date();
        break;
      case 'on_hold':
        updateData.onHoldAt = new Date();
        break;
      case 'pending':
        // Reset flags
        updateData.isPrinted = false;
        updateData.isPacked = false;
        updateData.printedAt = null;
        updateData.packedAt = null;
        break;
    }

    // Add to status history
    if (!order.metadata) order.metadata = {};
    if (!order.metadata.statusHistory) order.metadata.statusHistory = [];
    
    order.metadata.statusHistory.push({
      from: oldStatus,
      to: newStatus,
      changedAt: new Date(),
      changedBy: 'user',
      reason: 'Manual status update from dashboard'
    });

    order.metadata.lastStatusUpdate = new Date();

    // Update the order
    Object.assign(order, updateData);
    order.metadata = { ...order.metadata };

    await order.save();

    console.log(`✅ Order ${orderId} updated from ${oldStatus} to ${newStatus}`);

    res.json({
      success: true,
      message: `Order status updated from ${oldStatus} to ${newStatus}`,
      order: {
        orderId: order.orderId,
        oldStatus: oldStatus,
        newStatus: newStatus,
        isPrinted: order.isPrinted,
        isPacked: order.isPacked,
        updatedAt: order.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ 
      error: 'Failed to update order status',
      details: error.message 
    });
  }
});

module.exports = router;
