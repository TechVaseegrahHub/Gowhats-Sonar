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
        name: 'abandoned_cart_woocommerce',
        fallback: 'cart_reminder',
        components: (data) => {
          const components = [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: data.customerName || 'Valued Customer' },
                { type: 'text', text: data.items ? data.items.map(i => i.title || i.name).join(', ') : 'your selected items' }
              ]
            }
          ];

          if (data.checkoutUrl) {
            try {
              const url = new URL(data.checkoutUrl);
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

  // ─── App ID ──────────────────────────────────────────────────────────────────

  async getAppId() {
    try {
      const response = await axios.get(`https://graph.facebook.com/v23.0/app`, {
        params: { access_token: this.accessToken }
      });
      return response.data.id;
    } catch (error) {
      console.error('Error fetching App ID:', error.response?.data || error.message);
      throw new Error('Could not retrieve App ID for media upload.');
    }
  }

  // ─── Text Sanitizers ─────────────────────────────────────────────────────────

  sanitizeWhatsAppText(text) {
    if (!text) return text;
    return text.replace(/\*\*(.+?)\*\*/gs, '*$1*');
  }

  sanitizeTemplateText(value) {
    return String(value ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  sanitizeTemplateComponents(components = []) {
    if (!Array.isArray(components)) return [];
    return components.map((component) => ({
      ...component,
      parameters: Array.isArray(component?.parameters)
        ? component.parameters.map((parameter) =>
            parameter?.type === 'text'
              ? { ...parameter, text: this.sanitizeTemplateText(parameter.text) }
              : parameter
          )
        : component?.parameters
    }));
  }

  // ─── Media Upload ─────────────────────────────────────────────────────────────

  async uploadTemplateMedia(file) {
    try {
      console.log('📤 Starting Resumable Upload for Template...');
      const appId = await this.getAppId();

      if (!fs.existsSync(file.path)) throw new Error(`File not found at ${file.path}`);

      const fileSize = fs.statSync(file.path).size;
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

      const fileStream = fs.createReadStream(file.path);
      const uploadUrl = `https://graph.facebook.com/v23.0/${uploadSessionId}`;

      const uploadResponse = await axios.post(uploadUrl, fileStream, {
        headers: {
          'Authorization': `OAuth ${this.accessToken}`,
          'file_offset': '0',
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileSize
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      const handle = uploadResponse.data.h;
      console.log('✅ Media Handle Received:', handle);
      return handle;

    } catch (error) {
      console.error('❌ Template Media Upload Failed:', error.response?.data || error.message);
      if (error.response?.data) {
        console.error('Meta API Debug Info:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Media Upload Failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async uploadMediaFile(file, mediaType) {
    try {
      if (!this.accessToken || !this.phoneNumberId) {
        throw new Error('WhatsApp configuration missing');
      }

      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');

      if (file.buffer) {
        formData.append('file', file.buffer, {
          filename: file.originalname || `media.${mediaType === 'image' ? 'png' : 'bin'}`,
          contentType: file.mimetype || 'image/png'
        });
      } else if (file.path) {
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

  async uploadMedia(fileData, mimeType) {
    try {
      const supportedTypes = {
        audio: [
          'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
          'audio/ogg; codecs=opus', 'audio/webm', 'audio/webm; codecs=opus'
        ],
        image: ['image/jpeg', 'image/png'],
        video: ['video/3gpp', 'video/mp4', 'video/webm']
      };

      const mediaType = Object.keys(supportedTypes).find(type =>
        supportedTypes[type].includes(mimeType)
      );

      if (!mediaType) throw new Error('Unsupported media type');

      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', fileData, {
        filename: `media.${mimeType.split('/')[1]}`,
        contentType: mimeType
      });

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

  async downloadMedia(mediaId) {
    try {
      const mediaUrlResponse = await axios.get(
        `${this.baseUrl}/${mediaId}`,
        { headers: { 'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}` } }
      );

      if (!mediaUrlResponse.data?.url) throw new Error('Failed to get media URL');

      const mediaResponse = await axios.get(
        mediaUrlResponse.data.url,
        {
          headers: { 'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}` },
          responseType: 'arraybuffer'
        }
      );

      return {
        data: Buffer.from(mediaResponse.data),
        mimeType: mediaUrlResponse.data.mime_type
      };
    } catch (error) {
      console.error('Download media error:', error);
      throw error;
    }
  }

  // ─── Message Senders ─────────────────────────────────────────────────────────

  /**
   * Send a plain text message.
   * @param {string} to
   * @param {string} text
   */
  async sendMessage(to, text) {
    const formattedPhone = this.formatPhoneNumber(to);
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: { body: text }
    };
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send text message:', {
        status: error.response?.status,
        error: error.response?.data?.error
      });
      throw new Error(error.response?.data?.error?.message || 'Failed to send message');
    }
  }

  /**
   * Send a template message.
   */
  async sendTemplateMessage(templateName, to, components = [], language = 'en', options = {}) {
    const shouldLog = options?.silent !== true;
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const sanitizedComponents = this.sanitizeTemplateComponents(components);

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: typeof templateName === 'object' ? templateName.name : templateName,
          language: { code: language },
          components: sanitizedComponents
        }
      };

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

  /**
   * Send a template message with optional media header and/or flow button.
   */
  async sendTemplateWithMedia(templateName, to, templateData = {}, language = 'en') {
    try {
      const components = [];

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

      if (templateData.body?.parameters?.length > 0) {
        components.push({
          type: 'body',
          parameters: templateData.body.parameters.map(param => ({
            type: 'text',
            text: param.toString()
          }))
        });
      }

      if (templateData.hasFlowButton) {
        const flowToken = crypto.randomBytes(16).toString('hex');
        try {
          const FlowToken = require('../models/FlowToken');
          await FlowToken.create({
            tenantId: this.tenant._id.toString(),
            token: flowToken,
            flowId: 'questions_flow',
            phoneNumber: 'broadcast',
            flowType: 'order_completion',
            status: 'active',
            contextData: { isQuestionsFlow: true },
            createdAt: new Date()
          });
          console.log('✅ Flow token stored for questions flow');
        } catch (e) {
          console.error('Could not store flow token:', e.message);
        }

        components.push({
          type: 'button',
          sub_type: 'flow',
          index: '0',
          parameters: [
            { type: 'action', action: { flow_token: flowToken } }
          ]
        });
      }

      return await this.sendTemplateMessage(templateName, to, components, language);
    } catch (error) {
      console.error('❌ Template with media failed:', error.message);
      throw error;
    }
  }

  async sendBroadcastTemplate(to, broadcastData) {
    try {
      const { templateName, language, mediaType, mediaUrl, mediaId } = broadcastData;

      console.log(`📡 Preparing Broadcast Payload for ${to}...`);

      const templateData = { header: null };

      if (mediaType && (mediaUrl || mediaId)) {
        const type = mediaType.toLowerCase();
        if (['image', 'video', 'document'].includes(type)) {
          templateData.header = { type, data: {} };
          if (mediaId) templateData.header.data.id = mediaId;
          else if (mediaUrl) templateData.header.data.link = mediaUrl;
        }
      }

      templateData.hasFlowButton = broadcastData.hasFlowButton || false;
      return await this.sendTemplateWithMedia(templateName, to, templateData, language);
    } catch (error) {
      console.error('❌ Broadcast Send Error:', error.message);
      throw error;
    }
  }

  async sendStandardTemplate(templateType, phone, data, language = 'en') {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${phone}`);

      const templateConfig = this.standardTemplates[templateType];
      if (!templateConfig) throw new Error(`Unknown template type: ${templateType}`);

      console.log(`Sending ${templateType} template to ${formattedPhone}`);

      try {
        return await this.sendTemplateMessage(
          templateConfig.name,
          formattedPhone,
          templateConfig.components(data),
          language
        );
      } catch (primaryError) {
        console.warn(`Primary template ${templateConfig.name} failed:`, primaryError.message);

        if (templateConfig.fallback) {
          const fallbackResult = await this.sendTemplateMessage(
            templateConfig.fallback,
            formattedPhone,
            templateConfig.components(data),
            language
          );
          return fallbackResult;
        }

        const textFallback = this.getTextFallback(templateType, data);
        if (textFallback) return await this.sendMessage(formattedPhone, textFallback);

        throw primaryError;
      }
    } catch (error) {
      console.error(`Failed to send ${templateType} template:`, error);
      throw error;
    }
  }

  async sendTemplateByType(type, phone, templateData) {
    const templates = {
      order_confirmation: {
        name: 'order_confirmation',
        fallback: 'order_confirm',
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
      abandoned_cart: {
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

    const templateConfig = templates[type];
    if (!templateConfig) throw new Error(`Template type "${type}" not defined`);

    try {
      return await this.sendTemplateMessage(templateConfig.name, phone, templateConfig.parameters);
    } catch (error) {
      console.warn(`Error sending primary template "${templateConfig.name}":`, error.message);
      if (templateConfig.fallback) {
        return await this.sendTemplateMessage(templateConfig.fallback, phone, templateConfig.parameters);
      }
      throw error;
    }
  }

  async sendOrderConfirmation(phone, orderDetails) {
    try {
      const customerName = orderDetails.customerName || 'Customer';
      const result = await this.sendTemplateMessage(
        'order_confirmation',
        phone,
        [{ type: 'body', parameters: [{ type: 'text', text: customerName }] }]
      );
      console.log('Order confirmation sent:', { phone, customerName, messageId: result.messages?.[0]?.id });
      return result;
    } catch (error) {
      console.error('Error in sendOrderConfirmation:', error);
      throw error;
    }
  }

  async sendAbandonedCartReminder(phone, cartDetails) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${phone}`);

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: 'abandoned_cart_notify',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: cartDetails.customerName || 'Customer' }]
            }
          ]
        }
      };

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

      try {
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
      console.error(`❌ Template Error: ${error.message}`);
      if (error.response) {
        console.error('WhatsApp API Error:', JSON.stringify(error.response.data, null, 2));
      }
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

  // ─── Media Messages ───────────────────────────────────────────────────────────

  async sendMediaMessage(to, mediaType, mediaData, caption = '') {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

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
        case 'sticker':
          payload = await this.createStickerMessage(formattedPhone, mediaData);
          break;
        case 'location':
          payload = this.createLocationMessage(formattedPhone, mediaData);
          break;
        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }

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

      console.log(`✅ ${mediaType} message sent successfully`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to send ${mediaType} message:`, error.response?.data || error.message);
      throw error;
    }
  }

  async sendMedia(to, file, caption = '') {
    try {
      await fs.promises.access(file.path, fs.constants.F_OK);
      const stats = await fs.promises.stat(file.path);
      const fileSizeInMB = stats.size / (1024 * 1024);

      if (fileSizeInMB > 16) throw new Error(`File too large: ${fileSizeInMB.toFixed(2)}MB (max 16MB)`);

      let mediaType = 'document';
      if (file.mimetype) {
        if (file.mimetype.startsWith('image/')) mediaType = 'image';
        else if (file.mimetype.startsWith('video/')) mediaType = 'video';
        else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';
      }

      const fileData = await fs.promises.readFile(file.path);
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', fileData, {
        filename: file.originalname || `media.${file.mimetype?.split('/')[1] || 'bin'}`,
        contentType: file.mimetype
      });

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

      if (!uploadResponse.data?.id) throw new Error('Failed to get media ID from WhatsApp');

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: mediaType,
        [mediaType]: { id: uploadResponse.data.id }
      };

      if (caption && ['image', 'video', 'document'].includes(mediaType)) {
        messagePayload[mediaType].caption = caption;
      }
      if (mediaType === 'document') {
        messagePayload[mediaType].filename = file.originalname || 'document';
      }

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

      const mediaUrlPath = `media/${this.tenant._id}/${path.basename(file.path)}`;
      return { ...sendResponse.data, mediaId: uploadResponse.data.id, mediaUrl: mediaUrlPath };
    } catch (error) {
      console.error('WhatsApp Media Upload Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async createImageMessage(to, imageData, caption = '') {
    const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'image', image: {} };
    if (imageData.url || imageData.link) payload.image.link = imageData.url || imageData.link;
    else if (imageData.id || imageData.media_id) payload.image.id = imageData.id || imageData.media_id;
    else if (imageData.file) { const r = await this.uploadMediaFile(imageData.file, 'image'); payload.image.id = r.id; }
    else throw new Error('Image data must include url, id, or file');
    if (caption) payload.image.caption = caption;
    return payload;
  }

  async createVideoMessage(to, videoData, caption = '') {
    const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'video', video: {} };
    if (videoData.url || videoData.link) payload.video.link = videoData.url || videoData.link;
    else if (videoData.id || videoData.media_id) payload.video.id = videoData.id || videoData.media_id;
    else if (videoData.file) { const r = await this.uploadMediaFile(videoData.file, 'video'); payload.video.id = r.id; }
    else throw new Error('Video data must include url, id, or file');
    if (caption) payload.video.caption = caption;
    return payload;
  }

  async createAudioMessage(to, audioData) {
    const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'audio', audio: {} };
    if (audioData.url || audioData.link) payload.audio.link = audioData.url || audioData.link;
    else if (audioData.id || audioData.media_id) payload.audio.id = audioData.id || audioData.media_id;
    else if (audioData.file) { const r = await this.uploadMediaFile(audioData.file, 'audio'); payload.audio.id = r.id; }
    else throw new Error('Audio data must include url, id, or file');
    return payload;
  }

  async createDocumentMessage(to, documentData, caption = '') {
    const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'document', document: {} };
    if (documentData.url || documentData.link) payload.document.link = documentData.url || documentData.link;
    else if (documentData.id || documentData.media_id) payload.document.id = documentData.id || documentData.media_id;
    else if (documentData.file) { const r = await this.uploadMediaFile(documentData.file, 'document'); payload.document.id = r.id; }
    else throw new Error('Document data must include url, id, or file');
    if (caption) payload.document.caption = caption;
    if (documentData.filename) payload.document.filename = documentData.filename;
    return payload;
  }

  createLocationMessage(to, locationData) {
    if (!locationData.latitude || !locationData.longitude) {
      throw new Error('Location data must include latitude and longitude');
    }
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'location',
      location: {
        latitude: parseFloat(locationData.latitude),
        longitude: parseFloat(locationData.longitude)
      }
    };
    if (locationData.name) payload.location.name = locationData.name;
    if (locationData.address) payload.location.address = locationData.address;
    return payload;
  }

  async sendLocationMessage(to, locationData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'location',
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          name: locationData.name || '',
          address: locationData.address || ''
        }
      };
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

  async sendSticker(to, stickerId) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'sticker',
        sticker: { id: stickerId }
      };
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending sticker:', error.response?.data);
      throw error;
    }
  }

  async createStickerMessage(to, file) {
    const uploadResult = await this.uploadMediaFile(file, 'sticker');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'sticker',
      sticker: { id: uploadResult.id }
    };
  }

  createMediaMessagePayload(to, mediaType, mediaId, file) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: { id: mediaId }
    };
    if (mediaType === 'document') {
      payload[mediaType].caption = file.originalname || '';
      payload[mediaType].filename = file.originalname || 'document';
    }
    return payload;
  }

  // ─── Interactive / Special Messages ──────────────────────────────────────────

  async sendReactionMessage(to, messageId, emoji) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'reaction',
        reaction: { message_id: messageId, emoji }
      };
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

  async sendLocationRequestMessage(to, bodyText = 'Please share your current location for delivery.') {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: { text: bodyText },
          action: { name: 'send_location' }
        }
      };
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

  async sendInteractiveMessage(to, config) {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`;

      const urlWorkflow = config.workflows.find(wf => wf.workflow === 'Visit Website' && wf.url?.startsWith('http'));

      if (urlWorkflow && config.workflows.length === 1) {
        const ctaMessagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            header: config.headerText ? { type: 'text', text: config.headerText.replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/_(.+?)_/g,'$1').substring(0,60) } : undefined,
            body: { text: this.sanitizeWhatsAppText(config.messageBody) },
            action: {
              name: 'cta_url',
              parameters: { display_text: urlWorkflow.buttonText, url: urlWorkflow.url }
            }
          }
        };
        const response = await axios.post(url, ctaMessagePayload, {
          headers: { 'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/json' }
        });
        return response.data;
      }

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: config.interactiveType.toLowerCase(),
          header: config.headerText ? { type: 'text', text: config.headerText.replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/_(.+?)_/g,'$1').substring(0,60) } : undefined,
          body: { text: config.messageBody },
          action: {}
        }
      };

      if (config.interactiveType === 'Button') {
        messagePayload.interactive.action = {
          buttons: config.workflows.map((workflow, index) => ({
            type: 'reply',
            reply: { id: `workflow_${index}`, title: workflow.buttonText }
          }))
        };
      } else if (config.interactiveType === 'List') {
  messagePayload.interactive.action = {
    button: 'View options',
    sections: [{
      title: 'Choose an option',
      rows: config.workflows.map((workflow, index) => ({
        id: `workflow_${index}`,
        title: workflow.buttonText.substring(0, 24),
        description: ''  // ✅ FIX: was workflow.workflow — caused "Visit Website / Visit Website"
      }))
    }]
  };
}
      const response = await axios.post(url, messagePayload, {
        headers: { 'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      console.error('WhatsApp Interactive Message Error:', error.response?.data || error);
      throw error;
    }
  }

  async sendSingleProductMessage(to, productConfig = {}) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const { catalogId, productRetailerId, bodyText = 'Here is the product from our catalog.', footerText = 'Powered by GoWhats!' } = productConfig;
      if (!catalogId) throw new Error('catalogId is required');
      if (!productRetailerId) throw new Error('productRetailerId is required');

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'product',
          body: { text: bodyText },
          action: { catalog_id: String(catalogId), product_retailer_id: String(productRetailerId) }
        }
      };
      if (footerText) messagePayload.interactive.footer = { text: footerText };

      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        messagePayload,
        { headers: { Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send single product message:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendCatalogMessage(to, catalogConfig = {}) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const config = {
        bodyText: "🛍️ Welcome to our collection! Browse through our amazing products and add your favourites to cart. Happy shopping! ✨",
        footerText: "Fresh & Natural Products",
        ...catalogConfig
      };

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'catalog_message',
          body: { text: config.bodyText },
          action: { name: 'catalog_message' }
        }
      };

      if (config.thumbnailProductId) {
        messagePayload.interactive.action.parameters = {
          thumbnail_product_retailer_id: config.thumbnailProductId
        };
      }
      if (config.footerText) {
        messagePayload.interactive.footer = { text: config.footerText };
      }

      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        messagePayload,
        { headers: { Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send catalog message:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendPaymentOrderDetails(to, paymentOrderData, customMessage = null) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      let headerText = (customMessage?.header || '💳 Complete Your Payment').substring(0, 60);
      let bodyText = (customMessage?.body || 'Please review your details and complete the payment.').substring(0, 1024);
      let footerText = (customMessage?.footer || this.FOOTER_TEXT).substring(0, 60);

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'order_details',
          header: { type: 'text', text: headerText },
          body: { text: bodyText },
          footer: { text: footerText },
          action: { name: 'review_and_pay', parameters: paymentOrderData }
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        messagePayload,
        { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send payment order details:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendOrderStatusUpdate(to, orderStatusData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const { orderId, status, description, bodyText } = orderStatusData;

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'order_status',
          body: { text: bodyText || `Your order status has been updated to: ${status}` },
          action: {
            name: 'review_order',
            parameters: {
              reference_id: orderId,
              order: { status, ...(description && { description }) }
            }
          }
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        messagePayload,
        { headers: { Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send order status update:', error);
      throw error;
    }
  }

  // ─── Shipping Messages ────────────────────────────────────────────────────────

  async sendShippingOptionsList(to, shippingData) {
    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

    const Settings = require('../models/settings');
    const settings = await Settings.findOne({ tenant_id: this.tenant._id.toString() });
    const config = settings?.automationConfig?.shippingSelection?.courierListTemplate;

    const { orderAmount = 0, shippingOptions = [], customerName = 'Customer', freeShippingApplied = false } = shippingData;

    const courierOptions = shippingOptions.filter(option =>
      option.isEligible && (option.courierType === 'courier' || option.courierType === 'slab')
    );

    if (courierOptions.length === 0) {
      await this.sendMessage(formattedPhone, `Dear ${customerName}, no shipping options available currently. We will contact you.`);
      return null;
    }

    let headerText = config?.header || '🚚 Choose Courier';
    let bodyText = (config?.body || `Hi {{name}}! Please select your preferred courier for your order of {{amount}}.`)
      .replace('{{name}}', customerName)
      .replace('{{amount}}', `₹${orderAmount.toFixed(2)}`);
    let footerText = config?.footer || 'Select your preferred option';

    if (freeShippingApplied) {
      headerText = '🚚 Express Options';
      bodyText = `🎉 ${customerName}, your order qualifies for FREE SHIPPING! 🆓\n\nYou can also choose express courier options below:`;
    }

    const listMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText.substring(0, 60) },
        body: { text: bodyText.substring(0, 1024) },
        footer: { text: footerText.substring(0, 60) },
        action: {
          button: 'View Couriers',
          sections: [{
            title: 'Courier Services',
            rows: courierOptions.map(option => {
              let description = (option.isFreeShipping || option.shippingCost === 0) ? '🆓 FREE' : `₹${option.shippingCost.toFixed(2)}`;
              if (option.estimatedDeliveryTime) description += ` • ⏱️ ${option.estimatedDeliveryTime}`;
              return {
                id: `shipping_${option.methodId}`,
                title: option.methodName.substring(0, 23),
                description: description.substring(0, 72)
              };
            })
          }]
        }
      }
    };

    const response = await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      listMessage,
      { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } }
    );
    return response.data;
  }

  async sendShippingMethodsList(to, shippingData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const { orderAmount, itemCount = 1, packageWeight = 0.5, shippingOptions = [], customerName = 'Customer' } = shippingData;
      const eligibleOptions = shippingOptions.filter(option => option.isEligible);

      if (eligibleOptions.length === 0) {
        return await this.sendMessage(formattedPhone,
          `Dear ${customerName},\n\nUnfortunately, no shipping options are currently available for your location.\n\nOrder Amount: ₹${orderAmount.toFixed(2)}, Items: ${itemCount}, Weight: ${packageWeight}kg\n\nThank you for your patience! 🙏`
        );
      }

      const listMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: '🚚 Choose Your Shipping Method' },
          body: { text: `Hi ${customerName}! Please select your preferred shipping method for your order of ₹${orderAmount.toFixed(2)}.` },
          footer: { text: 'Tap an option below to select' },
          action: {
            button: 'View Options',
            sections: [{
              title: 'Available Delivery Methods',
              rows: eligibleOptions.map(option => {
                let description = (option.isFreeShipping || option.shippingCost === 0) ? '🆓 FREE SHIPPING' : `₹${option.shippingCost.toFixed(2)}`;
                if (option.estimatedDeliveryTime) description += ` • ⏱️ ${option.estimatedDeliveryTime}`;
                if (option.supportsCOD) description += ' • 💰 COD Available';
                if (option.isFreeShipping && option.savings > 0) description += ` • 💸 Save ₹${option.savings.toFixed(2)}`;
                return { id: `shipping_${option.methodId}`, title: option.methodName, description: description.substring(0, 72) };
              })
            }]
          }
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        listMessage,
        { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send shipping methods list:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send shipping update notification (plain text).
   */
  async sendShippingUpdate(to, updateData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const { customerName = 'Customer', orderNumber, status, trackingNumber, carrierName, estimatedDelivery, trackingUrl, currentLocation } = updateData;

      const statusEmojis = { confirmed: '✅', processing: '⚡', shipped: '🚚', in_transit: '🛫', out_for_delivery: '🚛', delivered: '📦', cancelled: '❌', returned: '↩️' };
      const statusMessages = { confirmed: 'Order Confirmed', processing: 'Order Processing', shipped: 'Order Shipped', in_transit: 'In Transit', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Order Cancelled', returned: 'Order Returned' };

      const emoji = statusEmojis[status] || '📦';
      const statusText = statusMessages[status] || status;

      let msg = `${emoji} *${statusText}*\n\nHi ${customerName}!`;
      if (orderNumber) msg += `\n\n📦 **Order:** #${orderNumber}`;
      msg += `\n🚚 **Status:** ${statusText}`;
      if (carrierName) msg += `\n🏢 **Carrier:** ${carrierName}`;
      if (trackingNumber) msg += `\n🔍 **Tracking:** ${trackingNumber}`;
      if (currentLocation) msg += `\n📍 **Location:** ${currentLocation}`;
      if (estimatedDelivery) msg += `\n⏱️ **ETA:** ${estimatedDelivery}`;
      if (trackingUrl) msg += `\n\n🔗 **Track your order:** ${trackingUrl}`;
      if (status === 'delivered') msg += `\n\n🎉 Your order has been delivered! We hope you love your purchase.`;
      else if (status === 'out_for_delivery') msg += `\n\n📞 The delivery partner will contact you shortly.`;
      msg += `\n\nQuestions? Just reply to this message. Thank you! 🙏`;

      return await this.sendMessage(formattedPhone, msg);
    } catch (error) {
      console.error('❌ Failed to send shipping update:', error);
      throw error;
    }
  }

  async sendShippingConfirmation(to, confirmationData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const { customerName = 'Customer', selectedMethod, orderAmount, shippingCost, totalAmount, orderNumber, deliveryAddress, estimatedDelivery, trackingInfo } = confirmationData;

      let msg = `✅ *Shipping Confirmed!*\n\nDear ${customerName}, your shipping method has been confirmed.\n\n🚚 **Delivery Method:** ${selectedMethod}\n💰 **Shipping Cost:** `;
      msg += shippingCost === 0 ? 'FREE 🆓' : `₹${shippingCost.toFixed(2)}`;
      msg += `\n\n📦 **Order Summary:**`;
      if (orderNumber) msg += `\n• Order #: ${orderNumber}`;
      msg += `\n• Order Value: ₹${orderAmount.toFixed(2)}\n• Shipping: ₹${shippingCost.toFixed(2)}\n• **Total: ₹${totalAmount.toFixed(2)}**`;
      if (deliveryAddress) {
        msg += `\n\n📍 **Delivery Address:**\n${deliveryAddress.name}\n${deliveryAddress.addressLine1}`;
        if (deliveryAddress.addressLine2) msg += `\n${deliveryAddress.addressLine2}`;
        msg += `\n${deliveryAddress.city}, ${deliveryAddress.state} - ${deliveryAddress.pincode}`;
      }
      if (estimatedDelivery) msg += `\n\n⏱️ **Estimated Delivery:** ${estimatedDelivery}`;
      msg += `\n\n🎉 Your order is being processed! You'll receive tracking details once your order is shipped.`;
      if (trackingInfo?.url) msg += `\n\n🔍 **Track your order:** ${trackingInfo.url}`;
      msg += `\n\nNeed help? Just reply to this message.\nThank you for choosing us! 🙏`;

      return await this.sendMessage(formattedPhone, msg);
    } catch (error) {
      console.error('❌ Failed to send shipping confirmation:', error);
      throw error;
    }
  }

  async sendShippingSelectionConfirmation(to, confirmationData) {
    const formattedPhone = this.formatPhoneNumber(to);
    const { selectedMethod, shippingCost, totalAmount, orderNumber } = confirmationData;
    let message = `✅ *Shipping Confirmed!*\n\n🚚 *Courier:* ${selectedMethod}\n💰 *Shipping Cost:* ₹${shippingCost.toFixed(2)}\n💳 *Total Amount:* ₹${totalAmount.toFixed(2)}\n\n`;
    if (orderNumber) message += `Your order *${orderNumber}* is confirmed. `;
    message += "You'll receive tracking details once shipped. Thank you! 🙏";
    return this.sendMessage(formattedPhone, message);
  }

  async sendEnhancedShippingConfirmation(to, confirmationData) {
    const formattedPhone = this.formatPhoneNumber(to);
    const { orderId, selectedMethod, shippingCost, totalAmount, orderAmount, customerName, isFreeShipping, deliveryAddress } = confirmationData;
    const shippingDisplay = shippingCost === 0 ? (isFreeShipping ? '🆓 FREE SHIPPING' : '₹0.00 (Free)') : `₹${shippingCost.toFixed(2)}`;

    let message = `🚚 *Shipping Method Confirmed!*\n\nDear ${customerName}, your shipping details have been confirmed.\n\n📦 *Order Details:*\n- Order ID: *${orderId}*\n- Order Amount: ₹${orderAmount.toFixed(2)}\n- Shipping: ${shippingDisplay}\n- *Total Amount: ₹${totalAmount.toFixed(2)}*\n\n🚚 *Delivery Method:* ${selectedMethod}`;

    if (deliveryAddress) {
      message += `\n📍 *Delivery Address:*\n${deliveryAddress.name}\n${deliveryAddress.addressLine1}\n${deliveryAddress.city}, ${deliveryAddress.state} - ${deliveryAddress.pincode}`;
    }
    message += `\n\n💡 Your payment link will be sent shortly to complete the order.\n\n_Powered by GoWhats!_`;
    return this.sendMessage(formattedPhone, message);
  }

  async sendDeliveryReminder(to, reminderData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const { customerName = 'Customer', orderNumber, deliveryDate, timeSlot, deliveryAddress, contactNumber, specialInstructions } = reminderData;

      let msg = `🔔 *Delivery Reminder*\n\nHi ${customerName}!\n\nYour order is scheduled for delivery:`;
      if (orderNumber) msg += `\n\n📦 **Order:** #${orderNumber}`;
      msg += `\n📅 **Date:** ${deliveryDate}`;
      if (timeSlot) msg += `\n⏰ **Time:** ${timeSlot}`;
      if (deliveryAddress) msg += `\n\n📍 **Address:**\n${deliveryAddress}`;
      if (contactNumber) msg += `\n\n📞 **Delivery Partner:** ${contactNumber}`;
      msg += `\n\n✅ **Please ensure:**\n• Someone is available to receive the order\n• Contact number is reachable\n• Address is easily accessible`;
      if (specialInstructions) msg += `\n\n📝 **Special Instructions:**\n${specialInstructions}`;
      msg += `\n\nNeed to reschedule? Reply to this message.\n\nThank you! 🙏`;

      return await this.sendMessage(formattedPhone, msg);
    } catch (error) {
      console.error('❌ Failed to send delivery reminder:', error);
      throw error;
    }
  }

  async sendShippingDelayNotification(to, delayData) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const { customerName = 'Customer', orderNumber, originalDate, newDate, reason, compensation } = delayData;

      let msg = `⏳ *Delivery Update*\n\nHi ${customerName},\n\nWe have an important update about your order delivery:`;
      if (orderNumber) msg += `\n\n📦 **Order:** #${orderNumber}`;
      msg += `\n📅 **Original ETA:** ${originalDate}\n📅 **New ETA:** ${newDate}`;
      if (reason) msg += `\n\n📝 **Reason:** ${reason}`;
      msg += `\n\n🙏 We sincerely apologize for this inconvenience.`;
      if (compensation) msg += `\n\n🎁 **As an apology:**\n${compensation}`;
      msg += `\n\n📞 Have questions? Just reply to this message.\n\nThank you for your patience! 💙`;

      return await this.sendMessage(formattedPhone, msg);
    } catch (error) {
      console.error('❌ Failed to send delay notification:', error);
      throw error;
    }
  }

  // ─── Flow Messages ────────────────────────────────────────────────────────────

  /**
   * Send a WhatsApp Flow message using a complete pre-built payload.
   */
  async sendFlowMessage(messagePayload) {
    try {
      if (!messagePayload.to || typeof messagePayload.to !== 'string') {
        throw new Error('Invalid payload: "to" must be a phone number string');
      }
      if (messagePayload.type !== 'interactive') {
        throw new Error('Invalid payload: "type" must be "interactive"');
      }
      if (messagePayload.interactive?.type !== 'flow') {
        throw new Error('Invalid payload: "interactive.type" must be "flow"');
      }

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

      console.log('✅ Flow sent:', response.data.messages?.[0]?.id);
      return response.data;
    } catch (error) {
      console.error('❌ Flow error:', error.message, error.response?.data);
      throw error;
    }
  }

  async sendGenericFlow(to, flowId, options = {}) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const flowToken = this.generateFlowToken();

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: options.header || { type: 'text', text: 'Flow Message' },
          body: { text: options.bodyText || 'Please complete the following form.' },
          footer: { text: options.footerText || 'Powered by WhatsApp' },
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
          typeof options.actionPayload === 'string' ? options.actionPayload : JSON.stringify(options.actionPayload);
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

  async sendTriggeredFlow(to, triggerConfig = {}, contextData = {}) {
    try {
      if (!this.tenant?.whatsappConfig?.accessToken || !this.tenant?.whatsappConfig?.phoneNumberId) {
        throw new Error('WhatsApp configuration is incomplete');
      }

      const flowId = String(triggerConfig.flowId || '').trim();
      if (!flowId) throw new Error('Flow ID is missing for this trigger');

      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const flowToken = crypto.randomBytes(32).toString('hex');
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: String(triggerConfig.messageText || 'Please fill out the form below.').slice(0, 1024) },
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

      if (triggerConfig.flowAction) payload.interactive.action.parameters.flow_action = triggerConfig.flowAction;
      if (triggerConfig.flowActionPayload) payload.interactive.action.parameters.flow_action_payload = triggerConfig.flowActionPayload;

      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        payload,
        {
          headers: { Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/json' },
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
        contextData: { source: 'flow_trigger', triggerId: String(triggerConfig._id || ''), triggerWord: String(triggerConfig.triggerWord || ''), ...contextData },
        createdAt: new Date()
      });

      return { ...response.data, _gowhats: { flowToken, payload, formattedPhone } };
    } catch (error) {
      console.error('Error sending triggered flow message:', error.response?.data || error);
      throw error;
    }
  }

  async sendOrderCompletionFlow(to, orderData) {
    try {
      console.log('🚀 Starting sendOrderCompletionFlow...');

      const Settings = require('../models/settings');
      const settings = await Settings.findOne({ tenant_id: this.tenant._id.toString() });

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

      if (!this.accessToken || !this.phoneNumberId) {
        console.error('❌ WhatsApp configuration incomplete');
        return await this.sendFallbackOrderMessage(to, orderData);
      }

      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error(`Invalid phone number: ${to}`);

      const flowToken = crypto.randomBytes(32).toString('hex');
      const totalItems = orderData.items?.length || 0;
      const totalAmount = orderData.total || '0';
      const currency = orderData.currency || 'INR';

      const stateData = [
        {"id":"AP","title":"Andhra Pradesh"},{"id":"AR","title":"Arunachal Pradesh"},{"id":"AS","title":"Assam"},
        {"id":"BR","title":"Bihar"},{"id":"CT","title":"Chhattisgarh"},{"id":"GA","title":"Goa"},
        {"id":"GJ","title":"Gujarat"},{"id":"HR","title":"Haryana"},{"id":"HP","title":"Himachal Pradesh"},
        {"id":"JH","title":"Jharkhand"},{"id":"KA","title":"Karnataka"},{"id":"KL","title":"Kerala"},
        {"id":"MP","title":"Madhya Pradesh"},{"id":"MH","title":"Maharashtra"},{"id":"MN","title":"Manipur"},
        {"id":"ML","title":"Meghalaya"},{"id":"MZ","title":"Mizoram"},{"id":"NL","title":"Nagaland"},
        {"id":"OR","title":"Odisha"},{"id":"PB","title":"Punjab"},{"id":"RJ","title":"Rajasthan"},
        {"id":"SK","title":"Sikkim"},{"id":"TN","title":"Tamil Nadu"},{"id":"TG","title":"Telangana"},
        {"id":"TR","title":"Tripura"},{"id":"UP","title":"Uttar Pradesh"},{"id":"UT","title":"Uttarakhand"},
        {"id":"WB","title":"West Bengal"},{"id":"AN","title":"Andaman and Nicobar Islands"},
        {"id":"CH","title":"Chandigarh"},{"id":"DN","title":"Dadra and Nagar Haveli and Daman and Diu"},
        {"id":"DL","title":"Delhi"},{"id":"JK","title":"Jammu and Kashmir"},{"id":"LA","title":"Ladakh"},
        {"id":"LD","title":"Lakshadweep"},{"id":"PY","title":"Puducherry"}
      ];

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: flowConfig.flowMessage?.header || '🛍️ Complete Your Order' },
          body: {
            text: flowConfig.flowMessage?.body ||
              `You've selected ${totalItems} item(s) worth ${currency} ${totalAmount}.\n\nPlease provide your delivery details to complete the order.`
          },
          footer: { text: flowConfig.flowMessage?.footer || 'Powered by GoWhats!' },
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
                data: { state: stateData }
              }
            }
          }
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        messagePayload,
        {
          headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      if (response.status !== 200 || !response.data?.messages) {
        throw new Error(`WhatsApp API returned status ${response.status}`);
      }

      await this.storeFlowToken(flowToken, flowId, formattedPhone, orderData, 'order_completion');

      console.log('✅ Flow message sent successfully:', { messageId: response.data.messages[0]?.id, recipient: formattedPhone });
      return response.data;

    } catch (error) {
      console.error('❌ Failed to send order flow:', error.message, error.response?.data);
      return await this.sendFallbackOrderMessage(to, orderData);
    }
  }

  async sendFallbackOrderMessage(to, orderData) {
    try {
      const fallbackMessage = `🛍️ Thank you for your order!\n\nItems: ${orderData.items?.length || 0}\nTotal: ${orderData.currency || 'INR'} ${orderData.total || '0'}\n\nWe'll process your order and get back to you shortly.`;
      return await this.sendMessage(to, fallbackMessage);
    } catch (fallbackError) {
      console.error('❌ Fallback message also failed:', fallbackError);
      throw fallbackError;
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
          body: { text: `Complete your order: ${orderData.items?.length || 0} items, ${orderData.currency || 'INR'} ${orderData.total || '0'}` },
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

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } }
      );

      await this.storeFlowToken(flowToken, flowId, formattedPhone, orderData);
      return response.data;
    } catch (error) {
      console.error('❌ Minimal flow failed:', error.response?.data);
      throw error;
    }
  }

  // ─── Flow Token ───────────────────────────────────────────────────────────────

  /**
   * Store a flow token, deleting any existing active tokens for that phone number first.
   */
  async storeFlowToken(token, flowId, phoneNumber, contextData = null, flowType = 'order_completion', registrationConfigId = null) {
    try {
      const FlowToken = require('../models/FlowToken');

      await FlowToken.deleteMany({
        tenantId: this.tenant._id.toString(),
        phoneNumber,
        status: 'active'
      });

      const tokenData = {
        tenantId: this.tenant._id.toString(),
        token,
        flowId,
        phoneNumber,
        flowType,
        status: 'active',
        createdAt: new Date()
      };

      if (contextData) tokenData.contextData = contextData;
      if (registrationConfigId) tokenData.registrationConfigId = registrationConfigId;

      const newToken = await FlowToken.create(tokenData);

      console.log('📝 Flow token stored successfully:', {
        token: token.substring(0, 8) + '...',
        flowId,
        phoneNumber,
        flowType,
        tokenId: newToken._id
      });

      return newToken;
    } catch (error) {
      console.error('❌ Failed to store flow token:', error);
      throw error;
    }
  }

  generateFlowToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  generateOrderId() {
    return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // ─── Flow Config Helpers ──────────────────────────────────────────────────────

  async testFlowConfiguration() {
    try {
      const Settings = require('../models/settings');
      const settings = await Settings.findOne({ tenant_id: this.tenant._id.toString() });
      if (!settings) throw new Error('Settings not found');

      const flowConfig = settings.flowConfig;
      if (!flowConfig?.enableFlowMessages) throw new Error('Flow messages are disabled');
      if (!flowConfig?.orderCompletionFlowId) throw new Error('Flow ID not configured');
      if (!this.accessToken) throw new Error('WhatsApp access token not configured');
      if (!this.phoneNumberId) throw new Error('WhatsApp phone number ID not configured');

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
      const Settings = require('../models/settings');
      const settings = await Settings.findOne({ tenant_id: this.tenant._id.toString() });
      return settings?.flowConfig || {
        orderCompletionFlowId: '',
        enableFlowMessages: false,
        autoSendOrderFlow: true,
        flowEndpointUrl: '',
        lastFlowUpdate: null
      };
    } catch (error) {
      console.error('❌ Error getting flow configuration:', error);
      throw error;
    }
  }

  // ─── Template Management ──────────────────────────────────────────────────────

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
        while ((match = regex.exec(String(text || '')))) indexes.add(Number(match[1]));
        return Array.from(indexes).filter(n => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
      };

      const normalizeExampleValues = (examples) => {
        if (Array.isArray(examples)) return examples.map(v => String(v ?? '').trim());
        if (examples && typeof examples === 'object') {
          return Object.keys(examples).map(k => Number(k)).filter(k => Number.isInteger(k) && k > 0).sort((a, b) => a - b).map(k => String(examples[k] ?? '').trim());
        }
        return [];
      };

      const buildExampleValues = (text, examples, label) => {
        const indexes = getVariableIndexes(text);
        if (indexes.length === 0) return null;
        if (indexes.some((v, i) => v !== i + 1)) throw new Error(`${label} variables must be sequential like {{1}}, {{2}}, {{3}}`);
        const values = normalizeExampleValues(examples);
        if (values.length < indexes.length) throw new Error(`${label} requires ${indexes.length} example value(s)`);
        const orderedValues = indexes.map((_, i) => String(values[i] || '').trim());
        if (orderedValues.some(v => !v)) throw new Error(`${label} variable examples cannot be empty`);
        return orderedValues;
      };

      if (data.headerType === 'CAROUSEL') {
        const bodyComponent = { type: 'BODY', text: data.bodyText };
        const bodyExampleValues = buildExampleValues(data.bodyText, data.bodyExamples, 'Body');
        if (bodyExampleValues) bodyComponent.example = { body_text: [bodyExampleValues] };
        components.push(bodyComponent);

        const cards = [];
        if (data.cards && Array.isArray(data.cards)) {
          for (let i = 0; i < data.cards.length; i++) {
            const cardData = data.cards[i];
            const cardFile = data.cardFiles ? data.cardFiles[i] : null;
            if (!cardFile) throw new Error(`Media file missing for card ${i + 1}`);

            const fileHandle = await this.uploadTemplateMedia(cardFile);
            const cardComponents = [
              { type: 'HEADER', format: 'IMAGE', example: { header_handle: [fileHandle] } },
              { type: 'BODY', text: cardData.bodyText }
            ];

            if (cardData.buttons?.length > 0) {
              const buttons = cardData.buttons.map(btn => {
                if (btn.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: btn.text };
                if (btn.type === 'URL') return { type: 'URL', text: btn.text, url: btn.url };
                if (btn.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
              });
              cardComponents.push({ type: 'BUTTONS', buttons });
            }
            cards.push({ components: cardComponents });
          }
        }
        components.push({ type: 'CAROUSEL', cards });

      } else {
        if (data.headerType && data.headerType !== 'NONE') {
          const headerComponent = { type: 'HEADER', format: data.headerType };
          if (data.headerType === 'TEXT') {
            headerComponent.text = data.headerText;
            const headerExampleValues = buildExampleValues(data.headerText, data.headerExamples, 'Header');
            if (headerExampleValues) headerComponent.example = { header_text: headerExampleValues };
          } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(data.headerType)) {
            const fileHandle = await this.uploadTemplateMedia(data.mediaFile);
            headerComponent.example = { header_handle: [fileHandle] };
          }
          components.push(headerComponent);
        }

        const bodyComponent = { type: 'BODY', text: data.bodyText };
        const bodyExampleValues = buildExampleValues(data.bodyText, data.bodyExamples, 'Body');
        if (bodyExampleValues) bodyComponent.example = { body_text: [bodyExampleValues] };
        components.push(bodyComponent);

        if (data.footerText) components.push({ type: 'FOOTER', text: data.footerText });

        if (data.buttons?.length > 0) {
          const buttons = data.buttons.map(btn => {
            if (btn.type === 'URL') return { type: 'URL', text: btn.text, url: btn.url };
            if (btn.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
            return { type: 'QUICK_REPLY', text: btn.text };
          });
          components.push({ type: 'BUTTONS', buttons });
        }
      }

      const payload = { name: data.name, category: data.category, language: data.language, components };
      console.log('Sending Template Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(url, payload, {
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      console.error('Create Template Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getTemplates() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.tenant.whatsappConfig.businessAccountId}/message_templates`,
        { headers: { Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}` } }
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
      if (!template) throw new Error(`Template "${templateName}" not found`);
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
        headers: { Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      console.error('Template creation error:', error.response?.data || error);
      throw error;
    }
  }

  // ─── Business Encryption ──────────────────────────────────────────────────────

  async setBusinessPublicKey(publicKey) {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/whatsapp_business_encryption`;
      const formData = new URLSearchParams();
      formData.append('business_public_key', publicKey);
      const response = await axios.post(url, formData, {
        headers: { 'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' }
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
        headers: { 'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error getting business public key:', error.response?.data || error);
      throw error;
    }
  }

  // ─── Payment ──────────────────────────────────────────────────────────────────

  async lookupPaymentStatus(orderId) {
    try {
      const Settings = require('../models/settings');
      const settings = await Settings.findOne({ tenant_id: this.tenant._id.toString() });
      if (!settings?.flowConfig?.paymentConfigurationName) throw new Error('Payment configuration not found in settings');

      const paymentConfigName = settings.flowConfig.paymentConfigurationName;
      const response = await axios.get(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/payments/${paymentConfigName}/${orderId}`,
        { headers: { Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}` } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Payment status lookup failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // ─── Read / Typing ────────────────────────────────────────────────────────────

  async markMessageAsRead(message, options = {}) {
    try {
      const withTypingIndicator = Boolean(options?.withTypingIndicator);
      const typingType = options?.type || 'text';

      let messageId;
      let isOutgoing = false;
      const systemPhoneNumberId = this.tenant.whatsappConfig?.phoneNumberId;

      if (typeof message === 'string') {
        messageId = message;
      } else if (typeof message === 'object' && message !== null) {
        if (message.from === systemPhoneNumberId) isOutgoing = true;
        messageId = message.messageId || message.wamid || message.id || message._id;
      }

      if (isOutgoing) return { success: true, message: 'Skipped outgoing message.' };
      if (!messageId) return { success: false, error: 'Message ID is missing/undefined' };
      if (messageId.length === 24 && /^[0-9a-fA-F]+$/.test(messageId)) {
        console.warn(`⚠️ Skipped markMessageAsRead: ${messageId} looks like a MongoDB ID.`);
        return { success: false, error: 'Invalid ID format (MongoDB ID detected)' };
      }

      const payload = { messaging_product: 'whatsapp', status: 'read', message_id: messageId };
      if (withTypingIndicator) payload.typing_indicator = { type: typingType };

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (error) {
      console.error('❌ Error marking message as read:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // ─── Welcome Message ──────────────────────────────────────────────────────────

  async sendWelcomeMessage(to, tenantId) {
    try {
      const BotConfiguration = require('../models/WelcomeTemplates');
      const config = await BotConfiguration.findOne({ tenant_id: tenantId, isActive: true });
      if (!config) {
        console.log('No active bot configuration found for tenant:', tenantId);
        return null;
      }

      if (config.welcomeMessageType === 'Interactive') {
        return await this.sendInteractiveMessage(to, config);
      } else {
        let messageText = '';
        if (config.headerText) messageText += `*${config.headerText}*\n\n`;
        messageText += this.sanitizeWhatsAppText(config.messageBody);
        messageText += `\n\n_${this.FOOTER_TEXT}_`;
        return await this.sendMessage(to, messageText);
      }
    } catch (error) {
      console.error('Error sending welcome message:', error);
      throw error;
    }
  }

  // ─── Message Persistence ──────────────────────────────────────────────────────

  async saveMessage(messageData) {
    try {
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
      console.log('[WhatsApp] Message saved to database');
    } catch (error) {
      console.error('[WhatsApp] Error saving message:', error.message);
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/[\s\-\(\)\+]/g, '').replace(/\D/g, '');
    if (cleaned.length < 7 || cleaned.length > 15) {
      console.warn('⚠️ Invalid phone number length:', cleaned);
      return cleaned;
    }
    return cleaned;
  }

  getTextFallback(templateType, data) {
    switch (templateType) {
      case 'order_confirmation':
        return `Hi ${data.customerName}, thank you for your order! Your order #${data.orderNumber} for ${data.total} has been confirmed.`;
      case 'abandoned_cart':
        return `Hi ${data.customerName}, you have items in your cart. Complete your purchase before they sell out!`;
      case 'shipping_update':
        return `Hi ${data.customerName}, your order #${data.orderNumber} has shipped! Track with number ${data.trackingNumber}. Estimated delivery: ${data.estimatedDelivery}.`;
      default:
        return null;
    }
  }
}

// ─── Standalone Helpers (exported separately if needed) ───────────────────────

const handleInteractiveMessageResponse = async (messageData, tenant, metadata) => {
  try {
    const BotConfiguration = require('../models/WelcomeTemplates');
    const interactiveData = messageData.interactive;
    let selectedOption = null;

    if (interactiveData?.type === 'list_reply') selectedOption = interactiveData.list_reply?.title;
    else if (interactiveData?.type === 'button_reply') selectedOption = interactiveData.button_reply?.title;

    if (!selectedOption) return;

    const botConfig = await BotConfiguration.findOne({ tenant_id: tenant._id.toString(), isActive: true });
    if (!botConfig) return;

    const whatsappService = new WhatsAppService(tenant);
    const customerPhone = messageData.from;
    const selectedWorkflow = botConfig.workflows.find(wf => wf.buttonText === selectedOption);
    if (!selectedWorkflow) return;

    switch (selectedWorkflow.workflow) {
      case 'Visit Website': {
	  const visitWebsiteMsg = botConfig.workflowMessages?.find(
	    wm => wm.workflow === 'Visit Website'
	  );

	  // ✅ FIX: removed hardcoded https://srfoodproducts.com fallback
	  const visitUrl = selectedWorkflow?.url || visitWebsiteMsg?.url || null;
	  const msgText = visitWebsiteMsg?.message || 'Click the link below to visit our website! 🙏';
	  const responseText = visitUrl ? `${msgText}\n\n🔗 ${visitUrl}` : msgText;

	  await whatsappService.sendMessage(customerPhone, responseText);
	  break;
	}

      case 'Shop Our Collection': {
        const shopWorkflowMsg = botConfig.workflowMessages?.find(wm => wm.workflow === 'Shop Our Collection');
        const catalogConfig = { bodyText: shopWorkflowMsg?.message || 'Welcome to our collection!', footerText: 'Powered by GoWhats!' };
        await whatsappService.sendCatalogMessage(customerPhone, catalogConfig);
        break;
      }
      default:
        console.log(`Unhandled workflow action: ${selectedWorkflow.workflow}`);
    }
  } catch (error) {
    console.error('❌ Error in handleInteractiveMessageResponse:', error);
  }
};

function extractShopifyPhoneNumber(orderData) {
  return orderData.customer?.phone ||
    orderData.customer?.default_address?.phone ||
    orderData.billing_address?.phone ||
    orderData.shipping_address?.phone;
}

module.exports = WhatsAppService;
module.exports.handleInteractiveMessageResponse = handleInteractiveMessageResponse;
module.exports.extractShopifyPhoneNumber = extractShopifyPhoneNumber;
