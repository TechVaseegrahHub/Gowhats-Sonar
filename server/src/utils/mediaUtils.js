// utils/mediaUtils.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const s3Service = require('./s3Service');

function getExtensionFromMimeType(mimeType) {
  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf'
  };
  return extensionMap[mimeType] || 'bin';
}

// Fixed function - no duplicates
async function downloadMediaFromWhatsApp(mediaId, accessToken, tenantId) {
  try {
    console.log(`Downloading WhatsApp media: ID=${mediaId}`);
    
    // Step 1: Get media URL from WhatsApp API
    const mediaInfoResponse = await axios.get(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!mediaInfoResponse.data || !mediaInfoResponse.data.url) {
      throw new Error('Invalid media info response from WhatsApp');
    }

    const { url, mime_type, file_size } = mediaInfoResponse.data;
    console.log(`Retrieved media info: type=${mime_type}, size=${file_size}`);

    // Step 2: Download the media content
    const mediaResponse = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      responseType: 'arraybuffer'
    });

    const mediaBuffer = Buffer.from(mediaResponse.data);
    console.log(`Downloaded media content: ${mediaBuffer.length} bytes`);

    // Step 3: Generate filename with appropriate extension
    const fileExtension = getExtensionFromMimeType(mime_type);
    const uniqueFileName = `whatsapp_${mediaId}_${Date.now()}.${fileExtension}`;
    
    // Step 4: Upload to S3
    const s3Key = `media/${tenantId}/${uniqueFileName}`;
    
    // Upload the media buffer to S3
    const uploadResult = await s3Service.uploadBuffer(
      mediaBuffer, 
      uniqueFileName, 
      mime_type, 
      tenantId
    );
    
    console.log('Media uploaded to S3:', uploadResult);
    
    // Step 5: Return the S3 URL and metadata for storage in your database
    return {
      url: uploadResult.url,        // Full S3 URL for direct access
      s3Key: uploadResult.key,      // S3 object key for reference
      storage: 's3',
      mimeType: mime_type,
      size: file_size,
      filename: uniqueFileName
    };
  } catch (error) {
    console.error('WhatsApp media download error:', error);
    return null;
  }
}

class MediaUtils {
  // Supported media types
  static MEDIA_TYPES = {
    image: {
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif']
    },
    video: {
      maxSize: 16 * 1024 * 1024, // 16MB
      allowedTypes: ['video/mp4', 'video/mpeg']
    },
    audio: {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['audio/mpeg', 'audio/ogg', 'audio/wav']
    },
    document: {
      maxSize: 100 * 1024 * 1024, // 100MB
      allowedTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    }
  };

  // Generate unique filename
  static generateUniqueFileName(originalName, type = 'media') {
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8);
    const sanitizedName = originalName
      .replace(/[^a-zA-Z0-9.]/g, '_')
      .toLowerCase();

    return `${type}_${timestamp}_${uniqueId}_${sanitizedName}`;
  }

  // Validate media buffer
  static validateMediaBuffer(buffer, mediaType) {
    const typeConfig = this.MEDIA_TYPES[mediaType];

    if (!typeConfig) {
      throw new Error(`Unsupported media type: ${mediaType}`);
    }

    // Size validation
    if (buffer.length > typeConfig.maxSize) {
      throw new Error(`Media exceeds maximum size of ${typeConfig.maxSize / 1024 / 1024}MB`);
    }

    return true;
  }

  // Detect media type from buffer
  static detectMediaType(buffer, mimeType) {
    for (const [type, config] of Object.entries(this.MEDIA_TYPES)) {
      if (config.allowedTypes.includes(mimeType)) {
        return type;
      }
    }
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  // Upload media to WhatsApp
  static async uploadToWhatsApp(options) {
    const {
      buffer,
      mimeType,
      phoneNumberId,
      accessToken
    } = options;

    try {
      const form = new FormData();
      form.append('file', buffer, {
        filename: this.generateUniqueFileName('upload', 'whatsapp'),
        contentType: mimeType
      });
      form.append('type', mimeType);
      form.append('messaging_product', 'whatsapp');

      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/media`,
        form,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...form.getHeaders()
          }
        }
      );

      return {
        mediaId: uploadResponse.data.id
      };
    } catch (error) {
      console.error('WhatsApp Media Upload Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Send media message
  static async sendMediaMessage(options) {
    const {
      phoneNumberId,
      accessToken,
      recipientPhone,
      mediaId,
      type = 'image',
      caption = ''
    } = options;

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type,
          [type]: {
            id: mediaId,
            ...(caption ? { caption: caption.slice(0, 1024) } : {})
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        messageId: response.data.messages[0].id
      };
    } catch (error) {
      console.error('Send Media Message Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Comprehensive media processing workflow
  static async processMedia(options) {
    const {
      buffer,
      mimeType,
      phoneNumberId,
      accessToken,
      recipientPhone,
      caption
    } = options;

    try {
      // Detect and validate media type
      const mediaType = this.detectMediaType(buffer, mimeType);
      this.validateMediaBuffer(buffer, mediaType);

      // Upload to WhatsApp
      const { mediaId } = await this.uploadToWhatsApp({
        buffer,
        mimeType,
        phoneNumberId,
        accessToken
      });

      // Send media message
      const result = await this.sendMediaMessage({
        phoneNumberId,
        accessToken,
        recipientPhone,
        mediaId,
        type: mediaType,
        caption
      });

      return result;
    } catch (error) {
      console.error('Media Processing Error:', error);
      throw error;
    }
  }
}


module.exports = {
  downloadMediaFromWhatsApp,
  MediaUtils
};
