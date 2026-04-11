// services/whatsappServices.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const { pipeline } = require('stream');
const streamPipeline = promisify(pipeline);
const { URL } = require('url');
const Message = require('../models/Message');
const BotConfiguration = require('../models/WelcomeTemplates');

class WhatsAppService {
  constructor(tenant) {
    this.tenant = tenant;
    this.baseUrl = 'https://graph.facebook.com/v22.0';
    this.FOOTER_TEXT = "Powered by GoWhats!";

    // ✅ ADD THESE TWO LINES - CRITICAL FIX
    this.accessToken = tenant.whatsappConfig?.accessToken;
    this.phoneNumberId = tenant.whatsappConfig?.phoneNumberId;

    this.standardTemplates = {
      order_confirmation: {
        name: 'order_confirmation',
        fallback: 'order_confirm',
        components: (data) => [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.customerName || 'Customer' },
              { type: 'text', text: data.orderNumber || 'Unknown' },
              { type: 'text', text: data.total || '$0.00' }
            ]
          }
        ]
      },
      abandoned_cart: {
        name: 'abandoned_cart_woocommerce', // Updated template name
        fallback: 'cart_reminder',
        components: (data) => {
          // 1. Prepare Body Components (2 Variables: Name, Products)
          const components = [
            {
              type: 'body',
              parameters: [
                // {{1}} Customer Name
                { type: 'text', text: data.customerName || 'Valued Customer' },

                // {{2}} Product List (formatted as string)
                { type: 'text', text: data.items ? data.items.map(i => i.title || i.name).join(', ') : 'your selected items' }
              ]
            }
          ];

          // 2. Prepare Button Component (Dynamic URL)
          if (data.checkoutUrl) {
            try {
              const url = new URL(data.checkoutUrl);
              // Extract everything after the domain (e.g., /cart/restore/...)
              const dynamicUrlPart = (url.pathname + url.search).substring(1);

              components.push({
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: dynamicUrlPart }]
              });
            } catch (error) {
              console.error('Error parsing checkout URL:', error);
            }
          }

          return components;
        }
      },

      shipping_update: {
        name: 'shipping_update',
        fallback: 'delivery_status',
        components: (data) => [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.customerName || 'Customer' },
              { type: 'text', text: data.orderNumber || 'Unknown' },
              { type: 'text', text: data.trackingNumber || 'N/A' },
              { type: 'text', text: data.estimatedDelivery || 'soon' }
            ]
          }
        ]
      },

      order_packed: {
        name: 'order_packed',
        fallback: null,
        components: (data) => [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.orderNumber || 'Order' }
            ]
          }
        ]
      }
    };
}

 // 1. Helper: Get App ID (Required for Template Media Upload)
  // ✅ UPDATED to v23.0 and uses the reliable '/app' endpoint
  async getAppId() {
    try {
      const response = await axios.get(`https://graph.facebook.com/v23.0/app`, {
        params: {
          access_token: this.accessToken
        }
      });
      return response.data.id;
    } catch (error) {
      console.error('Error fetching App ID:', error.response?.data || error.message);
      throw new Error('Could not retrieve App ID for media upload.');
    }
  }


  // 2. Helper: Perform Resumable Upload to get a Handle (h)
  async uploadTemplateMedia(file) {
    try {
      console.log('📤 Starting Resumable Upload for Template...');
      const appId = await this.getAppId();

      if (!fs.existsSync(file.path)) throw new Error(`File not found at ${file.path}`);

      // ✅ Get exact file size
      const fileSize = fs.statSync(file.path).size;

      // Step A: Start Upload Session
      const sessionUrl = `https://graph.facebook.com/v23.0/${appId}/uploads`;

      const sessionResponse = await axios.post(sessionUrl, null, {
        params: {
          file_length: fileSize,
          file_type: file.mimetype,
          access_token: this.accessToken
        }
      });

      const uploadSessionId = sessionResponse.data.id;
      console.log(`🔹 Upload Session ID: ${uploadSessionId}`);

      // Step B: Upload File Binary
      const fileStream = fs.createReadStream(file.path);
      const uploadUrl = `https://graph.facebook.com/v23.0/${uploadSessionId}`;

      const uploadResponse = await axios.post(uploadUrl, fileStream, {
        headers: {
          'Authorization': `OAuth ${this.accessToken}`,
          'file_offset': '0',
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileSize // ✅ CRITICAL FIX: Explicitly send file size
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      const handle = uploadResponse.data.h;
      console.log('✅ Media Handle Received:', handle);
      return handle;

    } catch (error) {
      console.error('❌ Template Media Upload Failed:', error.response?.data || error.message);
      // Detailed error logging to help debug
      if (error.response?.data) {
         console.error('Meta API Debug Info:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Media Upload Failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async sendBroadcastTemplate(to, broadcastData) {
    try {
      const { templateName, language, mediaType, mediaUrl, mediaId } = broadcastData;

      console.log(`📡 Preparing Broadcast Payload for ${to}...`);
      console.log(`   Template: ${templateName}, Media Type: ${mediaType || 'None'}, Media ID: ${mediaId || 'None'}`);

      // 1. Construct Template Data Object
      const templateData = {
  header: null
};

      // 2. Handle Media Header Construction
      // CRITICAL FIX: Ensure type is lowercase and data object exists
      if (mediaType && (mediaUrl || mediaId)) {
        const type = mediaType.toLowerCase();

        // Only proceed if it's a valid media type
        if (['image', 'video', 'document'].includes(type)) {
            templateData.header = {
              type: type,
              data: {}
            };

            // Prioritize ID if available (faster/more reliable), otherwise use URL (link)
            if (mediaId) {
              templateData.header.data.id = mediaId;
            } else if (mediaUrl) {
              templateData.header.data.link = mediaUrl; // NOTE: API expects 'link', not 'url'
            }
        }
      }

      // 3. Call the generic sender with the constructed object
      // Pass flow button flag
      templateData.hasFlowButton = broadcastData.hasFlowButton || false;
      return await this.sendTemplateWithMedia(templateName, to, templateData, language);

    } catch (error) {
      console.error('❌ Broadcast Send Error:', error.message);
      throw error;
    }
  }


  async sendLocationMessage(to, locationData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "location",
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          name: locationData.name || "",
          address: locationData.address || ""
        }
      };

      console.log('📤 Sending Location:', JSON.stringify(payload));

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Send Location Error:', error.response?.data || error.message);
      throw error;
    }
  }


  // 3. Create Template Function
  // ✅ UPDATED to v23.0 and correctly handles the media handle
  async createTemplate(data) {
    try {
      if (!this.accessToken || !this.tenant.whatsappConfig.businessAccountId) {
        throw new Error('WhatsApp configuration missing');
      }

      const url = `https://graph.facebook.com/v23.0/${this.tenant.whatsappConfig.businessAccountId}/message_templates`;
      const components = [];

      const getVariableIndexes = (text = '') => {
        const regex = /\{\{(\d+)\}\}/g;
        const indexes = new Set();
        let match;
        while ((match = regex.exec(String(text || '')))) {
          indexes.add(Number(match[1]));
        }
        return Array.from(indexes)
          .filter((n) => Number.isInteger(n) && n > 0)
          .sort((a, b) => a - b);
      };

      const normalizeExampleValues = (examples) => {
        if (Array.isArray(examples)) {
          return examples.map((value) => String(value ?? '').trim());
        }

        if (examples && typeof examples === 'object') {
          return Object.keys(examples)
            .map((key) => Number(key))
            .filter((key) => Number.isInteger(key) && key > 0)
            .sort((a, b) => a - b)
            .map((key) => String(examples[key] ?? '').trim());
        }

        return [];
      };

      const buildExampleValues = (text, examples, componentLabel) => {
        const indexes = getVariableIndexes(text);
        if (indexes.length === 0) return null;

        const hasGaps = indexes.some((value, i) => value !== i + 1);
        if (hasGaps) {
          throw new Error(`${componentLabel} variables must be sequential like {{1}}, {{2}}, {{3}}`);
        }

        const values = normalizeExampleValues(examples);
        if (values.length < indexes.length) {
          throw new Error(
            `${componentLabel} requires ${indexes.length} example value(s) for variables ${indexes
              .map((n) => `{{${n}}}`)
              .join(', ')}`
          );
        }

        const orderedValues = indexes.map((_, i) => String(values[i] || '').trim());
        const missingExamples = orderedValues.some((value) => !value);
        if (missingExamples) {
          throw new Error(
            `${componentLabel} variable examples cannot be empty`
          );
        }

        return orderedValues;
      };


      // ===========================
      // 🎠 CAROUSEL TEMPLATE LOGIC
      // ===========================
      if (data.headerType === 'CAROUSEL') {
        // 1. Main Body Component
         const bodyComponent = {
          type: "BODY",
          text: data.bodyText
        };

        const bodyExampleValues = buildExampleValues(data.bodyText, data.bodyExamples, 'Body');
        if (bodyExampleValues) {
          bodyComponent.example = { body_text: [bodyExampleValues] };
        }

        components.push(bodyComponent);


        // 2. Carousel Component
        const cards = [];

        // Loop through cards (data.cards is array of objects, data.cardFiles is map of files)
        // Note: The route should have parsed the JSON and handled file uploads

        if (data.cards && Array.isArray(data.cards)) {
          for (let i = 0; i < data.cards.length; i++) {
            const cardData = data.cards[i];
            const cardFile = data.cardFiles ? data.cardFiles[i] : null; // Accessed via index

            if (!cardFile) {
              throw new Error(`Media file missing for card ${i + 1}`);
            }

            // Upload Media for Card
            const fileHandle = await this.uploadTemplateMedia(cardFile);

            // Build Card Component
            const cardComponents = [
              {
                type: "HEADER",
                format: "IMAGE", // Carousel cards currently support IMAGE or VIDEO
                example: { header_handle: [fileHandle] }
              },
              {
                type: "BODY",
                text: cardData.bodyText
              }
            ];

            // Add Buttons to Card
            if (cardData.buttons && cardData.buttons.length > 0) {
              const buttons = cardData.buttons.map(btn => {
                if (btn.type === 'QUICK_REPLY') return { type: "QUICK_REPLY", text: btn.text };
                if (btn.type === 'URL') return { type: "URL", text: btn.text, url: btn.url };
                if (btn.type === 'PHONE_NUMBER') return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number };
              });

              cardComponents.push({ type: "BUTTONS", buttons });
            }

            cards.push({ components: cardComponents });
          }
        }

        components.push({
          type: "CAROUSEL",
          cards: cards
        });

      }
      // ===========================
      // 📄 STANDARD TEMPLATE LOGIC
      // ===========================
      else {

        // Header
        if (data.headerType && data.headerType !== 'NONE') {
            const headerComponent = { type: "HEADER", format: data.headerType };
            if (data.headerType === 'TEXT') {
                headerComponent.text = data.headerText;
                const headerExampleValues = buildExampleValues(data.headerText, data.headerExamples, 'Header');
                if (headerExampleValues) {
                  headerComponent.example = { header_text: headerExampleValues };
                }
            } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(data.headerType)) {
                const fileHandle = await this.uploadTemplateMedia(data.mediaFile);
                headerComponent.example = { header_handle: [fileHandle] };
            }
            components.push(headerComponent);
        }

        // Body
       const bodyComponent = { type: "BODY", text: data.bodyText };
        const bodyExampleValues = buildExampleValues(data.bodyText, data.bodyExamples, 'Body');
        if (bodyExampleValues) {
          bodyComponent.example = { body_text: [bodyExampleValues] };
        }
        components.push(bodyComponent);


        // Footer
        if (data.footerText) components.push({ type: "FOOTER", text: data.footerText });

        // Buttons
        if (data.buttons && data.buttons.length > 0) {
            // ... button mapping logic ...
             const buttons = data.buttons.map(btn => {
                if (btn.type === 'URL') return { type: "URL", text: btn.text, url: btn.url };
                if (btn.type === 'PHONE_NUMBER') return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number };
                return { type: "QUICK_REPLY", text: btn.text };
            });
            components.push({ type: "BUTTONS", buttons });
        }
      }

      // Construct Final Payload
      const payload = {
        name: data.name,
        category: data.category,
        language: data.language,
        components: components
      };

      console.log('Sending Template Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;

    } catch (error) {
      console.error('Create Template Error:', error.response?.data || error.message);
      throw error;
    }
  }

async sendSticker(to, stickerId) {
  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'sticker',
      sticker: {
        id: stickerId
      }
    };

    const response = await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error sending sticker:', error.response?.data);
    throw error;
  }
}


/**
   * Send a Reaction to a specific message
   * @param {string} to - Recipient Phone
   * @param {string} messageId - The wamid of the message to react to
   * @param {string} emoji - The emoji character
   */
  async sendReactionMessage(to, messageId, emoji) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "reaction",
        reaction: {
          message_id: messageId,
          emoji: emoji
        }
      };

      console.log('📤 Sending Reaction:', JSON.stringify(payload));

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Send Reaction Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send a Location Request (Interactive Button)
   * @param {string} to - Recipient Phone
   * @param {string} bodyText - Text to ask for location
   */
  async sendLocationRequestMessage(to, bodyText = "Please share your current location for delivery.") {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: bodyText
          },
          action: {
            name: "send_location"
          }
        }
      };

      console.log('📤 Sending Location Request:', JSON.stringify(payload));

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Send Location Request Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Helper to construct sticker payload
  async createStickerMessage(to, file) {
    // 1. Upload the sticker file (Must be .webp)
    const uploadResult = await this.uploadMediaFile(file, 'sticker');

    // 2. Return Payload
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'sticker',
      sticker: {
        id: uploadResult.id
      }
    };
  }

  async sendShippingOptionsList(to, shippingData) {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

    // 1. FETCH SETTINGS FROM DB
    const Settings = require('../models/settings');
    const settings = await Settings.findOne({ tenant_id: this.tenant._id.toString() });

    // Get Courier List Config
    const config = settings?.automationConfig?.shippingSelection?.courierListTemplate;

    const {
        orderAmount = 0,
        shippingOptions = [],
        customerName = 'Customer',
        freeShippingApplied = false
    } = shippingData;

    // Filter eligible options
    const courierOptions = shippingOptions.filter(option =>
        option.isEligible && (option.courierType === 'courier' || option.courierType === 'slab')
    );

    if (courierOptions.length === 0) {
        await this.sendMessage(formattedPhone, `Dear ${customerName}, no shipping options available currently. We will contact you.`);
        return null;
    }

    // 2. CONSTRUCT DYNAMIC TEXT
    // Use DB config or Fallback defaults
    let headerText = config?.header || '🚚 Choose Courier';
    let bodyText = config?.body || `Hi {{name}}! Please select your preferred courier for your order of {{amount}}.`;
    let footerText = config?.footer || 'Select your preferred option';

    // Replace Variables
    bodyText = bodyText
        .replace('{{name}}', customerName)
        .replace('{{amount}}', `₹${orderAmount.toFixed(2)}`);

    // Override for mixed free/paid scenarios (if any)
    if (freeShippingApplied) {
        headerText = '🚚 Express Options';
        bodyText = `🎉 ${customerName}, your order qualifies for FREE SHIPPING! 🆓\n\nYou can also choose express courier options below:`;
    }

    // 3. BUILD LIST MESSAGE
    const listMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: {
                type: 'text',
                text: headerText.substring(0, 60) // API Limit: 60 chars
            },
            body: {
                text: bodyText.substring(0, 1024) // API Limit: 1024 chars
            },
            footer: {
                text: footerText.substring(0, 60) // API Limit: 60 chars
            },
            action: {
                button: 'View Couriers',
                sections: [{
                    title: 'Courier Services',
                    rows: courierOptions.map(option => {
                        let description = '';
                        if (option.isFreeShipping || option.shippingCost === 0) {
                            description += '🆓 FREE';
                        } else {
                            description += `₹${option.shippingCost.toFixed(2)}`;
                        }
                        if (option.estimatedDeliveryTime) description += ` • ⏱️ ${option.estimatedDeliveryTime}`;

                        return {
                            id: `shipping_${option.methodId}`,
                            title: option.methodName.substring(0, 23), // Max 24 chars
                            description: description.substring(0, 72) // Max 72 chars
                        };
                    })
                }]
            }
        }
    };

    try {
        console.log('📤 Sending Dynamic Courier List...');
        const response = await axios.post(
            `${this.baseUrl}/${this.phoneNumberId}/messages`,
            listMessage, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`✅ Courier options sent successfully`);
        return response.data;
    } catch (error) {
        console.error('❌ Failed to send courier options:', error.response?.data || error.message);
        throw error;
    }
  }

  async sendAbandonedCartReminder(phone, cartDetails) {
    try {
      console.log(`\n========== ABANDONED CART TEMPLATE ==========`);
      console.log(`📱 Sending to: ${phone}`);

      // 1️⃣ Format Phone Number
      const formattedPhone = this.formatPhoneNumber(phone);
      if (!formattedPhone) {
        throw new Error(`Invalid phone number: ${phone}`);
      }

      // 2️⃣ Prepare the Template Payload
      // Note: your template 'abandoned_cart_notify' has 1 variable {{1}} for the name.
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: 'abandoned_cart_notify', // Must match Meta exactly
          language: { code: 'en' },      // Match the English language code
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: cartDetails.customerName || 'Customer' // This fills {{1}}
                }
              ]
            }
          ]
        }
      };

      console.log('📤 Sending Meta Template: abandoned_cart_notify');

      // 3️⃣ Send via WhatsApp API
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      console.log(`✅ Template message sent successfully`);

      // 4️⃣ Save log to Database (Optional but recommended)
      try {
        const Message = require('../models/Message');
        await Message.create({
          tenantId: this.tenant._id,
          from: this.phoneNumberId,
          to: formattedPhone,
          text: `Template: abandoned_cart_notify sent to ${cartDetails.customerName}`,
          type: 'template',
          subType: 'abandoned_cart',
          timestamp: new Date(),
          messageId: response.data.messages?.[0]?.id,
          status: 'sent',
          isAbandonedCartReminder: true,
          isAutomatedMessage: true,
          sentFromWABA: true
        });
      } catch (saveError) {
        console.error('⚠️ Failed to save message to DB:', saveError.message);
      }

      return response.data;

    } catch (error) {
      console.error(`\n❌ ========== TEMPLATE ERROR ==========`);
      console.error(`Error: ${error.message}`);
      if (error.response) {
        console.error(`WhatsApp API Error:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }


// Helper method to save message to database
async saveMessage(messageData) {
  try {
    const Message = require('../models/Message');

    const message = new Message({
      tenantId: this.tenant._id,
      to: messageData.to,
      from: this.phoneNumberId,
      messageId: messageData.messageId,
      status: messageData.status,
      messageType: messageData.messageType || 'template',
      templateName: messageData.templateName,
      isAbandonedCart: messageData.isAbandonedCart || false,
      cartData: messageData.cartData,
      timestamp: new Date()
    });

    await message.save();
    console.log(`[WhatsApp] Message saved to database`);
  } catch (error) {
    console.error('[WhatsApp] Error saving message:', error.message);
  }
}

async sendShippingSelectionConfirmation(to, confirmationData) {
  const formattedPhone = this.formatPhoneNumber(to);
  const { selectedMethod, shippingCost, totalAmount, orderNumber } = confirmationData;

  // ✅ Simple numeric order ID in message
  let message = `✅ *Shipping Confirmed!*\n\n` +
                `🚚 *Courier:* ${selectedMethod}\n` +
                `💰 *Shipping Cost:* ₹${shippingCost.toFixed(2)}\n` +
                `💳 *Total Amount:* ₹${totalAmount.toFixed(2)}\n\n`;

  if (orderNumber) {
    // Simple display - just the number, no prefixes
    message += `Your order *${orderNumber}* is confirmed. `;
  }
  message += "You'll receive tracking details once shipped. Thank you! 🙏";

  return this.sendMessage(formattedPhone, message);
}
    /**
     * Sends a basic text message.
     */
    async sendMessage(to, text) {
    const formattedPhone = this.formatPhoneNumber(to);
    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: { body: text }  // ✅ This is correct
    };
    try {
        const response = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, payload, { headers: { Authorization: `Bearer ${this.accessToken}` } });
        return response.data;
    } catch (error) {
        console.error('❌ Failed to send text message:', {
            status: error.response?.status,
            error: error.response?.data?.error
        });
        throw new Error(error.response?.data?.error?.message || 'Failed to send message');
    }
}

     async sendOrderCompletionFlow(to, orderData) {
  try {
    console.log('🚀 Sending order completion flow with tenant config...');

    // ✅ FIX 1: Get tenant-specific settings
    const Settings = require('../models/settings');
    const settings = await Settings.findOne({
      tenant_id: this.tenant._id.toString()
    });

    if (!settings) {
      console.error('❌ No settings found for tenant:', this.tenant._id);
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    const flowConfig = settings.flowConfig;

    // ✅ FIX 2: Check if flow is enabled
    if (!flowConfig?.enableFlowMessages) {
      console.log('📴 Flow messages disabled for tenant:', this.tenant._id);
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    const flowId = flowConfig?.orderCompletionFlowId;
    if (!flowId) {
      console.error('❌ Order completion flow ID not configured');
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    if (!this.accessToken || !this.phoneNumberId) {
      console.error('❌ WhatsApp configuration incomplete');
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const flowToken = crypto.randomBytes(32).toString('hex');
    const totalItems = orderData.items?.length || 0;
    const totalAmount = orderData.total || '0';
    const currency = orderData.currency || 'INR';

    // ✅ FIX 3: Use tenant-specific flow message content
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: {
          type: 'text',
          text: flowConfig.flowMessage?.header || '🛍️ Complete Your Order'
        },
        body: {
          text: flowConfig.flowMessage?.body ||
                `You've selected ${totalItems} item(s) worth ${currency} ${totalAmount}.\n\nPlease provide your delivery details to complete the order.`
        },
        footer: {
          text: flowConfig.flowMessage?.footer || 'Powered by GoWhats!'
        },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: flowId,
            flow_token: flowToken,
            flow_cta: flowConfig.flowMessage?.ctaButtonText || 'Complete Order',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'DETAILS',
              data: {
                order_total: totalAmount,
                currency: currency,
                item_count: totalItems
              }
            }
          }
        }
      }
    };

    console.log('📱 Sending flow with tenant config:', {
      flowId,
      to: formattedPhone,
      header: messagePayload.interactive.header.text,
      ctaButton: messagePayload.interactive.action.parameters.flow_cta
    });

    const response = await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      messagePayload,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('📤 WhatsApp API Response:', {
      status: response.status,
      messageId: response.data?.messages?.[0]?.id
    });

    if (response.status !== 200 || !response.data?.messages) {
      throw new Error(`WhatsApp API returned status ${response.status}: ${JSON.stringify(response.data)}`);
    }

    // ✅ FIX 4: Store flow token with correct type
    await this.storeFlowToken(
      flowToken,
      flowId,
      formattedPhone,
      orderData,
      'order_completion' // CRITICAL: Mark as order flow
    );

    console.log('✅ Order flow sent successfully:', {
      messageId: response.data.messages[0]?.id,
      recipient: formattedPhone,
      flowId: flowId
    });

    return response.data;

  } catch (error) {
    console.error('❌ Failed to send order flow:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
      tenantId: this.tenant._id
    });

    return await this.sendFallbackOrderMessage(to, orderData);
  }
}

  async sendFallbackOrderMessage(to, orderData) {
        const message = `Thank you for your order! We have received it and will get back to you shortly to confirm the details.`;
        return this.sendMessage(to, message);
    }


async storeFlowToken(token, flowId, phoneNumber, contextData = null, flowType = 'order_completion', registrationConfigId = null) {
  try {
    const FlowToken = require('../models/FlowToken');

    // Delete any existing active tokens for this phone number
    await FlowToken.deleteMany({
      tenantId: this.tenant._id.toString(),
      phoneNumber: phoneNumber,
      status: 'active'
    });

    const tokenData = {
      tenantId: this.tenant._id.toString(),
      token: token,
      flowId: flowId,
      phoneNumber: phoneNumber,
      flowType: flowType, // ✅ CRITICAL: Always set the flow type
      status: 'active',
      createdAt: new Date()
    };

    // Add context data if provided
    if (contextData) {
      tokenData.contextData = contextData;
    }

    // Add registration config ID if provided
    if (registrationConfigId) {
      tokenData.registrationConfigId = registrationConfigId;
    }

    const newToken = await FlowToken.create(tokenData);

    console.log('📝 Flow token stored successfully:', {
      token: token.substring(0, 8) + '...',
      flowId: flowId,
      phoneNumber: phoneNumber,
      flowType: flowType,
      registrationConfigId: registrationConfigId || 'N/A',
      tokenId: newToken._id
    });

    return newToken;
  } catch (error) {
    console.error('❌ Failed to store flow token:', error);
    throw error;
  }
}

async sendTrackingNotification(phone, trackingData) {
  try {
    const { customerName, orderId, trackingNumber, weight, trackingUrl } = trackingData;

    return await this.sendTemplateMessage(
      'tracking_notification',
      phone,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: orderId },
            { type: 'text', text: trackingNumber },
            { type: 'text', text: weight },
            { type: 'text', text: trackingUrl }
          ]
        }
      ]
    );
  } catch (error) {
    console.error('❌ Failed to send tracking notification template:', error);
    throw error;
  }
}

/**
 * Sends a shipping method selection list to customer
 * @param {string} to - Customer phone number
 * @param {Object} shippingData - Shipping calculation data
 * @returns {Promise<Object>} Message sending result
 */
async sendShippingMethodsList(to, shippingData) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const {
      orderAmount,
      itemCount = 1,
      packageWeight = 0.5,
      shippingOptions = [],
      customerName = 'Customer'
    } = shippingData;

    // Filter only eligible options
    const eligibleOptions = shippingOptions.filter(option => option.isEligible);

    if (eligibleOptions.length === 0) {
      // Send no options available message
      const noOptionsMessage = `Dear ${customerName},

Unfortunately, no shipping options are currently available for your location.

Our team will contact you shortly to arrange alternative delivery methods.

Order Details:
💰 Amount: ₹${orderAmount.toFixed(2)}
📦 Items: ${itemCount}
⚖️ Weight: ${packageWeight}kg

Thank you for your patience! 🙏`;

      return await this.sendMessage(formattedPhone, noOptionsMessage);
    }

    // Create list message payload

    const listMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: {
                type: 'text',
                text: '🚚 Choose Your Shipping Method'
            },
            body: {
                text: `Hi ${customerName}! Please select your preferred shipping method for your order of ₹${orderAmount.toFixed(2)}.`
            },
            footer: {
                text: 'Tap an option below to select'
            },
            action: {
                // ✅ FIX: Shortened button text to meet 20-character limit
                button: 'View Options',
                sections: [{
                    title: 'Available Delivery Methods',
                    rows: eligibleOptions.map(option => {
                let description = '';

                // Cost
                if (option.isFreeShipping || option.shippingCost === 0) {
                  description += '🆓 FREE SHIPPING';
                } else {
                  description += `₹${option.shippingCost.toFixed(2)}`;
                }

                // Delivery time
                if (option.estimatedDeliveryTime) {
                  description += ` • ⏱️ ${option.estimatedDeliveryTime}`;
                }

                // COD availability
                if (option.supportsCOD) {
                  description += ' • 💰 COD Available';
                }

                // Add savings info for free shipping
                if (option.isFreeShipping && option.savings > 0) {
                  description += ` • 💸 Save ₹${option.savings.toFixed(2)}`;
                }

                return {
                  id: `shipping_${option.methodId}`,
                  title: option.methodName,
                  description: description.substring(0, 72)
                };
              })
            }
          ]
        }
      }
    };

    console.log('📤 Sending shipping methods list:', {
      to: formattedPhone,
      optionsCount: eligibleOptions.length,
      orderAmount: orderAmount
    });

    const response = await axios.post(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
      listMessage,
      {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Shipping methods list sent successfully');
    return response.data;

  } catch (error) {
    console.error('❌ Failed to send shipping methods list:', {
      error: error.response?.data || error.message,
      to: to
    });
    throw error;
  }
}

/**
 * Sends shipping confirmation message
 * @param {string} to - Customer phone number
 * @param {Object} confirmationData - Shipping confirmation details
 * @returns {Promise<Object>} Message sending result
 */
async sendShippingConfirmation(to, confirmationData) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const {
      customerName = 'Customer',
      selectedMethod,
      orderAmount,
      shippingCost,
      totalAmount,
      orderNumber,
      deliveryAddress,
      estimatedDelivery,
      trackingInfo
    } = confirmationData;

    let confirmationMessage = `✅ *Shipping Confirmed!*

Dear ${customerName}, your shipping method has been confirmed.

🚚 **Delivery Method:** ${selectedMethod}
💰 **Shipping Cost:** `;

    if (shippingCost === 0) {
      confirmationMessage += `FREE 🆓`;
    } else {
      confirmationMessage += `₹${shippingCost.toFixed(2)}`;
    }

    confirmationMessage += `

📦 **Order Summary:**`;

    if (orderNumber) {
      confirmationMessage += `
• Order #: ${orderNumber}`;
    }

    confirmationMessage += `
• Order Value: ₹${orderAmount.toFixed(2)}
• Shipping: ₹${shippingCost.toFixed(2)}
• **Total: ₹${totalAmount.toFixed(2)}**`;

    if (deliveryAddress) {
      confirmationMessage += `

📍 **Delivery Address:**
${deliveryAddress.name}
${deliveryAddress.addressLine1}`;

      if (deliveryAddress.addressLine2) {
        confirmationMessage += `
${deliveryAddress.addressLine2}`;
      }

      confirmationMessage += `
${deliveryAddress.city}, ${deliveryAddress.state} - ${deliveryAddress.pincode}`;
    }

    if (estimatedDelivery) {
      confirmationMessage += `

⏱️ **Estimated Delivery:** ${estimatedDelivery}`;
    }

    confirmationMessage += `

🎉 Your order is being processed! You'll receive tracking details once your order is shipped.`;

    if (trackingInfo?.url) {
      confirmationMessage += `

🔍 **Track your order:** ${trackingInfo.url}`;
    }

    confirmationMessage += `

Need help? Just reply to this message.
Thank you for choosing us! 🙏`;

    const response = await this.sendMessage(formattedPhone, confirmationMessage);

    console.log('✅ Shipping confirmation sent successfully');
    return response;

  } catch (error) {
    console.error('❌ Failed to send shipping confirmation:', error);
    throw error;
  }
}

/**
 * Sends shipping update notification
 * @param {string} to - Customer phone number
 * @param {Object} updateData - Shipping update details
 * @returns {Promise<Object>} Message sending result
 */
async sendShippingUpdate(to, updateData) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const {
      customerName = 'Customer',
      orderNumber,
      status,
      trackingNumber,
      carrierName,
      estimatedDelivery,
      trackingUrl,
      currentLocation
    } = updateData;

    const statusEmojis = {
      'confirmed': '✅',
      'processing': '⚡',
      'shipped': '🚚',
      'in_transit': '🛫',
      'out_for_delivery': '🚛',
      'delivered': '📦',
      'cancelled': '❌',
      'returned': '↩️'
    };

    const statusMessages = {
      'confirmed': 'Order Confirmed',
      'processing': 'Order Processing',
      'shipped': 'Order Shipped',
      'in_transit': 'In Transit',
      'out_for_delivery': 'Out for Delivery',
      'delivered': 'Delivered',
      'cancelled': 'Order Cancelled',
      'returned': 'Order Returned'
    };

    const emoji = statusEmojis[status] || '📦';
    const statusText = statusMessages[status] || status;

    let updateMessage = `${emoji} *${statusText}*

Hi ${customerName}!`;

    if (orderNumber) {
      updateMessage += `

📦 **Order:** #${orderNumber}`;
    }

    updateMessage += `
🚚 **Status:** ${statusText}`;

    if (carrierName) {
      updateMessage += `
🏢 **Carrier:** ${carrierName}`;
    }

    if (trackingNumber) {
      updateMessage += `
🔍 **Tracking:** ${trackingNumber}`;
    }

    if (currentLocation) {
      updateMessage += `
📍 **Location:** ${currentLocation}`;
    }

    if (estimatedDelivery) {
      updateMessage += `
⏱️ **ETA:** ${estimatedDelivery}`;
    }

    if (trackingUrl) {
      updateMessage += `

🔗 **Track your order:** ${trackingUrl}`;
    }

    if (status === 'delivered') {
      updateMessage += `

🎉 Your order has been delivered! We hope you love your purchase.

Please rate your experience and let us know how we did!`;
    } else if (status === 'out_for_delivery') {
      updateMessage += `

📞 The delivery partner will contact you shortly. Please keep your phone accessible.`;
    }

    updateMessage += `

Questions? Just reply to this message. Thank you! 🙏`;

    const response = await this.sendMessage(formattedPhone, updateMessage);

    console.log('✅ Shipping update sent successfully:', {
      status: status,
      orderNumber: orderNumber
    });

    return response;

  } catch (error) {
    console.error('❌ Failed to send shipping update:', error);
    throw error;
  }
}

/**
 * Sends delivery reminder message
 * @param {string} to - Customer phone number
 * @param {Object} reminderData - Delivery reminder details
 * @returns {Promise<Object>} Message sending result
 */
async sendDeliveryReminder(to, reminderData) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const {
      customerName = 'Customer',
      orderNumber,
      deliveryDate,
      timeSlot,
      deliveryAddress,
      contactNumber,
      specialInstructions
    } = reminderData;

    let reminderMessage = `🔔 *Delivery Reminder*

Hi ${customerName}!

Your order is scheduled for delivery:`;

    if (orderNumber) {
      reminderMessage += `

📦 **Order:** #${orderNumber}`;
    }

    reminderMessage += `
📅 **Date:** ${deliveryDate}`;

    if (timeSlot) {
      reminderMessage += `
⏰ **Time:** ${timeSlot}`;
    }

    if (deliveryAddress) {
      reminderMessage += `

📍 **Address:**
${deliveryAddress}`;
    }

    if (contactNumber) {
      reminderMessage += `

📞 **Delivery Partner:** ${contactNumber}`;
    }

    reminderMessage += `

✅ **Please ensure:**
• Someone is available to receive the order
• Contact number is reachable
• Address is easily accessible`;

    if (specialInstructions) {
      reminderMessage += `

📝 **Special Instructions:**
${specialInstructions}`;
    }

    reminderMessage += `

Need to reschedule? Reply to this message.

Thank you! 🙏`;

    const response = await this.sendMessage(formattedPhone, reminderMessage);

    console.log('✅ Delivery reminder sent successfully');
    return response;

  } catch (error) {
    console.error('❌ Failed to send delivery reminder:', error);
    throw error;
  }
}

/**
 * Sends shipping delay notification
 * @param {string} to - Customer phone number
 * @param {Object} delayData - Delay notification details
 * @returns {Promise<Object>} Message sending result
 */
async sendShippingDelayNotification(to, delayData) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const {
      customerName = 'Customer',
      orderNumber,
      originalDate,
      newDate,
      reason,
      compensation
    } = delayData;

    let delayMessage = `⏳ *Delivery Update*

Hi ${customerName},

We have an important update about your order delivery:`;

    if (orderNumber) {
      delayMessage += `

📦 **Order:** #${orderNumber}`;
    }

    delayMessage += `
📅 **Original ETA:** ${originalDate}
📅 **New ETA:** ${newDate}`;

    if (reason) {
      delayMessage += `

📝 **Reason:** ${reason}`;
    }

    delayMessage += `

🙏 We sincerely apologize for this inconvenience. We're working hard to get your order to you as soon as possible.`;

    if (compensation) {
      delayMessage += `

🎁 **As an apology:**
${compensation}`;
    }

    delayMessage += `

📞 Have questions? Just reply to this message.

Thank you for your patience and understanding! 💙`;

    const response = await this.sendMessage(formattedPhone, delayMessage);

    console.log('✅ Shipping delay notification sent successfully');
    return response;

  } catch (error) {
    console.error('❌ Failed to send delay notification:', error);
    throw error;
  }
}


async sendOrderCompletionFlow(to, orderData) {
  try {
    console.log('🚀 Starting sendOrderCompletionFlow with state data...');

    const Catalog = require('../models/settings');
    const settings = await Catalog.findOne({
      tenant_id: this.tenant._id.toString()
    });

    if (!settings) {
      console.error('❌ No settings found for tenant:', this.tenant._id);
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    const flowConfig = settings.flowConfig;

    if (!flowConfig?.enableFlowMessages) {
      console.log('📴 Flow messages disabled for tenant:', this.tenant._id);
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    const flowId = flowConfig?.orderCompletionFlowId;
    if (!flowId) {
      console.error('❌ Order completion flow ID not configured');
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    if (!this.tenant.whatsappConfig?.accessToken || !this.tenant.whatsappConfig?.phoneNumberId) {
      console.error('❌ WhatsApp configuration incomplete');
      return await this.sendFallbackOrderMessage(to, orderData);
    }

    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const flowToken = crypto.randomBytes(32).toString('hex');
    const totalItems = orderData.items?.length || 0;
    const totalAmount = orderData.total || '0';
    const currency = orderData.currency || 'INR';

    const stateData = [
      {"id": "AP", "title": "Andhra Pradesh"},
      {"id": "AR", "title": "Arunachal Pradesh"},
      {"id": "AS", "title": "Assam"},
      {"id": "BR", "title": "Bihar"},
      {"id": "CT", "title": "Chhattisgarh"},
      {"id": "GA", "title": "Goa"},
      {"id": "GJ", "title": "Gujarat"},
      {"id": "HR", "title": "Haryana"},
      {"id": "HP", "title": "Himachal Pradesh"},
      {"id": "JH", "title": "Jharkhand"},
      {"id": "KA", "title": "Karnataka"},
      {"id": "KL", "title": "Kerala"},
      {"id": "MP", "title": "Madhya Pradesh"},
      {"id": "MH", "title": "Maharashtra"},
      {"id": "MN", "title": "Manipur"},
      {"id": "ML", "title": "Meghalaya"},
      {"id": "MZ", "title": "Mizoram"},
      {"id": "NL", "title": "Nagaland"},
      {"id": "OR", "title": "Odisha"},
      {"id": "PB", "title": "Punjab"},
      {"id": "RJ", "title": "Rajasthan"},
      {"id": "SK", "title": "Sikkim"},
      {"id": "TN", "title": "Tamil Nadu"},
      {"id": "TG", "title": "Telangana"},
      {"id": "TR", "title": "Tripura"},
      {"id": "UP", "title": "Uttar Pradesh"},
      {"id": "UT", "title": "Uttarakhand"},
      {"id": "WB", "title": "West Bengal"},
      {"id": "AN", "title": "Andaman and Nicobar Islands"},
      {"id": "CH", "title": "Chandigarh"},
      {"id": "DN", "title": "Dadra and Nagar Haveli and Daman and Diu"},
      {"id": "DL", "title": "Delhi"},
      {"id": "JK", "title": "Jammu and Kashmir"},
      {"id": "LA", "title": "Ladakh"},
      {"id": "LD", "title": "Lakshadweep"},
      {"id": "PY", "title": "Puducherry"}
    ];

    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: {
          type: 'text',
          text: '🛍️ Complete Your Order'
        },
        body: {
          text: `You've selected ${totalItems} item(s) worth ${currency} ${totalAmount}.\n\nPlease provide your delivery details to complete the order.`
        },
        footer: {
          text: 'Powered by GoWhats!'
        },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: flowId,
            flow_token: flowToken,
            flow_cta: 'Complete Order',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'DETAILS',
              data: {
                state: stateData
              }
            }
          }
        }
      }
    };

    console.log('📱 Sending flow message with embedded state data:', {
      flowId,
      to: formattedPhone,
      totalItems,
      totalAmount,
      stateCount: stateData.length
    });

    const response = await axios.post(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
      messagePayload,
      {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('📤 WhatsApp API Response:', {
      status: response.status,
      messageId: response.data?.messages?.[0]?.id
    });

    if (response.status !== 200 || !response.data?.messages) {
      throw new Error(`WhatsApp API returned status ${response.status}: ${JSON.stringify(response.data)}`);
    }

    await this.storeFlowToken(flowToken, flowId, formattedPhone, orderData);

    console.log('✅ Flow message sent successfully with embedded state data:', {
      messageId: response.data.messages[0]?.id,
      recipient: formattedPhone,
      flowId: flowId,
      statesIncluded: stateData.length
    });

    return response.data;

  } catch (error) {
    console.error('❌ Failed to send flow message:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
      tenantId: this.tenant._id
    });

    return await this.sendFallbackOrderMessage(to, orderData);
  }
}

async sendFallbackOrderMessage(to, orderData) {
  try {
    console.log('📧 Sending fallback order message...');

    const fallbackMessage = `🛍️ Thank you for your order!\n\n` +
      `Items: ${orderData.items?.length || 0}\n` +
      `Total: ${orderData.currency || 'INR'} ${orderData.total || '0'}\n\n` +
      `We'll process your order and get back to you shortly.`;

    const response = await this.sendMessage(to, fallbackMessage);
    console.log('✅ Fallback message sent successfully');
    return response;

  } catch (fallbackError) {
    console.error('❌ Fallback message also failed:', fallbackError);
    throw fallbackError;
  }
}


async storeFlowToken(token, flowId, phoneNumber, orderData) {
  try {
    const FlowToken = require('../models/FlowToken');

    await FlowToken.deleteMany({
      tenantId: this.tenant._id.toString(),
      phoneNumber: phoneNumber,
      status: 'active'
    });

    const newToken = await FlowToken.create({
      tenantId: this.tenant._id.toString(),
      token: token,
      flowId: flowId,
      phoneNumber: phoneNumber,
      orderData: orderData,
      status: 'active',
      createdAt: new Date()
    });

    console.log('📝 Flow token stored successfully:', {
      token: token.substring(0, 8) + '...',
      flowId: flowId,
      phoneNumber: phoneNumber,
      tokenId: newToken._id
    });

    return newToken;
  } catch (error) {
    console.error('❌ Failed to store flow token:', error);
    throw error;
  }
}


async testFlowConfiguration() {
  try {
    const Catalog = require('../models/settings');
    const settings = await Catalog.findOne({
      tenant_id: this.tenant._id.toString()
    });

    if (!settings) {
      throw new Error('Settings not found');
    }

    const flowConfig = settings.flowConfig;

    if (!flowConfig?.enableFlowMessages) {
      throw new Error('Flow messages are disabled');
    }

    if (!flowConfig?.orderCompletionFlowId) {
      throw new Error('Flow ID not configured');
    }

    if (!this.tenant.whatsappConfig?.accessToken) {
      throw new Error('WhatsApp access token not configured');
    }

    if (!this.tenant.whatsappConfig?.phoneNumberId) {
      throw new Error('WhatsApp phone number ID not configured');
    }

    return {
      success: true,
      message: 'Flow configuration is valid',
      flowId: flowConfig.orderCompletionFlowId,
      enabled: flowConfig.enableFlowMessages,
      autoSend: flowConfig.autoSendOrderFlow
    };

  } catch (error) {
    console.error('❌ Flow configuration test failed:', error);
    throw error;
  }
}


async getFlowConfiguration() {
  try {
    const Catalog = require('../models/settings');
    const settings = await Catalog.findOne({
      tenant_id: this.tenant._id.toString()
    });

    if (!settings) {
      return {
        orderCompletionFlowId: "",
        enableFlowMessages: false,
        autoSendOrderFlow: true,
        flowEndpointUrl: "",
        lastFlowUpdate: null
      };
    }

    return settings.flowConfig || {
      orderCompletionFlowId: "",
      enableFlowMessages: false,
      autoSendOrderFlow: true,
      flowEndpointUrl: "",
      lastFlowUpdate: null
    };
  } catch (error) {
    console.error('❌ Error getting flow configuration:', error);
    throw error;
  }
}

async sendMinimalOrderFlow(to, orderData) {
  try {
    const flowId = this.tenant.flowConfig?.orderCompletionFlowId;
    const formattedPhone = this.formatPhoneNumber(to);
    const flowToken = crypto.randomBytes(32).toString('hex');

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: {
          text: `Complete your order: ${orderData.items?.length || 0} items, ${orderData.currency || 'INR'} ${orderData.total || '0'}`
        },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: flowId,
            flow_token: flowToken,
            flow_cta: 'Complete Order',
            mode: 'published'
          }
        }
      }
    };

    console.log('📦 Sending minimal flow message:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    await this.storeFlowToken(flowToken, flowId, formattedPhone, orderData);
    return response.data;

  } catch (error) {
    console.error('❌ Minimal flow failed:', error.response?.data);
    throw error;
  }
}

/**
 * Sends a flow message using the WhatsApp API
 * @param {Object} messagePayload - Complete message payload
 * @returns {Promise<Object>} Message sending result
 */
async sendFlowMessage(messagePayload) {
  try {
    console.log('📤 Sending flow message');

    // ✅ Validate the payload structure before sending
    if (!messagePayload.to || typeof messagePayload.to !== 'string') {
      throw new Error('Invalid payload: "to" must be a phone number string');
    }

    if (!messagePayload.type || messagePayload.type !== 'interactive') {
      throw new Error('Invalid payload: "type" must be "interactive"');
    }

    if (!messagePayload.interactive || messagePayload.interactive.type !== 'flow') {
      throw new Error('Invalid payload: "interactive.type" must be "flow"');
    }

    console.log('📋 Flow message validation passed');

    const response = await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      messagePayload, // Use the payload exactly as provided
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Flow sent:', response.data.messages?.[0]?.id);
    return response.data;

  } catch (error) {
    console.error('❌ Flow error:', {
      message: error.message,
      response: error.response?.data,
      payload: error.config?.data ? JSON.parse(error.config.data).to : 'N/A'
    });
    throw error;
  }
}

/**
 * Generate a unique flow token
 * @returns {string} Flow token
 */
generateFlowToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a unique order ID
 * @returns {string} Order ID
 */
generateOrderId() {
  return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Store flow token for validation
 * @param {string} token - Flow token
 * @param {string} flowId - Flow ID
 * @param {string} phoneNumber - Phone number
 * @param {Object} orderData - Order data
 * @returns {Promise<void>}
 */
async storeFlowToken(token, flowId, phoneNumber, orderData) {
  try {
    const FlowToken = require('../models/FlowToken');

    await FlowToken.deleteMany({
      tenantId: this.tenant._id.toString(),
      phoneNumber: phoneNumber,
      status: 'active'
    });

    const newToken = await FlowToken.create({
      tenantId: this.tenant._id.toString(),
      token: token,
      flowId: flowId,
      phoneNumber: phoneNumber,
      orderData: orderData,
      status: 'active',
      createdAt: new Date()
    });

    console.log('📝 Flow token stored successfully:', {
      token: token.substring(0, 8) + '...',
      flowId: flowId,
      phoneNumber: phoneNumber,
      tokenId: newToken._id
    });

    return newToken;
  } catch (error) {
    console.error('❌ Failed to store flow token:', error);
    throw error;
  }
}

  formatPhoneNumber(phone) {
  if (!phone) return null;

  // Convert to string, remove spaces/dashes/parens/+
  let cleaned = String(phone).replace(/[\s\-\(\)\+]/g, '');
  
  // Remove all non-digits
  cleaned = cleaned.replace(/\D/g, '');

  // Validate E.164 range (7–15 digits)
  if (cleaned.length < 7 || cleaned.length > 15) {
    console.warn('⚠️ Invalid phone number length:', cleaned);
    return cleaned; // Return as-is rather than null
  }

  // Return as-is — WhatsApp numbers always come WITH country code
  return cleaned;
}


/**
 * Send a generic flow message
 * @param {string} to - Recipient phone number
 * @param {string} flowId - Flow ID
 * @param {Object} options - Flow options
 * @returns {Promise<Object>} Message sending result
 */
async sendGenericFlow(to, flowId, options = {}) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const flowToken = this.generateFlowToken();

    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: options.header || {
          type: 'text',
          text: 'Flow Message'
        },
        body: {
          text: options.bodyText || 'Please complete the following form.'
        },
        footer: {
          text: options.footerText || 'Powered by WhatsApp'
        },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: flowId,
            flow_token: flowToken,
            flow_cta: options.ctaText || 'Continue',
            mode: process.env.NODE_ENV === 'production' ? 'published' : 'draft'
          }
        }
      }
    };

    if (options.actionPayload) {
      messagePayload.interactive.action.parameters.flow_action_payload =
        typeof options.actionPayload === 'string'
          ? options.actionPayload
          : JSON.stringify(options.actionPayload);
    }

    const response = await this.sendFlowMessage(messagePayload);

    if (response) {
      await this.storeFlowToken(flowToken, flowId, formattedPhone, options.data || {});
    }

    return response;

  } catch (error) {
    console.error('❌ Failed to send generic flow:', error);
    throw error;
  }
}

  /**
   * Sends a template message using standardized template formats
   * @param {string} templateType - Type of template to send (e.g., 'order_confirmation')
   * @param {string} phone - Recipient phone number in E.164 format
   * @param {Object} data - Data to fill template parameters
   * @param {string} language - Language code (default: 'en')
   * @returns {Promise<Object>} Message sending result
   */
  async sendStandardTemplate(templateType, phone, data, language = 'en') {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      if (!formattedPhone) {
        throw new Error(`Invalid phone number: ${phone}`);
      }

      const templateConfig = this.standardTemplates[templateType];
      if (!templateConfig) {
        throw new Error(`Unknown template type: ${templateType}`);
      }

      console.log(`Sending ${templateType} template to ${formattedPhone}`, {
        tenantId: this.tenant._id,
        templateName: templateConfig.name,
        data: JSON.stringify(data)
      });

      try {
        const result = await this.sendTemplateMessage(
          templateConfig.name,
          formattedPhone,
          templateConfig.components(data),
          language
        );

        console.log(`Successfully sent ${templateType} template`, {
          messageId: result.messages?.[0]?.id,
          recipient: formattedPhone
        });

        return result;
      } catch (primaryError) {
        console.warn(`Primary template ${templateConfig.name} failed:`, primaryError.message);

        if (templateConfig.fallback) {
          console.log(`Attempting fallback template: ${templateConfig.fallback}`);

          const fallbackResult = await this.sendTemplateMessage(
            templateConfig.fallback,
            formattedPhone,
            templateConfig.components(data),
            language
          );

          console.log(`Successfully sent fallback ${templateConfig.fallback} template`, {
            messageId: fallbackResult.messages?.[0]?.id,
            recipient: formattedPhone
          });

          return fallbackResult;
        }

        console.log(`Attempting plain text fallback for ${templateType}`);
        const textFallback = this.getTextFallback(templateType, data);

        if (textFallback) {
          return await this.sendMessage(formattedPhone, textFallback);
        }

        throw primaryError;
      }
    } catch (error) {
      console.error(`Failed to send ${templateType} template:`, error);
      throw error;
    }
  }


async sendMediaMessage(to, mediaType, mediaData, caption = '') {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) {
        throw new Error(`Invalid phone number: ${to}`);
      }

      let payload;

      switch (mediaType.toLowerCase()) {
        case 'image':
          payload = await this.createImageMessage(formattedPhone, mediaData, caption);
          break;
        case 'video':
          payload = await this.createVideoMessage(formattedPhone, mediaData, caption);
          break;
        case 'audio':
          payload = await this.createAudioMessage(formattedPhone, mediaData);
          break;
        case 'document':
          payload = await this.createDocumentMessage(formattedPhone, mediaData, caption);
          break;

        // ✅ NEW: Sticker Support
        case 'sticker':
          // For stickers, mediaData is expected to be the file object
          payload = await this.createStickerMessage(formattedPhone, mediaData);
          break;

        // ✅ UPDATED: Location Support
        case 'location':
          // mediaData must contain { latitude, longitude, name, address }
          payload = this.createLocationMessage(formattedPhone, mediaData);
          break;

        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }

      console.log(`Sending ${mediaType} message to ${formattedPhone}:`, JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ ${mediaType} message sent successfully`);
      return response.data;

    } catch (error) {
      console.error(`❌ Failed to send ${mediaType} message:`, error.response?.data || error.message);
      throw error;
    }
  }


async createImageMessage(to, imageData, caption = '') {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'image',
    image: {}
  };

  if (imageData.url || imageData.link) {
    payload.image.link = imageData.url || imageData.link;
  } else if (imageData.id || imageData.media_id) {
    payload.image.id = imageData.id || imageData.media_id;
  } else if (imageData.file) {
    const uploadResult = await this.uploadMediaFile(imageData.file, 'image');
    payload.image.id = uploadResult.id;
  } else {
    throw new Error('Image data must include url, id, or file');
  }

  if (caption) {
    payload.image.caption = caption;
  }

  return payload;
}


async createVideoMessage(to, videoData, caption = '') {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'video',
    video: {}
  };

  if (videoData.url || videoData.link) {
    payload.video.link = videoData.url || videoData.link;
  } else if (videoData.id || videoData.media_id) {
    payload.video.id = videoData.id || videoData.media_id;
  } else if (videoData.file) {
    const uploadResult = await this.uploadMediaFile(videoData.file, 'video');
    payload.video.id = uploadResult.id;
  } else {
    throw new Error('Video data must include url, id, or file');
  }

  if (caption) {
    payload.video.caption = caption;
  }

  return payload;
}


async createAudioMessage(to, audioData) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'audio',
    audio: {}
  };

  if (audioData.url || audioData.link) {
    payload.audio.link = audioData.url || audioData.link;
  } else if (audioData.id || audioData.media_id) {
    payload.audio.id = audioData.id || audioData.media_id;
  } else if (audioData.file) {
    const uploadResult = await this.uploadMediaFile(audioData.file, 'audio');
    payload.audio.id = uploadResult.id;
  } else {
    throw new Error('Audio data must include url, id, or file');
  }

  return payload;
}


async createDocumentMessage(to, documentData, caption = '') {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'document',
    document: {}
  };

  if (documentData.url || documentData.link) {
    payload.document.link = documentData.url || documentData.link;
  } else if (documentData.id || documentData.media_id) {
    payload.document.id = documentData.id || documentData.media_id;
  } else if (documentData.file) {
    const uploadResult = await this.uploadMediaFile(documentData.file, 'document');
    payload.document.id = uploadResult.id;
  } else {
    throw new Error('Document data must include url, id, or file');
  }

  if (caption) {
    payload.document.caption = caption;
  }

  if (documentData.filename) {
    payload.document.filename = documentData.filename;
  }

  return payload;
}


createLocationMessage(to, locationData) {
  if (!locationData.latitude || !locationData.longitude) {
    throw new Error('Location data must include latitude and longitude');
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'location',
    location: {
      latitude: parseFloat(locationData.latitude),
      longitude: parseFloat(locationData.longitude)
    }
  };

  if (locationData.name) {
    payload.location.name = locationData.name;
  }

  if (locationData.address) {
    payload.location.address = locationData.address;
  }

  return payload;
}


async uploadMediaFile(file, mediaType) {
      try {
        if (!this.accessToken || !this.phoneNumberId) {
          throw new Error('WhatsApp configuration missing');
        }

        // Create FormData
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');

        // 1. Handle Buffer (New logic for QR Codes generated in memory)
        if (file.buffer) {
          formData.append('file', file.buffer, {
            filename: file.originalname || `media.${mediaType === 'image' ? 'png' : 'bin'}`,
            contentType: file.mimetype || 'image/png'
          });
        }
        // 2. Handle File Path (Existing logic for disk files)
        else if (file.path) {
           // ✅ INCREASED LIMIT TO 64MB (WhatsApp supports up to 100MB generally, 16MB for template video)
           // If this is for a template, ensure the file itself is < 16MB.
           const stats = await fs.promises.stat(file.path);
           if (stats.size > 64 * 1024 * 1024) throw new Error('File too large (Max 64MB)');

           formData.append('file', fs.createReadStream(file.path), {
            filename: path.basename(file.path),
            contentType: file.mimetype
          });
        }

        const response = await axios.post(
          `${this.baseUrl}/${this.phoneNumberId}/media`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          }
        );
        return response.data;
      } catch (error) {
        console.error('Media Upload Failed:', error.message);
        throw error;
      }
  }

/**
 * Enhanced template sender with media support
 */
  async sendTemplateWithMedia(templateName, to, templateData = {}, language = 'en') {
  try {
    const components = [];

    // Header component
    if (templateData.header) {
      const headerComponent = { type: 'header', parameters: [] };
      const hType = templateData.header.type;
      const hData = templateData.header.data;

      if (['image', 'video', 'document'].includes(hType) && hData) {
        const mediaObj = {};
        if (hData.id) mediaObj.id = hData.id;
        else if (hData.url || hData.link) mediaObj.link = hData.url || hData.link;

        if (Object.keys(mediaObj).length > 0) {
          headerComponent.parameters.push({ type: hType, [hType]: mediaObj });
          components.push(headerComponent);
        }
      } else if (hType === 'text' && templateData.header.text) {
        headerComponent.parameters.push({ type: 'text', text: templateData.header.text });
        components.push(headerComponent);
      }
    }

    // Body component
    if (templateData.body?.parameters?.length > 0) {
      components.push({
        type: 'body',
        parameters: templateData.body.parameters.map(param => ({
          type: 'text',
          text: param.toString()
        }))
      });
    }

    // ✅ FIXED: Proper flow button component
    if (templateData.hasFlowButton) {
    const crypto = require('crypto');
    const flowToken = crypto.randomBytes(16).toString('hex');

    // ✅ Store token matching FlowToken model requirements
    try {
        const FlowToken = require('../models/FlowToken');
        await FlowToken.create({
            tenantId: this.tenant._id.toString(),
            token: flowToken,
            flowId: 'questions_flow',        // ✅ required field
            phoneNumber: 'broadcast',         // ✅ required field placeholder
            flowType: 'order_completion',     // ✅ use valid enum value
            status: 'active',
            contextData: { isQuestionsFlow: true },  // ✅ store flag here
            createdAt: new Date()
        });
        console.log('✅ Flow token stored for questions flow');
    } catch(e) {
        console.error('Could not store flow token:', e.message);
    }

    components.push({
        type: 'button',
        sub_type: 'flow',
        index: '0',
        parameters: [
            {
                type: 'action',
                action: {
                    flow_token: flowToken
                }
            }
        ]
    });
}

    return await this.sendTemplateMessage(templateName, to, components, language);

  } catch (error) {
    console.error('❌ Template with media failed:', error.message);
    throw error;
  }
}



async sendOrderConfirmation(phone, orderDetails) {
  try {
    // Ensure all required details are present
    const customerName = orderDetails.customerName || 'Customer';

    // Send template message with single parameter
    const result = await this.sendTemplateMessage(
      'order_confirmation',
      phone,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName }
          ]
        }
      ]
    );

    console.log('Order confirmation sent:', {
      phone,
      customerName,
      messageId: result.messages?.[0]?.id
    });

    return result;
  } catch (error) {
    console.error('Error in sendOrderConfirmation:', error);
    throw error;
  }
}

  /**
   * Sends shipping update template
   * @param {string} phone - Recipient phone number
   * @param {Object} shippingData - Shipping data
   * @returns {Promise<Object>} Message sending result
   */
  async sendShippingUpdate(phone, shippingData) {
    return this.sendStandardTemplate('shipping_update', phone, {
      customerName: shippingData.customerName,
      orderNumber: shippingData.orderNumber,
      trackingNumber: shippingData.trackingNumber,
      estimatedDelivery: shippingData.estimatedDelivery
    });
  }

  /**
   * Creates text fallback messages when templates fail
   * @param {string} templateType - Type of template
   * @param {Object} data - Template data
   * @returns {string} Fallback text message
   */
  getTextFallback(templateType, data) {
    switch (templateType) {
      case 'order_confirmation':
        return `Hi ${data.customerName}, thank you for your order! Your order #${data.orderNumber} for ${data.total} has been confirmed.`;

      case 'abandoned_cart':
        return `Hi ${data.customerName}, you have ${data.itemCount} items worth ${data.cartTotal} in your cart. Complete your purchase before they sell out!`;

      case 'shipping_update':
        return `Hi ${data.customerName}, your order #${data.orderNumber} has shipped! Track with number ${data.trackingNumber}. Estimated delivery: ${data.estimatedDelivery}.`;

      default:
        return null;
    }
  }

   sanitizeTemplateText(value) {
    return String(value ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  sanitizeTemplateComponents(components = []) {
    if (!Array.isArray(components)) {
      return [];
    }

    return components.map((component) => ({
      ...component,
      parameters: Array.isArray(component?.parameters)
        ? component.parameters.map((parameter) => (
            parameter?.type === 'text'
              ? {
                  ...parameter,
                  text: this.sanitizeTemplateText(parameter.text)
                }
              : parameter
          ))
        : component?.parameters
    }));
  }

  /**
   * Sends a template message to WhatsApp
   * @param {string} templateName - Name of template
   * @param {string} to - Recipient phone number
   * @param {Array} components - Template components
   * @param {string} language - Language code
   * @returns {Promise<Object>} Message sending result
   */
   async sendTemplateMessage(templateName, to, components = [], language = "en", options = {}) {
    const shouldLog = options?.silent !== true;

    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);
      const sanitizedComponents = this.sanitizeTemplateComponents(components);

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "template",
        template: {
          name: typeof templateName === 'object' ? templateName.name : templateName,
          language: { code: language },
          components: sanitizedComponents
        }
      };

    // Debug Log: Inspect the exact payload causing 132012 errors
   if (shouldLog) {
        console.log('📤 Sending Template Payload:', JSON.stringify(payload, null, 2));
      }

    const response = await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data;

  } catch (error) {
    const apiError = error.response?.data?.error;
    if (apiError && shouldLog) {
      console.error('❌ WhatsApp API Error:', {
        code: apiError.code,
        message: apiError.message,
        details: apiError.error_data?.details || 'No details'
      });
    } else if (shouldLog) {
      console.error('❌ Network/Internal Error:', error.message);
    }
    throw error;
  }
}

  async sendMessage(to, payload) {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`;

      // If payload is a string, convert it to a text message
      if (typeof payload === 'string') {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: payload }
        };
      }

      // Ensure the payload has the correct structure
      if (!payload.messaging_product) {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          ...payload
        };
      }

      console.log('Sending message payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('WhatsApp API Error:', error.response?.data || error);
      throw error;
    }
  }

  async sendMedia(to, file, caption = '') {
  try {
    // Validate file existence and size
    await fs.promises.access(file.path, fs.constants.F_OK);

    const stats = await fs.promises.stat(file.path);
    const fileSizeInMB = stats.size / (1024 * 1024);

    if (fileSizeInMB > 16) {
      throw new Error(`File too large: ${fileSizeInMB.toFixed(2)}MB (max 16MB)`);
    }

    // Determine media type
    let mediaType = 'document';
    if (file.mimetype) {
      if (file.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      }
    }

    // Read file data
    const fileData = await fs.promises.readFile(file.path);

    // Create FormData for upload
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', fileData, {
      filename: file.originalname || `media.${file.mimetype?.split('/')[1] || 'bin'}`,
      contentType: file.mimetype
    });

    console.log('WhatsApp Media Upload Details:', {
      mediaType,
      fileSize: `${fileSizeInMB.toFixed(2)}MB`,
      filename: file.originalname,
      mimeType: file.mimetype,
      caption: caption || 'No caption'
    });

    // Upload media to WhatsApp
    const uploadResponse = await axios.post(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000
      }
    );

    if (!uploadResponse.data || !uploadResponse.data.id) {
      throw new Error('Failed to get media ID from WhatsApp');
    }

    // Prepare media message payload
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: mediaType,
      [mediaType]: {
        id: uploadResponse.data.id
      }
    };

    // ✅ ADD CAPTION SUPPORT FOR ALL SUPPORTED MEDIA TYPES
    if (caption && ['image', 'video', 'document'].includes(mediaType)) {
      messagePayload[mediaType].caption = caption;
    }

    // Add filename for documents
    if (mediaType === 'document') {
      messagePayload[mediaType].filename = file.originalname || 'document';
    }

    console.log('Sending media message with payload:', JSON.stringify(messagePayload, null, 2));

    // Send media message
    const sendResponse = await axios.post(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
      messagePayload,
      {
        headers: {
          'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Generate media URL path
    const mediaUrlPath = `media/${this.tenant._id}/${path.basename(file.path)}`;

    return {
      ...sendResponse.data,
      mediaId: uploadResponse.data.id,
      mediaUrl: mediaUrlPath
    };

  } catch (error) {
    console.error('WhatsApp Media Upload Error:', error.response?.data || error.message);
    throw error;
  }
}

async uploadMedia(fileData, mimeType) {
  try {
    const supportedTypes = {
      audio: [
        'audio/aac',
        'audio/amr',
        'audio/mpeg',
        'audio/mp4',
        'audio/ogg',
        'audio/ogg; codecs=opus',  // ADD THIS
        'audio/webm',              // ADD THIS
        'audio/webm; codecs=opus'  // ADD THIS
      ],
      image: ['image/jpeg', 'image/png'],
      video: ['video/3gpp', 'video/mp4', 'video/webm']
    };

      const mediaType = Object.keys(supportedTypes).find(type =>
        supportedTypes[type].includes(mimeType)
      );

      if (!mediaType) {
        throw new Error('Unsupported media type');
      }

      // Prepare FormData
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', fileData, {
        filename: `media.${mimeType.split('/')[1]}`,
        contentType: mimeType
      });

      // Upload to WhatsApp
      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
            ...formData.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      return response.data;
    } catch (error) {
      console.error('WhatsApp Media Upload Error:', {
        message: error.response?.data || error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  createMediaMessagePayload(to, mediaType, mediaId, file) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: mediaType,
      [mediaType]: { id: mediaId }
    };

    // Add optional metadata for specific media types
    if (mediaType === 'document') {
      payload[mediaType].caption = file.originalname || '';
      payload[mediaType].filename = file.originalname || 'document';
    }

    return payload;
  }

/**
 * Sends WhatsApp Payment order_details message using Razorpay
 * @param {string} to - Customer phone number
 * @param {Object} orderData - Order and payment details
 * @returns {Promise<Object>} Message sending result
 */
async sendPaymentOrderDetails(to, paymentOrderData, customMessage = null) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    // 1. Prepare Text (With Fallbacks)
    let headerText = customMessage?.header || '💳 Complete Your Payment';
    let bodyText = customMessage?.body || 'Please review your details and complete the payment.';
    let footerText = customMessage?.footer || this.FOOTER_TEXT;

    // 2. Enforce WhatsApp API Limits (Critical to prevent 400 errors)
    // Header: Max 60 chars
    if (headerText.length > 60) {
      headerText = headerText.substring(0, 57) + '...';
    }

    // Footer: Max 60 chars
    if (footerText.length > 60) {
      footerText = footerText.substring(0, 57) + '...';
    }

    // Body: Max 1024 chars
    if (bodyText.length > 1024) {
      bodyText = bodyText.substring(0, 1021) + '...';
    }

    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'order_details',
        header: {
          type: 'text',
          text: headerText
        },
        body: {
          text: bodyText
        },
        footer: {
          text: footerText
        },
        action: {
          name: 'review_and_pay',
          parameters: paymentOrderData // This contains the 'digital-goods' vs 'physical-goods' logic passed from webhook
        }
      }
    };

    console.log('📤 Sending payment order details:', JSON.stringify(messagePayload, null, 2));

    const response = await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      messagePayload,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Payment order details sent successfully');
    return response.data;

  } catch (error) {
    console.error('❌ Failed to send payment order details:', {
      error: error.response?.data || error.message,
      to: to
    });
    throw error;
  }
}

/**
 * Sends enhanced shipping confirmation with proper free shipping display
 */
async sendEnhancedShippingConfirmation(to, confirmationData) {
  const formattedPhone = this.formatPhoneNumber(to);
  const {
    orderId,
    selectedMethod,
    shippingCost,
    totalAmount,
    orderAmount,
    customerName,
    isFreeShipping,
    deliveryAddress
  } = confirmationData;

  // ✅ Enhanced shipping cost display
  let shippingDisplay;
  if (shippingCost === 0) {
    shippingDisplay = isFreeShipping ? "🆓 FREE SHIPPING" : "₹0.00 (Free)";
  } else {
    shippingDisplay = `₹${shippingCost.toFixed(2)}`;
  }

  let message = `🚚 *Shipping Method Confirmed!*

Dear ${customerName}, your shipping details have been confirmed.

📦 *Order Details:*
- Order ID: *${orderId}*
- Order Amount: ₹${orderAmount.toFixed(2)}
- Shipping: ${shippingDisplay}
- *Total Amount: ₹${totalAmount.toFixed(2)}*

🚚 *Delivery Method:* ${selectedMethod}`;

  if (deliveryAddress) {
    message += `
📍 *Delivery Address:*
${deliveryAddress.name}
${deliveryAddress.addressLine1}
${deliveryAddress.city}, ${deliveryAddress.state} - ${deliveryAddress.pincode}`;
  }

  message += `

💡 Your payment link will be sent shortly to complete the order.

_Powered by GoWhats!_`;

  return this.sendMessage(formattedPhone, message);
}
/**
 * Lookup payment status for an order
 * @param {string} orderId - Order ID (reference_id)
 * @returns {Promise<Object>} Payment status details
 */
async lookupPaymentStatus(orderId) {
  try {
    // Get payment configuration from settings
    const Settings = require('../models/settings');
    const settings = await Settings.findOne({
      tenant_id: this.tenant._id.toString()
    });

    if (!settings?.flowConfig?.paymentConfigurationName) {
      throw new Error('Payment configuration not found in settings');
    }

    const paymentConfigName = settings.flowConfig.paymentConfigurationName;

    const response = await axios.get(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/payments/${paymentConfigName}/${orderId}`,
      {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`
        }
      }
    );

    console.log('✅ Payment status lookup successful:', response.data);
    return response.data;

  } catch (error) {
    console.error('❌ Payment status lookup failed:', {
      error: error.response?.data || error.message,
      orderId: orderId
    });
    throw error;
  }
}

/**
 * Send order status update message
 * @param {string} to - Customer phone number
 * @param {Object} orderStatusData - Order status details
 * @returns {Promise<Object>} Message sending result
 */
async sendOrderStatusUpdate(to, orderStatusData) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    const {
      orderId,
      status, // 'processing', 'shipped', 'completed', 'canceled'
      description,
      bodyText
    } = orderStatusData;

    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'order_status',
        body: {
          text: bodyText || `Your order status has been updated to: ${status}`
        },
        action: {
          name: 'review_order',
          parameters: {
            reference_id: orderId,
            order: {
              status: status,
              ...(description && { description: description })
            }
          }
        }
      }
    };

    const response = await axios.post(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
      messagePayload,
      {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Order status update sent successfully');
    return response.data;

  } catch (error) {
    console.error('❌ Failed to send order status update:', error);
    throw error;
  }
}
    async getTemplates() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.tenant.whatsappConfig.businessAccountId}/message_templates`,
        {
          headers: {
            Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to fetch templates:', error.message);
      return { data: [] };
    }
  }

  async getTemplateDetails(templateName) {
    try {
      const templates = await this.getTemplates();
      const template = templates.data?.find(t => t.name === templateName);

      if (!template) {
        throw new Error(`Template "${templateName}" not found`);
      }

      return {
        name: template.name,
        language: template.language,
        category: template.category,
        components: template.components || [],
        status: template.status
      };
    } catch (error) {
      console.error('Error fetching template details:', error);
      throw error;
    }
  }

  async createMessageTemplate(template) {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.businessAccountId}/message_templates`;

      const response = await axios.post(url, template, {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Template creation error:', error.response?.data || error);
      throw error;
    }
  }

  async downloadMedia(mediaId) {
    try {
      // Step 1: Get media URL
      const mediaUrlResponse = await axios.get(
        `${this.baseUrl}/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`
          }
        }
      );

      if (!mediaUrlResponse.data || !mediaUrlResponse.data.url) {
        throw new Error('Failed to get media URL');
      }

      // Step 2: Download media
      const mediaResponse = await axios.get(
        mediaUrlResponse.data.url,
        {
          headers: {
            'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`
          },
          responseType: 'arraybuffer'
        }
      );

      // Step 3: Return media data
      return {
        data: Buffer.from(mediaResponse.data),
        mimeType: mediaUrlResponse.data.mime_type
      };
    } catch (error) {
      console.error('Download media error:', error);
      throw error;
    }
  }

  async setBusinessPublicKey(publicKey) {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/whatsapp_business_encryption`;

      // Create form data for the request
      const formData = new URLSearchParams();
      formData.append('business_public_key', publicKey);

      const response = await axios.post(url, formData, {
        headers: {
          'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error setting business public key:', error.response?.data || error);
      throw error;
    }
  }

  async getBusinessPublicKey() {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/whatsapp_business_encryption`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting business public key:', error.response?.data || error);
      throw error;
    }
  }

  async sendTemplateByType(type, phone, templateData) {
    // Define template mappings
    const templates = {
      'order_confirmation': {
        name: 'order_confirmation',
        fallback: 'order_confirm', // Fallback template name if primary doesn't exist
        parameters: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: templateData.name || 'Customer' },
              { type: 'text', text: templateData.orderNumber || 'Unknown' },
              { type: 'text', text: templateData.total || '$0.00' }
            ]
          }
        ]
      },
      'abandoned_cart': {
        name: 'abandoned_cart',
        fallback: 'cart_reminder',
        parameters: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: templateData.itemCount?.toString() || '0' },
              { type: 'text', text: templateData.cartTotal || '$0.00' }
            ]
          }
        ]
      }
    };

    // Get template configuration
    const templateConfig = templates[type];
    if (!templateConfig) {
      throw new Error(`Template type "${type}" not defined`);
    }

    try {
      // Try primary template
      const result = await this.sendTemplateMessage(
        templateConfig.name,
        phone,
        templateConfig.parameters
      );
      return result;
    } catch (error) {
      console.warn(`Error sending primary template "${templateConfig.name}":`, error.message);

      // Try fallback template if exists
      if (templateConfig.fallback) {
        try {
          console.log(`Trying fallback template "${templateConfig.fallback}"...`);
          const fallbackResult = await this.sendTemplateMessage(
            templateConfig.fallback,
            phone,
            templateConfig.parameters
          );
          return fallbackResult;
        } catch (fallbackError) {
          console.error(`Error sending fallback template:`, fallbackError.message);
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
  }

  async sendFlowMessage(to, flowId, params = {}) {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`;

      // Generate a flow token for this session
      const flowToken = crypto.randomBytes(32).toString('hex');

      // Build message payload
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'flow',
          flow: {
            id: flowId,
            flow_token: flowToken,
            // Optional mode for testing
            mode: process.env.NODE_ENV === 'production' ? undefined : 'draft',
            // Set flow_action if we need to make a data exchange request
            // flow_action: 'data_exchange'
          }
        }
      };

      // Add any additional parameters if needed
      if (params.flow_action) {
        payload.interactive.flow.flow_action = params.flow_action;
      }

      if (params.flow_action_payload) {
        payload.interactive.flow.flow_action_payload =
          typeof params.flow_action_payload === 'string'
            ? params.flow_action_payload
            : JSON.stringify(params.flow_action_payload);
      }

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Store flow token for future validation
      await FlowToken.create({
        tenantId: this.tenant._id,
        phoneNumber: to,
        flowId,
        token: flowToken,
        createdAt: new Date()
      });

      return response.data;
    } catch (error) {
      console.error('Error sending flow message:', error.response?.data || error);
      throw error;
    }
  }

  async sendTriggeredFlow(to, triggerConfig = {}, contextData = {}) {
    try {
      if (!this.tenant?.whatsappConfig?.accessToken || !this.tenant?.whatsappConfig?.phoneNumberId) {
        throw new Error('WhatsApp configuration is incomplete');
      }

      const flowId = String(triggerConfig.flowId || '').trim();
      if (!flowId) {
        throw new Error('Flow ID is missing for this trigger');
      }

      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) {
        throw new Error(`Invalid phone number: ${to}`);
      }

      const flowToken = crypto.randomBytes(32).toString('hex');
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: {
            text: String(triggerConfig.messageText || 'Please fill out the form below.').slice(0, 1024)
          },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_id: flowId,
              flow_token: flowToken,
              flow_cta: String(triggerConfig.buttonLabel || 'Open Flow').slice(0, 20),
              mode: 'published'
            }
          }
        }
      };

      if (triggerConfig.flowAction) {
        payload.interactive.action.parameters.flow_action = triggerConfig.flowAction;
      }

      if (triggerConfig.flowActionPayload) {
        payload.interactive.action.parameters.flow_action_payload = triggerConfig.flowActionPayload;
      }

      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const FlowToken = require('../models/FlowToken');
      await FlowToken.create({
        tenantId: this.tenant._id.toString(),
        token: flowToken,
        flowId,
        phoneNumber: formattedPhone,
        flowType: 'custom',
        contextData: {
          source: 'flow_trigger',
          triggerId: String(triggerConfig._id || ''),
          triggerWord: String(triggerConfig.triggerWord || ''),
          ...contextData
        },
        createdAt: new Date()
      });

      return {
        ...response.data,
        _gowhats: {
          flowToken,
          payload,
          formattedPhone
        }
      };
    } catch (error) {
      console.error('Error sending triggered flow message:', error.response?.data || error);
      throw error;
    }
  }

/**
 * Sends an interactive message with buttons or list
 * @param {string} to - Recipient phone number
 * @param {Object} config - Bot configuration from database
 * @returns {Promise<Object>} Message sending result
 */
 async sendInteractiveMessage(to, config) {
   try {
     const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`;

     // Find if a 'Visit Website' action with a valid URL exists
     const urlWorkflow = config.workflows.find(wf => wf.workflow === 'Visit Website' && wf.url && wf.url.startsWith('http'));

     // --- THIS IS THE NEW SMART LOGIC ---
     // SCENARIO A: If the ONLY button is a "Visit Website" with a URL, send a CTA URL message.
     if (urlWorkflow && config.workflows.length === 1) {
       console.log('✅ Detected single "Visit Website" button with URL. Sending as CTA URL message.');

       const ctaMessagePayload = {
         messaging_product: 'whatsapp',
         recipient_type: 'individual',
         to: to,
         type: 'interactive',
         interactive: {
           type: 'cta_url',
           header: config.headerText ? { type: 'text', text: config.headerText } : undefined,
           body: { text: config.messageBody },
           action: {
             name: 'cta_url',
             parameters: {
               display_text: urlWorkflow.buttonText, // The text on the button
               url: urlWorkflow.url                  // The URL to open
             }
           }
         }
       };

       console.log('Sending CTA URL message:', JSON.stringify(ctaMessagePayload, null, 2));
       const response = await axios.post(url, ctaMessagePayload, {
         headers: {
           'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
           'Content-Type': 'application/json'
         }
       });
       return response.data;
     }
     // --- END OF NEW LOGIC ---


     // SCENARIO B: If there are multiple buttons, or no URL, send a standard interactive message.
     console.log('Sending as standard interactive message (reply buttons or list).');
     const messagePayload = {
       messaging_product: 'whatsapp',
       recipient_type: 'individual',
       to: to,
       type: 'interactive',
       interactive: {
         type: config.interactiveType.toLowerCase(),
         header: config.headerText ? { type: 'text', text: config.headerText } : undefined,
         body: { text: config.messageBody },
         action: {}
       }
     };

     if (config.interactiveType === 'Button') {
       messagePayload.interactive.action = {
         buttons: config.workflows.map((workflow, index) => ({
           type: 'reply',
           reply: {
             id: `workflow_${index}`,
             title: workflow.buttonText
           }
         }))
       };
     } else if (config.interactiveType === 'List') {
       messagePayload.interactive.action = {
         button: 'View options',
         sections: [{
           title: 'Choose an option',
           rows: config.workflows.map((workflow, index) => ({
             id: `workflow_${index}`,
             title: workflow.buttonText,
             description: workflow.workflow
           }))
         }]
       };
     }

     console.log('Sending interactive welcome message:', JSON.stringify(messagePayload, null, 2));
     const response = await axios.post(url, messagePayload, {
       headers: {
         'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
         'Content-Type': 'application/json'
       }
     });
     return response.data;

   } catch (error) {
     console.error('WhatsApp Interactive Message Error:', error.response?.data || error);
     throw error;
   }
 }


 /**
  * Sends a single catalog product to customer
  * @param {string} to - Recipient phone number
  * @param {Object} productConfig - Product configuration
  * @returns {Promise<Object>} Message sending result
  */
 async sendSingleProductMessage(to, productConfig = {}) {
   try {
     const formattedPhone = this.formatPhoneNumber(to);
     if (!formattedPhone) {
       throw new Error(`Invalid phone number: ${to}`);
     }
 
     const {
       catalogId,
       productRetailerId,
       bodyText = 'Here is the product from our catalog.',
       footerText = 'Powered by GoWhats!'
     } = productConfig;
 
     if (!catalogId) {
       throw new Error('catalogId is required to send a product message');
     }
 
     if (!productRetailerId) {
       throw new Error('productRetailerId is required to send a product message');
     }
 
     const messagePayload = {
       messaging_product: 'whatsapp',
       recipient_type: 'individual',
       to: formattedPhone,
       type: 'interactive',
       interactive: {
         type: 'product',
         body: {
           text: bodyText
         },
         action: {
           catalog_id: String(catalogId),
           product_retailer_id: String(productRetailerId)
         }
       }
     };
 
     if (footerText) {
       messagePayload.interactive.footer = { text: footerText };
     }
 
     console.log('📦 Sending single product message:', JSON.stringify(messagePayload, null, 2));
 
     const response = await axios.post(
       `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
       messagePayload,
       {
         headers: {
           Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
           'Content-Type': 'application/json'
         }
       }
     );
 
     console.log('✅ Single product message sent successfully to:', formattedPhone);
     return response.data;
   } catch (error) {
     console.error('❌ Failed to send single product message:', {
       error: error.response?.data || error.message,
       to,
       productConfig
     });
     throw error;
   }
 }
 
/**
 * Sends a catalog message to showcase product catalog
 * @param {string} to - Recipient phone number
 * @param {Object} catalogConfig - Catalog configuration options
 * @returns {Promise<Object>} Message sending result
 */
async sendCatalogMessage(to, catalogConfig = {}) {
  try {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number: ${to}`);
    }

    // Default catalog message configuration
    const defaultConfig = {
      bodyText: "🛍️ Welcome to our collection! Browse through our amazing products and add your fav    orites to cart. Happy shopping! ✨",
      footerText: "Fresh & Natural Products"
    };

    // Merge default config with provided config
    const config = {
      ...defaultConfig,
      ...catalogConfig
    };

    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'catalog_message',
        body: {
          text: config.bodyText
        },
        action: {
          name: 'catalog_message'
        }
      }
    };

    // Add thumbnail product if specified
    if (config.thumbnailProductId) {
      messagePayload.interactive.action.parameters = {
        thumbnail_product_retailer_id: config.thumbnailProductId
      };
    }

    // Add footer if provided
    if (config.footerText) {
      messagePayload.interactive.footer = {
        text: config.footerText
      };
    }

    console.log('📦 Sending catalog message:', JSON.stringify(messagePayload, null, 2));

    const response = await axios.post(
      `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
      messagePayload,
      {
        headers: {
          Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Catalog message sent successfully to:', formattedPhone);
    return response.data;

  } catch (error) {
    console.error('❌ Failed to send catalog message:', {
      error: error.response?.data || error.message,
      to: to,
      config: catalogConfig
    });

    // Enhanced error handling for catalog-specific issues
    if (error.response?.data?.error?.message?.includes('catalog')) {
      console.error('🔍 Catalog Error Details:', {
        message: 'Make sure you have products uploaded to Meta Commerce Manager',
        tenantId: this.tenant._id,
        businessAccountId: this.tenant.whatsappConfig?.businessAccountId
      });
    }

    throw error;
  }
}

/**
 * Mark a message as read
 * @param {string} messageId - WhatsApp message ID to mark as read
  * @param {Object} [options]
 * @param {boolean} [options.withTypingIndicator=false] - Include typing indicator in the read request
 * @param {string} [options.type='text'] - Typing indicator type
 * @returns {Promise<Object>} Response from WhatsApp API
 */

async markMessageAsRead(message, options = {}) {
  try {
        const withTypingIndicator = Boolean(options?.withTypingIndicator);
    const typingType = options?.type || 'text';
 
    // 1. Extract the actual ID string safely
    let messageId;
    let isOutgoing = false;
    const systemPhoneNumberId = this.tenant.whatsappConfig?.phoneNumberId;

    if (typeof message === 'string') {
      messageId = message;
    } else if (typeof message === 'object' && message !== null) {
      // Check if we are trying to mark our own message as read (skip it)
      if (message.from === systemPhoneNumberId) {
        isOutgoing = true;
      }

      // Extract ID from common properties
      messageId = message.messageId || message.wamid || message.id || message._id;
    }

    // 2. Validation: Skip if it's outgoing or ID is missing
    if (isOutgoing) {
      return { success: true, message: 'Skipped outgoing message.' };
    }

    if (!messageId) {
      console.warn('⚠️ markMessageAsRead called with missing ID. Input:', message);
      return { success: false, error: 'Message ID is missing/undefined' };
    }

    // 3. Validation: Ensure it looks like a WhatsApp ID (usually starts with wamid or is numeric)
    // MongoDB IDs are 24 chars hex, WhatsApp IDs are different.
    // We skip if it looks strictly like a Mongo Object ID to prevent API errors.
    if (messageId.length === 24 && /^[0-9a-fA-F]+$/.test(messageId)) {
        console.warn(`⚠️ Skipped markMessageAsRead: ${messageId} looks like a MongoDB ID, not a WhatsApp ID.`);
        return { success: false, error: 'Invalid ID format (MongoDB ID detected)' };
    }

    console.log(`📖 Marking message as read: ${messageId}`);

    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    };

    if (withTypingIndicator) {
      payload.typing_indicator = {
        type: typingType
      };
    }

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Message ${messageId} marked as read`);
    return response.data;

  } catch (error) {
    // Only log if it's NOT a "message already read" error (optional optimization)
    console.error('❌ Error marking message as read:', {
      error: error.response?.data || error.message
    });

    return { success: false, error: error.message };
  }
}

/**
 * Sends welcome message based on bot configuration
 * @param {string} to - Recipient phone number
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Message sending result
 */

 async sendWelcomeMessage(to, tenantId) {
    try {
      // Get the bot configuration for this tenant
      const BotConfiguration = require('../models/WelcomeTemplates');
      const config = await BotConfiguration.findOne({
        tenant_id: tenantId,
        isActive: true
      });

      if (!config) {
        console.log('No active bot configuration found for tenant:', tenantId);
        return null;
      }

      console.log('Sending welcome message to:', to, 'with config:', {
        type: config.welcomeMessageType,
        interactive: config.interactiveType,
        workflows: config.workflows?.length || 0
      });

      // ✅ UPDATED: Send based on message type with guaranteed footer
      if (config.welcomeMessageType === 'Interactive') {
        return await this.sendInteractiveMessage(to, config);
      } else {
        // ✅ UPDATED: For simple text messages, append footer
        let messageText = '';

        // Add header if present
        if (config.headerText) {
          messageText += `*${config.headerText}*\n\n`;
        }

        // Add message body
        messageText += config.messageBody;

        // ✅ ALWAYS ADD FOOTER
        messageText += `\n\n_${this.FOOTER_TEXT}_`;

        return await this.sendMessage(to, messageText);
      }
    } catch (error) {
      console.error('Error sending welcome message:', error);
      throw error;
    }
  }}

const handleInteractiveMessageResponse = async (messageData, tenant, metadata) => {
  try {
    const Message = require('../models/Message');
    const BotConfiguration = require('../models/WelcomeTemplates');

    const interactiveData = messageData.interactive;
    let selectedOption = null;

    if (interactiveData?.type === 'list_reply') {
      selectedOption = interactiveData.list_reply?.title;
    } else if (interactiveData?.type === 'button_reply') {
      selectedOption = interactiveData.button_reply?.title;
    }

    console.log('🔄 Interactive response received:', {
      type: interactiveData?.type,
      selectedOption,
      from: messageData.from
    });

    if (!selectedOption) {
      console.log('❌ No valid interactive selection found');
      return;
    }

    const botConfig = await BotConfiguration.findOne({
      tenant_id: tenant._id.toString(),
      isActive: true
    });

    if (!botConfig) {
      console.log('❌ No active bot configuration found for this tenant.');
      return;
    }

    const whatsappService = new WhatsAppService(tenant);
    const customerPhone = messageData.from;

    const selectedWorkflow = botConfig.workflows.find(wf => wf.buttonText === selectedOption);

    if (!selectedWorkflow) {
      console.log(`❌ No matching workflow found in config for button text: "${selectedOption}"`);
      return;
    }

    switch (selectedWorkflow.workflow) {
      case 'Visit Website': {
        console.log('✅ CORRECT ACTION: User selected "Visit Website". Sending link...');
        const visitWebsiteMsg = botConfig.workflowMessages?.find(wm => wm.workflow === 'Visit Website');
        const responseMessageText = visitWebsiteMsg?.message || `Here is our website: https://srfoodproducts.com 🙏`;

        const textResponse = await whatsappService.sendMessage(customerPhone, responseMessageText);
        if (textResponse) {
            // Logic to save and emit the message
        }
        break;
      }
      case 'Shop Our Collection': {
        console.log('✅ CORRECT ACTION: User selected "Shop Our Collection". Sending catalog...');
        const shopWorkflowMsg = botConfig.workflowMessages?.find(wm => wm.workflow === 'Shop Our Collection');
        const catalogConfig = {
            bodyText: shopWorkflowMsg?.message || "Welcome to our collection!",
            footerText: "Powered by GoWhats!"
        };
        await whatsappService.sendCatalogMessage(customerPhone, catalogConfig);
        break;
      }
      default:
        console.log(`- Unhandled workflow action: ${selectedWorkflow.workflow}`);
    }

  } catch (error) {
    console.error('❌ Error in handleInteractiveMessageResponse:', error);
  }
};

function extractShopifyPhoneNumber(orderData) {
  // Try multiple possible locations for phone number in Shopify order
  const phone = orderData.customer?.phone ||
                orderData.customer?.default_address?.phone ||
                orderData.billing_address?.phone ||
                orderData.shipping_address?.phone;

  return phone;
}

  module.exports = WhatsAppService;
