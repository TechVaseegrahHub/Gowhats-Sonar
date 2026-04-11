const express = require('express');
const router = express.Router();
const Catalog = require('../models/settings');
const Tenant = require('../models/Tenant'); // ✅ Added for Debugging
const axios = require('axios'); // ✅ Added for Debugging

// =================================================================
// 🛠️ DEBUG PAYMENT CONFIGURATION (Use this to fix Error 131009)
// =================================================================
router.get('/debug-payment/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    // 1. Fetch Tenant to get Access Token
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (!tenant.whatsappConfig?.accessToken || !tenant.whatsappConfig?.businessAccountId) {
        return res.status(400).json({ error: 'WhatsApp Config missing in Tenant' });
    }

    const url = `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.businessAccountId}/payment_configurations`;
    
    console.log(`🔍 Querying Meta API for Payment Configs...`);

    // 2. Call Meta API
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` }
    });

    // 3. Return the List
    res.json({
        success: true,
        source: 'Meta API',
        data: response.data.data
    });

  } catch (error) {
    console.error("❌ Debug API Error:", error.response?.data || error.message);
    res.status(500).json(error.response?.data || { error: error.message });
  }
});

// =================================================================
// 🚨 SPECIFIC ROUTES (Must be before /:id)
// =================================================================

// 1. GET: Fetch Automation Configuration (For Packing Toggle)
router.get('/automation-config', async (req, res) => {
  try {
    const { tenantId, type } = req.query;
    const targetTenantId = tenantId || req.tenantId; 

    if (!targetTenantId) return res.status(400).json({ error: 'Tenant ID is required' });

    const settings = await Catalog.findOne({ tenant_id: targetTenantId });
    if (!settings) return res.json({ [type]: { enabled: false } });

    const config = settings.automationConfig?.[type] || { enabled: false };
    res.json({ [type]: config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. POST: Toggle Automation On/Off
router.post('/toggle-automation', async (req, res) => {
  try {
    const { tenantId, type, enabled } = req.body;
    const targetTenantId = tenantId || req.tenantId;

    if (!targetTenantId || !type) return res.status(400).json({ error: 'Tenant ID required' });

    const updatePath = `automationConfig.${type}.enabled`;
    const updatedSettings = await Catalog.findOneAndUpdate(
      { tenant_id: targetTenantId },
      { $set: { [updatePath]: enabled } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, settings: updatedSettings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. GET: Get flow configuration
router.get('/flow/config', async (req, res) => {
  try {
    const settings = await Catalog.findOne({ tenant_id: req.tenantId });
    if (!settings) return res.status(404).json({ success: false });

    res.status(200).json({
      success: true,
      flowConfig: settings.flowConfig || {}
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. POST: Test flow configuration
router.post('/flow/test', async (req, res) => {
  try {
    const settings = await Catalog.findOne({ tenant_id: req.tenantId });
    if (!settings?.flowConfig?.orderCompletionFlowId) {
      return res.status(400).json({ success: false, message: "Flow ID not configured" });
    }
    res.status(200).json({ success: true, message: "Valid", flowConfig: settings.flowConfig });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =================================================================
// GENERIC ROUTES
// =================================================================

// Get all
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.tenant && req.tenant._id?.toString());
    if (!tenantId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const catalogs = await Catalog.find({ tenant_id: tenantId });
    res.status(200).json({ success: true, catalogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new
router.post('/', async (req, res) => {
  try {
    const existingSettings = await Catalog.findOne({ tenant_id: req.tenantId });
    if (existingSettings) return res.status(400).json({ success: false, message: "Use PUT" });

    const newCatalog = new Catalog({
      tenant_id: req.tenantId,
      ...req.body,
      flowConfig: { ...req.body.flowConfig, lastFlowUpdate: new Date() }
    });

    const savedCatalog = await newCatalog.save();
    res.status(201).json({ success: true, item: savedCatalog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const updatedCatalog = await Catalog.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedCatalog) return res.status(404).json({ success: false });
    res.status(200).json({ success: true, item: updatedCatalog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single (WILDCARD - MUST BE LAST)
router.get('/:id', async (req, res) => {
  try {
    const catalog = await Catalog.findOne({ _id: req.params.id, tenant_id: req.tenantId });
    if (!catalog) return res.status(404).json({ success: false });
    res.status(200).json({ success: true, catalog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
