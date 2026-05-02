const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const Tenant = require('../models/Tenant');

// ==========================================
// Handle history webhook (message history sync)
// ==========================================
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

    // ✅ FIX 2: Normalize display_phone_number once outside the loop for accurate comparison.
    // Meta's display_phone_number can be formatted (e.g. "+1 555-123-4567") while
    // msg.from is a raw E.164 number ("15551234567"). Strip all non-digits for comparison.
    const displayPhoneNormalized = (value.metadata?.display_phone_number || '')
      .replace(/\D/g, '');

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

      for (const msg of messages) {
        const {
          id: whatsappMessageId,
          from,
          to,
          timestamp,
          type,
          history_context
        } = msg;

        // Skip media placeholders — actual media arrives in a separate event
        if (type === 'media_placeholder') {
          console.log('Media placeholder detected, skipping');
          continue;
        }

        // Check if message already exists (idempotency guard)
        const existingMessage = await Message.findOne({
          tenantId: tenantId,
          messageId: whatsappMessageId
        });

        if (existingMessage) {
          console.log('Message already exists:', whatsappMessageId);
          continue;
        }

        // ✅ FIX 2: Normalize from number before comparing to avoid formatting mismatch
        const fromNormalized = (from || '').replace(/\D/g, '');
        const isOutgoing = fromNormalized === displayPhoneNormalized;

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
        }

        // ✅ FIX 1: Result used — emit socket event after creation
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

        // ✅ FIX 1: Emit per-message socket event so UI can update incrementally
        if (global.io) {
          global.io.to(tenantId).emit('waba_historical_message', {
            message: newMessage.toObject(),
            contact: contact.toObject(),
            tenantId: tenantId
          });
        }
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

// ==========================================
// Handle smb_app_state_sync webhook (contacts sync)
// ==========================================
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

      // ✅ FIX 3: Removed unused `metadata` destructure
      const { contact, action } = syncItem;
      const { phone_number, full_name, first_name } = contact || {};

      if (!phone_number) {
        console.log('No phone number in contact sync item');
        continue;
      }

      console.log(`Processing contact sync: ${phone_number} (${action})`);

      if (action === 'add') {
        let existingContact = await Contact.findOne({
          tenantId: tenantId,
          phone_number: phone_number
        });

        if (existingContact) {
          existingContact.name = full_name || first_name || existingContact.name;
          existingContact.profile_name = full_name;
          existingContact.syncedFromWABA = true;
          await existingContact.save();
          console.log('Updated existing contact:', phone_number);
        } else {
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
        await Contact.findOneAndUpdate(
          { tenantId: tenantId, phone_number: phone_number },
          { $set: { removedFromWABA: true, removedAt: new Date() } }
        );
        console.log('Marked contact as removed:', phone_number);
      }
    }

    console.log('Contacts sync completed');

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

// ==========================================
// Handle smb_message_echoes webhook
// ==========================================
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

      const existingMessage = await Message.findOne({
        tenantId: tenantId,
        messageId: whatsappMessageId
      });

      if (existingMessage) {
        console.log('Message echo already exists:', whatsappMessageId);
        continue;
      }

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

      // ✅ FIX 1: newMessage is now properly used
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

// ==========================================
// Handle account_update webhook
// ==========================================
async function handleAccountUpdateWebhook(value, tenantId) {
  try {
    console.log('Processing account update webhook for tenant:', tenantId);

    const { phone_number, event } = value;
    console.log(`Account update event: ${event} for phone: ${phone_number}`);

    if (event === 'PARTNER_REMOVED') {
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

// ✅ FIX 4: Debug route REMOVED entirely.
// It exposed Meta accessToken and businessAccountId to unauthenticated callers.
// If you need this again for local debugging, add `auth` middleware and restrict
// to non-production environments: if (process.env.NODE_ENV !== 'production') { ... }

module.exports = {
  handleHistoryWebhook,
  handleContactsSyncWebhook,
  handleMessageEchoesWebhook,
  handleAccountUpdateWebhook,
  router
};
