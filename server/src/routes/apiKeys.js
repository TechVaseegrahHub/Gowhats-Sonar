const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ApiKey = require('../models/ApiKey');
const ApiKeyUsage = require('../models/ApiKeyUsage');

// Get all API keys for tenant
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

// Create new API key
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
    
    if (!name) {
      return res.status(400).json({ error: 'API key name is required' });
    }
    
    // Generate new API key
    const { key, hashedKey, prefix } = ApiKey.generateKey();
    
    // Calculate expiration date if specified
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }
    
    // Create API key
    const apiKey = new ApiKey({
      tenantId: req.user.tenant_id,
      name,
      key, // Store temporarily to return to user
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
    
    // Return the full key only once (it won't be stored in plain text)
    res.status(201).json({
      success: true,
      message: 'API key created successfully. Please save this key securely - it will not be shown again.',
      apiKey: {
        id: apiKey._id,
        name: apiKey.name,
        key: key, // ⚠️ Only shown once!
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

// Update API key
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions, isActive, rateLimit, ipWhitelist, webhookUrl } = req.body;
    
    const apiKey = await ApiKey.findOne({
      _id: id,
      tenantId: req.user.tenant_id,
      revokedAt: null
    });
    
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    // Update fields
    if (name) apiKey.name = name;
    if (permissions) apiKey.permissions = permissions;
    if (typeof isActive === 'boolean') apiKey.isActive = isActive;
    if (rateLimit) apiKey.rateLimit = { ...apiKey.rateLimit, ...rateLimit };
    if (ipWhitelist) apiKey.ipWhitelist = ipWhitelist;
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

// Revoke API key
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
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
    
    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// Get API key usage statistics
router.get('/:id/usage', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 7 } = req.query;
    
    const apiKey = await ApiKey.findOne({
      _id: id,
      tenantId: req.user.tenant_id
    });
    
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
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
      usage: usage,
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
