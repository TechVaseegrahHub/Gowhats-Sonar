const express = require('express');
const router = express.Router();
const Settings = require('../models/settings');
const authenticateToken = require('../middleware/auth');
const { createTenantApiKey, revokeTenantApiKey } = require('../services/gowhatsAgentService');

// Only super_admin can call these routes
function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden. Only super_admin can manage agent API keys.'
    });
  }
  next();
}

/**
 * POST /api/admin/provision-agent-key
 * Creates a new client-role key in Python agent and stores it for the tenant.
 *
 * Body: { tenantId, label? }
 */
router.post('/provision-agent-key', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId, label } = req.body;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'tenantId is required' });
    }

    // Check if tenant already has a key
    const existing = await Settings.findOne({ tenant_id: tenantId }).lean();
    if (existing?.aiConfig?.agentApiKey) {
      return res.status(409).json({
        success: false,
        message: 'Tenant already has an agent API key. Revoke the existing one first.'
      });
    }

    // Create key in Python agent
    const apiKey = await createTenantApiKey(
      tenantId,
      label || `GoWhats Tenant: ${tenantId}`
    );

    // Store key in tenant's Settings
    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
    }
    if (!settings.aiConfig) settings.aiConfig = {};

    settings.aiConfig.agentApiKey = apiKey;
    settings.markModified('aiConfig');
    await settings.save();

    console.log(`✅ Agent key provisioned for tenant ${tenantId}`);

    res.json({
      success: true,
      message: `AI agent key created and stored for tenant ${tenantId}`,
      tenantId,
      keyPrefix: apiKey.substring(0, 20) + '...' // never expose full key in response
    });

  } catch (error) {
    console.error('❌ Provision agent key error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to provision key' });
  }
});

/**
 * DELETE /api/admin/revoke-agent-key
 * Revokes the tenant's key from Python agent and clears it from Settings.
 *
 * Body: { tenantId, keyId }
 * Note: keyId is the UUID from the Python agent (key_id field).
 *       Store this when provisioning if you need to revoke later.
 *       If you don't have keyId, you can just clear the key from Settings.
 */
router.delete('/revoke-agent-key', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId, keyId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'tenantId is required' });
    }

    // Revoke from Python agent if keyId is provided
    if (keyId) {
      await revokeTenantApiKey(keyId);
    }

    // Clear from Settings regardless
    const settings = await Settings.findOne({ tenant_id: tenantId });
    if (settings?.aiConfig?.agentApiKey) {
      settings.aiConfig.agentApiKey = null;
      settings.markModified('aiConfig');
      await settings.save();
    }

    console.log(`✅ Agent key revoked for tenant ${tenantId}`);

    res.json({
      success: true,
      message: `Agent API key revoked for tenant ${tenantId}`
    });

  } catch (error) {
    console.error('❌ Revoke agent key error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to revoke key' });
  }
});

/**
 * GET /api/admin/agent-key-status?tenantId=xxx
 * Check if a tenant has an agent key configured (without exposing the key itself).
 */
router.get('/agent-key-status', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'tenantId is required' });
    }

    const settings = await Settings.findOne({ tenant_id: tenantId }).lean();
    const apiKey = settings?.aiConfig?.agentApiKey;

    res.json({
      success: true,
      tenantId,
      hasAgentKey: Boolean(apiKey),
      keyPrefix: apiKey ? apiKey.substring(0, 20) + '...' : null
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
