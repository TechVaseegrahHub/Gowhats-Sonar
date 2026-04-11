const AbandonedCart = require('../models/AbandonedCart');
const WhatsAppService = require('./whatsappServices');
const Tenant = require('../models/Tenant');
const Message = require('../models/Message');
const Order = require('../models/Order');
const Settings = require('../models/settings');
const { isEncryptionEnabled, hashPhone, normalizePhone } = require('../utils/encryption');

// In-memory map to track active timers (Key: "TenantID-PhoneNumber")
const activeTimers = new Map();
const DEFAULT_DELAY_MINUTES = 30;

// ==============================================================================
// ✅ PART 1: START OR RESTART TIMER
// ==============================================================================

/**
 * Starts a countdown timer based on Tenant Settings.
 * Call this when:
 * 1. User sends a cart message.
 * 2. User creates an order (but hasn't paid yet).
 */
const handleIncomingCart = async (tenant, contactPhone, cartData) => {
    try {
        const tenantId = tenant._id.toString();
        const key = `${tenantId}-${contactPhone}`;

        // 1. Fetch Tenant Settings for Delay
        const settings = await Settings.findOne({ tenant_id: tenantId });
        const config = settings?.automationConfig?.abandonedCart;

        // If disabled, stop.
        if (!config || !config.enabled) {
            console.log(`🚫 [Abandoned Cart] Disabled for tenant: ${tenantId}`);
            return;
        }

        // 2. Get the MINUTES from settings (or default to 30)
        const delayMinutes = config.delayMinutes || DEFAULT_DELAY_MINUTES;
        
        console.log(`⏳ [Timer Started] User: ${contactPhone} | Wait Time: ${delayMinutes} minutes`);

        // 3. Reset existing timer (Debounce/Restart logic)
        // If a timer is already running, we stop it and start a new one (giving them more time)
        if (activeTimers.has(key)) {
            clearTimeout(activeTimers.get(key));
            activeTimers.delete(key);
        }

        // 4. Set the Timer
        const timerId = setTimeout(async () => {
            // When time is up, check database status
            await checkPaymentAndSendReminder(tenant, contactPhone, cartData);
            activeTimers.delete(key);
        }, delayMinutes * 60 * 1000); // Convert minutes to milliseconds

        activeTimers.set(key, timerId);

    } catch (error) {
        console.error('❌ Error in handleIncomingCart:', error);
    }
};

// ==============================================================================
// ✅ PART 2: CANCEL TIMER (STOP)
// ==============================================================================

/**
 * Call this ONLY when Payment is SUCCESSFUL.
 * This prevents the message from sending if they actually bought the item.
 */
const cancelTimer = (tenantId, phone) => {
    try {
        const key = `${tenantId}-${phone}`;
        if (activeTimers.has(key)) {
            console.log(`🛑 [Timer Cancelled] Payment Success for ${phone}`);
            clearTimeout(activeTimers.get(key));
            activeTimers.delete(key);
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Error in cancelTimer:', error);
        return false;
    }
};

// ==============================================================================
// ✅ PART 3: CHECK STATUS & SEND (THE LOGIC)
// ==============================================================================

/**
 * This runs when the timer expires.
 * It checks if the user has PAID. If not, it sends the reminder.
 */
const checkPaymentAndSendReminder = async (tenant, phone, cartData) => {
    try {
        const tenantId = tenant._id.toString();
        console.log(`⏰ [Timer Expired] Checking payment status for ${phone}...`);

        // 1. Find the most recent order for this phone (last 24 hours)
        const cleanPhone = phone.replace(/\D/g, '');
        const phoneVariations = [
            phone, 
            cleanPhone, 
            `+${cleanPhone}`, 
            `91${cleanPhone.replace(/^91/, '')}`, 
            cleanPhone.replace(/^91/, '')
        ];

        const recentOrderQuery = {
            tenantId: tenantId,
            createdAt: { $gte: new Date(Date.now() - (24 * 60 * 60 * 1000)) }
        };

        if (isEncryptionEnabled()) {
            const hashes = phoneVariations
                .map((val) => hashPhone(normalizePhone(val)))
                .filter(Boolean);
            recentOrderQuery.customerPhoneHash = { $in: hashes };
        } else {
            recentOrderQuery.customerPhone = { $in: phoneVariations };
        }

        const recentOrder = await Order.findOne(recentOrderQuery).sort({ createdAt: -1 });

        // 2. CHECK PAYMENT STATUS
        if (recentOrder) {
            // If Payment is Completed, STOP.
            if (recentOrder.paymentStatus === 'completed' || recentOrder.status === 'confirmed' || recentOrder.status === 'paid') {
                console.log(`✅ User Paid (Order #${recentOrder.orderId}). No reminder needed.`);
                return; // STOP
            }
            
            // If Payment is Pending (even if order status is 'processing' or 'shipping_selected')
            // We CONTINUE below to send the message.
            console.log(`⚠️ Order #${recentOrder.orderId} is Unpaid (Status: ${recentOrder.status}, Payment: ${recentOrder.paymentStatus}). Sending Reminder.`);
        }

        // 3. Prepare Message Data (Amounts & Count)
        let total = 0;
        let itemCount = 0;
        let currency = 'INR';

        // Prefer Order data if available (it's more accurate)
        if (recentOrder) {
            total = recentOrder.totalAmount;
            itemCount = recentOrder.items?.length || 1;
            currency = recentOrder.currency;
        } 
        // Fallback to Cart data if order wasn't created yet
        else if (cartData && cartData.product_items) {
            total = cartData.product_items.reduce((sum, item) => sum + (Number(item.item_price) * Number(item.quantity)), 0);
            itemCount = cartData.product_items.length;
            if (cartData.product_items[0]?.currency) currency = cartData.product_items[0].currency;
        }

        // 4. Send the Reminder Message
        const whatsappService = new WhatsAppService(tenant);
        
        const result = await whatsappService.sendAbandonedCartReminder(phone, {
            customerName: recentOrder?.customerDetails?.name || 'Valued Customer', 
            cartTotal: `${currency} ${total.toFixed(2)}`,
            itemCount: itemCount,
            checkoutUrl: '' 
        });

        // 5. Save Log to Database & UI
        if (global.io && result) {
             const sentMessage = {
                tenantId: tenantId,
                to: phone,
                from: tenant.whatsappConfig?.phoneNumberId,
                type: 'interactive',
                text: `Abandoned Cart Reminder Sent (Unpaid Order)`,
                status: 'sent',
                timestamp: new Date(),
                isAbandonedCartReminder: true,
                isAutomatedMessage: true,
                messageId: result.messages?.[0]?.id
            };
            
            global.io.to(tenantId).emit('message_sent', {
                ...sentMessage,
                contact: { phone_number: phone }
            });
            
            try {
                await Message.create(sentMessage);
            } catch(e) { console.error("Error saving DB log", e); }
        }

    } catch (error) {
        console.error('❌ Error in checkPaymentAndSendReminder:', error);
    }
};

// ==============================================================================
// ✅ PART 4: WEBSITE INTEGRATION (OPTIONAL / LEGACY)
// ==============================================================================
// You can keep these functions if you use Shopify/WooCommerce website integration as well.

const extractCartDetails = (cartData, platform, integration) => {
    if (platform === 'shopify') {
        const customer = cartData.customer || {};
        const shipping_address = cartData.shipping_address || {};
        let checkoutUrl = cartData.abandoned_checkout_url || cartData.checkout_url;
        if (!checkoutUrl && integration && integration.storeUrl && cartData.token) {
            const storeUrl = integration.storeUrl.replace(/\/$/, '');
            checkoutUrl = `${storeUrl}/checkouts/cn/${cartData.token}/en-in`;
        }
        return {
            id: cartData.token,
            phone: shipping_address.phone || customer.phone || cartData.phone,
            customerName: shipping_address.first_name || customer.first_name || 'Customer',
            items: cartData.line_items || [],
            cartTotal: cartData.total_price,
            currency: cartData.currency,
            checkoutUrl: checkoutUrl || ''
        };
    }

        if (platform === 'woocommerce') {
        return {
            // Priority 1: PHP Snippet Keys | Priority 2: Standard WC Keys
            id: cartData.id?.toString() || cartData.cart_hash || Date.now().toString(),
            phone: cartData.billing_phone || cartData.billing?.phone || cartData.phone,
            customerName: cartData.billing_first_name || cartData.billing?.first_name || 'Customer',
            items: cartData.line_items || [],
            cartTotal: cartData.cart_total || cartData.total || 0,
            currency: cartData.currency || 'INR',
            checkoutUrl: cartData.checkout_url || ''
        };
    }
    return {};
};

const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('91')) cleaned = '91' + cleaned;
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
};

const scheduleReminder = async (platform, cartData, integration) => {
  try {
    const { id, phone, customerName, items, cartTotal, currency, checkoutUrl } = extractCartDetails(cartData, platform, integration);

    if (!id || !items || items.length === 0) return;

    const formattedPhone = phone ? formatPhoneNumber(phone) : null;
    if (!formattedPhone) return;

    // ✅ FIX: Use the specific delay from Integration Settings (or default to 30)
    const delayMinutes = integration.abandonedCartDelay || 30;
    
    // Calculate trigger time
    const reminderAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    console.log(`[Website Cart] Scheduling reminder for ${formattedPhone} in ${delayMinutes} mins`);

    await AbandonedCart.findOneAndUpdate(
      { cartId: id, platform: platform, tenantId: integration.tenantId },
      {
        customerPhone: formattedPhone,
        customerName: customerName,
        cartDetails: { items, total: cartTotal, currency, checkoutUrl },
        reminderAt: reminderAt,
        status: 'pending'
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('Error scheduling website reminder:', error);
  }
};


const processPendingReminders = async () => {
  try {
    const now = new Date();
    const cartsToSend = await AbandonedCart.find({ status: 'pending', reminderAt: { $lte: now } });
    
    for (const cart of cartsToSend) {
      const tenant = await Tenant.findById(cart.tenantId);
      if (!tenant) {
        cart.status = 'failed';
        await cart.save();
        continue;
      }

      // Check if they placed an order recently via other means
      const recentOrder = await Message.findOne({
        tenantId: cart.tenantId,
        to: cart.customerPhone,
        isOrderConfirmation: true,
        timestamp: { $gte: new Date(cart.createdAt) }
      });

      if (recentOrder) {
        cart.status = 'converted';
        await cart.save();
        continue;
      }

      const whatsappService = new WhatsAppService(tenant);
      try {
        await whatsappService.sendAbandonedCartReminder(cart.customerPhone, {
            customerName: cart.customerName,
            checkoutUrl: cart.cartDetails.checkoutUrl,
            itemCount: cart.cartDetails.items.length,
            cartTotal: `${cart.cartDetails.currency} ${cart.cartDetails.total}`
        });
        cart.status = 'sent';
      } catch (e) {
        console.error("Failed to send website reminder:", e.message);
        cart.status = 'failed';
      }
      await cart.save();
    }
  } catch (error) {
    console.error('Error processing website reminders:', error);
  }
};

const markCartAsConverted = async (platform, cartId, orderId = null) => {
  if (!platform || !cartId) return null;

  return AbandonedCart.findOneAndUpdate(
    {
      platform,
      cartId,
      status: { $in: ['pending', 'sent', 'awaiting_phone'] }
    },
    {
      $set: {
        status: 'converted',
        orderId: orderId || null,
        convertedAt: new Date()
      }
    },
    {
      new: true,
      sort: { updatedAt: -1 }
    }
  );
};

const markCartAsConvertedByPhone = async (tenantId, phone, orderId = null) => {
  if (!phone) return null;

  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone) return null;

  const phoneDigits = normalizedPhone.replace(/\D/g, '');
  const phoneVariations = [...new Set([
    normalizedPhone,
    phoneDigits,
    `+${phoneDigits}`,
    phoneDigits.startsWith('91') ? `+${phoneDigits}` : `+91${phoneDigits}`,
    phoneDigits.startsWith('91') ? phoneDigits.slice(2) : phoneDigits
  ])];

  const query = {
    customerPhone: { $in: phoneVariations },
    status: { $in: ['pending', 'sent', 'awaiting_phone'] }
  };

  if (tenantId) {
    query.tenantId = String(tenantId);
  }

  return AbandonedCart.findOneAndUpdate(
    query,
    {
      $set: {
        status: 'converted',
        orderId: orderId || null,
        convertedAt: new Date()
      }
    },
    {
      new: true,
      sort: { updatedAt: -1 }
    }
  );
};

// Export all functions
module.exports = {
    handleIncomingCart,
    cancelTimer,
    scheduleReminder,
    processPendingReminders,
    markCartAsConverted,
    markCartAsConvertedByPhone
};

