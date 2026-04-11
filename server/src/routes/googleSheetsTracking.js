const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireProModule } = require('../middleware/subscriptionMiddleware');
const {
  getTenantTrackingSheetConfig,
  saveTenantTrackingSheetConfig,
  syncTrackingFromGoogleSheet
} = require('../services/googleSheetsTrackingService');

const GOOGLE_SHEETS_TRACKING_LOGS_ENABLED =
  String(process.env.GOOGLE_SHEETS_TRACKING_LOGS_ENABLED ?? 'false').toLowerCase() === 'true';

function errorGoogleSheetsTracking(...args) {
  if (GOOGLE_SHEETS_TRACKING_LOGS_ENABLED) console.error(...args);
}

router.use(requireProModule('tracking'));

router.get('/config', auth, async (req, res) => {
  try {
    const config = await getTenantTrackingSheetConfig(req.user.tenant_id);
    return res.json({ success: true, config });
  } catch (error) {
    errorGoogleSheetsTracking('Google Sheets config fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.put('/config', auth, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid config payload' });
    }

    const config = await saveTenantTrackingSheetConfig(req.user.tenant_id, req.body);
    return res.json({
      success: true,
      message: 'Google Sheets tracking config updated',
      config
    });
  } catch (error) {
    errorGoogleSheetsTracking('Google Sheets config update error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/sync', auth, async (req, res) => {
  try {
    const result = await syncTrackingFromGoogleSheet({
      tenantId: req.user.tenant_id,
      dryRun: !!req.body?.dryRun,
      ignoreEnabled: !!req.body?.ignoreEnabled,
      initiatedBy: 'api',
      silent: true
    });

    return res.json({
      success: true,
      message: 'Google Sheets sync completed',
      result
    });
  } catch (error) {
    errorGoogleSheetsTracking('Google Sheets sync error:', error);
    const statusCode = Number(error?.statusCode || error?.response?.status || 500);
    return res.status(statusCode).json({
      error: error.message || 'Google Sheets sync failed',
      details: error?.details || null
    });
  }
});

module.exports = router;

