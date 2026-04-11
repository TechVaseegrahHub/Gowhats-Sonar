const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const { body, validationResult } = require('express-validator'); // For input validation
const auth = require('../middleware/auth'); // Make sure to import the auth middleware



// Update WhatsApp configuration for a tenant
router.put(
  '/:id/whatsapp-config',
  auth, // Ensure the request is authenticated
  [
    // Validate request body
    body('accessToken').notEmpty().withMessage('Access token is required'),
    body('businessAccountId').notEmpty().withMessage('Business account ID is required'),
    body('phoneNumberId').notEmpty().withMessage('Phone number ID is required'),
    body('webhookSecret').notEmpty().withMessage('Webhook secret is required'),
    body('verifyToken').notEmpty().withMessage('Verify token is required')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const tenant = await Tenant.findById(req.params.id);
      if (!tenant) {
        return res.status(404).json({ message: 'Tenant not found' });
      }

      // Update WhatsApp configuration
      tenant.whatsappConfig = {
        accessToken: req.body.accessToken,
        businessAccountId: req.body.businessAccountId,
        phoneNumberId: req.body.phoneNumberId,
        webhookSecret: req.body.webhookSecret,
        verifyToken: req.body.verifyToken
      };

      await tenant.save();
      res.json({ message: 'WhatsApp configuration updated', tenant });
    } catch (error) {
      console.error('Error updating WhatsApp config:', error);
      res.status(500).json({ message: 'Failed to update WhatsApp config' });
    }
  }
);
// Add this to your tenant.js file


// Get tenant by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    res.json({
      _id: tenant._id,
      name: tenant.name || '',
      whatsappConfig: tenant.whatsappConfig || {
        businessAccountId: '',
        phoneNumberId: '',
        accessToken: '',
        webhookSecret: '',
        verifyToken: ''
      }
    });
  } catch (error) {
    console.error('Error getting tenant:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add this route to your tenants.js or create a separate script
router.post('/:tenantId/configure-flow', async (req, res) => {
  try {
    const { orderCompletionFlowId, enableFlowMessages } = req.body;

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.tenantId,
      {
        $set: {
          'flowConfig.orderCompletionFlowId': orderCompletionFlowId,
          'flowConfig.enableFlowMessages': enableFlowMessages || true,
          'flowConfig.flowConfiguredAt': new Date()
        }
      },
      { new: true }
    );

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({
      success: true,
      message: 'Flow configured successfully',
      flowConfig: tenant.flowConfig
    });
  } catch (error) {
    console.error('Flow configuration error:', error);
    res.status(500).json({ error: 'Failed to configure flow' });
  }
});

module.exports = router;