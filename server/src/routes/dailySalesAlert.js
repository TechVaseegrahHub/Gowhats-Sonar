const express = require('express');
const router = express.Router();
const { getConfig, saveConfig, triggerNow } = require('../controllers/dailySalesAlertController');
const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenantMiddleware');

router.get('/config', authMiddleware, tenantMiddleware, getConfig);
router.post('/config', authMiddleware, tenantMiddleware, saveConfig);
router.post('/trigger', authMiddleware, tenantMiddleware, triggerNow);

module.exports = router;
