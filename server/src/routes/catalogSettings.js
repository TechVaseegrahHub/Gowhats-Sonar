const express = require('express');
const router = express.Router();
const Settings = require('../models/settings');
const OrderCounter = require('../models/OrderCounter');
const auth = require('../middleware/auth');

/**
 * GET /api/catalog-settings
 */
router.get('/', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
      await settings.save();
    }

    const counter = await OrderCounter.findOne({
      tenantId: tenantId.toString(),
      counterType: 'order'
    });

    res.json({
      success: true,
      flowConfig: settings.flowConfig,
      automationConfig: settings.automationConfig,
      printingConfig: settings.printingConfig || {
        fromAddress: {},
        labelFormat: 'thermal'
      }, // ✅ Ensure printingConfig is always returned
      settings: settings,
      orderCounter: counter?.nextOrderNumber || 1000
    });

  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

/**
 * POST /api/catalog-settings
 */
router.post('/', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;

    // ✅ EXTRACT ALL FIELDS FROM REQUEST BODY
    const {
      flowConfig,
      automationConfig,
      printingConfig,
      orderCounter,
      catalogId,        // ✅ ADD THESE
      catalogName,
      category,
      description,
      address,
      email,
      website
    } = req.body;

    console.log('📥 Saving settings for tenant:', tenantId);
    console.log('📥 Received data:', {
      catalogId,
      category,
      description,
      address,
      email,
      website
    });

    // 1. Handle Order Counter
    if (orderCounter !== undefined && orderCounter !== null) {
      const counterVal = parseInt(orderCounter);

      if (isNaN(counterVal) || counterVal < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order counter value'
        });
      }

      console.log(`🔢 Setting counter to: ${counterVal}`);

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

      console.log('✅ Counter updated');
    }

    // 2. Handle Settings
    let settings = await Settings.findOne({ tenant_id: tenantId });

    if (!settings) {
      // Create new settings
      settings = new Settings({
        tenant_id: tenantId,
        catalogId: catalogId || '',
        catalogName: catalogName || '',
        category: category || '',
        description: description || '',
        address: address || '',
        email: email || '',
        website: website || '',
        automationConfig: automationConfig || {},
        flowConfig: {},
        printingConfig: printingConfig || {}
      });
    } else {
      // ✅ UPDATE TOP-LEVEL CATALOG FIELDS
      if (catalogId !== undefined) {
        settings.catalogId = catalogId;
        console.log('💾 Updating catalogId:', catalogId);
      }
      if (catalogName !== undefined) settings.catalogName = catalogName;
      if (category !== undefined) settings.category = category;
      if (description !== undefined) settings.description = description;
      if (address !== undefined) settings.address = address;
      if (email !== undefined) settings.email = email;
      if (website !== undefined) settings.website = website;

      // Update automation config
      if (automationConfig) {
        settings.automationConfig = {
          ...(settings.automationConfig || {}),
          ...(automationConfig || {}),
          orderFlow: {
            ...(settings.automationConfig?.orderFlow || {}),
            ...(automationConfig.orderFlow || {})
          },
          orderConfirmation: {
            ...(settings.automationConfig?.orderConfirmation || {}),
            ...(automationConfig.orderConfirmation || {})
          },
          paymentRequest: {
            ...(settings.automationConfig?.paymentRequest || {}),
            ...(automationConfig.paymentRequest || {})
          },
          shippingUpdate: {
            ...(settings.automationConfig?.shippingUpdate || {}),
            ...(automationConfig.shippingUpdate || {})
          },
          shippingSelection: {
            ...(settings.automationConfig?.shippingSelection || {}),
            ...(automationConfig.shippingSelection || {})
          },
          abandonedCart: {
            ...(settings.automationConfig?.abandonedCart || {}),
            ...(automationConfig.abandonedCart || {})
	  },
          inventoryAlerts: {
            ...(settings.automationConfig?.inventoryAlerts || {}),
            ...(automationConfig.inventoryAlerts || {})
          }
        };
      }

      // Handle printingConfig
      if (printingConfig) {
        console.log('💾 Saving printingConfig:', printingConfig);
        settings.printingConfig = {
          fromAddress: printingConfig.fromAddress || {},
          labelFormat: printingConfig.labelFormat || 'thermal'
        };
      }

      // Only update flowConfig if it has valid data
      if (flowConfig && Object.keys(flowConfig).length > 0) {
        const cleanFlowConfig = Object.entries(flowConfig).reduce((acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = value;
          }
          return acc;
        }, {});

        settings.flowConfig = {
          ...(settings.flowConfig || {}),
          ...cleanFlowConfig,
          lastFlowUpdate: new Date()
        };
      }
    }

    // ✅ Mark ALL modified fields
    settings.markModified('catalogId');
    settings.markModified('catalogName');
    settings.markModified('category');
    settings.markModified('description');
    settings.markModified('address');
    settings.markModified('email');
    settings.markModified('website');
    settings.markModified('automationConfig');
    settings.markModified('flowConfig');
    settings.markModified('printingConfig');

    await settings.save();
    console.log('✅ Settings saved successfully');
    console.log('✅ Final catalogId:', settings.catalogId);

    res.json({
      success: true,
      message: 'Settings saved successfully',
      settings: settings
    });

  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save settings',
      error: error.message
    });
  }
});



router.post('/validate-catalog', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const { catalogId } = req.body;

    if (!catalogId) {
      return res.status(400).json({
        success: false,
        message: 'Catalog ID is required'
      });
    }

    // Get tenant's access token
    const Tenant = require('../models/Tenant');
    const tenant = await Tenant.findById(tenantId);

    if (!tenant?.whatsappConfig?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp not configured'
      });
    }

    // Validate catalog exists in WhatsApp
    const axios = require('axios');
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${catalogId}`,
      {
        headers: {
          Authorization: `Bearer ${tenant.whatsappConfig.accessToken}`
        },
        params: {
          fields: 'id,name'
        }
      }
    );

    res.json({
      success: true,
      message: 'Catalog ID is valid',
      catalog: response.data
    });

  } catch (error) {
    console.error('Catalog validation error:', error.response?.data || error.message);
    res.status(400).json({
      success: false,
      message: 'Invalid Catalog ID or access denied',
      error: error.response?.data?.error?.message || error.message
    });
  }
});


module.exports = router;

