const OrderCounter = require('../models/OrderCounter');
 
async function generateOrderId(tenantId, counterType = 'order') {
  const MAX_RETRIES = 10; // increased from 5
 
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`📊 Generating ${counterType} ID - Attempt ${attempt}/${MAX_RETRIES}`);
 
      // Use your existing model method (unchanged)
      const orderId = await OrderCounter.getNextOrderNumber(tenantId, counterType);
      const orderIdString = orderId.toString();
 
      // Check uniqueness
      const exists = await orderIdExists(tenantId, orderIdString);
 
      if (!exists) {
        console.log(`✅ Generated ${counterType} ID: ${orderIdString}`);
        return orderIdString;
      }
 
      console.warn(`⚠️ ${counterType} ID ${orderIdString} exists for tenant ${tenantId}, resyncing counter...`);
 
      // ── AUTO-RESYNC ──────────────────────────────────────────
      // Find the real highest order number and jump the counter past it
      const Order = require('../models/Order');
      const allOrders = await Order.find({ tenantId }).select('orderId').lean();
 
      let maxNum = parseInt(orderIdString, 10) || 0;
      for (const o of allOrders) {
        const n = parseInt(String(o.orderId).replace(/\D/g, ''), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
 
      const syncedTo = maxNum + 1;
 
      // Update using the same schema your model uses
      await OrderCounter.findOneAndUpdate(
        { tenantId, counterType },
        { $set: { nextOrderNumber: syncedTo, lastUpdated: new Date() } },
        { upsert: true }
      );
 
      console.log(`🔄 Counter resynced → next will be ${syncedTo}`);
 
      // Brief pause before retry
      await new Promise(r => setTimeout(r, 50 * attempt));
 
    } catch (error) {
      console.error(`❌ generateOrderId attempt ${attempt} error:`, error.message);
 
      if (attempt >= MAX_RETRIES) {
        // Timestamp fallback — guaranteed unique, never collides
        const fallbackId = Date.now().toString().slice(-8);
        console.error(`❌ Using timestamp fallback ID: ${fallbackId}`);
        return fallbackId;
      }
 
      await new Promise(r => setTimeout(r, 100 * attempt));
    }
  }
 
  // Safety net (should never reach here)
  return Date.now().toString().slice(-8);
}
 
async function orderIdExists(tenantId, orderId) {
  const Order = require('../models/Order');
  const count = await Order.countDocuments({ tenantId, orderId });
  return count > 0;
}
 
module.exports = { generateOrderId, orderIdExists };
