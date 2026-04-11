const cron = require('node-cron');
const Order = require('../models/Order');
const Settings = require('../models/settings');
const WhatsAppService = require('../services/whatsappServices');
const Tenant = require('../models/Tenant');

const startAbandonedCartScheduler = () => {
  console.log('🛒 Initializing Abandoned Cart Scheduler...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const allSettings = await Settings.find({ 'automationConfig.abandonedCart.enabled': true });

      for (const setting of allSettings) {
        const tenantId = setting.tenant_id;
        const config = setting.automationConfig.abandonedCart;
        
        const delayMs = (config.delayMinutes || 30) * 60 * 1000;
        const thresholdTime = new Date(Date.now() - delayMs);

        // Find Candidates
        const abandonedOrders = await Order.find({
          tenantId: tenantId,
          status: 'pending',
          paymentStatus: 'pending',
          createdAt: { $lte: thresholdTime },
          'metadata.abandonedCartSent': { $ne: true } 
        }).limit(10);

        if (abandonedOrders.length === 0) continue;

        const tenant = await Tenant.findById(tenantId);
        if (!tenant || !tenant.whatsappConfig?.accessToken) continue;

        const whatsappService = new WhatsAppService(tenant);

        for (const order of abandonedOrders) {
          // Atomic Lock
          const updatedOrder = await Order.findOneAndUpdate(
            { _id: order._id, 'metadata.abandonedCartSent': { $ne: true } },
            { $set: { 'metadata.abandonedCartSent': true } },
            { new: true }
          );

          if (!updatedOrder) continue;

          try {
            console.log(`🛒 Sending Abandoned Cart to ${order.customerPhone}`);
            const formattedPhone = whatsappService.formatPhoneNumber(order.customerPhone);
            
            const header = config.template.header || "⏳ Forgotten Items?";
            const body = config.template.body || "You left items in your cart.";
            const footer = config.template.footer || "Don't miss out!";
            const cta = config.template.ctaText || "Recover Order";
            const recoveryLink = `https://wa.me/${tenant.whatsappConfig.phoneNumberId}?text=Recover Order ${order.orderNumber}`;

            const msg = `*${header}*\n\n${body}\n\n_${footer}_\n\n👇 *${cta}*:\n${recoveryLink}`;
            
            await whatsappService.sendMessage(formattedPhone, msg);

          } catch (err) {
            console.error(`❌ Failed to send to ${order.orderId}:`, err.message);
          }
        }
      }
    } catch (error) {
      console.error('Cron Error:', error.message);
    }
  });
};

// ✅ THIS LINE IS CRITICAL - DO NOT MISS IT
module.exports = { startAbandonedCartScheduler };
