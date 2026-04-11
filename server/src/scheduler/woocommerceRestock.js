const cron = require('node-cron');
const {
  processDueWooCommerceRestockDispatches
} = require('../services/woocommerceRestockService');

let schedulerRunning = false;

function isSchedulerEnabled() {
  const value = String(process.env.WOOCOMMERCE_RESTOCK_SCHEDULER_ENABLED || 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(value);
}

function startWooCommerceRestockScheduler() {
  if (!isSchedulerEnabled()) {
    console.log('🧃 WooCommerce restock scheduler disabled by env');
    return;
  }

  console.log('🧃 Initializing WooCommerce restock scheduler (every minute)');

  cron.schedule('* * * * *', async () => {
    if (schedulerRunning) {
      console.log('🧃 WooCommerce restock scheduler is still running, skipping this tick');
      return;
    }

    schedulerRunning = true;

    try {
      await processDueWooCommerceRestockDispatches();
    } catch (error) {
      console.error('🧃 WooCommerce restock scheduler error:', error.message);
    } finally {
      schedulerRunning = false;
    }
  });
}

module.exports = {
  startWooCommerceRestockScheduler
};

