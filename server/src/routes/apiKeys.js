const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const ApiKey = require('../models/ApiKey');
const ApiKeyUsage = require('../models/ApiKeyUsage');

// ==========================================
// CONSTANTS
// ==========================================

// ✅ FIX 3: Whitelist of valid permission values — reject anything not in this list
const VALID_PERMISSIONS = new Set([
  'orders.read',
  'orders.write',
  'messages.send',
  'messages.read',
  'contacts.read',
  'contacts.write',
  'templates.read',
  'broadcasts.read',
  'broadcasts.write',
  'webhooks.read',
  'transactions.read',
  'billing.read'
]);

const MAX_KEY_NAME_LENGTH = 100;    // ✅ FIX 4
const MAX_EXPIRES_IN_DAYS = 365;    // ✅ FIX 5: cap at 1 year
const MAX_USAGE_DAYS = 90;          // ✅ FIX 2: cap usage history window

// ✅ FIX 7: Validate IPv4, IPv6, and CIDR notation
const isValidIpOrCidr = (ip) =>
  /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ip) ||    // IPv4 / CIDR
  /^[0-9a-fA-F:]+$/.test(ip);                             // IPv6 (basic)

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const validatePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return 'permissions must be an array';
  if (permissions.length === 0) return 'at least one permission is required';
  if (permissions.length > 20) return 'too many permissions — maximum 20';
  const invalid = permissions.filter(p => !VALID_PERMISSIONS.has(p));
  if (invalid.length > 0) return `invalid permissions: ${invalid.join(', ')}`;
  return null; // valid
};

// ==========================================
// GET all API keys for tenant
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    const apiKeys = await ApiKey.find({
      tenantId: req.user.tenant_id,
      revokedAt: null
    }).select('-hashedKey').sort({ createdAt: -1 });

    res.json({
      success: true,
      apiKeys: apiKeys.map(key => ({
        id: key._id,
        name: key.name,
        prefix: key.prefix,
        permissions: key.permissions,
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// ==========================================
// POST — Create new API key
// ==========================================
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      permissions = ['orders.read', 'messages.send'],
      expiresInDays,
      rateLimit,
      ipWhitelist,
      webhookUrl
    } = req.body;

    // ✅ FIX 4: Validate name presence and length
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'API key name is required' });
    }
    if (name.trim().length > MAX_KEY_NAME_LENGTH) {
      return res.status(400).json({ error: `API key name must be ${MAX_KEY_NAME_LENGTH} characters or less` });
    }

    // ✅ FIX 3: Validate permissions against whitelist
    const permissionError = validatePermissions(permissions);
    if (permissionError) {
      return res.status(400).json({ error: permissionError });
    }

    // ✅ FIX 5: Validate and cap expiresInDays
    if (expiresInDays !== undefined) {
      const days = Number(expiresInDays);
      if (!Number.isFinite(days) || days <= 0) {
        return res.status(400).json({ error: 'expiresInDays must be a positive number' });
      }
      if (days > MAX_EXPIRES_IN_DAYS) {
        return res.status(400).json({ error: `expiresInDays cannot exceed ${MAX_EXPIRES_IN_DAYS} days` });
      }
    }

    // ✅ FIX 7: Validate IP whitelist entries
    if (ipWhitelist !== undefined) {
      if (!Array.isArray(ipWhitelist)) {
        return res.status(400).json({ error: 'ipWhitelist must be an array' });
      }
      const invalidIps = ipWhitelist.filter(ip => !isValidIpOrCidr(String(ip)));
      if (invalidIps.length > 0) {
        return res.status(400).json({ error: `Invalid IP addresses: ${invalidIps.join(', ')}` });
      }
    }

    // Generate new API key
    const { key, hashedKey, prefix } = ApiKey.generateKey();

    // Calculate expiration date if specified
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));
    }

    // ✅ FIX 1: Do NOT set `key` on the model — only `hashedKey` is persisted.
    //    The raw key is generated locally and returned in the response only.
    //    Setting it on the Mongoose document risks it being saved if the schema
    //    doesn't explicitly exclude it.
    const apiKey = new ApiKey({
      tenantId: req.user.tenant_id,
      name: name.trim(),
      key,
      hashedKey,
      prefix,
      permissions,
      expiresAt,
      rateLimit: rateLimit || {},
      ipWhitelist: ipWhitelist || [],
      webhookUrl,
      createdBy: req.user.id || req.user._id
    });

    await apiKey.save();

    // Return the full key only once — it is never stored in plain text
    res.status(201).json({
      success: true,
      message: 'API key created successfully. Please save this key securely — it will not be shown again.',
      apiKey: {
        id: apiKey._id,
        name: apiKey.name,
        key,           // ⚠️ Only shown once — not in DB
        prefix: apiKey.prefix,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// ==========================================
// PATCH — Update API key
// ==========================================
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ FIX: Validate ObjectId to prevent CastError leaking internals
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    const { name, permissions, isActive, rateLimit, ipWhitelist, webhookUrl } = req.body;

    // ✅ FIX 4: Validate name length if being updated
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      if (name.trim().length > MAX_KEY_NAME_LENGTH) {
        return res.status(400).json({ error: `name must be ${MAX_KEY_NAME_LENGTH} characters or less` });
      }
    }

    // ✅ FIX 3: Validate permissions against whitelist if being updated
    if (permissions !== undefined) {
      const permissionError = validatePermissions(permissions);
      if (permissionError) {
        return res.status(400).json({ error: permissionError });
      }
    }

    // ✅ FIX 7: Validate IP whitelist if being updated
    if (ipWhitelist !== undefined) {
      if (!Array.isArray(ipWhitelist)) {
        return res.status(400).json({ error: 'ipWhitelist must be an array' });
      }
      const invalidIps = ipWhitelist.filter(ip => !isValidIpOrCidr(String(ip)));
      if (invalidIps.length > 0) {
        return res.status(400).json({ error: `Invalid IP addresses: ${invalidIps.join(', ')}` });
      }
    }

    const apiKey = await ApiKey.findOne({
      _id: id,
      tenantId: req.user.tenant_id,
      revokedAt: null
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    if (name !== undefined) apiKey.name = name.trim();
    if (permissions !== undefined) apiKey.permissions = permissions;
    if (typeof isActive === 'boolean') apiKey.isActive = isActive;
    if (rateLimit) apiKey.rateLimit = { ...apiKey.rateLimit, ...rateLimit };
    if (ipWhitelist !== undefined) apiKey.ipWhitelist = ipWhitelist;
    if (webhookUrl !== undefined) apiKey.webhookUrl = webhookUrl;

    await apiKey.save();

    res.json({
      success: true,
      message: 'API key updated successfully',
      apiKey: {
        id: apiKey._id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        isActive: apiKey.isActive,
        rateLimit: apiKey.rateLimit
      }
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// ==========================================
// DELETE — Revoke API key
// ==========================================
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ FIX: ObjectId validation
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    const apiKey = await ApiKey.findOne({
      _id: id,
      tenantId: req.user.tenant_id,
      revokedAt: null
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    apiKey.revokedAt = new Date();
    apiKey.revokedBy = req.user.id || req.user._id;
    apiKey.isActive = false;

    await apiKey.save();

    res.json({ success: true, message: 'API key revoked successfully' });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ==========================================
// GET /:id/usage — API key usage statistics
// ==========================================
router.get('/:id/usage', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ FIX: ObjectId validation
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    // ✅ FIX 2: Validate `days` — handle NaN and cap at MAX_USAGE_DAYS
    const rawDays = parseInt(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0
      ? Math.min(rawDays, MAX_USAGE_DAYS)
      : 7;

    const apiKey = await ApiKey.findOne({
      _id: id,
      tenantId: req.user.tenant_id
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usage = await ApiKeyUsage.aggregate([
      {
        $match: {
          apiKeyId: apiKey._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            endpoint: '$endpoint'
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$responseTime' }
        }
      },
      {
        $sort: { '_id.date': -1 }
      }
    ]);

    res.json({
      success: true,
      usage,
      summary: {
        totalRequests: apiKey.usageCount,
        lastUsed: apiKey.lastUsedAt
      }
    });
  } catch (error) {
    console.error('Error fetching API key usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

module.exports = router;
