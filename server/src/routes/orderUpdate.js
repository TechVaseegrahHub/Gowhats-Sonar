// routes/orderUpdate.js - Order status update management
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const WhatsAppService = require('../services/whatsappServices');
const Tenant = require('../models/Tenant');
const Message = require('../models/Message');

// Get order update options based on current status
router.get('/update-options/:orderNumber', auth, async (req, res) => {
  try {
    const { orderNumber } = req.params;

    console.log(`🔍 Getting update options for order: ${orderNumber}`);

    const order = await Order.findOne({
      tenantId: req.user.tenant_id,
      orderId: orderNumber
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Define workflow rules
    const workflowRules = {
      'pending': ['printed'], // From pending, can only go to printed
      'confirmed': ['printed'], // From confirmed, can go to printed
      'processing': ['printed'], // Legacy processing status
      'printed': ['packed'], // From printed, can only go to packed
      'packed': ['tracked', 'on_hold'], // From packed, can go to tracked or hold
      'tracked': ['on_hold'], // From tracked, can go to hold
      'on_hold': ['packed', 'tracked'], // From hold, can go back to packed or tracked
      'shipped': [], // No updates from shipped
      'delivered': [], // No updates from delivered
      'cancelled': [], // No updates from cancelled
      'refunded': [], // No updates from refunded
      'returned': [] // No updates from returned
    };

    const currentStatus = order.status;
    const availableStatuses = workflowRules[currentStatus] || [];

    // Check payment completion requirement
    const paymentCompleted = order.paymentStatus === 'completed';
    
    console.log(`📋 Order ${orderNumber} - Current: ${currentStatus}, Payment: ${order.paymentStatus}, Available: ${availableStatuses.join(', ')}`);

    res.json({
      success: true,
      orderNumber,
      currentStatus,
      paymentStatus: order.paymentStatus,
      paymentCompleted,
      availableStatuses,
      canUpdate: availableStatuses.length > 0 && paymentCompleted,
      orderDetails: {
        customerName: order.customerDetails?.name || order.shippingAddress?.name || 'Unknown Customer',
        customerPhone: order.customerPhone,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        printedAt: order.printedAt,
        packedAt: order.packedAt,
        trackedAt: order.trackedAt,
        onHoldAt: order.onHoldAt,
        holdReleasedAt: order.holdReleasedAt,
        trackingInfo: order.metadata?.trackingInfo,
        holdingInfo: order.metadata?.holdingInfo
      },
      workflow: {
        rules: workflowRules,
        description: {
          printed: 'Order has been printed and ready for packing',
          packed: 'Order has been packed and ready for shipping',
          tracked: 'Order tracking information sent to customer',
          on_hold: 'Order is on hold with customer notification'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting update options:', error);
    res.status(500).json({ 
      error: 'Failed to get update options',
      details: error.message 
    });
  }
});

// Update order status
router.post('/update-status', auth, async (req, res) => {
  try {
    const { orderNumber, newStatus, additionalData } = req.body;

    console.log(`🔄 Status update request:`, {
      orderNumber,
      newStatus,
      hasAdditionalData: !!additionalData
    });

    if (!orderNumber || !newStatus) {
      return res.status(400).json({ error: 'Order number and new status are required' });
    }

    const order = await Order.findOne({
      tenantId: req.user.tenant_id,
      orderId: orderNumber
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check payment completion
    if (order.paymentStatus !== 'completed') {
      return res.status(400).json({ 
        error: 'Payment not completed',
        message: 'Order payment must be completed before status updates',
        currentPaymentStatus: order.paymentStatus,
        requiredPaymentStatus: 'completed'
      });
    }

    const oldStatus = order.status;

    // Validate status transition
    const workflowRules = {
      'pending': ['printed'],
      'confirmed': ['printed'],
      'processing': ['printed'],
      'printed': ['packed'],
      'packed': ['tracked', 'on_hold'],
      'tracked': ['on_hold'],
      'on_hold': ['packed', 'tracked']
    };

    const allowedTransitions = workflowRules[oldStatus] || [];
    
    if (!allowedTransitions.includes(newStatus)) {
      return res.status(400).json({
        error: 'Invalid status transition',
        message: `Cannot change from ${oldStatus} to ${newStatus}`,
        currentStatus: oldStatus,
        allowedTransitions,
        requestedStatus: newStatus
      });
    }

    // Prepare update data
    const updateData = {
      status: newStatus
    };

    // Add status-specific data and timestamps
    switch (newStatus) {
      case 'printed':
        updateData.isPrinted = true;
        updateData.printedAt = new Date();
        if (!order.printedAt) updateData.printedAt = new Date();
        break;
        
      case 'packed':
        updateData.isPacked = true;
        updateData.packedAt = new Date();
        if (!order.packedAt) updateData.packedAt = new Date();
        break;
        
      case 'tracked':
        updateData.trackedAt = new Date();
        if (!order.trackedAt) updateData.trackedAt = new Date();
        if (additionalData?.trackingInfo) {
          updateData['metadata.trackingInfo'] = {
            trackingNumber: additionalData.trackingInfo.trackingNumber,
            courierService: additionalData.trackingInfo.courierService,
            courierName: additionalData.trackingInfo.courierName || additionalData.trackingInfo.courierService,
            trackingUrl: additionalData.trackingInfo.trackingUrl || '',
            notificationSent: false, // Will be set to true when notification is sent
            lastUpdatedAt: new Date(),
            addedViaUpdate: true
          };
        }
        break;
        
      case 'on_hold':
        if (!order.onHoldAt) updateData.onHoldAt = new Date();
        if (additionalData?.holdingInfo) {
          updateData['metadata.holdingInfo'] = {
            productName: additionalData.holdingInfo.productName,
            timeframe: additionalData.holdingInfo.timeframe,
            holdReason: additionalData.holdingInfo.holdReason || 'Preparation in progress',
            notificationSent: false, // Will be set to true when notification is sent
            lastUpdatedAt: new Date(),
            addedViaUpdate: true
          };
        }
        break;
    }

    // Update the order
    const updatedOrder = await Order.findOneAndUpdate(
      { tenantId: req.user.tenant_id, orderId: orderNumber },
      {
        $set: updateData,
        $push: {
          relatedMessages: {
            messageId: `status_update_${Date.now()}`,
            messageType: 'status_update',
            sentAt: new Date(),
            content: `Status updated from ${oldStatus} to ${newStatus} via order management system`
          }
        }
      },
      { new: true }
    );

    console.log(`✅ Order ${orderNumber} status updated: ${oldStatus} → ${newStatus}`);

    // Send appropriate notification based on status
    let notificationSent = false;
    let notificationMessage = '';
    let whatsappMessageId = null;

    const tenant = await Tenant.findById(req.user.tenant_id);
    
    if (tenant?.whatsappConfig?.accessToken && order.customerPhone) {
      try {
        const whatsappService = new WhatsAppService(tenant);
        const formattedPhone = whatsappService.formatPhoneNumber(order.customerPhone);
        const customerName = order.customerDetails?.name || order.shippingAddress?.name || 'Customer';

        if (formattedPhone) {
          let templateResponse = null;

          switch (newStatus) {
            case 'printed':
              // Optional: Send printed confirmation
              notificationMessage = `Order ${orderNumber} has been printed and is being prepared for packing.`;
              console.log(`📄 Order ${orderNumber} marked as printed - no WhatsApp notification sent`);
              break;
              
            case 'packed':
              // Optional: Send packed confirmation
              notificationMessage = `Order ${orderNumber} has been packed and is ready for shipping.`;
              console.log(`📦 Order ${orderNumber} marked as packed - no WhatsApp notification sent`);
              break;
              
            case 'tracked':
              // Send tracking notification if tracking info provided
              if (additionalData?.trackingInfo?.trackingNumber) {
                console.log(`🚚 Sending tracking notification for order ${orderNumber}`);
                templateResponse = await whatsappService.sendTemplateMessage(
                  'tracking',
                  formattedPhone,
                  [
                    {
                      type: 'body',
                      parameters: [
                        { type: 'text', text: customerName },
                        { type: 'text', text: orderNumber },
                        { type: 'text', text: additionalData.trackingInfo.trackingNumber },
                        { type: 'text', text: additionalData.trackingInfo.courierService || 'Courier' }
                      ]
                    }
                  ]
                );
                
                if (templateResponse?.messages?.[0]?.id) {
                  notificationSent = true;
                  whatsappMessageId = templateResponse.messages[0].id;
                  notificationMessage = `Tracking notification sent for order ${orderNumber}`;
                  
                  // Update the tracking info to mark notification as sent
                  await Order.updateOne(
                    { tenantId: req.user.tenant_id, orderId: orderNumber },
                    {
                      $set: {
                        'metadata.trackingInfo.notificationSent': true,
                        'metadata.trackingInfo.notificationSentAt': new Date(),
                        'metadata.trackingInfo.messageId': whatsappMessageId
                      }
                    }
                  );
                }
              }
              break;
              
            case 'on_hold':
              // Send holding notification if holding info provided
              if (additionalData?.holdingInfo?.productName && additionalData?.holdingInfo?.timeframe) {
                console.log(`⏸️ Sending holding notification for order ${orderNumber}`);
                templateResponse = await whatsappService.sendTemplateMessage(
                  'holding',
                  formattedPhone,
                  [
                    {
                      type: 'body',
                      parameters: [
                        { type: 'text', text: customerName },
                        { type: 'text', text: orderNumber },
                        { type: 'text', text: additionalData.holdingInfo.productName },
                        { type: 'text', text: additionalData.holdingInfo.timeframe }
                      ]
                    }
                  ]
                );
                
                if (templateResponse?.messages?.[0]?.id) {
                  notificationSent = true;
                  whatsappMessageId = templateResponse.messages[0].id;
                  notificationMessage = `Holding notification sent for order ${orderNumber}`;
                  
                  // Update the holding info to mark notification as sent
                  await Order.updateOne(
                    { tenantId: req.user.tenant_id, orderId: orderNumber },
                    {
                      $set: {
                        'metadata.holdingInfo.notificationSent': true,
                        'metadata.holdingInfo.notificationSentAt': new Date(),
                        'metadata.holdingInfo.messageId': whatsappMessageId
                      }
                    }
                  );
                }
              }
              break;
          }

          // Save notification message if sent
          if (templateResponse?.messages?.[0]?.id) {
            const message = new Message({
              tenantId: tenant._id,
              from: tenant.whatsappConfig.phoneNumberId,
              to: formattedPhone,
              text: notificationMessage,
              type: 'template',
              templateName: newStatus === 'tracked' ? 'tracking' : (newStatus === 'on_hold' ? 'holding' : 'status_update'),
              timestamp: new Date(),
              messageId: templateResponse.messages[0].id,
              status: 'sent',
              orderNumber: orderNumber,
              statusUpdate: {
                oldStatus,
                newStatus,
                updatedAt: new Date()
              }
            });
            
            await message.save();
            console.log(`💾 WhatsApp message saved with ID: ${templateResponse.messages[0].id}`);
          }
        }

      } catch (whatsappError) {
        console.error('❌ WhatsApp notification failed:', whatsappError);
        // Don't fail the status update if notification fails
        notificationMessage = `Status updated successfully, but notification failed: ${whatsappError.message}`;
      }
    } else {
      console.log(`⚠️ No WhatsApp notification sent - missing config or phone number`);
    }

    // Emit socket event for real-time updates
    if (global.io) {
      global.io.to(req.user.tenant_id).emit('order_status_updated', {
        orderNumber,
        oldStatus,
        newStatus: updatedOrder.status,
        customerName: order.customerDetails?.name || order.shippingAddress?.name,
        customerPhone: order.customerPhone,
        updatedAt: new Date(),
        notificationSent,
        messageId: whatsappMessageId
      });
    }

    res.json({
      success: true,
      message: `Order status updated from ${oldStatus} to ${newStatus}`,
      order: {
        orderNumber: updatedOrder.orderId,
        oldStatus,
        newStatus: updatedOrder.status,
        updatedAt: new Date(),
        customerName: order.customerDetails?.name || order.shippingAddress?.name,
        customerPhone: order.customerPhone,
        timestamps: {
          printedAt: updatedOrder.printedAt,
          packedAt: updatedOrder.packedAt,
          trackedAt: updatedOrder.trackedAt,
          onHoldAt: updatedOrder.onHoldAt
        }
      },
      notification: {
        sent: notificationSent,
        message: notificationMessage,
        messageId: whatsappMessageId
      },
      additionalData: additionalData || null
    });

  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ 
      error: 'Failed to update order status',
      details: error.message 
    });
  }
});

// Get order workflow information (for debugging)
router.get('/workflow-info', auth, async (req, res) => {
  try {
    const workflowRules = {
      'pending': ['printed'],
      'confirmed': ['printed'],
      'processing': ['printed'],
      'printed': ['packed'],
      'packed': ['tracked', 'on_hold'],
      'tracked': ['on_hold'],
      'on_hold': ['packed', 'tracked']
    };

    const statusDescriptions = {
      'pending': 'Order created, awaiting payment completion',
      'confirmed': 'Order confirmed, ready for printing',
      'processing': 'Order being processed, can be marked as printed',
      'printed': 'Order printed, ready for packing',
      'packed': 'Order packed, ready for shipping or tracking',
      'tracked': 'Order shipped with tracking info sent to customer',
      'on_hold': 'Order on hold, customer notified about delay'
    };

    res.json({
      success: true,
      workflow: {
        rules: workflowRules,
        descriptions: statusDescriptions,
        requirements: {
          paymentStatus: 'completed',
          note: 'All status updates require completed payment'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting workflow info:', error);
    res.status(500).json({ error: 'Failed to get workflow info' });
  }
});

module.exports = router;