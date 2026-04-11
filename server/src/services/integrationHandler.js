// services/integrationHandler.js
const WhatsAppService = require('./whatsappServices');
const Message = require('../models/Message');
const {
  canSendWebsiteOrderConfirmation,
  syncWebsiteOrderConfirmationUsage
} = require('./subscriptionService');

// ============ HELPER FUNCTIONS ============

function extractPhoneNumber(orderData) {
  const phone = orderData.billing?.phone ||
                orderData.shipping?.phone ||
                orderData.customer?.phone ||
                orderData.meta_data?.find(meta => meta.key === 'billing_phone')?.value;

  return phone;
}

function extractShopifyPhoneNumber(orderData) {
  const phone = orderData.customer?.phone ||
                orderData.customer?.default_address?.phone ||
                orderData.billing_address?.phone ||
                orderData.shipping_address?.phone;

  return phone;
}

function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

// ============ WOOCOMMERCE HANDLER ============

async function handleOrderConfirmation(orderData, tenant) {
  try {
    if (!tenant.whatsappConfig?.accessToken) {
      console.error('❌ Tenant missing WhatsApp configuration');
      return;
    }

    const customerPhone = extractPhoneNumber(orderData);
    if (!customerPhone) {
      console.error('❌ No phone number found in WooCommerce order data');
      return;
    }

   let quotaCheck = canSendWebsiteOrderConfirmation(tenant);
    if (!quotaCheck.subscription.isPro) {
      const synced = await syncWebsiteOrderConfirmationUsage(tenant._id.toString());
      quotaCheck = {
        allowed: synced.isPro || synced.websiteOrderConfirmationRemaining > 0,
        subscription: synced
      };
    }
    if (!quotaCheck.allowed) {
      console.warn(
        `[Subscription] Website order confirmation limit reached for tenant ${tenant._id}. ` +
        `Used ${quotaCheck.subscription.websiteOrderConfirmationSent}/${quotaCheck.subscription.websiteOrderConfirmationLimit}`
      );
      return {
        skipped: true,
        reason: 'FREE_TRIAL_WEBSITE_ORDER_CONFIRMATION_LIMIT_REACHED',
        subscription: quotaCheck.subscription
      };
    }
    const whatsappService = new WhatsAppService(tenant);

    const orderDetails = {
      orderNumber: orderData.number || orderData.id,
      total: orderData.total,
      customerName: orderData.billing?.first_name || 'Customer',
      currency: orderData.currency || 'INR'
    };

    const products = orderData.line_items || [];
    const productsList = products.map(item => `${item.name} x ${item.quantity}`).join(', ') || 'Your products';

    const formattedPhone = formatPhoneNumber(customerPhone);

    const templateResponse = await whatsappService.sendTemplateMessage(
      'order_confirmation_website',
      formattedPhone,
      [{
        type: 'body',
        parameters: [
          { type: 'text', text: orderDetails.customerName },
          { type: 'text', text: orderDetails.orderNumber },
          { type: 'text', text: productsList },
          { type: 'text', text: `${orderDetails.currency} ${orderDetails.total}` }
        ]
      }]
    );

    if (templateResponse) {
      const newMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig?.phoneNumberId || 'system',
        to: formattedPhone,
        text: `Order confirmation sent for #${orderDetails.orderNumber}`,
        timestamp: new Date(),
        messageId: templateResponse.messages?.[0]?.id,
        status: 'sent',
        type: 'template',
        templateName: 'order_confirmation_website',
        isOrderConfirmation: true,
        orderData: {
          orderId: orderData.id?.toString(),
          orderNumber: orderDetails.orderNumber,
          total: orderDetails.total,
          currency: orderDetails.currency,
          status: orderData.status || 'processing',
          platform: 'woocommerce',
          customerName: orderDetails.customerName,
          items: products.map(item => ({
            id: item.id?.toString(),
            name: item.name,
            quantity: item.quantity,
            price: item.price?.toString(),
          }))
        },
      });

      await newMessage.save();

      if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', newMessage.toObject());
      }
    }
  } catch (error) {
    console.error('💥 Error in handleOrderConfirmation:', error);
  }
}

// ============ SHOPIFY HANDLER ============

async function handleShopifyOrderConfirmation(orderData, tenant) {
  try {
    console.log('🚀 Starting Shopify order confirmation process...');

    if (!tenant.whatsappConfig?.accessToken) {
      console.error('❌ Tenant missing WhatsApp configuration. Aborting.');
      return;
    }

    // Use the robust phone number extraction function
    const customerPhone = extractShopifyPhoneNumber(orderData);
    if (!customerPhone) {
      console.error('❌ No phone number found in Shopify order data. Skipping message.');
      console.log('📋 Available data:', { 
          customer: orderData.customer, 
          billing: orderData.billing_address, 
          shipping: orderData.shipping_address 
      });
      return;
    }

    let quotaCheck = canSendWebsiteOrderConfirmation(tenant);
    if (!quotaCheck.subscription.isPro) {
      const synced = await syncWebsiteOrderConfirmationUsage(tenant._id.toString());
      quotaCheck = {
        allowed: synced.isPro || synced.websiteOrderConfirmationRemaining > 0,
        subscription: synced
      };
    }
    if (!quotaCheck.allowed) {
      console.warn(
        `[Subscription] Website order confirmation limit reached for tenant ${tenant._id}. ` +
        `Used ${quotaCheck.subscription.websiteOrderConfirmationSent}/${quotaCheck.subscription.websiteOrderConfirmationLimit}`
      );
      return {
        skipped: true,
        reason: 'FREE_TRIAL_WEBSITE_ORDER_CONFIRMATION_LIMIT_REACHED',
        subscription: quotaCheck.subscription
      };
    }

    console.log('📞 Customer phone found:', customerPhone);
    const whatsappService = new WhatsAppService(tenant);

    // --- Defensive Data Extraction to prevent crashes ---
    const orderDetails = {
      orderNumber: orderData.name || orderData.order_number || orderData.id,
      total: orderData.total_price || '0.00',
      customerName: orderData.customer?.first_name || orderData.billing_address?.first_name || 'Valued Customer',
      currency: orderData.currency || 'INR'
    };

    const products = orderData.line_items || []; // Default to empty array
    const productsList = products.map(item => `${item.title || 'Product'} x ${item.quantity || 1}`).join(', ') || 'Your products';
    // --- End of Defensive Data Extraction ---

    const formattedPhone = formatPhoneNumber(customerPhone);
    console.log('📱 Formatted phone for API:', formattedPhone);

    const templateName = 'order_confirmation_website';
    console.log(`📤 Sending template '${templateName}'...`);

    const templateResponse = await whatsappService.sendTemplateMessage(
      templateName,
      formattedPhone,
      [{
        type: 'body',
        parameters: [
          { type: 'text', text: orderDetails.customerName },
          { type: 'text', text: orderDetails.orderNumber },
          { type: 'text', text: productsList },
          { type: 'text', text: `${orderDetails.currency} ${orderDetails.total}` }
        ]
      }]
    );

    if (templateResponse) {
      console.log('✅ Shopify WhatsApp message sent successfully.');
      const Message = require('../models/Message');

      const newMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig?.phoneNumberId || 'system',
        to: formattedPhone,
        text: `Shopify order confirmation sent for ${orderDetails.orderNumber}`,
        timestamp: new Date(),
        messageId: templateResponse.messages?.[0]?.id,
        status: 'sent',
        type: 'template',
        templateName: templateName,
        isOrderConfirmation: true, // Flag for the frontend
        orderData: {
          orderId: orderData.id?.toString(),
          orderNumber: orderDetails.orderNumber,
          total: orderDetails.total,
          currency: orderDetails.currency,
          status: orderData.financial_status || 'pending',
          platform: 'shopify',
          customerName: orderDetails.customerName,
          items: products.map(item => ({
            id: item.id?.toString(),
            name: item.title,
            quantity: item.quantity,
            price: item.price?.toString(),
          }))
        },
      });

      await newMessage.save();
      console.log('💾 Shopify message saved to database.');

      if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', newMessage.toObject());
        console.log('📡 Shopify message emitted to socket.');
      }
    }
  } catch (error) {
    console.error('💥 CRITICAL ERROR in handleShopifyOrderConfirmation:', error);
    if (error.response?.data) {
      console.error('📡 WhatsApp API Error Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

module.exports = {
  handleOrderConfirmation,
  handleShopifyOrderConfirmation
};
