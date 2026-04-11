const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const Tenant = require('../models/Tenant');
// ✅ Added for the temporary debug route
const axios = require('axios'); 

// Handle history webhook (message history sync)
async function handleHistoryWebhook(value, tenantId) {
  try {
    console.log('Processing history webhook for tenant:', tenantId);

    const history = value.history?.[0];
    if (!history) {
      console.log('No history data in webhook');
      return;
    }

    const { metadata, threads } = history;
    const { phase, chunk_order, progress } = metadata || {};

    console.log(`History sync progress: ${progress}% (Phase: ${phase}, Chunk: ${chunk_order})`);

    if (!threads || threads.length === 0) {
      console.log('No threads in history data');
      return;
    }

    // Process each thread (conversation)
    for (const thread of threads) {
      const whatsappUserId = thread.id;
      const messages = thread.messages || [];

      console.log(`Processing thread with ${messages.length} messages for user: ${whatsappUserId}`);

      // Find or create contact
      let contact = await Contact.findOne({
        tenantId: tenantId,
        phone_number: whatsappUserId
      });

      if (!contact) {
        contact = await Contact.create({
          tenantId: tenantId,
          phone_number: whatsappUserId,
          name: whatsappUserId,
          source: 'whatsapp_business_app',
          syncedFromWABA: true
        });
        console.log('Created new contact:', whatsappUserId);
      }

      // Process each message in the thread
      for (const msg of messages) {
        const {
          id: whatsappMessageId,
          from,
          to,
          timestamp,
          type,
          history_context
        } = msg;

        // Check if message already exists
        const existingMessage = await Message.findOne({
          tenantId: tenantId,
          messageId: whatsappMessageId
        });

        if (existingMessage) {
          console.log('Message already exists:', whatsappMessageId);
          continue;
        }

        // Determine if this is an incoming or outgoing message
        const isOutgoing = from === value.metadata.display_phone_number;

        // Extract message content based on type
        let messageContent = '';
        let mediaUrl = null;

        if (type === 'text' && msg.text) {
          messageContent = msg.text.body;
        } else if (type === 'image' && msg.image) {
          messageContent = msg.image.caption || 'Image';
          mediaUrl = msg.image.id;
        } else if (type === 'video' && msg.video) {
          messageContent = msg.video.caption || 'Video';
          mediaUrl = msg.video.id;
        } else if (type === 'audio' && msg.audio) {
          messageContent = 'Audio message';
          mediaUrl = msg.audio.id;
        } else if (type === 'document' && msg.document) {
          messageContent = msg.document.filename || 'Document';
          mediaUrl = msg.document.id;
        } else if (type === 'media_placeholder') {
          console.log('Media placeholder detected, waiting for actual media data');
          continue;
        }

        // Create message record
        const newMessage = await Message.create({
          tenantId: tenantId,
          from: from,
          to: to || whatsappUserId,
          text: messageContent,
          mediaUrl: mediaUrl,
          type: type,
          status: history_context?.status?.toLowerCase() || 'delivered',
          timestamp: new Date(parseInt(timestamp) * 1000),
          messageId: whatsappMessageId,
          isHistorical: true,
          historicalPhase: phase,
          historicalChunk: chunk_order,
          sentFromWABA: isOutgoing
        });

        console.log(`Created historical message: ${whatsappMessageId} (${type})`);
      }
    }

    // Update sync progress in tenant
    await Tenant.findOneAndUpdate(
      { _id: tenantId },
      {
        $set: {
          'whatsappConfig.syncProgress': progress,
          'whatsappConfig.syncPhase': phase,
          'whatsappConfig.lastSyncedAt': new Date()
        }
      }
    );

    console.log(`History sync progress updated: ${progress}%`);

    // Emit socket event
    if (global.io) {
      global.io.to(tenantId).emit('waba_history_sync_progress', {
        progress: progress,
        phase: phase,
        chunk: chunk_order,
        tenantId: tenantId,
        timestamp: new Date()
      });
    }

  } catch (error) {
    console.error('Error handling history webhook:', error);
  }
}

// Handle smb_app_state_sync webhook (contacts sync)
async function handleContactsSyncWebhook(value, tenantId) {
  try {
    console.log('Processing contacts sync webhook for tenant:', tenantId);

    const stateSync = value.state_sync;
    if (!stateSync || stateSync.length === 0) {
      console.log('No state sync data in webhook');
      return;
    }

    for (const syncItem of stateSync) {
      if (syncItem.type !== 'contact') {
        continue;
      }

      const { contact, action, metadata } = syncItem;
      const { phone_number, full_name, first_name } = contact || {};

      if (!phone_number) {
        console.log('No phone number in contact sync item');
        continue;
      }

      console.log(`Processing contact sync: ${phone_number} (${action})`);

      if (action === 'add') {
        // Find or create contact
        let existingContact = await Contact.findOne({
          tenantId: tenantId,
          phone_number: phone_number
        });

        if (existingContact) {
          // Update existing contact
          existingContact.name = full_name || first_name || existingContact.name;
          existingContact.profile_name = full_name;
          existingContact.syncedFromWABA = true;
          await existingContact.save();
          console.log('Updated existing contact:', phone_number);
        } else {
          // Create new contact
          await Contact.create({
            tenantId: tenantId,
            phone_number: phone_number,
            profile_name: full_name,
            name: full_name || first_name || phone_number,
            source: 'whatsapp_business_app',
            syncedFromWABA: true,
            syncedAt: new Date()
          });
          console.log('Created new contact from WABA:', phone_number);
        }
      } else if (action === 'remove') {
        // Mark contact as removed
        await Contact.findOneAndUpdate(
          {
            tenantId: tenantId,
            phone_number: phone_number
          },
          {
            $set: {
              removedFromWABA: true,
              removedAt: new Date()
            }
          }
        );
        console.log('Marked contact as removed:', phone_number);
      }
    }

    console.log('Contacts sync completed');

    // Emit socket event
    if (global.io) {
      global.io.to(tenantId).emit('waba_contacts_synced', {
        contactCount: stateSync.length,
        tenantId: tenantId,
        timestamp: new Date()
      });
    }

  } catch (error) {
    console.error('Error handling contacts sync webhook:', error);
  }
}

// Handle smb_message_echoes webhook (messages sent from WhatsApp Business App)
async function handleMessageEchoesWebhook(value, tenantId) {
  try {
    console.log('Processing message echoes webhook for tenant:', tenantId);

    const messageEchoes = value.message_echoes;
    if (!messageEchoes || messageEchoes.length === 0) {
      console.log('No message echoes in webhook');
      return;
    }

    for (const msg of messageEchoes) {
      const {
        id: whatsappMessageId,
        from,
        to,
        timestamp,
        type
      } = msg;

      // Check if message already exists
      const existingMessage = await Message.findOne({
        tenantId: tenantId,
        messageId: whatsappMessageId
      });

      if (existingMessage) {
        console.log('Message echo already exists:', whatsappMessageId);
        continue;
      }

      // Find contact
      let contact = await Contact.findOne({
        tenantId: tenantId,
        phone_number: to
      });

      if (!contact) {
        contact = await Contact.create({
          tenantId: tenantId,
          phone_number: to,
          name: to,
          source: 'whatsapp_business_app'
        });
      }

      // Extract message content
      let messageContent = '';
      let mediaUrl = null;

      if (type === 'text' && msg.text) {
        messageContent = msg.text.body;
      } else if (type === 'image' && msg.image) {
        messageContent = msg.image.caption || 'Image';
        mediaUrl = msg.image.id;
      } else if (type === 'video' && msg.video) {
        messageContent = msg.video.caption || 'Video';
        mediaUrl = msg.video.id;
      } else if (type === 'audio' && msg.audio) {
        messageContent = 'Audio message';
        mediaUrl = msg.audio.id;
      } else if (type === 'document' && msg.document) {
        messageContent = msg.document.filename || 'Document';
        mediaUrl = msg.document.id;
      }

      // Create message record
      const newMessage = await Message.create({
        tenantId: tenantId,
        from: from,
        to: to,
        text: messageContent,
        mediaUrl: mediaUrl,
        type: type,
        status: 'sent',
        timestamp: new Date(parseInt(timestamp) * 1000),
        messageId: whatsappMessageId,
        sentFromWABA: true
      });

      console.log(`Created message echo: ${whatsappMessageId} (${type})`);

      // Emit socket event to update UI
      if (global.io) {
        global.io.to(tenantId).emit('message_sent', {
          ...newMessage.toObject(),
          contact: contact.toObject(),
          sentFromWABA: true
        });

        global.io.to(tenantId).emit('waba_message_echo', {
          message: newMessage.toObject(),
          contact: contact.toObject(),
          tenantId: tenantId,
          timestamp: new Date()
        });
      }
    }

  } catch (error) {
    console.error('Error handling message echoes webhook:', error);
  }
}

// Handle account_update webhook
async function handleAccountUpdateWebhook(value, tenantId) {
  try {
    console.log('Processing account update webhook for tenant:', tenantId);

    const { phone_number, event } = value;

    console.log(`Account update event: ${event} for phone: ${phone_number}`);

    if (event === 'PARTNER_REMOVED') {
      // Business disconnected from Cloud API via WhatsApp Business App
      console.log('Partner removed - business disconnected from Cloud API');

      await Tenant.findOneAndUpdate(
        { _id: tenantId },
        {
          $set: {
            'whatsappConfig.partnerRemoved': true,
            'whatsappConfig.partnerRemovedAt': new Date(),
            'whatsappConfig.isWhatsAppBusinessApp': false
          }
        }
      );

      // Emit socket event to notify user
      if (global.io) {
        global.io.to(tenantId).emit('whatsapp_disconnected', {
          reason: 'Partner removed from WhatsApp Business App',
          phoneNumber: phone_number,
          tenantId: tenantId,
          timestamp: new Date()
        });

        global.io.to(tenantId).emit('waba_disconnected', {
          phoneNumber: phone_number,
          event: event,
          tenantId: tenantId,
          timestamp: new Date()
        });
      }
    }

  } catch (error) {
    console.error('Error handling account update webhook:', error);
  }
}

// ==========================================
// 🛠️ TEMPORARY DEBUG ROUTE (for finding Payment ID)
// ==========================================
router.get('/debug-payment/:tenantId', async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.tenantId);
    if (!tenant) return res.status(404).send('Tenant not found');

    const url = `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.businessAccountId}/payment_configurations`;
    
    console.log(`🔍 Querying Meta API for Payment Configs... URL: ${url}`);

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${tenant.whatsappConfig.accessToken}` }
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Debug API Error:", error.response?.data || error.message);
    res.status(500).json(error.response?.data || { error: error.message });
  }
});

// Export handlers
module.exports = {
  handleHistoryWebhook,
  handleContactsSyncWebhook,
  handleMessageEchoesWebhook,
  handleAccountUpdateWebhook,
  router // Export router so it can be mounted in server.js
};
