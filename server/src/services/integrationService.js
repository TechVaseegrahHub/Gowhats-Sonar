const WhatsAppService = require('./whatsappServices');
const Message = require('../models/Message');
const Contact = require('../models/Contact'); // ✅ ADDED
const ShopifyApiService = require('./shopifyApiService');
const Integration = require('../models/Integration');
const {
  canSendWebsiteOrderConfirmation,
  syncWebsiteOrderConfirmationUsage
} = require('./subscriptionService');

const activeOrderConfirmationLocks = new Map();

class IntegrationService {

  getShopifyShippingAddress(orderData) {
    if (!orderData.shipping_address) return '';
    const addr = orderData.shipping_address;
    return [addr.address1, addr.address2, addr.city, addr.province, addr.country, addr.zip]
      .filter(Boolean).join(', ');
  }

  getWooCommerceShippingAddress(orderData) {
    if (!orderData.shipping) return '';
    const addr = orderData.shipping;
    return [addr.address_1, addr.address_2, addr.city, addr.state, addr.country, addr.postcode]
      .filter(Boolean).join(', ');
  }

  async extractOrderDetails(orderData, platform = 'shopify') {
    if (platform === 'shopify') {
      let phone = orderData.shipping_address?.phone ||
                  orderData.billing_address?.phone ||
                  orderData.customer?.phone;

      if (phone) {
        phone = phone.replace(/\D/g, '');
        if (!phone.startsWith('91')) {
          phone = '91' + phone;
        }
        phone = '+' + phone;
      }

      return {
        phone: phone,
        name: orderData.shipping_address?.first_name ||
              orderData.billing_address?.first_name ||
              orderData.customer?.first_name ||
              'Customer',
        orderNumber: orderData.order_number ||
                     orderData.name ||
                     orderData.id?.toString() ||
                     'Unknown',
        total: orderData.total_price ? `$${orderData.total_price}` : 'Unknown',
        items: orderData.line_items || []
      };
    }

    if (platform === 'woocommerce') {
      let phone = orderData.billing?.phone ||
                  orderData.shipping?.phone ||
                  orderData.customer?.phone ||
                  orderData.billing_phone ||
                  orderData.shipping_phone ||
                  orderData.phone ||
                  orderData.meta_data?.find((meta) => meta?.key === 'billing_phone')?.value;


      if (phone) {
        phone = phone.replace(/\D/g, '');
        if (!phone.startsWith('91')) {
          phone = '91' + phone;
        }
        phone = '+' + phone;
      }

      return {
        phone: phone,
        name: orderData.billing?.first_name ||
              orderData.shipping?.first_name ||
              orderData.customer?.first_name ||
              orderData.billing_first_name ||
              orderData.shipping_first_name ||
              orderData.customer_first_name ||
              'Customer',
        orderNumber: orderData.number ||
                     orderData.order_number ||
                     orderData.id?.toString() ||
                     'Unknown',
        total: orderData.total ? `${orderData.total}` : 'Unknown',
        items: Array.isArray(orderData.line_items) ? orderData.line_items : []

      };
    }

    return {
      phone: null,
      name: 'Customer',
      orderNumber: 'Unknown',
      total: 'Unknown',
      items: []
    };
  }

  extractCartDetails(cartData, platform = 'shopify') {
    if (platform === 'shopify' || cartData.token !== undefined) {
      let phone = cartData.customer?.phone ||
                  cartData.billing_address?.phone ||
                  cartData.shipping_address?.phone;

      if (phone) {
        phone = phone.replace(/\D/g, '');
        if (!phone.startsWith('91')) {
          phone = '91' + phone;
        }
        phone = '+' + phone;
      }

      return {
        phone: phone || '',
        items: cartData.line_items || [],
        cartTotal: cartData.total_price ? `$${cartData.total_price}` : '$0.00',
        itemCount: (cartData.line_items || []).length,
        customerName: cartData.customer?.first_name || 'Customer'
      };
    }

    return {
      phone: this.formatPhoneNumber(cartData.customer?.phone || cartData.billing?.phone || ''),
      items: cartData.items || [],
      cartTotal: cartData.total ? `$${cartData.total}` : '$0.00',
      itemCount: (cartData.items || []).length,
      customerName: cartData.billing?.first_name || 'Customer'
    };
  }

  async getShopifyOrderDetails(orderId, tenant) {
    console.log(`[Shopify API] Fetching order details for ID: ${orderId}`);
    try {
      console.warn('getShopifyOrderDetails: Actual API implementation needed');
      return {
        phone: null,
        name: 'Customer',
        orderNumber: orderId.toString(),
        formattedProducts: 'Products not available',
        formattedTotal: 'N/A'
      };
    } catch (error) {
      console.error('Error fetching Shopify order details:', error);
      return {
        phone: null,
        name: 'Customer',
        orderNumber: orderId.toString(),
        formattedProducts: 'Products not available',
        formattedTotal: 'N/A'
      };
    }
  }

  // ✅ NEW HELPER: Create or update contact and notify browser
  async upsertContactAndNotify(tenantId, phone, name, lastMessage, source) {
    try {
      const contact = await Contact.findOneAndUpdate(
        {
          tenantId: tenantId.toString(),
          phone_number: phone
        },
        {
          $set: {
            name: name || 'Customer',
            phone_number: phone,
            lastMessage: lastMessage || 'Message sent',
            timestamp: new Date(),
            source: source || 'shopify',
            status: 'active'
          },
          $setOnInsert: {
            unreadCount: 0,
            profile_name: name || 'Customer'
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );

      console.log(`✅ Contact upserted: ${phone} (${name})`);

      // Tell browser about this contact immediately
      if (global.io) {
        global.io.to(tenantId.toString()).emit('new_contact', {
          contact: contact.toObject(),
          tenantId: tenantId.toString(),
          timestamp: new Date(),
          isNewContact: true
        });

        global.io.to(tenantId.toString()).emit('contact_updated', {
          contact: contact.toObject(),
          tenantId: tenantId.toString(),
          timestamp: new Date(),
          action: 'automated_message_sent'
        });

        console.log(`📡 Contact emitted to browser: ${phone}`);
      }

      return contact;
    } catch (error) {
      console.error('❌ Error upserting contact:', error);
      return null;
    }
  }

  async hasExistingOrderConfirmation(tenantId, platform, externalOrderId) {
    if (!externalOrderId) return false;

    const existingMessage = await Message.exists({
      tenantId: tenantId.toString(),
      isOrderConfirmation: true,
      $or: [
        {
          'orderData.orderId': externalOrderId,
          'orderData.platform': platform
        },
        {
          'orderDetails.orderId': externalOrderId,
          'orderDetails.platform': platform
        },
        {
          orderId: externalOrderId,
          'orderData.platform': platform
        }
      ]
    });

    return Boolean(existingMessage);
  }

 async handleOrderConfirmation(orderData, tenant, platform = 'shopify') {
    let orderConfirmationLockKey = '';

    try {
      const { phone, name, orderNumber, total, items } = await this.extractOrderDetails(orderData, platform);
      const externalOrderId = String(orderData?.id || orderData?.order_id || '');

      if (!phone) {
        console.warn('No phone number found in order data');
        return;
      }

      if (externalOrderId) {
        orderConfirmationLockKey = `${tenant._id}:${platform}:${externalOrderId}`;

        if (activeOrderConfirmationLocks.has(orderConfirmationLockKey)) {
          console.log(
            `[Integration] Duplicate ${platform} order confirmation skipped while another send is in progress for order ${externalOrderId}`
          );

          return {
            skipped: true,
            reason: 'ORDER_CONFIRMATION_IN_PROGRESS'
          };
        }

        activeOrderConfirmationLocks.set(orderConfirmationLockKey, Date.now());
      }

      if (externalOrderId) {
        const alreadySent = await this.hasExistingOrderConfirmation(
          tenant._id,
          platform,
          externalOrderId
        );

        if (alreadySent) {
          console.log(
            `[Integration] Duplicate ${platform} order confirmation skipped for order ${externalOrderId}`
          );

          return {
            skipped: true,
            reason: 'DUPLICATE_ORDER_CONFIRMATION'
          };
        }
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

      const currency = orderData.currency || 'INR';
      const formattedTotal = `${currency} ${total.toString().replace(/\$/g, '')}`;

      let formattedProducts = '';
      if (items && items.length > 0) {
        formattedProducts = items.map(item => {
          const itemPrice = item.price ? item.price.toString().replace(/\$/g, '') : '0';
          return `- ${item.name} x${item.quantity} (${currency} ${itemPrice})`;
        }).join(' | ');
      } else {
        formattedProducts = 'No items in order';
      }

      const formattedPhone = this.formatPhoneNumber(phone);
      const whatsappService = new WhatsAppService(tenant);
      const templateName = tenant.templates?.orderConfirmationWebsite || 'order_confirmation_website';

      const allParameters = [
        { type: 'text', text: String(name || 'Customer') },
        { type: 'text', text: String(orderNumber || 'Unknown') },
        { type: 'text', text: String(formattedProducts || 'No items in order') },
        { type: 'text', text: String(formattedTotal || 'INR 0.00') }
      ];

      let result;
      let usedTemplate = templateName;
      let usedParameters = allParameters;
      let usedMessageType = 'template';
      let finalMessageText = `Order #${orderNumber} confirmed`;

      try {
        console.log(`Attempting to send order confirmation with template: ${templateName}`);

        if (typeof whatsappService.sendTemplateWithParameterAutodetect === 'function') {
          result = await whatsappService.sendTemplateWithParameterAutodetect(
            templateName,
            formattedPhone,
            [{ type: 'body', parameters: allParameters }]
          );
        } else {
          result = await whatsappService.sendTemplateMessage(
            templateName,
            formattedPhone,
            [{ type: 'body', parameters: allParameters }]
          );
        }
      } catch (templateError) {
        console.error('Error sending detailed template:', templateError);

        const standardTemplateName = tenant.templates?.orderConfirmation;

        if (standardTemplateName && standardTemplateName !== templateName) {
          try {
            usedTemplate = standardTemplateName;
            usedParameters = [
              { type: 'text', text: String(name || 'Customer') },
              { type: 'text', text: String(orderNumber || 'Unknown') },
              { type: 'text', text: String(formattedTotal || 'INR 0.00') }
            ];

            console.log(`Falling back to standard template: ${usedTemplate}`);
            result = await whatsappService.sendTemplateMessage(
              usedTemplate,
              formattedPhone,
              [{ type: 'body', parameters: usedParameters }]
            );
          } catch (fallbackError) {
            console.error('Fallback template also failed:', fallbackError);
            usedTemplate = null;
            usedParameters = [];
          }
        }

        if (!result) {
          console.log('Sending plain text fallback');
          usedTemplate = null;
          usedParameters = [];
          usedMessageType = 'text';
          finalMessageText = `Hi ${name}, thank you for your order #${orderNumber} totaling ${formattedTotal}. We'll update you on your order status soon.`;
          result = await whatsappService.sendMessage(formattedPhone, finalMessageText);
        }
      }

      // Save message to DB
      const templateMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId || 'system',
        to: formattedPhone,
        text: finalMessageText,
        orderId: externalOrderId || null,
        type: usedMessageType,
        templateName: usedTemplate || undefined,
        status: 'sent',
        messageId: result.messages?.[0]?.id,
        isOrderConfirmation: true,
        templateParams: usedParameters.length > 0
          ? [{
              type: 'body',
              parameters: usedParameters
            }]
          : undefined,
        orderData: {
          orderId: externalOrderId,
          customerName: name,
          orderNumber: orderNumber,
          platform: platform,
          total: formattedTotal,
          currency: currency,
          items: items.map(item => ({
            name: item.name || 'Product',
            quantity: item.quantity || 1
          }))
        },
        orderDetails: {
          orderId: String(orderData.id || ''),
          orderNumber: orderNumber,
          total: formattedTotal,
          status: platform === 'shopify'
            ? orderData.financial_status || 'processing'
            : orderData.status || 'processing',
          platform: platform,
          products: formattedProducts,
          items: items.map(item => ({
            name: item.name || 'Product',
            quantity: item.quantity || 1,
            price: `${currency} ${item.price?.toString().replace(/\$/g, '') || '0'}`,
            sku: item.sku || '',
            imageUrl: item.image_url || ''
          })),
          tenantInfo: {
            businessName: tenant.businessName || tenant.name || '',
            logoUrl: tenant.logoUrl || '',
            templateName: usedTemplate
          }
        }
      });

      await templateMessage.save();
      console.log(`✅ Order confirmation message saved for order #${orderNumber}`);

      // ✅ CREATE CONTACT IN DB AND NOTIFY BROWSER
      await this.upsertContactAndNotify(
        tenant._id,
        formattedPhone,
        name,
        `Order #${orderNumber} confirmed`,
        platform
      );

      // Emit message to browser
      if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', {
          ...templateMessage.toObject(),
          contact: { phone_number: formattedPhone }
        });
        console.log(`📡 Order confirmation emitted to socket for tenant: ${tenant._id}`);
      }

      console.log(`✅ Order confirmation sent for order #${orderNumber} to ${formattedPhone}`);
      return templateMessage;

    } catch (error) {
      console.error('Error processing order confirmation:', error);
      if (error.response?.data) {
        console.error('API error details:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    } finally {
      if (orderConfirmationLockKey) {
        activeOrderConfirmationLocks.delete(orderConfirmationLockKey);
      }
    }
  }

  async handleAbandonedCart(cartData, tenant, platform = 'shopify') {
    try {
      const { phone, items, cartTotal, itemCount, customerName } = this.extractCartDetails(cartData, platform);

      if (!phone || itemCount === 0) {
        console.warn('No phone number or empty cart');
        return;
      }

      const whatsappService = new WhatsAppService(tenant);

      await whatsappService.sendAbandonedCartReminder(phone, {
        customerName: customerName,
        itemCount: itemCount,
        cartTotal: cartTotal
      });

      console.log(`✅ Abandoned cart reminder sent to ${phone}`);

      // ✅ CREATE CONTACT IN DB AND NOTIFY BROWSER
      await this.upsertContactAndNotify(
        tenant._id,
        phone,
        customerName,
        `Abandoned cart reminder sent`,
        platform
      );

      // Save message to DB
      const cartMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId || 'system',
        to: phone,
        text: `Abandoned cart reminder sent`,
        type: 'template',
        templateName: 'abandoned_cart_notify',
        status: 'sent',
        isAbandonedCartReminder: true,
        cartDetails: {
          items: items,
          total: cartTotal,
          itemCount: itemCount,
          currency: 'INR'
        }
      });

      await cartMessage.save();

      // Emit message to browser
      if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', {
          ...cartMessage.toObject(),
          contact: { phone_number: phone }
        });
        console.log(`📡 Abandoned cart message emitted to socket`);
      }

    } catch (error) {
      console.error('Error sending abandoned cart reminder:', error);
    }
  }

  async handleOrderDispatched(fulfillmentData, tenant, integration, platform = 'shopify') {
    console.log('--- Inside handleOrderDispatched ---');

    if (!integration.isDispatchedMessageEnabled) {
      console.log(`Order Dispatched messages disabled for tenant ${tenant._id}`);
      return;
    }

    if (platform === 'shopify') {
      const orderId = fulfillmentData.order_id;

      if (!orderId) {
        console.warn('Missing order ID in fulfillment webhook');
        return;
      }

      console.log(`📦 Processing dispatch for Shopify Order ID: ${orderId}`);

      if (!integration.adminAccessToken) {
        console.error(`❌ CRITICAL: No Admin API token configured`);
        return;
      }

      let orderDetails = null;

      try {
        const shopifyApi = new ShopifyApiService(
          integration.storeUrl,
          integration.adminAccessToken,
          integration.apiConfig?.version || '2024-10'
        );

        orderDetails = await shopifyApi.getOrderDetailsForDispatch(orderId);

        if (!orderDetails) {
          throw new Error('Failed to fetch order details from Shopify');
        }
      } catch (apiError) {
        console.error('❌ ERROR DURING SHOPIFY API CALL:', apiError.message);
        return;
      }

      let phone = this.formatPhoneNumber(orderDetails.phone);

      if (!phone || phone.length < 10) {
        console.log('   [Fallback] No phone in order details, checking webhook...');

        const webhookPhone = fulfillmentData.destination?.phone ||
                            fulfillmentData.customer?.phone ||
                            fulfillmentData.line_items?.[0]?.phone ||
                            null;

        if (webhookPhone) {
          console.log(`   [Fallback] ✅ Found phone in webhook: ${webhookPhone}`);
          phone = this.formatPhoneNumber(webhookPhone);
        } else {
          console.error(`❌ No valid phone number found`);
          return;
        }
      }

      let customerName = orderDetails.name;

      if (!customerName || customerName === 'Valued Customer') {
        console.log('   [Name Fallback] Checking webhook for customer name...');
        customerName = fulfillmentData.destination?.first_name ||
                      fulfillmentData.destination?.name ||
                      fulfillmentData.customer?.first_name ||
                      fulfillmentData.customer?.name ||
                      fulfillmentData.order?.customer?.first_name ||
                      fulfillmentData.order?.shipping_address?.first_name ||
                      fulfillmentData.order?.billing_address?.first_name ||
                      'Valued Customer';
      }

      console.log(`📲 Sending WhatsApp notification to: ${phone}`);
      console.log(`👤 Customer name: ${customerName}`);

      const whatsappService = new WhatsAppService(tenant);
      const orderNumber = orderDetails.orderNumber;
      const formattedProducts = orderDetails.formattedProducts;
      const formattedTotal = orderDetails.formattedTotal;

      const trackingNumber = fulfillmentData.tracking_number || 'Not available';
      const trackingCompany = fulfillmentData.tracking_company || 'Standard Shipping';
      const trackingUrl = fulfillmentData.tracking_url || fulfillmentData.tracking_urls?.[0] || null;

      try {
        const templateName = tenant.templates?.orderDispatched || 'order_dispatched';
        console.log(`\n[Template] Sending template: ${templateName}`);

        const templateParams = [
          { type: 'text', text: customerName },
          { type: 'text', text: String(orderNumber) },
          { type: 'text', text: formattedProducts },
          { type: 'text', text: formattedTotal },
          { type: 'text', text: trackingCompany },
          { type: 'text', text: trackingNumber }
        ];

        const components = [{ type: 'body', parameters: templateParams }];

        console.log('[Template] Sending with params:', JSON.stringify(templateParams, null, 2));

        const result = await whatsappService.sendTemplateMessage(
          templateName,
          phone,
          components
        );

        if (result && result.messages?.[0]?.id) {
          console.log('✅ Dispatch template sent successfully!');

          const savedMessage = new Message({
            tenantId: tenant._id,
            from: tenant.whatsappConfig.phoneNumberId || 'system',
            to: phone,
            text: `Order #${orderNumber} dispatched`,
            type: 'template',
            templateName: templateName,
            status: 'sent',
            messageId: result.messages[0].id,
            isOrderDispatched: true,
            templateParams: components,
            orderDetails: {
              orderId: String(orderId),
              orderNumber: String(orderNumber),
              trackingNumber: trackingNumber,
              trackingCompany: trackingCompany,
              trackingUrl: trackingUrl,
              products: formattedProducts,
              total: formattedTotal,
              platform: platform,
              customerName: customerName
            }
          });

          await savedMessage.save();

          // ✅ CREATE CONTACT IN DB AND NOTIFY BROWSER
          await this.upsertContactAndNotify(
            tenant._id,
            phone,
            customerName,
            `Order #${orderNumber} dispatched`,
            platform
          );

          // Emit message to browser
          if (global.io) {
            global.io.to(tenant._id.toString()).emit('message_sent', {
              ...savedMessage.toObject(),
              contact: { phone_number: phone }
            });

            global.io.to(tenant._id.toString()).emit('order_dispatched', {
              orderId: orderId,
              orderNumber: orderNumber,
              customerPhone: phone,
              trackingNumber: trackingNumber,
              trackingCompany: trackingCompany,
              timestamp: new Date()
            });
          }

          return savedMessage;
        }
      } catch (templateError) {
        console.error('❌ Template failed:', templateError.message);

        if (templateError.response?.data) {
          console.error('Template error details:', JSON.stringify(templateError.response.data, null, 2));
        }

        console.log('\n[Fallback] Template failed, sending plain text...');

        try {
          const plainTextMessage = `Hi ${customerName}! 🎉\n\n` +
            `Your order #${orderNumber} has been dispatched! 📦\n\n` +
            `Order Details:\n${formattedProducts}\n\n` +
            `Total: ${formattedTotal}\n\n` +
            `Tracking Info:\n` +
            `🚚 Carrier: ${trackingCompany}\n` +
            `📍 Tracking Number: ${trackingNumber}\n` +
            (trackingUrl ? `\n🔗 Track: ${trackingUrl}\n` : '') +
            `\n✅ Once you receive your parcel, please reply "Received" to confirm delivery.\n\n` +
            `⚠️ Please attend the courier's call and assist with delivery if needed.\n\n` +
            `Thank you for shopping with us! ❤️`;

          const plainResult = await whatsappService.sendMessage(phone, plainTextMessage);

          if (plainResult && plainResult.messages?.[0]?.id) {
            console.log('✅ Plain text fallback message sent');

            const savedMessage = new Message({
              tenantId: tenant._id,
              from: tenant.whatsappConfig.phoneNumberId || 'system',
              to: phone,
              text: plainTextMessage,
              type: 'text',
              status: 'sent',
              messageId: plainResult.messages[0].id,
              isOrderDispatched: true,
              orderDetails: {
                orderId: String(orderId),
                orderNumber: String(orderNumber),
                trackingNumber: trackingNumber,
                trackingCompany: trackingCompany,
                trackingUrl: trackingUrl,
                total: formattedTotal,
                platform: platform,
                fallbackUsed: true
              }
            });

            await savedMessage.save();

            // ✅ CREATE CONTACT IN DB AND NOTIFY BROWSER (fallback too)
            await this.upsertContactAndNotify(
              tenant._id,
              phone,
              customerName,
              `Order #${orderNumber} dispatched`,
              platform
            );

            if (global.io) {
              global.io.to(tenant._id.toString()).emit('message_sent', {
                ...savedMessage.toObject(),
                contact: { phone_number: phone }
              });
            }

            return savedMessage;
          }
        } catch (plainError) {
          console.error('❌ Plain text fallback also failed:', plainError.message);
          console.error(`[CRITICAL] Failed to send dispatch notification for order ${orderNumber} to ${phone}`);
          throw new Error(`Failed to send dispatch notification: ${plainError.message}`);
        }
      }
    } else {
      console.log(`Platform ${platform} dispatch handling not implemented`);
    }
  }

  formatPhoneNumber(phone) {
    if (!phone) return null;

    let cleaned = phone.replace(/\D/g, '');

    if (!cleaned.startsWith('91') && !cleaned.startsWith('1') && !cleaned.startsWith('+')) {
      cleaned = '91' + cleaned;
    }

    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }
}

module.exports = IntegrationService;

// ✅ Export standalone functions
const handleOrderDispatched = async function(fulfillmentData, tenant, integration, platform) {
  const service = new IntegrationService();
  return service.handleOrderDispatched(fulfillmentData, tenant, integration, platform);
};

const handleOrderConfirmation = async function(orderData, tenant, platform) {
  const service = new IntegrationService();
  return service.handleOrderConfirmation(orderData, tenant, platform);
};

const handleAbandonedCart = async function(cartData, tenant, platform) {
  const service = new IntegrationService();
  return service.handleAbandonedCart(cartData, tenant, platform);
};

module.exports.handleOrderDispatched = handleOrderDispatched;
module.exports.handleOrderConfirmation = handleOrderConfirmation;
module.exports.handleAbandonedCart = handleAbandonedCart;

