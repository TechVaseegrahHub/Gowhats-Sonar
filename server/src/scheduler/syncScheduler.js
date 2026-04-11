// scheduler/syncScheduler.js
const cron = require('node-cron');
const whatsappSync = require('../services/whatsappSync');

/**
 * Schedule automatic product syncing to WhatsApp
 * @param {String} schedule - Cron schedule expression (default: every hour)
 */
const scheduleSyncTask = (schedule = '0 * * * *') => {
  console.log(`Scheduling WhatsApp sync with schedule: ${schedule}`);
  
  // cron.schedule(schedule, async () => {
  //   console.log('Running scheduled WhatsApp product sync...');
  //   try {
  //     const result = await whatsappSync.syncAllUnsyncedProducts();
  //     console.log('Scheduled sync completed:', result);
  //   } catch (error) {
  //     console.error('Scheduled sync failed:', error);
  //   }
  // });
};

module.exports = { scheduleSyncTask };