const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const CallingSession = require('../models/CallingSession');

// ============================================================
// 🔓 OPEN ROUTES (Accessible to admins to enable the feature)
// ============================================================

// PATCH /api/calling/toggle
router.patch('/toggle', auth, async (req, res) => {
  try {
    const { enabled } = req.body;
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.whatsappConfig) tenant.whatsappConfig = {};

    tenant.whatsappConfig.isCallingEnabled = enabled;
    await tenant.save();

    res.json({ success: true, isCallingEnabled: enabled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/calling/settings
router.put('/settings', auth, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/settings`,
      { calling: { status: 'ENABLED', callback_permission_status: 'ENABLED' } },
      { headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` } }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Enable calling error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// GET /api/calling/status  ← MUST be before the blocking middleware
router.get('/status', auth, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);
    res.json({
      isCallingEnabled: tenant?.whatsappConfig?.isCallingEnabled || false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 🛡️ RESTRICTED ROUTES (Only work if isCallingEnabled is TRUE)
// ============================================================

router.use(auth, async (req, res, next) => {
  const tenant = await Tenant.findById(req.user.tenant_id);
  if (!tenant || !tenant.whatsappConfig?.isCallingEnabled) {
    return res.status(403).json({ error: "WhatsApp Calling is not enabled for your plan." });
  }
  req.tenant = tenant;
  next();
});

// POST /api/calling/initiate
router.post('/initiate', async (req, res) => {
  try {
    const { to, sdpOffer } = req.body;
    const tenant = req.tenant;

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/calls`,
      {
        messaging_product: 'whatsapp',
        to,
        action: 'connect',
        session: { sdp_type: 'offer', sdp: sdpOffer }
      },
      { headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` } }
    );

    const callId = response.data.calls[0].id;
    await CallingSession.create({
      tenantId: tenant._id,
      callId,
      customerPhone: to,
      direction: 'BUSINESS_INITIATED',
      status: 'initiated',
      startedAt: new Date()
    });

    if (global.io) {
      global.io.to(tenant._id.toString()).emit('call_initiated', { callId, customerPhone: to });
    }

    res.json({ success: true, callId });
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// POST /api/calling/accept
router.post('/accept', async (req, res) => {
  try {
    const { callId, sdpAnswer } = req.body;
    const tenant = req.tenant;

    await axios.post(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/calls`,
      {
        messaging_product: 'whatsapp',
        call_id: callId,
        action: 'accept',
        session: { sdp_type: 'answer', sdp: sdpAnswer }
      },
      { headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Accept call error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to answer call' });
  }
});

// POST /api/calling/terminate
router.post('/terminate', async (req, res) => {
  try {
    const { callId } = req.body;
    const tenant = req.tenant;

    await axios.post(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/calls`,
      { messaging_product: 'whatsapp', call_id: callId, action: 'terminate' },
      { headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` } }
    );

    await CallingSession.findOneAndUpdate({ callId }, { status: 'terminated', endedAt: new Date() });

    if (global.io) {
      global.io.to(tenant._id.toString()).emit('call_ended', { callId });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/calling/request-permission
router.post('/request-permission', async (req, res) => {
  try {
    const { to, bodyText } = req.body;
    const tenant = req.tenant;

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'call_permission_request',
          action: { name: 'call_permission_request' },
          body: { text: bodyText || 'We would like to call you to assist you better.' }
        }
      },
      { headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` } }
    );

    res.json({ success: true, messageId: response.data.messages[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/calling/permission-status
router.get('/permission-status', async (req, res) => {
  try {
    const { phone } = req.query;
    const tenant = req.tenant;

    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/call_permissions`,
      {
        params: { user_wa_id: phone },
        headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` }
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/calling/ice-candidate
router.post('/ice-candidate', async (req, res) => {
  try {
    const { callId, candidate, direction } = req.body;
    const tenant = req.tenant;

    if (!callId || !candidate) {
      return res.status(400).json({ error: 'callId and candidate are required' });
    }

    await axios.post(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/calls`,
      {
        messaging_product: 'whatsapp',
        call_id: callId,
        action: 'ice_candidates',
        session: {
          ice_candidates: [candidate]
        }
      },
      { headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('ICE candidate error:', error.response?.data || error.message);
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
