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
    res.json({ enabled: tenant?.deviceSecurity?.enabled === true });
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

    const mongoose = require('mongoose');
    const userId   = new mongoose.Types.ObjectId(req.user.id || req.user._id);
    const tenantId = req.user.tenant_id;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant || tenant.deviceSecurity?.enabled !== true) {
      // Security disabled — let them straight in using their deviceRole
      const user = await User.findById(userId).select('deviceRole');
      return res.json({
        registered: true,
        role: user?.deviceRole || req.user.deviceRole || 'customer_care',
        securityEnabled: false
      });
    }

    // Check if THIS user already registered THIS device
    const existing = await DeviceSession.findOne({
      device_id: deviceId,
      account_id: userId,
      is_active: true
    });

    if (existing) {
      return res.json({
        registered: true,
        role: existing.role,
        session_name: existing.session_name,
        securityEnabled: true,
      });
    }

    // Has this user registered ANY device before? (existing user, new device)
    const previousSession = await DeviceSession.findOne({
      account_id: userId,
      tenant_id: tenantId,
      is_active: true
    }).sort({ created_at: -1 });

    return res.json({
      registered: false,
      isExistingUser: !!previousSession,
      inheritedRole: previousSession?.role || req.user.deviceRole || 'customer_care',
      securityEnabled: true,
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

    const {
      session_name, role, access_code,
      browser, os, gpu, cpu_cores, ram,
      isExistingUser, person_name
    } = req.body;

    const userId   = req.user.id || req.user._id;
    const tenantId = req.user.tenant_id;

    if (!userId) return res.status(401).json({ message: 'Invalid token — user ID missing' });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    let finalPersonName = person_name || req.user.name || '';
    let finalRole = role;

    // ── PIN VALIDATION ──────────────────────────────────────
    if (tenant.deviceSecurity?.enabled === true) {
      if (!access_code) return res.status(400).json({ message: 'Access code is required' });

      const incomingCode = String(access_code).trim();

      if (isExistingUser) {
        // Check if ANY PIN is set for this account. (In case an admin reset all PINs)
        const anyPinExists = await DeviceSession.findOne({
          account_id: userId,
          tenant_id: tenantId,
          is_active: true,
          access_code: { $exists: true, $ne: null, $gt: '' }
        });

        if (!anyPinExists) {
          // No PINs exist yet. Accept this as a new PIN but inherit the profile.
          const prev = await DeviceSession.findOne({
            account_id: userId,
            tenant_id: tenantId,
            is_active: true,
          }).sort({ created_at: -1 });
          
          if (prev) {
            finalRole = prev.role;
            finalPersonName = prev.person_name;
          }
        } else {
          // Validate the PIN matches one of the active profiles on this shared account
          const matchedSession = await DeviceSession.findOne({
            account_id: userId,
            tenant_id: tenantId,
            is_active: true,
            access_code: incomingCode
          });

          if (!matchedSession) {
            return res.status(403).json({ message: 'Invalid access code' });
          }

          // Automatically inherit the profile from the session that matched the PIN
          finalRole = matchedSession.role;
          finalPersonName = matchedSession.person_name;
        }
      } else {
        // New user profile. Check for PIN collision on this shared account
        const pinInUse = await DeviceSession.findOne({
          account_id: userId,
          tenant_id: tenantId,
          is_active: true,
          access_code: incomingCode
        });

        if (pinInUse) {
          return res.status(400).json({ message: 'This PIN is already used by someone else in your workspace. Please choose a different one.' });
        }
      }
    } else {
      // Security is disabled. If existing user, inherit from last session.
      if (isExistingUser) {
        const prev = await DeviceSession.findOne({
          account_id: userId,
          tenant_id: tenantId,
          is_active: true,
        }).sort({ created_at: -1 });
        
        finalRole = prev?.role || role;
        if (prev?.person_name) finalPersonName = prev.person_name;
      }
    }

    if (!finalRole) finalRole = req.user.deviceRole || role || 'customer_care';

    // ── SAVE SESSION ────────────────────────────────────────
    const rawIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || '';

    const session = await DeviceSession.findOneAndUpdate(
      { device_id: deviceId, account_id: userId },
      {
        device_id:    deviceId,
        account_id:   userId,
        tenant_id:    tenantId,
        session_name: session_name || 'Unknown Device',
        person_name:  finalPersonName,
        role:         finalRole,
        access_code:  tenant.deviceSecurity?.enabled
                        ? String(access_code).trim()
                        : null,
        browser:      browser   || '',
        os:           os        || '',
        gpu:          gpu       || '',
        cpu_cores:    cpu_cores || 0,
        ram:          ram       || 0,
        ip_address:   maskIp(rawIp),
        is_online:    true,
        last_seen_at: new Date(),
        is_active:    true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Also update the user's deviceRole in User model to keep in sync
    await User.findByIdAndUpdate(userId, { deviceRole: finalRole });

    console.log(`✅ Registered: ${session.person_name} | ${finalRole} | device: ${session.session_name}`);
    return res.status(201).json({ message: 'Device registered', role: session.role });

  } catch (err) {
    console.error('Device register error:', err);
    if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
    return res.status(500).json({ message: 'Server error' });
  }
});


// ─── POST /api/devices/heartbeat ─────────────────────────
router.post('/heartbeat', auth, heartbeatLimiter, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ message: 'X-Device-ID header required' });
    const userId = req.user.id || req.user._id;
    await DeviceSession.findOneAndUpdate(
      { device_id: deviceId, account_id: userId },
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
    const userId = req.user.id || req.user._id;
    await DeviceSession.findOneAndUpdate(
      { device_id: deviceId, account_id: userId },
      { is_online: false, last_seen_at: new Date() }
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/devices (admin only) ────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
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
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    await DeviceSession.updateMany(
      { device_id: req.params.device_id, tenant_id: req.user.tenant_id },
      { is_active: false, is_online: false }
    );
    return res.json({ message: 'Device deactivated' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/devices/reset-code (admin only) ────────────
// Clears a user's PIN from ALL their sessions so they can set a new one
router.post('/reset-code', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    // ✅ Clear PIN from DeviceSession (NOT User model)
    await DeviceSession.updateMany(
      { account_id: userId, tenant_id: req.user.tenant_id },
      { $unset: { access_code: '' } }
    );
    return res.json({ success: true, message: 'PIN reset. User can set a new one on next login.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
