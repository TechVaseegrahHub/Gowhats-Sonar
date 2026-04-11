const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const authenticateToken = require('../middleware/auth');
const auth = require('../middleware/auth');
const Contact = require('../models/Contact');
const { decryptFields, MESSAGE_ENCRYPTION_FIELDS } = require('../utils/encryption');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Add this line
const Tenant = require('../models/Tenant');
const WhatsAppService = require('../services/whatsappServices');
const TemplateService = require('../services/templateService');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const Broadcast = require('../models/Broadcast');
const mongoose = require('mongoose');
const redisService = require('../services/redisService');
ffmpeg.setFfmpegPath(ffmpegPath);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tenantId = req.user.tenant_id;
    // Go up from src/ to server/, then into uploads/
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'media', tenantId.toString());

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    console.log('📁 Saving file to directory:', uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const filename = Date.now() + path.extname(file.originalname);
    console.log('💾 Saving file as:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 64 * 1024 * 1024,
  }
})

/**
 * Enhanced media URL validation and fallback
 */
async function validateAndGetMediaUrl(mediaUrl, templateName, mediaType) {
  try {
    // Test if the URL is accessible
    const response = await fetch(mediaUrl, { method: 'HEAD', timeout: 5000 });

    if (response.ok) {
      return mediaUrl; // Original URL works
    } else {
      console.warn(`⚠️ Media URL returned ${response.status} for template ${templateName}`);
      throw new Error(`Media URL not accessible: ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Media URL validation failed for ${templateName}:`, error.message);

    // Return a publicly accessible placeholder based on media type
    const fallbackUrls = {
      'image': 'https://via.placeholder.com/400x300/0066CC/FFFFFF?text=Product+Image',
      'video': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'document': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
    };

    return fallbackUrls[mediaType] || fallbackUrls['image'];
  }
}

/**
 * Updated component generator with media validation
 */
function generateTemplateComponents(template, customerData = {}) {
  const components = [];

  if (!template.components) {
    console.log(`⚠️ Template ${template.name} has no components defined`);
    return components;
  }

  template.components.forEach((component, componentIndex) => {
    console.log(`🔍 Processing component ${componentIndex}:`, component.type, component);

    // ✅ BODY COMPONENT - Use actual customer data
    if (component.type === 'BODY' && component.text) {
      const paramMatches = component.text.match(/\{\{\d+\}\}/g) || [];
      console.log(`📝 Body needs ${paramMatches.length} parameters`);

      if (paramMatches.length > 0) {
        const parameters = [];

        paramMatches.forEach((match, index) => {
          let paramValue = '';

          // ✅ CRITICAL FIX: Use actual customer data, not example values
          if (customerData.customerName) {
            paramValue = customerData.customerName;
          } else if (customerData.profile_name) {
            paramValue = customerData.profile_name;
          } else if (component.example?.body_text?.[0]?.[index]) {
            // Only use example as last resort
            paramValue = component.example.body_text[0][index];
          } else {
            paramValue = 'Customer'; // Final fallback
          }

          parameters.push({
            type: 'text',
            text: paramValue
          });
        });

        components.push({
          type: 'body',
          parameters: parameters
        });

        console.log(`✅ BODY parameters with ACTUAL data:`, parameters);
      }
    }
    // ✅ HEADER with TEXT parameters
    else if (component.type === 'HEADER' && component.format === 'TEXT' && component.text) {
      const headerParams = component.text.match(/\{\{\d+\}\}/g) || [];

      if (headerParams.length > 0) {
        const parameters = headerParams.map((param, index) => {
          let value = 'Header';

          if (customerData.headerText) {
            value = customerData.headerText;
          } else if (component.example?.header_text?.[index]) {
            value = component.example.header_text[index];
          }

          return {
            type: 'text',
            text: value
          };
        });

        components.push({
          type: 'header',
          parameters: parameters
        });

        console.log(`✅ TEXT header parameters added`);
      }
    }
    // ✅ HEADER with MEDIA (IMAGE/VIDEO/DOCUMENT)
    else if (component.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO'].includes(component.format)) {
      console.log(`🖼️ Processing ${component.format} header for template: ${template.name}`);

      let mediaUrl = '';
      const format = component.format.toLowerCase();

      // Try customer data first
      if (customerData[`${format}Url`]) {
        mediaUrl = customerData[`${format}Url`];
      } else if (component.example?.header_handle?.[0]) {
        mediaUrl = component.example.header_handle[0];
      } else {
        // Use reliable defaults
        if (format === 'image') mediaUrl = getReliableImageUrl(template.name);
        else if (format === 'video') mediaUrl = getReliableVideoUrl(template.name);
        else if (format === 'document') mediaUrl = getReliableDocumentUrl(template.name);
        else if (format === 'audio') mediaUrl = getReliableAudioUrl(template.name);
      }

      const mediaParam = {
        type: format,
        [format]: { link: mediaUrl }
      };

      if (format === 'document' && customerData.documentFilename) {
        mediaParam[format].filename = customerData.documentFilename;
      }

      components.push({
        type: 'header',
        parameters: [mediaParam]
      });

      console.log(`✅ ${format.toUpperCase()} header parameter added: ${mediaUrl}`);
    }
  });

  console.log(`📋 Final generated components for ${template.name}:`, JSON.stringify(components, null, 2));
  return components;
}

function buildPhoneVariations(phoneNumber = '') {
  const raw = String(phoneNumber || '').trim();
  const clean = raw.replace(/\D/g, '');
  const local10 = clean.slice(-10);

  const variations = new Set([raw, clean]);

  if (clean) {
    variations.add(`+${clean}`);
  }

  if (local10) {
    variations.add(local10);
    variations.add(`91${local10}`);
    variations.add(`+91${local10}`);
  }

  return Array.from(variations).filter(Boolean);
}

// ✅ ENHANCED: Reliable media URL functions with working URLs
function getReliableImageUrl(templateName) {
  // Use working, publicly accessible image URLs
  const imageUrls = {
    'avarampoo': 'https://picsum.photos/400/300?random=1',
    'product': 'https://picsum.photos/400/300?random=2',
    'welcome': 'https://picsum.photos/400/300?random=3',
    'order_confirmation': 'https://picsum.photos/400/300?random=4',
    'default': 'https://via.placeholder.com/400x300/4F46E5/FFFFFF?text=Template+Image'
  };

  return imageUrls[templateName] || imageUrls['default'];
}

function getReliableVideoUrl(templateName) {
  // Use a reliable, publicly accessible video URL
  return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
}

function getReliableDocumentUrl(templateName) {
  // Use a working PDF URL
  return 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
}

function getReliableAudioUrl(templateName) {
  // Use a working audio URL
  return 'https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav';
}

// ✅ ENHANCED: Template validation before sending
async function validateTemplateBeforeSending(template, components) {
  console.log(`🔍 Validating template "${template.name}" before sending...`);

  // Check if template has required components
  const requiredHeaderComponents = template.components?.filter(c =>
    c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO'].includes(c.format)
  ) || [];

  const providedHeaderComponents = components.filter(c => c.type === 'header') || [];

  if (requiredHeaderComponents.length > 0 && providedHeaderComponents.length === 0) {
    throw new Error(`Template "${template.name}" requires ${requiredHeaderComponents[0].format} header but none provided`);
  }

  // ✅ ENHANCED: Validate each header component has proper structure
  for (const component of providedHeaderComponents) {
    if (component.parameters) {
      for (const param of component.parameters) {
        if (param.type === 'image' && !param.image?.link) {
          throw new Error(`Invalid image parameter structure for template "${template.name}"`);
        }
        if (param.type === 'video' && !param.video?.link) {
          throw new Error(`Invalid video parameter structure for template "${template.name}"`);
        }
        if (param.type === 'document' && !param.document?.link) {
          throw new Error(`Invalid document parameter structure for template "${template.name}"`);
        }
        if (param.type === 'audio' && !param.audio?.link) {
          throw new Error(`Invalid audio parameter structure for template "${template.name}"`);
        }
      }
    }
  }

  console.log(`✅ Template validation passed for "${template.name}"`);
  return true;
}


// Get messages for tenant
router.get('/', auth, async (req, res) => {
  try {
    const { phone_number, limit = 50, beforeId } = req.query;

    if (!phone_number) {
        return res.status(400).json({ error: "Phone number is required" });
    }

    const phoneVariations = buildPhoneVariations(phone_number);
   
 // ✅ Build Query
    let query = {
      tenantId: req.user.tenant_id,
      $or: [
        { from: { $in: phoneVariations } },
        { to: { $in: phoneVariations } }
      ]
    };

    // Pagination: If we have a 'beforeId', load messages older than that ID (scrolling up)
    if (beforeId) {
        query._id = { $lt: beforeId };
    }

    // ✅ Fetch Messages
    // Sort DESC (-1) first to get the LATEST messages, then limit
    let messages = await Message.find(query)
    .sort({ timestamp: -1 }) 
    .limit(parseInt(limit))
    .lean(); // Faster execution

    // Since we sorted DESC to get the latest, we reverse them back for the chat UI
    messages = messages.reverse();

    messages = messages.map((msg) => {
  decryptFields(msg, MESSAGE_ENCRYPTION_FIELDS);
  return msg;
});


    // ✅ Server-side Deduplication (Optimized)
    const seen = new Set();
    messages = messages.filter(msg => {
      if (msg.type !== 'template') return true;
      // Unique key for template deduping
      const key = `${msg.type}-${msg.templateName}-${Math.floor(new Date(msg.timestamp).getTime() / 10000)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});


// Template stats for a single contact
router.get('/template-stats', auth, async (req, res) => {
  try {
    const { phone_number } = req.query;

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const phoneVariations = buildPhoneVariations(phone_number);
    const tenantId = mongoose.Types.ObjectId.isValid(req.user.tenant_id)
      ? new mongoose.Types.ObjectId(req.user.tenant_id)
      : req.user.tenant_id;

    const statusBuckets = await Message.aggregate([
      {
        $match: {
          tenantId,
          type: 'template',
          to: { $in: phoneVariations }
        }
      },
      {
        $group: {
          _id: { $toLower: { $ifNull: ['$status', 'unknown'] } },
          count: { $sum: 1 }
        }
      }
    ]);

    let totalTemplates = 0;
    let failed = 0;

    for (const bucket of statusBuckets) {
      totalTemplates += bucket.count || 0;
      if (bucket._id === 'failed') {
        failed += bucket.count || 0;
      }
    }

    const sent = Math.max(totalTemplates - failed, 0);

    res.json({
      success: true,
      phone_number,
      stats: {
        totalTemplates,
        sent,
        failed
      }
    });
  } catch (error) {
    console.error('Error fetching template stats:', error);
    res.status(500).json({ error: 'Failed to fetch template stats' });
  }
});

// Send message
router.post('/send', auth, async (req, res) => {
  try {
    const { to, text, clientId, quotedMessageId, quotedMessageText } = req.body;

    // Basic validation
    if (!to || !text) {
      return res.status(400).json({ error: 'Missing required fields: to, text' });
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const whatsappService = new WhatsAppService(tenant);

    // Check 24-hour window logic
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const phoneVariations = buildPhoneVariations(to);
    const lastCustomerMessage = await Message.findOne({
    tenantId: tenant._id,
    from: { $in: phoneVariations },
    timestamp: { $gte: twentyFourHoursAgo }
    }).sort({ timestamp: -1 });

    const isWindowOpen = lastCustomerMessage !== null;
    let response;
    let messageType = 'text';
    let templateName = null;
    let messageText = text;

    if (isWindowOpen) {
  console.log(`[Send Logic] 24-hour window is OPEN for ${to}. Sending regular message.`);

  if (quotedMessageId) {
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      context: { message_id: quotedMessageId },
      text: { body: text }
    };
    response = await whatsappService.sendMessage(to, messagePayload);
  } else {
    response = await whatsappService.sendMessage(to, text);
  }
  
} else {
  console.log(`[Send Logic] 24-hour window is CLOSED for ${to}. Sending 'hello_world' template (fallback).`);
  templateName = 'hello_world';
  messageType = 'template';
  messageText = `Template: ${templateName}`;

  response = await whatsappService.sendTemplateMessage(
    templateName,
    to,
    []
  );
}

    // Create the message object
    const newMessage = new Message({
      tenantId: tenant._id,
      from: tenant.whatsappConfig.phoneNumberId || 'me',
      to: to,
      text: messageText,
      type: messageType,
      templateName: templateName,
      timestamp: new Date(),
      status: 'sent',
      messageId: response?.messages?.[0]?.id,
      clientId: clientId || null,
      quotedMessageId: quotedMessageId || null,
      quotedMessageText: quotedMessageText || null
    });

    await newMessage.save();

    // Update Contact's Last Message and Timestamp
    const updatedContact = await Contact.findOneAndUpdate({
      tenantId: tenant._id,
      phone_number: to
    }, {
      $set: {
        lastMessage: messageText,
        timestamp: new Date()
      }
    }, { upsert: true, new: true });

    // Real-time Sync for Multiple Agents
    if (global.io) {
      global.io.to(tenant._id.toString()).emit('message_sent', {
        ...newMessage.toObject(),
        clientId: clientId || null,
        contact: {
          phone_number: to,
          name: updatedContact ? (updatedContact.name || to) : to,
          profile_name: updatedContact ? updatedContact.profile_name : null
        }
      });

      console.log(`📡 Emitted message_sent to tenant room ${tenant._id} for contact ${to}`);
    }

    res.json({
      success: true,
      message: newMessage,
      whatsappResponse: response
    });

  } catch (error) {
    console.error('Message send error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.response?.data || error.message
    });
  }
});


router.post('/send-media', auth, uploadWithErrorHandling, async (req, res) => {
 try {
    const { to, caption, clientId, quotedMessage } = req.body;
    let { mediaType, mediaData } = req.body;
    const file = req.file;

    console.log('📤 Universal media send request:', {
      to,
      mediaType,
      hasFile: !!file,
      hasMediaData: !!mediaData,
      caption: caption || 'No caption',
      clientId,
      hasQuotedMessage: !!quotedMessage
    });

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      if (file && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const whatsapp = new WhatsAppService(tenant);
    let response;
    let newMessage;

    // Handle file upload method
    if (file) {
      console.log('📁 Processing uploaded file:', {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: `${(file.size / 1024 / 1024).toFixed(2)}MB`
      });

      mediaType = mediaType || determineMediaType(file.mimetype);

      let fileToSend = file;

      // Audio conversion logic (existing code...)
      const isUnsupportedAudio = mediaType === 'audio' && !['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'].includes(file.mimetype);

      if (isUnsupportedAudio) {
        console.log(`⚠️ Unsupported audio format (${file.mimetype}) detected. Converting to MP3...`);

        const baseFilename = path.basename(file.filename, path.extname(file.filename));
        const outputMp3Path = path.join(path.dirname(file.path), `${baseFilename}.mp3`);
        const newFilename = `${baseFilename}.mp3`;

        await new Promise((resolve, reject) => {
          ffmpeg(file.path)
            .format('mp3')
            .audioBitrate('128k')
            .on('error', (err) => reject(new Error('Failed to convert audio file.')))
            .on('end', () => resolve())
            .save(outputMp3Path);
        });

        const convertedFile = {
          ...file,
          path: outputMp3Path,
          mimetype: 'audio/mpeg',
          filename: newFilename,
          originalname: `${path.basename(file.originalname, path.extname(file.originalname))}.mp3`
        };

        fileToSend = convertedFile;
        fs.unlinkSync(file.path);
      }

      console.log(`🚀 Sending media to WhatsApp service...`);
      
      // ✅ Send with reply context if available
      response = await whatsapp.sendMedia(
        to, 
        fileToSend, 
        caption,
        quotedMessage?.messageId  // Pass quoted message ID
      );

      newMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to,
        type: mediaType,
        mediaUrl: `/uploads/media/${tenant._id}/${fileToSend.filename}`,
        text: caption || file.originalname,
        timestamp: new Date(),
        status: 'sent',
        messageId: response.messages?.[0]?.id,
        clientId: clientId || null,
        // ✅ NEW: Store quoted message
        quotedMessage: quotedMessage ? {
          messageId: quotedMessage.messageId,
          text: quotedMessage.text,
          from: quotedMessage.from,
          timestamp: quotedMessage.timestamp,
          type: quotedMessage.type || 'text',
          senderName: quotedMessage.senderName
        } : undefined
      });

    } else if (mediaData) {
      // Handle URL or ID method
      console.log('🔗 Processing media data (URL/ID):', mediaData);
      response = await whatsapp.sendMediaMessage(
        to, 
        mediaType, 
        mediaData, 
        caption,
        quotedMessage?.messageId  // Pass quoted message ID
      );

      newMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to,
        type: mediaType,
        mediaUrl: mediaData.url || mediaData.link || `media_id:${mediaData.id}`,
        text: caption || `${mediaType} message`,
        timestamp: new Date(),
        status: 'sent',
        messageId: response.messages?.[0]?.id,
        clientId: clientId || null,
        // ✅ NEW: Store quoted message
        quotedMessage: quotedMessage ? {
          messageId: quotedMessage.messageId,
          text: quotedMessage.text,
          from: quotedMessage.from,
          timestamp: quotedMessage.timestamp,
          type: quotedMessage.type || 'text',
          senderName: quotedMessage.senderName
        } : undefined
      });
    } else {
      return res.status(400).json({ error: 'No file or media data provided' });
    }

    await newMessage.save();
    console.log('💾 Message saved to database:', newMessage._id);

    // Update contact's last message
    await Contact.findOneAndUpdate(
      { tenantId: tenant._id, phone_number: to },
      {
        $set: {
          lastMessage: caption || `Sent ${mediaType}`,
          timestamp: new Date()
        }
      },
      { upsert: true }
    );

    // Emit to socket for real-time UI update
    if (global.io) {
      global.io.to(tenant._id.toString()).emit('message_sent', {
        ...newMessage.toObject(),
        clientId: clientId || null
      });
      console.log('📡 Message sent event emitted to socket with clientId:', clientId);
    }

    res.json({
      success: true,
      message: newMessage,
      whatsappResponse: response
    });

  } catch (error) {
    console.error('❌ Universal media send error:', error);
    if (error.isAxiosError && error.response) {
        console.error('Axios Error Details:', error.response.data);
    }
    res.status(500).json({
      error: 'Failed to send media',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Wrap multer to handle errors gracefully
function uploadWithErrorHandling(req, res, next) {
  upload.single('file')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File too large',
          details: 'Maximum file size is 25MB'
        });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'Upload failed', details: err.message });
    }
    next();
  });
}


// Helper function to determine media type from MIME type
function determineMediaType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

// Send location message
router.post('/send-location', auth, async (req, res) => {
  try {
    const { to, latitude, longitude, name, address } = req.body;

    if (!to || !latitude || !longitude) {
      return res.status(400).json({
        error: 'Missing required fields: to, latitude, longitude'
      });
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const whatsapp = new WhatsAppService(tenant);
    const locationData = { latitude, longitude, name, address };

    const response = await whatsapp.sendMediaMessage(to, 'location', locationData);

    const newMessage = new Message({
      tenantId: tenant._id,
      from: tenant.whatsappConfig.phoneNumberId,
      to,
      type: 'location',
      text: name || `Location: ${latitude}, ${longitude}`,
      metadata: locationData,
      timestamp: new Date(),
      status: 'sent',
      messageId: response.messages?.[0]?.id
    });

    await newMessage.save();

    // Update contact
    await Contact.findOneAndUpdate(
      { tenantId: tenant._id, phone_number: to },
      {
        $set: {
          lastMessage: `Shared location${name ? ': ' + name : ''}`,
          timestamp: new Date()
        }
      },
      { upsert: true }
    );

    // Emit to socket
    if (global.io) {
      global.io.to(tenant._id.toString()).emit('message_sent', {
        ...newMessage.toObject()
      });
    }

    res.json({
      success: true,
      message: newMessage,
      whatsappResponse: response
    });

  } catch (error) {
    console.error('❌ Location send error:', error);
    res.status(500).json({
      error: 'Failed to send location',
      details: error.message
    });
  }
});

// Template message route
router.post('/send-template', auth, async (req, res) => {
  try {
    let { templateName, recipientPhone, language = "en", components = [], parameters = {} } = req.body;

    if (!templateName || !recipientPhone) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Extract template name if it's an object
    if (typeof templateName === 'object' && templateName.name) {
      templateName = templateName.name;
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const whatsapp = new WhatsAppService(tenant);

    try {
      console.log(`🔍 Fetching template details for: ${templateName}`);
      const templates = await whatsapp.getTemplates();
      const template = templates.data?.find(t => t.name === templateName && t.status === 'APPROVED');

      if (!template) {
        throw new Error(`Template "${templateName}" not found or not approved`);
      }

      console.log('📋 Template structure:', JSON.stringify(template, null, 2));

      // ✅ CRITICAL FIX: Get customer data from Contact
      const Contact = require('../models/Contact');
      const contact = await Contact.findOne({
        tenantId: tenant._id,
        phone_number: recipientPhone
      });

      // ✅ Prepare customer data for template
      const customerData = {
        customerName: contact?.profile_name || contact?.name || parameters.customerName || 'Customer',
        profile_name: contact?.profile_name || contact?.name || 'Customer',
        phone: recipientPhone,
        ...parameters // Include any additional parameters from request
      };

      console.log('👤 Using customer data:', customerData);

      // ✅ Build components with ACTUAL customer data
      const templateComponents = generateTemplateComponents(template, customerData);

      // Validate template before sending
      await validateTemplateBeforeSending(template, templateComponents);

      console.log('📋 Final template components to send:', JSON.stringify(templateComponents, null, 2));

      // Send template
      let response;
      try {
        response = await whatsapp.sendTemplateMessage(
          templateName,
          recipientPhone,
          templateComponents,
          language
        );
        console.log(`✅ Template "${templateName}" sent successfully to ${recipientPhone}`);
      } catch (sendError) {
        console.error(`❌ Failed to send template "${templateName}":`, sendError.response?.data || sendError.message);

        let errorMessage = 'Failed to send template message';
        const errorData = sendError.response?.data?.error || sendError.response?.data?.error_data;

        if (errorData) {
          if (errorData.message?.includes('Parameter format does not match')) {
            errorMessage = `Template parameter format mismatch. Check customer data.`;
          } else if (errorData.details?.includes('does not exist in')) {
            errorMessage = `Template "${templateName}" does not exist in language "${language}".`;
          } else {
            errorMessage = errorData.message || errorData.details || errorMessage;
          }
        }

        return res.status(400).json({
          success: false,
          error: errorMessage,
          details: errorData,
          templateName,
          customerData: customerData // ✅ Return what was used
        });
      }

      // Create message record
      const Message = require('../models/Message');

      const newMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to: recipientPhone,
        type: 'template',
        templateName,
        text: `Template: ${templateName} - Hello ${customerData.customerName}`, // ✅ Show actual text
        timestamp: new Date(),
        messageId: response.messages?.[0]?.id,
        status: 'sent',
        sentFromWABA: true
      });

      await newMessage.save();

      // Update contact
      await Contact.findOneAndUpdate(
        { tenantId: tenant._id, phone_number: recipientPhone },
        {
          $set: {
            lastMessage: `Template: ${templateName}`,
            timestamp: new Date()
          }
        },
        { upsert: true }
      );

      // Emit to socket
      if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', {
          ...newMessage.toObject()
        });
        console.log('✅ Template message emitted to socket');
      }

      res.json({
        success: true,
        message: newMessage,
        whatsappResponse: response,
        customerData: customerData, // ✅ Return what was sent
        componentsUsed: templateComponents.length
      });

    } catch (templateError) {
      console.error('❌ Template processing error:', templateError);
      res.status(400).json({
        success: false,
        error: 'Template processing failed',
        details: templateError.message,
        templateName
      });
    }

  } catch (error) {
    console.error('❌ Template send error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send template message',
      details: error.message
    });
  }
});

router.post('/preview-template', auth, async (req, res) => {
  try {
    const { templateName } = req.body;

    if (!templateName) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const whatsapp = new WhatsAppService(tenant);
    const templates = await whatsapp.getTemplates();
    const template = templates.data?.find(t => t.name === templateName);

    if (!template) {
      return res.status(404).json({ error: `Template "${templateName}" not found` });
    }

    // Generate components
    const components = generateTemplateComponents(template);

    res.json({
      success: true,
      template: {
        name: template.name,
        language: template.language,
        status: template.status,
        category: template.category,
        components: template.components
      },
      generatedComponents: components,
      isValid: components.length > 0 || template.components?.length === 0
    });

  } catch (error) {
    console.error('Template preview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to preview template',
      details: error.message
    });
  }
});

// Media upload route
router.post('/media', auth, uploadWithErrorHandling, async (req, res) => {
 try {
    const { to } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File uploaded:', file);

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Determine media type based on mimetype
    let type;
    if (file.mimetype.startsWith('image/')) {
      type = 'image';
    } else if (file.mimetype.startsWith('video/')) {
      type = 'video';
    } else if (file.mimetype.startsWith('audio/')) {
      type = 'audio';
    } else {
      type = 'document';
    }

    try {
      // Special handling for audio files
if (type === 'audio') {
  console.log('🎤 Processing audio file for WhatsApp compatibility...');

  try {
    const outputPath = path.join(path.dirname(file.path), `converted_${Date.now()}.ogg`);

    // Convert to OGG Opus format that WhatsApp accepts
    await new Promise((resolve, reject) => {
      ffmpeg(file.path)
        .audioCodec('libopus')
        .audioBitrate('128k')
        .audioChannels(1)
        .format('ogg')
        .on('start', (cmd) => {
          console.log('🔄 FFmpeg conversion started:', cmd);
        })
        .on('progress', (progress) => {
          console.log('⏳ Converting:', Math.floor(progress.percent || 0) + '%');
        })
        .on('end', () => {
          console.log('✅ Audio conversion completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg conversion error:', err);
          reject(err);
        })
        .save(outputPath);
    });

    // Check converted file exists and has content
    const stats = await fs.promises.stat(outputPath);
    console.log(`✅ Converted file size: ${(stats.size / 1024).toFixed(2)}KB`);

    if (stats.size < 1000) {
      throw new Error('Converted audio file is too small');
    }

    // Replace file with converted version
    const convertedFile = {
      ...file,
      path: outputPath,
      mimetype: 'audio/ogg; codecs=opus',
      originalname: file.originalname.replace(/\.\w+$/, '.ogg'),
      filename: path.basename(outputPath)
    };

    console.log('📤 Sending converted audio file to WhatsApp...');

    const whatsapp = new WhatsAppService(tenant);
    const response = await whatsapp.sendMedia(to, convertedFile);

    // Clean up temporary files
    try {
      await fs.promises.unlink(file.path); // Delete original
      // Keep converted file for serving
    } catch (cleanupError) {
      console.warn('⚠️ Cleanup warning:', cleanupError.message);
    }

    const mediaUrl = `media/${tenant._id}/${convertedFile.filename}`;
    console.log('💾 Creating audio message record with mediaUrl:', mediaUrl);

    const newMessage = new Message({
      tenantId: tenant._id,
      from: tenant.whatsappConfig.phoneNumberId,
      to,
      type: 'audio',
      mediaUrl: mediaUrl,
      duration: req.body.duration || 0,
      timestamp: new Date(),
      status: 'sent',
      messageId: response?.messages?.[0]?.id
    });

    await newMessage.save();

    await Contact.findOneAndUpdate(
      { tenantId: tenant._id, phone_number: to },
      {
        $set: {
          lastMessage: 'Voice message',
          timestamp: new Date()
        }
      },
      { upsert: true }
    );

    if (global.io) {
      global.io.to(tenant._id.toString()).emit('message_sent', {
        ...newMessage.toObject()
      });
    }

    return res.json({
      success: true,
      message: newMessage,
      convertedFrom: file.mimetype,
      convertedTo: 'audio/ogg; codecs=opus'
    });

  } catch (audioError) {
    console.error('❌ Audio processing error:', audioError);
    return res.status(500).json({
      error: 'Failed to process audio file',
      details: audioError.message
    });
  }
}

      // Regular handling for other file types
      const whatsapp = new WhatsAppService(tenant);
      const response = await whatsapp.sendMedia(to, file);

      // Create message record
      const newMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to,
        type,
        mediaUrl: `media/${tenant._id}/${file.filename}`, // Construct the path correctly
        text: file.originalname,
        timestamp: new Date(),
        status: 'sent',
        messageId: response.messages?.[0]?.id
      });

      await newMessage.save();

      // Update contact's last message
      await Contact.findOneAndUpdate(
        {
          tenantId: tenant._id,
          phone_number: to
        },
        {
          $set: {
            lastMessage: `Sent ${type}`,
            timestamp: new Date()
          }
        },
        { upsert: true }
      );

      // Emit to socket if available
      if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', {
          ...newMessage.toObject()
        });
      }

      res.json(newMessage);
    } catch (error) {
      console.error('WhatsApp API error:', error);
      res.status(500).json({
        error: 'Failed to send via WhatsApp',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({
      error: 'Failed to process media',
      details: error.message
    });
  }
});

// Replace the existing /process-broadcast route with this enhanced version
router.post('/process-broadcast', auth, async (req, res) => {
  try {
    const { broadcastId, templateName, recipients, prioritize } = req.body;

    if (!broadcastId || !templateName || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "Missing or invalid required fields" });
    }

    console.log(`🚀 Processing broadcast: ${broadcastId}, template: ${templateName}, recipients: ${recipients.length}`);

    // Get tenant info
    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Fetch the broadcast document
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) {
      return res.status(404).json({ error: "Broadcast not found" });
    }

    const whatsapp = new WhatsAppService(tenant);

    // Get template details and prepare components
    let components = [];
    try {
      const templates = await whatsapp.getTemplates();
      const template = templates.data?.find(t => t.name === templateName && t.status === 'APPROVED');

      if (!template) {
        throw new Error(`Template "${templateName}" not found or not approved`);
      }

      components = generateTemplateComponents(template);

    } catch (templateError) {
      console.error('Template component generation failed:', templateError.message);

      // If template has no examples, try sending without parameters as fallback
      if (templateError.message.includes('missing') || templateError.message.includes('insufficient')) {
        console.log(`⚠️ Template ${templateName} missing examples, trying without parameters...`);
        components = []; // Empty components array
      } else {
        return res.status(400).json({ error: `Template error: ${templateError.message}` });
      }
    }

    let sentCount = 0;
    const failed = [];
    const succeeded = [];

    // Send to all recipients
    for (const recipient of recipients) {
      try {
        console.log(`📱 Sending template "${templateName}" to ${recipient} with components`);

        const waRes = await whatsapp.sendTemplateMessage(templateName, recipient, components, "en");

        // Save a Message record for each
        await Message.create({
          tenantId: tenant._id,
          from: tenant.whatsappConfig.phoneNumberId,
          to: recipient,
          type: "template",
          templateName,
          text: `Template: ${templateName}`,
          timestamp: new Date(),
          messageId: waRes?.messages?.[0]?.id,
          status: "sent",
          broadcastId: broadcast._id
        });

        sentCount++;
        succeeded.push(recipient);
        console.log(`✅ Successfully sent to ${recipient}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${recipient}:`, err.response?.data || err.message);
        failed.push({ recipient, error: err.message });
      }
    }

    // Update broadcast doc
    broadcast.sentCount = sentCount;
    broadcast.status = sentCount > 0 ? "Sent" : "Failed";
    if (failed.length > 0) {
      broadcast.processingErrors = failed;
    }
    await broadcast.save();

    console.log(`📊 Broadcast ${broadcastId} completed: ${sentCount} sent, ${failed.length} failed`);

    res.json({
      success: sentCount,
      failed: failed.length,
      recipients: succeeded,
      errors: failed
    });
  } catch (error) {
    console.error('❌ Error in process-broadcast:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/mark-read', auth, async (req, res) => {
  try {
    const { messageId, phoneNumber } = req.body;

    if (!messageId) {
      return res.status(400).json({ error: 'Message ID is required' });
    }

    console.log(`📖 Request to mark message as read:`, {
      messageId,
      phoneNumber,
      tenantId: req.user.tenant_id
    });

    // Get tenant
    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Initialize WhatsApp service
    const whatsappService = new WhatsAppService(tenant);

    // Mark message as read via WhatsApp API
    const result = await whatsappService.markMessageAsRead(messageId);

    // Update message status in database
    if (result.success !== false) {
      await Message.findOneAndUpdate(
        {
          tenantId: req.user.tenant_id,
          messageId: messageId
        },
        {
          $set: {
            readByUser: true,
            readAt: new Date()
          }
        }
      );

      console.log(`✅ Message ${messageId} marked as read in database`);
    }

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('❌ Error marking message as read:', error);
    res.status(500).json({
      error: 'Failed to mark message as read',
      details: error.message
    });
  }
});

// Send typing indicator (also marks latest inbound message as read)
router.post('/typing-indicator', auth, async (req, res) => {
  try {
    const { phoneNumber, messageId, type = 'text' } = req.body || {};

    if (!phoneNumber && !messageId) {
      return res.status(400).json({ error: 'phoneNumber or messageId is required' });
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const whatsappService = new WhatsAppService(tenant);

    let targetMessageId = messageId;
    let targetPhone = phoneNumber;

    // If messageId is not provided, use latest inbound message for this contact
    if (!targetMessageId) {
      const phoneVariations = buildPhoneVariations(phoneNumber);
      const latestInboundMessage = await Message.findOne({
        tenantId: req.user.tenant_id,
        from: { $in: phoneVariations },
        messageId: { $exists: true, $ne: null }
      })
        .sort({ timestamp: -1 })
        .select('messageId from')
        .lean();

      if (!latestInboundMessage?.messageId) {
        return res.status(404).json({ error: 'No inbound message found for this contact' });
      }

      targetMessageId = latestInboundMessage.messageId;
      targetPhone = latestInboundMessage.from || phoneNumber;
    }

    const result = await whatsappService.markMessageAsRead(targetMessageId, {
      withTypingIndicator: true,
      type
    });

    if (result?.success === false) {
      return res.status(502).json({
        success: false,
        error: 'Failed to send typing indicator',
        details: result.error || 'Unknown error'
      });
    }

    return res.json({
      success: true,
      phoneNumber: targetPhone,
      messageId: targetMessageId,
      result
    });
  } catch (error) {
    console.error('❌ Error sending typing indicator:', error);
    return res.status(500).json({
      error: 'Failed to send typing indicator',
      details: error.message
    });
  }
});

// Bulk mark messages as read for a contact
router.post('/mark-contact-read', auth, async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log(`📖 Marking all messages as read for: ${phoneNumber}`);

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Get all unread messages from this contact
    const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
    const phoneVariations = [
      phoneNumber,
      `+${phoneNumber}`,
      cleanNumber,
      `91${cleanNumber.replace(/^91/, '')}`,
      `+91${cleanNumber.replace(/^91/, '')}`,
    ];

    const uniquePhones = [...new Set(phoneVariations)];

  // ✅ BULK UPDATE - single DB query instead of N queries
	const result = await Message.updateMany(
	  {
	    tenantId: req.user.tenant_id,
	    from: { $in: uniquePhones },
	    readByUser: { $ne: true }
	  },
	  {
	    $set: { readByUser: true, readAt: new Date() }
	  }
	);

	console.log(`Marked ${result.modifiedCount} messages as read in one query`);

	const whatsappService = new WhatsAppService(tenant);
	let successCount = result.modifiedCount;
	let failCount = 0;

	// Only call WhatsApp API for the single latest message
	const latestUnread = await Message.findOne({
	  tenantId: req.user.tenant_id,
	  from: { $in: uniquePhones },
	  messageId: { $exists: true, $ne: null }
	}).sort({ timestamp: -1 });

	if (latestUnread) {
	  try {
	    await whatsappService.markMessageAsRead(latestUnread.messageId);
	  } catch (error) {
	    console.error('Failed to mark latest message as read via WhatsApp API:', error.message);
	  }
	}

    // Clear unread count for contact
    const updatedContact = await Contact.findOneAndUpdate(
      {
        tenantId: req.user.tenant_id,
        phone_number: { $in: uniquePhones }
      },
      {
        $set: { unreadCount: 0 }
      },
      { new: true }
    );

	// Invalidate cached contact lists/counts so unread tab is correct after page changes.
    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);
    await redisService.deletePattern(`contacts:counts:${req.user.tenant_id}`);

    // Emit socket event to update UI
    if (global.io) {
      global.io.to(req.user.tenant_id.toString()).emit('messages_marked_read', {
        phoneNumber: phoneNumber,
        count: successCount
      });

     if (updatedContact) {
        global.io.to(req.user.tenant_id.toString()).emit('contact_updated', {
          contact: updatedContact,
          action: 'mark_read',
          timestamp: new Date()
        });
      }

    }

    res.json({
      success: true,
      markedAsRead: successCount,
      failed: failCount,
      total: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error marking contact messages as read:', error);
    res.status(500).json({
      error: 'Failed to mark messages as read',
      details: error.message
    });
  }
});

router.get('/debug-whatsapp-token', auth, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);

    const tokenInfo = {
      hasToken: !!tenant.whatsappConfig?.accessToken,
      tokenLength: tenant.whatsappConfig?.accessToken?.length,
      tokenFirst20: tenant.whatsappConfig?.accessToken?.substring(0, 20),
      tokenLast20: tenant.whatsappConfig?.accessToken?.substring(tenant.whatsappConfig?.accessToken?.length - 20),
      phoneNumberId: tenant.whatsappConfig?.phoneNumberId
    };

    res.json(tokenInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function for default parameter values
function getDefaultParameterValue(templateName, paramIndex) {
  const defaults = {
    'order_confirmation_website': {
      1: 'John Doe',           // Customer name
      2: 'ORD-2025-001',       // Order number
      3: '$129.99',            // Total amount
      4: 'GoWhats Store',      // Store name
      'header': 'Order Confirmation'
    },
    'kamesh_testing': {
      1: 'Test Customer',
      2: 'Test Value',
      3: 'Sample Data',
      'header': 'Test Header'
    },
    'product': {
      1: 'Premium Product',
      2: '$49.99',
      3: 'Available Now',
      'header': 'New Product'
    },
    'hello_world': {
      1: 'World',
      'header': 'Hello'
    }
  };

  return defaults[templateName]?.[paramIndex] || `Parameter ${paramIndex}`;
}

// ✅ Route: Send Reaction
router.post('/send-reaction', authenticateToken, async (req, res) => {
  try {
    const { to, messageId, emoji } = req.body;

    if (!to || !messageId || !emoji) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const whatsappService = new WhatsAppService(tenant);

    // Send reaction via WhatsApp API
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji: emoji
      }
    };

    const axios = require('axios');
    const response = await axios.post(
      `${whatsappService.baseUrl}/${whatsappService.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${whatsappService.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data) {
      // Save reaction to database
      const reactionMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to: to,
        type: 'reaction',
        reaction: {
          messageId: messageId,
          emoji: emoji
        },
        timestamp: new Date(),
        messageId: response.data.messages?.[0]?.id,
        status: 'sent'
      });

      await reactionMessage.save();

      // Emit to socket
      if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', {
          ...reactionMessage.toObject(),
          contact: { phone_number: to }
        });
      }

      res.json({ success: true, message: reactionMessage });
    }
  } catch (error) {
    console.error('Error sending reaction:', error);
    res.status(500).json({ error: 'Failed to send reaction' });
  }
});



// ✅ Route: Send Location
router.post('/send-location', auth, async (req, res) => {
  try {
    const { to, location } = req.body;
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const whatsapp = new WhatsAppService(tenant);

    // 1. Send to WhatsApp
    const response = await whatsapp.sendLocationMessage(to, location);

    // 2. Save to DB
    const Message = require('../models/Message');
    const msg = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to: to,
        type: 'location',
        location: location,
        timestamp: new Date(),
        status: 'sent',
        messageId: response.messages?.[0]?.id
    });
    await msg.save();

    // 3. Emit to Socket
    if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', { ...msg.toObject() });
    }

    res.json({ success: true, data: response, message: msg });
  } catch (error) {
    console.error('❌ Send Location Route Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Route: Send Location Request
router.post('/send-location-request', auth, async (req, res) => {
  try {
    const { to, bodyText } = req.body;
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const whatsapp = new WhatsAppService(tenant);

    const response = await whatsapp.sendLocationRequestMessage(to, bodyText);

    // Save to DB
    const Message = require('../models/Message');
    const msg = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to: to,
        type: 'interactive',
        text: 'Location Request Sent',
        timestamp: new Date(),
        status: 'sent',
        messageId: response.messages?.[0]?.id,
        isInteractionResponse: true // Mark so it shows up in chat
    });
    await msg.save();

    if (global.io) {
        global.io.to(tenant._id.toString()).emit('message_sent', { ...msg.toObject() });
    }

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('❌ Send Location Request Route Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for media URLs
function getDefaultImageUrl(templateName) {
  // Use a placeholder image service or your own default images
  return `https://via.placeholder.com/400x300/0075BE/FFFFFF?text=${encodeURIComponent(templateName)}`;
}

function getDefaultVideoUrl(templateName) {
  // Return a sample video URL - you should replace with actual video
  return 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4';
}

function getDefaultDocumentUrl(templateName) {
  // Return a sample document URL - you should replace with actual document
  return 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
}

router.get('/orders/by-contact', auth, async (req, res) => {
  try {
    const { phone } = req.query;
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    
    const Order = require('../models/Order');
    const orders = await Order.find({
      tenantId: req.user.tenant_id,
      $or: [
        { customerPhone: { $regex: cleanPhone + '$' } },
        { 'customerDetails.phone': { $regex: cleanPhone + '$' } }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50) // Never fetch 1000!
    .lean();
    
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
