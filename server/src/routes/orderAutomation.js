const express = require('express');
const router = express.Router();
const Settings = require('../models/settings');
const OrderCounter = require('../models/OrderCounter');
const auth = require('../middleware/auth');
const axios = require('axios');

/**
 * GET /api/catalog-settings
 * Fetch tenant's catalog and order automation settings
 */
router.get('/', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No tenant ID found' });
    }

    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
      await settings.save();
    }

    // Also get order counter
    const counter = await OrderCounter.findOne({
      tenantId: tenantId.toString(),
      counterType: 'order'
    });

    res.json({
      success: true,
      flowConfig: settings.flowConfig,
      automationConfig: settings.automationConfig,
      settings: settings,
      orderCounter: counter?.nextOrderNumber || 1000,
      orderIdPrefix: settings.automationConfig?.orderIdConfig?.prefix || 'ORD'
    });

  } catch (error) {
    console.error('❌ Error fetching catalog settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

/**
 * POST /api/catalog-settings
 * Save/Update tenant's order automation configuration + order counter
 */
router.post('/', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { flowConfig, automationConfig, orderCounter, orderIdPrefix } = req.body;

    console.log('📥 Received save request:', {
      tenantId,
      hasFlowConfig: !!flowConfig,
      hasAutomationConfig: !!automationConfig,
      orderCounter,
      orderIdPrefix
    });

    // 1. Handle Order Counter (if provided)
    if (orderCounter !== undefined && orderCounter !== null) {
      const counterVal = parseInt(orderCounter);

      if (isNaN(counterVal) || counterVal < 1) {
        return res.status(400).json({
          success: false,
          message: 'Order counter must be a positive number'
        });
      }

      console.log(`🔢 Updating order counter to: ${counterVal}`);

      try {
        await OrderCounter.findOneAndUpdate(
          {
            tenantId: tenantId.toString(),
            counterType: 'order'
          },
          {
            nextOrderNumber: counterVal,
            lastUpdated: new Date()
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
          }
        );
        console.log('✅ Order counter updated');
      } catch (counterError) {
        console.error('❌ Counter update error:', counterError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update order counter',
          error: counterError.message
        });
      }
    }

    // 2. Handle Settings Update
    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings) {
      settings = new Settings({
        tenant_id: tenantId,
        flowConfig: flowConfig || {},
        automationConfig: automationConfig || {}
      });
    } else {
      // Update automationConfig with deep merge to prevent overwriting
      if (automationConfig) {
        settings.automationConfig = {
          ...settings.automationConfig,
          
          orderFlow: {
            ...settings.automationConfig?.orderFlow,
            ...automationConfig.orderFlow
          },
          orderConfirmation: {
            ...settings.automationConfig?.orderConfirmation,
            ...automationConfig.orderConfirmation
          },
          paymentRequest: {
            ...settings.automationConfig?.paymentRequest,
            ...automationConfig.paymentRequest
          },
          shippingUpdate: {
            ...settings.automationConfig?.shippingUpdate,
            ...automationConfig.shippingUpdate
          },
          shippingSelection: {
            ...settings.automationConfig?.shippingSelection,
            ...automationConfig.shippingSelection
          },
          abandonedCart: {
            ...settings.automationConfig?.abandonedCart,
            ...automationConfig.abandonedCart
          },
	   inventoryAlerts: {
            ...settings.automationConfig?.inventoryAlerts,
            ...automationConfig.inventoryAlerts
          },
          // ✅ Save Order ID Prefix
          orderIdConfig: {
             prefix: orderIdPrefix || settings.automationConfig?.orderIdConfig?.prefix || 'ORD',
             startSequence: parseInt(orderCounter) || 1000
          }
        };
      }

      // Update flowConfig if provided (legacy support)
      if (flowConfig) {
        settings.flowConfig = {
          ...settings.flowConfig,
          ...flowConfig,
          lastFlowUpdate: new Date()
        };
      }
    }

    await settings.save();
    console.log('✅ Settings saved successfully');

    res.json({
      success: true,
      message: 'Settings saved successfully',
      settings: settings,
      orderCounterUpdated: orderCounter !== undefined
    });

  } catch (error) {
    console.error('❌ Error saving catalog settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save settings',
      error: error.message
    });
  }
});

/**
 * POST /api/catalog-settings/fetch-flow-metadata
 * Fetch flow fields from WhatsApp Flow
 */
router.post('/fetch-flow-metadata', auth, async (req, res) => {
  try {
    const { flowId } = req.body;
    const tenantId = req.user.tenantId || req.user.tenant_id;

    if (!flowId) {
      return res.status(400).json({
        success: false,
        message: 'Flow ID is required'
      });
    }

    const Tenant = require('../models/Tenant');
    const tenant = await Tenant.findById(tenantId);

    if (!tenant || !tenant.whatsappConfig?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp not configured for this tenant'
      });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${flowId}`,
      {
        headers: {
          Authorization: `Bearer ${tenant.whatsappConfig.accessToken}`
        },
        params: {
          fields: 'name,status,categories,validation_errors,json_version'
        }
      }
    );

    let fields = [];

    if (response.data.json_version) {
      try {
        const flowJson = typeof response.data.json_version === 'string'
          ? JSON.parse(response.data.json_version)
          : response.data.json_version;

        if (flowJson.screens) {
          flowJson.screens.forEach(screen => {
            if (screen.layout?.children) {
              screen.layout.children.forEach(child => {
                if (child.type === 'TextInput' ||
                    child.type === 'Dropdown' ||
                    child.type === 'OptIn' ||
                    child.type === 'RadioButtonsGroup') {
                  fields.push({
                    id: child.name,
                    label: child.label || child.name,
                    type: child.type,
                    required: child.required || false
                  });
                }
              });
            }
          });
        }
      } catch (parseError) {
        console.error('Error parsing flow JSON:', parseError);
      }
    }

    res.json({
      success: true,
      flowId: flowId,
      flowName: response.data.name,
      status: response.data.status,
      fields: fields
    });

  } catch (error) {
    console.error('Error fetching flow metadata:', error.response?.data || error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Flow not found. Please check the Flow ID.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch flow metadata',
      error: error.response?.data?.error?.message || error.message
    });
  }
});

module.exports = router;
