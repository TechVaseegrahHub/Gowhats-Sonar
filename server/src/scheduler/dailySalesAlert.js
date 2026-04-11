const cron = require('node-cron');
const Settings = require('../models/settings');
const { sendDailySalesReport } = require('../controllers/dailySalesAlertController');

const startDailySalesAlertScheduler = () => {
  console.log('📊 Initializing Daily Sales Alert Scheduler...');

  // Runs every minute to check if any tenant's sendTime matches current HH:MM
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const hh = String(istNow.getUTCHours()).padStart(2, '0');
      const mm = String(istNow.getUTCMinutes()).padStart(2, '0');
      const todayStr = istNow.toISOString().slice(0, 10);

      const currentTime = `${hh}:${mm}`;

      // Find all tenants with enabled dailySalesAlert whose sendTime matches NOW
      const matchingSettings = await Settings.find({
        'dailySalesAlert.enabled': true,
        'dailySalesAlert.sendTime': currentTime
      });

      for (const setting of matchingSettings) {
        const tenantId = setting.tenant_id;
        const alertConfig = setting.dailySalesAlert;

        // Skip if already sent today
        if (alertConfig.lastSentDate === todayStr) {
          continue;
        }

        // Mark as sent for today FIRST to prevent duplicate sends
        await Settings.findOneAndUpdate(
          { tenant_id: tenantId },
          { $set: { 'dailySalesAlert.lastSentDate': todayStr } }
        );

        try {
          console.log(`📊 [DailySalesAlert] Sending report for tenant: ${tenantId}`);
          const result = await sendDailySalesReport(tenantId);
          if (result.success) {
            console.log(`✅ [DailySalesAlert] Report sent for tenant ${tenantId}:`, result.results);
          } else {
            console.warn(`⚠️ [DailySalesAlert] Skipped tenant ${tenantId}: ${result.reason}`);
          }
        } catch (err) {
          console.error(`❌ [DailySalesAlert] Error for tenant ${tenantId}:`, err.message);
        }
      }
    } catch (error) {
      console.error('❌ [DailySalesAlert] Cron Error:', error.message);
    }
  });
};

module.exports = { startDailySalesAlertScheduler };
