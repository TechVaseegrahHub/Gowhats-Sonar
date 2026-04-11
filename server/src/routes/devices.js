const express = require('express');
const router = express.Router();
const DeviceSession = require('../models/DeviceSession');
const Tenant = require('../models/Tenant');
const User = require('../models/User'); 
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const heartbeatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const maskIp = (ip = '') => {
  if (!ip) return '';
  const parts = ip.split('.');
  if (parts.length === 4) { parts[3] = 'xxx'; return parts.join('.'); }
  return ip.replace(/:[^:]+$/, ':xxxx');
};

// ─── GET /api/devices/settings ────────────────────────────
router.get('/settings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const tenant = await Tenant.findById(req.user.tenant_id);
    res.json({
      // 👇 Defaults to FALSE if undefined
      enabled: tenant?.deviceSecurity?.enabled === true, 
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/devices/settings ───────────────────────────
router.post('/settings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const { enabled } = req.body;

    await Tenant.findByIdAndUpdate(req.user.tenant_id, {
      'deviceSecurity.enabled': enabled,
      'deviceSecurity.updatedAt': new Date()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/devices/check ───────────────────────────────
router.get('/check', auth, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ message: 'X-Device-ID header required' });

    const tenantId = req.user.tenant_id;

    // 👇 If disabled (default), bypass modal completely
    const tenant = await Tenant.findById(tenantId);
    if (!tenant || tenant.deviceSecurity?.enabled !== true) {
      return res.json({ registered: true, role: req.user.role });
    }

    const existing = await DeviceSession.findOne({ device_id: deviceId, is_active: true });
    if (existing) {
      return res.json({
        registered: true,
        role: existing.role,
        session_name: existing.session_name,
      });
    }

    const previousSession = await DeviceSession
      .findOne({ account_id: req.user.id, tenant_id: tenantId, is_active: true })
      .sort({ created_at: -1 });

    return res.json({
      registered: false,
      isExistingUser: !!previousSession,
      inheritedRole: previousSession?.role || null,
    });
  } catch (err) {
    console.error('Device check error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/devices/register ──────────────────────────
router.post('/register', auth, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ message: 'X-Device-ID header required' });

    const { session_name, role, access_code, browser, os, gpu, cpu_cores, ram, isExistingUser } = req.body;

    const tenant = await Tenant.findById(req.user.tenant_id);
    const user = await User.findById(req.user.id);

    if (!tenant || !user) return res.status(404).json({ message: 'Account not found' });

    // 1. Verify / Set User's Personal Access Code (Only if enabled)
    if (tenant.deviceSecurity?.enabled === true) {
      if (!access_code) {
        return res.status(400).json({ message: 'Access code is required' });
      }

      // If the user has never set an access code, save this one
      if (!user.access_code) {
        user.access_code = String(access_code);
        await user.save();
      } 
      // If they already have one, verify it matches
      else if (String(access_code) !== String(user.access_code)) {
        return res.status(403).json({ message: 'Invalid access code' });
      }
    }

    // 2. Resolve Role
    let finalRole = role;
    if (isExistingUser) {
      const prev = await DeviceSession.findOne({ account_id: req.user.id, tenant_id: req.user.tenant_id });
      finalRole = prev?.role || req.user.role || 'customer_care';
    }

    if (!finalRole) return res.status(400).json({ message: 'Role is required' });

    // 3. Register Session
    const rawIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || '';
    const session = await DeviceSession.findOneAndUpdate(
      { device_id: deviceId },
      {
        device_id: deviceId,
        account_id: req.user.id,
        tenant_id: req.user.tenant_id,
        session_name: session_name || 'Unknown Device',
        role: finalRole,
        browser: browser || '',
        os: os || '',
        gpu: gpu || '',
        cpu_cores: cpu_cores || 0,
        ram: ram || 0,
        ip_address: maskIp(rawIp),
        is_online: true,
        last_seen_at: new Date(),
        is_active: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ message: 'Device registered', role: session.role });
  } catch (err) {
    console.error('Device register error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/devices/heartbeat ─────────────────────────
router.post('/heartbeat', auth, heartbeatLimiter, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ message: 'X-Device-ID header required' });

    await DeviceSession.findOneAndUpdate(
      { device_id: deviceId, account_id: req.user.id },
      { is_online: true, last_seen_at: new Date() }
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/devices/logout ─────────────────────────────
router.post('/logout', auth, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ message: 'X-Device-ID header required' });

    await DeviceSession.findOneAndUpdate(
      { device_id: deviceId, account_id: req.user.id },
      { is_online: false, last_seen_at: new Date() }
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/devices ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const sessions = await DeviceSession
      .find({ tenant_id: req.user.tenant_id, is_active: true })
      .populate('account_id', 'name email')
      .sort({ last_seen_at: -1 });
    return res.json(sessions);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE /api/devices/:device_id ──────────────────────
router.delete('/:device_id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    await DeviceSession.findOneAndUpdate(
      { device_id: req.params.device_id, tenant_id: req.user.tenant_id },
      { is_active: false, is_online: false }
    );
    return res.json({ message: 'Device deactivated' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
