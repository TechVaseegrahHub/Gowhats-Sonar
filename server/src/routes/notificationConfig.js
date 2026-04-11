const express = require('express');
const router = express.Router();
const NotificationConfig = require('../models/NotificationConfig');
const auth = require('../middleware/auth');

// Get Configuration
router.get('/', auth, async (req, res) => {
  try {
    let config = await NotificationConfig.findOne({ tenantId: req.user.tenant_id });
    if (!config) {
      config = await NotificationConfig.create({ tenantId: req.user.tenant_id });
    }
    res.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save Configuration
router.post('/', auth, async (req, res) => {
  try {
    const { packing, tracking, holding } = req.body;
    
    // Upsert the configuration
    const config = await NotificationConfig.findOneAndUpdate(
      { tenantId: req.user.tenant_id },
      { $set: { packing, tracking, holding } },
      { new: true, upsert: true }
    );
    
    res.json(config);
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
