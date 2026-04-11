// routes/flowConfiguration.js - Enhanced version
const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const auth = require('../middleware/auth');
const checkTenant = require('../middleware/tenantMiddleware');

// Update flow configuration - Enhanced to handle frontend form submission
router.post('/config', [auth, checkTenant], async (req, res) => {
  try {
    const {
      orderCompletionFlowId,
      customerSupportFlowId,
      feedbackFlowId,
      enableFlowMessages,
      autoSendOrderFlow,
      flowWebhookUrl
    } = req.body;

    const updateData = {};

    if (orderCompletionFlowId !== undefined) {
      updateData['flowConfig.orderCompletionFlowId'] = orderCompletionFlowId;
      // Mark flow setup as complete if flow ID is provided
      if (orderCompletionFlowId) {
        updateData['flowConfig.configurationSteps.flowSetup'] = true;
        updateData['flowConfig.enableFlowMessages'] = true; // Auto-enable when flow ID is set
      }
    }

    if (customerSupportFlowId !== undefined) {
      updateData['flowConfig.customerSupportFlowId'] = customerSupportFlowId;
    }

    if (feedbackFlowId !== undefined) {
      updateData['flowConfig.feedbackFlowId'] = feedbackFlowId;
    }

    if (enableFlowMessages !== undefined) {
      updateData['flowConfig.enableFlowMessages'] = enableFlowMessages;
    }

    if (autoSendOrderFlow !== undefined) {
      updateData['flowConfig.autoSendOrderFlow'] = autoSendOrderFlow;
    }

    if (flowWebhookUrl !== undefined) {
      updateData['flowConfig.flowWebhookUrl'] = flowWebhookUrl;
    }

    // Always update the configuration timestamp
    updateData['flowConfig.flowConfiguredAt'] = new Date();

    const tenant = await Tenant.findByIdAndUpdate(
      req.user.tenant_id,
      { $set: updateData },
      { new: true }
    );

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    console.log('✅ Flow configuration updated:', {
      tenantId: tenant._id,
      orderCompletionFlowId: tenant.flowConfig?.orderCompletionFlowId,
      enableFlowMessages: tenant.flowConfig?.enableFlowMessages
    });

    res.json({
      success: true,
      message: 'Flow configuration updated successfully',
      config: tenant.flowConfig
    });
  } catch (error) {
    console.error('Error updating flow config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update flow configuration'
    });
  }
});

module.exports = router;