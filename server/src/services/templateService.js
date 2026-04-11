// services/whatsappServices.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class WhatsAppService {
  constructor(tenant) {
    this.tenant = tenant;
    this.baseUrl = 'https://graph.facebook.com/v22.0';
  }

  async sendMessage(to, text) {
    try {
      const url = `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`;
      
      const response = await axios.post(url, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text }
      }, {
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

  async sendMedia(to, file) {
    try {
      // Check if file exists
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found: ${file.path}`);
      }
      
      // Determine media type based on mimetype
      let mediaType;
      if (file.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      } else {
        mediaType = 'document';
      }
      
      console.log(`Sending ${mediaType} to WhatsApp API`);
      
      // First upload the media to get an ID
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', fs.createReadStream(file.path));
      
      // Upload the file to WhatsApp API
      const uploadResponse = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
            ...formData.getHeaders()
          }
        }
      );
      
      const mediaId = uploadResponse.data.id;
      console.log('Media uploaded to WhatsApp with ID:', mediaId);
      
      // Save a copy of the file with the WhatsApp media ID as the filename
      const fileExt = path.extname(file.originalname);
      const newFileName = `${mediaId}${fileExt}`;
      const destPath = path.join(__dirname, '..', 'uploads', newFileName);
      
      fs.copyFileSync(file.path, destPath);
      
      // Create appropriate payload based on media type
      const messageData = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: mediaType,
        [mediaType]: {
          id: mediaId
        }
      };
      
      // Add caption for image and document types
      if (mediaType === 'image' || mediaType === 'document') {
        messageData[mediaType].caption = file.originalname || '';
      }
      
      // Add filename for document type
      if (mediaType === 'document') {
        messageData[mediaType].filename = file.originalname || 'document';
      }
      
      console.log('Sending media message with payload:', JSON.stringify(messageData));
      
      // Send the message with the media ID
      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        messageData,
        {
          headers: {
            'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
  
      return {
        ...response.data,
        mediaId,
        mediaUrl: newFileName
      };
    } catch (error) {
      console.error('WhatsApp media send error:', error.response?.data || error);
      throw error;
    }
  }

  async getTemplates() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.tenant.whatsappConfig.businessAccountId}/message_templates`,
        {
          headers: {
            Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async sendTemplateMessage(templateName, recipientPhone, parameters = {}) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.tenant.whatsappConfig.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: recipientPhone,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: 'en' // or get from template
            },
            components: parameters
          }
        },
        {
          headers: {
            Authorization: `Bearer ${this.tenant.whatsappConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
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
}

module.exports = WhatsAppService;