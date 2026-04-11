// routes/registrationConfig.js
const express = require('express');
const router = express.Router();
const RegistrationConfig = require('../models/RegistrationConfig');
const auth = require('../middleware/auth');
const checkTenant = require('../middleware/tenantMiddleware');
const axios = require('axios');
const Tenant = require('../models/Tenant');

// 1. GET Configuration
router.get('/', auth, checkTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const config = await RegistrationConfig.findOne({ tenantId });

    if (!config) {
      return res.json({ success: true, exists: false, config: null });
    }

    return res.json({ success: true, exists: true, config: config });
  } catch (error) {
    console.error('❌ Error fetching registration config:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch configuration', error: error.message });
  }
});

// 2. CREATE or UPDATE Configuration (Main Save Route)
router.post('/', auth, checkTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    console.log('📝 Saving registration config for tenant:', tenantId);

    const {
      whatsappNumber,
      triggerWord,
      registrationFlowId,
      paymentRequired,
      registrationFee,
      paymentGateway,
      stripeConfig,
      paymentConfigurationName,
      confirmationMessage,
      fieldMapping,
      ticketConfig,
      flowMessage,
      paymentMessage
    } = req.body;

    // ✅ FIX: Convert triggerWord string → clean array before sending
    let triggerWordArray = [];
    
    if (typeof triggerWord === 'string') {
      triggerWordArray = triggerWord
        .split(',')
        .map(w => w.trim())
        .filter(Boolean);
    } else if (Array.isArray(triggerWord)) {
      triggerWordArray = triggerWord
        .map(w => String(w).trim())
        .filter(Boolean);
    }

    // Validation
    if (!whatsappNumber || triggerWordArray.length === 0 || !registrationFlowId) {
      return res.status(400).json({ success: false, message: 'WhatsApp Number, Trigger Word, and Flow ID are required' });
    }

    const cleanNumber = whatsappNumber.replace(/\D/g, '');

    // ✅ Check for duplicate trigger words (case-insensitive)
    for (const word of triggerWordArray) {
      const existingTrigger = await RegistrationConfig.findOne({
        triggerWord: new RegExp(`^${word}$`, 'i'),
        tenantId: { $ne: tenantId }
      });

      if (existingTrigger) {
        return res.status(400).json({ 
          success: false, 
          message: `Trigger word "${word}" is already in use by another tenant.` 
        });
      }
    }

    // Update Data
    const updateData = {
      tenantId,
      whatsappNumber: cleanNumber,
      triggerWord: triggerWordArray, // ✅ Store as array with original case
      registrationFlowId,
      paymentRequired: paymentRequired || false,
      registrationFee: registrationFee !== undefined ? Number(registrationFee) : 0,
      paymentGateway: paymentGateway || 'razorpay',
      stripeConfig: (stripeConfig && typeof stripeConfig === 'object')
        ? stripeConfig
        : { enabled: false, publicKey: '', secretKey: '', webhookSecret: '' },
      paymentConfigurationName: paymentConfigurationName || '',
      confirmationMessage: confirmationMessage || '🎉 Booking Confirmed!',
      fieldMapping: fieldMapping || {},
      ticketConfig: ticketConfig || { prefix: 'EV', startNumber: 100, currentSequence: 0 },
      flowMessage: flowMessage || {
        header: '📝 Business Registration',
        body: 'Please fill out the registration form',
        footer: 'Powered by GoWhats!',
        ctaButtonText: 'Start Registration'
      },
      paymentMessage: paymentMessage || {
        header: '💳 Complete Your Payment',
        body: 'Please review your order details',
        footer: 'Secure Payment'
      }
    };

    // Find & Update or Create New
    let config = await RegistrationConfig.findOne({ tenantId });

    if (config) {
      Object.assign(config, updateData);
    } else {
      config = new RegistrationConfig(updateData);
    }

    // ✅ Wrap generateQRCodeData in try-catch
    try {
      config.generateQRCodeData();
    } catch (qrError) {
      console.error('⚠️ generateQRCodeData failed (non-fatal):', qrError.message);
    }

    await config.save();

    console.log('✅ Configuration saved successfully');
    console.log('📋 Trigger Words Saved:', config.triggerWord);

    res.json({
      success: true,
      message: 'Configuration saved successfully',
      exists: true,
      config: config
    });

  } catch (error) {
    console.error('❌ Error saving config:', error);
    res.status(500).json({ success: false, message: 'Failed to save configuration', error: error.message });
  }
});

// 3. DELETE Configuration
router.delete('/:configId', auth, checkTenant, async (req, res) => {
  try {
    const { configId } = req.params;
    const tenantId = req.user.tenant_id;
    const config = await RegistrationConfig.findOneAndDelete({ _id: configId, tenantId: tenantId });

    if (!config) return res.status(404).json({ success: false, message: 'Configuration not found' });

    console.log('✅ Registration config deleted:', configId);
    return res.json({ success: true, message: 'Configuration deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete configuration' });
  }
});

// 4. PUT Configuration (Partial Updates)
router.put('/:configId', auth, checkTenant, async (req, res) => {
  try {
    const { configId } = req.params;
    const tenantId = req.user.tenant_id;
    const config = await RegistrationConfig.findOne({ _id: configId, tenantId: tenantId });

    if (!config) return res.status(404).json({ success: false, message: 'Registration configuration not found' });

    // Update fields only if provided
    if (req.body.whatsappNumber !== undefined) config.whatsappNumber = req.body.whatsappNumber.trim();

    if (req.body.triggerWord !== undefined) {
      // ✅ Convert to array and keep original case
      let newTriggerWords = [];
      
      if (typeof req.body.triggerWord === 'string') {
        newTriggerWords = req.body.triggerWord
          .split(',')
          .map(w => w.trim())
          .filter(Boolean);
      } else if (Array.isArray(req.body.triggerWord)) {
        newTriggerWords = req.body.triggerWord
          .map(w => String(w).trim())
          .filter(Boolean);
      }

      // Check for duplicates (case-insensitive)
      for (const word of newTriggerWords) {
        const duplicate = await RegistrationConfig.findOne({ 
          tenantId: tenantId, 
          triggerWord: new RegExp(`^${word}$`, 'i'),
          _id: { $ne: configId } 
        });
        
        if (duplicate) {
          return res.status(400).json({ 
            success: false, 
            message: `Trigger word "${word}" already exists` 
          });
        }
      }
      
      config.triggerWord = newTriggerWords;
    }

    if (req.body.registrationFlowId !== undefined) config.registrationFlowId = req.body.registrationFlowId.trim();
    if (req.body.paymentRequired !== undefined) config.paymentRequired = req.body.paymentRequired;
    if (req.body.registrationFee !== undefined) config.registrationFee = Number(req.body.registrationFee);
    if (req.body.paymentGateway !== undefined) config.paymentGateway = req.body.paymentGateway;
    
    if (req.body.stripeConfig) {
      config.stripeConfig = { ...config.stripeConfig, ...req.body.stripeConfig };
    }
    
    if (req.body.paymentConfigurationName !== undefined) config.paymentConfigurationName = req.body.paymentConfigurationName;
    if (req.body.isActive !== undefined) config.isActive = req.body.isActive;
    if (req.body.flowMessage) config.flowMessage = { ...config.flowMessage, ...req.body.flowMessage };
    if (req.body.paymentMessage) config.paymentMessage = { ...config.paymentMessage, ...req.body.paymentMessage };
    if (req.body.confirmationMessage !== undefined) config.confirmationMessage = req.body.confirmationMessage;
    if (req.body.fieldMapping) config.fieldMapping = { ...config.fieldMapping, ...req.body.fieldMapping };
    if (req.body.ticketConfig) config.ticketConfig = { ...config.ticketConfig, ...req.body.ticketConfig };

    await config.save();

    if (req.body.whatsappNumber || req.body.triggerWord) {
      try {
        config.generateQRCodeData();
        await config.save();
      } catch (qrError) {
        console.error('⚠️ generateQRCodeData failed (non-fatal):', qrError.message);
      }
    }

    console.log('✅ Registration config updated successfully');
    return res.json({ success: true, message: 'Configuration updated successfully', config: config });

  } catch (error) {
    console.error('❌ Error updating registration config:', error);
    return res.status(500).json({ success: false, message: 'Failed to update configuration', error: error.message });
  }
});

// 5. TOGGLE Status
router.patch('/:configId/toggle', auth, checkTenant, async (req, res) => {
  try {
    const { configId } = req.params;
    const tenantId = req.user.tenant_id;
    const config = await RegistrationConfig.findOne({ _id: configId, tenantId: tenantId });

    if (!config) return res.status(404).json({ success: false, message: 'Configuration not found' });

    config.isActive = !config.isActive;
    await config.save();

    return res.json({ success: true, message: `Configuration ${config.isActive ? 'activated' : 'deactivated'}`, config: config });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to toggle status' });
  }
});

// 6. FETCH FLOW METADATA
router.post('/fetch-flow-metadata', auth, checkTenant, async (req, res) => {
  try {
    const { flowId } = req.body;
    const tenantId = req.user.tenant_id;
    const tenant = await Tenant.findById(tenantId);

    if (!tenant || !tenant.whatsappConfig.accessToken) {
      return res.status(400).json({ success: false, message: 'WhatsApp not configured' });
    }
    
    if (!flowId) {
      return res.status(400).json({ success: false, message: 'Flow ID is required' });
    }

    const url = `https://graph.facebook.com/v18.0/${flowId}/assets`;
    const response = await axios.get(url, { 
      headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` } 
    });

    const flowJsonAsset = response.data.data.find(asset => asset.asset_type === 'FLOW_JSON');
    
    if (!flowJsonAsset) {
      return res.status(404).json({ success: false, message: 'Flow JSON not found' });
    }

    const jsonResponse = await axios.get(flowJsonAsset.download_url);
    const flowJson = jsonResponse.data;

    const fields = [];
    
    if (flowJson.screens) {
      flowJson.screens.forEach(screen => {
        if (screen.layout && screen.layout.children) {
          const findInputs = (children) => {
            children.forEach(child => {
              if (['TextInput', 'Dropdown', 'RadioButtons', 'CheckboxGroup', 'DatePicker', 'TextArea'].includes(child.type)) {
                fields.push({ 
                  id: child.name, 
                  label: child.label || child.name, 
                  type: child.type 
                });
              }
              if (child.children) findInputs(child.children);
            });
          };
          findInputs(screen.layout.children);
        }
      });
    }

    res.json({ success: true, fields });
    
  } catch (error) {
    console.error('❌ Error fetching flow metadata:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch flow details', 
      error: error.message 
    });
  }
});

// 7. GET STATS
router.get('/stats', [auth, checkTenant], async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const config = await RegistrationConfig.findOne({ tenantId });
    
    res.json({ 
      success: true, 
      stats: config ? config.stats : { 
        totalScans: 0, 
        totalRegistrations: 0, 
        totalPayments: 0 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
