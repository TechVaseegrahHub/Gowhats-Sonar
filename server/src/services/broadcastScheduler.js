const cron = require('node-cron');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Broadcast = mongoose.model('Broadcast');
const Tenant = mongoose.model('Tenant');
const Message = mongoose.model('Message');
const Contact = mongoose.model('Contact');
const WhatsAppService = require('./whatsappServices');
const rateLimiter = require('./broadcastRateLimiter');

console.log('======= LOADING ENHANCED BROADCAST SCHEDULER WITH MEDIA SUPPORT =======');

let isProcessing = false;
let initialized = false;

function startScheduler() {
  if (initialized) {
    console.log('Scheduler already started - ignoring duplicate call');
    return;
  }

  console.log('Starting enhanced broadcast scheduler with media support and rate limiting');
  initialized = true;

  // Run every minute
  cron.schedule('* * * * *', async () => {
    console.log('Scheduler check running');

    if (isProcessing) {
      console.log('Previous scheduler task still running - skipping');
      return;
    }

    isProcessing = true;

    try {
      await processScheduledBroadcasts();
    } catch (error) {
      console.error('Error in scheduler:', error);
    } finally {
      isProcessing = false;
    }
  });
}

async function processScheduledBroadcasts() {
  const now = new Date();
  console.log(`Looking for broadcasts at ${now.toISOString()}`);

  // ✅ FIX: Query for lowercase statuses ('scheduled' and 'pending')
  const broadcasts = await Broadcast.find({
    $or: [
      {
        isScheduled: true,
        scheduledDate: { $lte: now },
        processing: { $ne: true },
        status: 'scheduled' 
      },
      {
        isScheduled: false,
        processing: { $ne: true },
        status: 'pending' 
      }
    ]
  }).limit(3);

  if (broadcasts.length === 0) {
    console.log('No broadcasts to process');
    return;
  }

  console.log(`Found ${broadcasts.length} broadcasts to process`);

  for (const broadcast of broadcasts) {
    try {
      // ✅ FIX: Update status to 'processing' (lowercase)
      await Broadcast.updateOne(
        { _id: broadcast._id },
        {
          $set: {
            processing: true,
            processingStartedAt: now,
            status: 'processing'
          }
        }
      );

      if (broadcast.isScheduled && !shouldSendNow(broadcast, now)) {
        console.log(`Not time to send broadcast ${broadcast._id} yet`);

        // ✅ FIX: Revert status to 'scheduled' (lowercase)
        await Broadcast.updateOne(
          { _id: broadcast._id },
          {
            $set: {
              processing: false,
              processingStartedAt: null,
              status: 'scheduled'
            }
          }
        );
        continue;
      }

      await sendBroadcast(broadcast);

    } catch (error) {
      console.error(`Error processing broadcast ${broadcast._id}:`, error);

      // ✅ FIX: Update status to 'failed' (lowercase)
      await Broadcast.updateOne(
        { _id: broadcast._id },
        {
          $set: {
            processing: false,
            status: 'failed',
            processingError: error.message
          }
        }
      );
    }
  }
}

function shouldSendNow(broadcast, now) {
  try {
    if (!broadcast.isScheduled) {
      console.log(`[DEBUG] Broadcast ${broadcast._id}: Not scheduled, sending immediately`);
      return true;
    }

    // Get timezone-aware local time
    const options = { timeZone: broadcast.timezone || 'Asia/Kolkata' };
    const localTime = new Date(now.toLocaleString('en-US', options));

    // Get day names
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[localTime.getDay()];

    console.log(`[DEBUG] Broadcast ${broadcast._id}:`);
    console.log(`[DEBUG] - Timezone: ${broadcast.timezone || 'Asia/Kolkata'}`);
    console.log(`[DEBUG] - Current day: ${currentDay}`);
    console.log(`[DEBUG] - Allowed days: ${broadcast.days}`);
    console.log(`[DEBUG] - Scheduled date: ${broadcast.scheduledDate}`);
    console.log(`[DEBUG] - Scheduled time: ${broadcast.scheduledTime}`);
    console.log(`[DEBUG] - Current date: ${localTime.toISOString()}`);
    console.log(`[DEBUG] - Current time: ${localTime.getHours()}:${localTime.getMinutes().toString().padStart(2, '0')}`);

    // Check if scheduled date has passed
    const scheduledDate = new Date(broadcast.scheduledDate);
    const localDateOnly = new Date(localTime.getFullYear(), localTime.getMonth(), localTime.getDate());
    const scheduledDateOnly = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());

    if (localDateOnly < scheduledDateOnly) {
      console.log(`[DEBUG] - Date check failed: Current date is before scheduled date`);
      return false;
    }

    if (localDateOnly > scheduledDateOnly) {
      console.log(`[DEBUG] - Date check passed: Scheduled date has passed, sending now`);
      return true;
    }

    // Check day of week (only if array doesn't include all 7 days)
    if (broadcast.days && broadcast.days.length > 0 && broadcast.days.length < 7) {
      if (!broadcast.days.includes(currentDay)) {
        console.log(`[DEBUG] - Day check failed: ${currentDay} not in ${broadcast.days}`);
        return false;
      }
    }
    console.log(`[DEBUG] - Day check passed`);

    // Check time
    if (broadcast.scheduledTime) {
      const [scheduledHour, scheduledMinute] = broadcast.scheduledTime.split(':').map(Number);
      const currentHour = localTime.getHours();
      const currentMinute = localTime.getMinutes();

      console.log(`[DEBUG] - Time comparison:`);
      console.log(`[DEBUG]   Scheduled: ${scheduledHour.toString().padStart(2, '0')}:${scheduledMinute.toString().padStart(2, '0')}`);
      console.log(`[DEBUG]   Current:   ${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`);

      // Allow execution within 5 minute window
      const scheduledTotalMinutes = scheduledHour * 60 + scheduledMinute;
      const currentTotalMinutes = currentHour * 60 + currentMinute;
      const timeDifference = Math.abs(currentTotalMinutes - scheduledTotalMinutes);

      console.log(`[DEBUG]   Time difference: ${timeDifference} minutes`);

      if (timeDifference <= 5) {
        console.log(`[DEBUG] - Time check passed (within 5 minute window)`);
        return true;
      } else if (currentTotalMinutes > scheduledTotalMinutes) {
        console.log(`[DEBUG] - Time check failed: Scheduled time has passed for today`);
        return false;
      } else {
        console.log(`[DEBUG] - Time check failed: Not time yet`);
        return false;
      }
    }

    console.log(`[DEBUG] - All checks passed`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Error in shouldSendNow:`, error);
    return false;
  }
}


async function sendBroadcast(broadcast) {
  console.log(`Sending broadcast: ${broadcast.name} (${broadcast._id})`);
  console.log(`Media support: ${broadcast.hasMedia ? 'YES' : 'NO'}`);
  console.log(`WhatsApp Media ID: ${broadcast.whatsappMediaId || 'Not yet uploaded'}`);

  const tenant = await Tenant.findOne({ _id: broadcast.tenantId });
  if (!tenant) {
    throw new Error(`Tenant not found for broadcast ${broadcast._id}`);
  }

  const whatsapp = new WhatsAppService(tenant);

  // Handle media upload to WhatsApp (BEFORE sending messages)
  let whatsappMediaId = null;
  if (broadcast.hasMedia) {
    // Check if media was already uploaded
    if (broadcast.whatsappMediaId) {
      whatsappMediaId = broadcast.whatsappMediaId;
      console.log(`✅ Using existing WhatsApp media ID: ${whatsappMediaId}`);
    } else {
      // Upload media now
      try {
        console.log(`📤 Uploading media to WhatsApp: ${broadcast.mediaFileName}`);

        // --- PATH RESOLUTION FIX START ---
        let mediaPath = null;
        
        // 1. Define potential paths based on your folder structure
        const candidates = [];

        // A. Explicit absolute path from DB
        if (broadcast.mediaAbsolutePath) candidates.push(broadcast.mediaAbsolutePath);

        // B. Standard relative path
        if (broadcast.mediaUrl) {
            // Remove leading slash to prevent double-rooting
            const cleanUrl = broadcast.mediaUrl.startsWith('/') ? broadcast.mediaUrl.slice(1) : broadcast.mediaUrl;
            
            candidates.push(path.join(process.cwd(), cleanUrl));
            candidates.push(path.join(process.cwd(), 'server', cleanUrl)); // In case running from root
            candidates.push(broadcast.mediaUrl); // Try as is (if already absolute)
        }

        // C. Fallback: Search in upload directory by filename
        if (broadcast.mediaFileName && broadcast.tenantId) {
             // Assuming uploads are in /uploads/broadcast-media/{tenantId}/...
             candidates.push(path.join(process.cwd(), 'uploads', 'broadcast-media', broadcast.tenantId, broadcast.mediaFileName));
             // Fallback for direct uploads
             candidates.push(path.join(process.cwd(), 'uploads', broadcast.mediaFileName));
        }

        // 2. Check which candidate exists
        for (const p of candidates) {
            if (p && fs.existsSync(p)) {
                mediaPath = p;
                console.log(`✅ Found media file at: ${mediaPath}`);
                break;
            } else {
                // console.log(`[Debug] Path not found: ${p}`);
            }
        }

        if (!mediaPath) {
          console.error('Scanned paths:', candidates);
          throw new Error(`Media file not found. Filename: ${broadcast.mediaFileName}`);
        }
        // --- PATH RESOLUTION FIX END ---

        console.log(`Reading media from: ${mediaPath}`);
        const mediaBuffer = await fs.promises.readFile(mediaPath);
        
        // Safety check for empty files
        if (mediaBuffer.length === 0) throw new Error("Media file is empty (0 bytes)");

        console.log(`Media file size: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB`);

        const uploadResult = await whatsapp.uploadMediaFile({
          buffer: mediaBuffer,
          mimetype: broadcast.mediaMimeType,
          originalname: broadcast.mediaFileName
        }, broadcast.mediaType);

        if (!uploadResult || !uploadResult.id) {
          throw new Error('WhatsApp media upload returned no ID');
        }

        whatsappMediaId = uploadResult.id;

        // Save media ID to broadcast to prevent re-uploading on retry
        await Broadcast.updateOne(
          { _id: broadcast._id },
          { $set: { whatsappMediaId: whatsappMediaId } }
        );

        console.log(`✅ Media uploaded successfully: ${whatsappMediaId}`);
      } catch (mediaError) {
        console.error(`❌ Failed to upload media: ${mediaError.message}`);

        // Mark broadcast as failed (lowercase)
        await Broadcast.updateOne(
          { _id: broadcast._id },
          {
            $set: {
              status: 'failed',
              processing: false,
              processingError: `Media upload failed: ${mediaError.message}`
            }
          }
        );

        throw new Error(`Media upload failed: ${mediaError.message}`);
      }
    }
  }

  // Get template and generate components
  let components = [];
  try {
    const templates = await whatsapp.getTemplates();
    const template = templates.data?.find(t => t.name === broadcast.templateName && t.status === 'APPROVED');

    if (!template) {
      throw new Error(`Template "${broadcast.templateName}" not found or not approved`);
    }

    components = generateTemplateComponentsWithMedia(template, whatsappMediaId);
    console.log(`Generated ${components.length} template components`);

    // Validate media component
    if (broadcast.hasMedia && whatsappMediaId) {
      const hasMediaComponent = components.some(c =>
        c.type === 'header' &&
        c.parameters?.some(p => ['image', 'video', 'document'].includes(p.type))
      );

      if (!hasMediaComponent) {
        throw new Error('Media component not generated for media template');
      }
    }
  } catch (error) {
    console.error(`Template error: ${error.message}`);
    throw error;
  }

  // Initialize counters
  let successCount = 0;
  let deliveredCount = 0;
  let readCount = 0;
  let failedCount = 0;
  const errors = [];
  const sentMessages = [];
  const deliveredMessages = [];
  const readMessages = [];
  const failedMessages = [];

  const totalRecipients = broadcast.recipients.length;

  // Update broadcast status to 'processing'
  await Broadcast.updateOne(
    { _id: broadcast._id },
    {
      $set: {
        status: 'processing',
        processingStartedAt: new Date(),
        sentMessages: [],
        deliveredMessages: [],
        readMessages: [],
        failedMessages: []
      }
    }
  );

  if (global.emitBroadcastUpdate) {
    global.emitBroadcastUpdate(broadcast.tenantId.toString(), {
      broadcastId: broadcast._id,
      status: 'processing',
      counts: { sent: 0, delivered: 0, read: 0, failed: 0 },
      progress: 0
    });
  }

  console.log(`📬 Adding ${totalRecipients} messages to rate-limited queue`);

  // Process each recipient with rate limiting
  for (let i = 0; i < broadcast.recipients.length; i++) {
    const recipient = broadcast.recipients[i];
    const formattedRecipient = recipient.replace(/\D/g, '');

    try {
      console.log(`Sending ${broadcast.hasMedia ? 'media ' : ''}template to ${formattedRecipient} (${i + 1}/${totalRecipients})`);

      const response = await rateLimiter.addToQueue(async () => {
        return await whatsapp.sendTemplateMessage(
          broadcast.templateName,
          formattedRecipient,
          components,
          "en"
        );
      }, 'normal', formattedRecipient);

      if (!response || !response.messages || !response.messages[0]?.id) {
        throw new Error('Invalid response from WhatsApp API');
      }

      // Save message to database
      const newMessage = new Message({
        tenantId: tenant._id,
        from: tenant.whatsappConfig.phoneNumberId,
        to: formattedRecipient,
        type: 'template',
        templateName: broadcast.templateName,
        text: `Template: ${broadcast.templateName}${broadcast.hasMedia ? ' (with media)' : ''}`,
        timestamp: new Date(),
        messageId: response.messages[0].id,
        status: 'sent',
        broadcastId: broadcast._id,
        hasMedia: broadcast.hasMedia || false,
        mediaType: broadcast.mediaType || null,
        mediaId: whatsappMediaId || null
      });

      await newMessage.save();

      sentMessages.push(newMessage._id);
      successCount++;

      // Update contact
      await Contact.findOneAndUpdate(
        { tenantId: tenant._id, phone_number: formattedRecipient },
        {
          $set: {
            lastMessage: `${broadcast.templateName}${broadcast.hasMedia ? ' 📁' : ''}`,
            timestamp: new Date(),
            lastInteractionAt: new Date(),
            unreadCount: 0
          }
        },
        { upsert: true, new: true }
      );

      // Update progress every 5 messages
      if (successCount % 5 === 0 || i === totalRecipients - 1) {
        const progress = Math.round((successCount / totalRecipients) * 100);

        if (global.emitBroadcastUpdate) {
          global.emitBroadcastUpdate(broadcast.tenantId.toString(), {
            broadcastId: broadcast._id,
            status: 'processing',
            counts: { sent: successCount, delivered: deliveredCount, read: readCount, failed: failedCount },
            progress
          });
        }

        await Broadcast.updateOne(
          { _id: broadcast._id },
          {
            $set: {
              sentCount: successCount,
              deliveredCount: deliveredCount,
              readCount: readCount,
              failedCount: failedCount,
              sentMessages: sentMessages,
              deliveredMessages: deliveredMessages,
              readMessages: readMessages,
              failedMessages: failedMessages,
              lastProgressUpdate: new Date()
            }
          }
        );
      }

      if (global.io) {
        global.io.to(tenant._id.toString()).emit('contact_updated', {
          phone_number: formattedRecipient,
          lastMessage: `${broadcast.templateName}${broadcast.hasMedia ? ' 📁' : ''}`,
          timestamp: new Date(),
          action: 'broadcast_sent',
          hasMedia: broadcast.hasMedia
        });
      }

    } catch (error) {
      console.error(`❌ Failed to send to ${recipient}:`, error.message);
      errors.push({ recipient, error: error.message, timestamp: new Date() });
      failedMessages.push(recipient);
      failedCount++;
    }
  }

  // Final update
  const finalStatus = successCount > 0 ? 'completed' : 'failed';

  await Broadcast.updateOne(
    { _id: broadcast._id },
    {
      $set: {
        sentCount: successCount,
        deliveredCount: deliveredCount,
        readCount: readCount,
        failedCount: failedCount,
        sentMessages: sentMessages,
        deliveredMessages: deliveredMessages,
        readMessages: readMessages,
        failedMessages: failedMessages,
        processing: false,
        lastProcessedAt: new Date(),
        status: finalStatus,
        processingErrors: errors,
        completedAt: new Date()
      }
    }
  );

  if (global.emitBroadcastCompletion) {
    global.emitBroadcastCompletion(broadcast.tenantId.toString(), {
      broadcastId: broadcast._id,
      name: broadcast.name,
      status: finalStatus,
      finalCounts: {
        sent: successCount,
        delivered: deliveredCount,
        read: readCount,
        failed: failedCount
      },
      completedAt: new Date().toISOString()
    });
  }

  console.log(`✅ Broadcast ${broadcast._id} completed: ${successCount} sent, ${failedCount} failed`);
}


function generateTemplateComponentsWithMedia(template, mediaId) {
  const components = [];

  if (!template.components) {
    return components;
  }

  template.components.forEach((component) => {
    // Handle media headers
    if (component.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(component.format)) {
      if (mediaId) {
        const mediaType = component.format.toLowerCase();
        components.push({
          type: 'header',
          parameters: [{
            type: mediaType,
            [mediaType]: {
              id: mediaId
            }
          }]
        });
        console.log(`Added ${mediaType} header component with media ID: ${mediaId}`);
      } else {
        console.warn(`Template requires ${component.format} but no media ID provided`);
      }
    }

    // Handle text headers
    if (component.type === 'HEADER' && component.format === 'TEXT' && component.text) {
      const headerParams = component.text.match(/\{\{\d+\}\}/g) || [];
      if (headerParams.length > 0) {
        const exampleValues = component.example?.header_text || [];
        if (exampleValues.length > 0) {
          components.push({
            type: 'header',
            parameters: headerParams.map((param, index) => ({
              type: 'text',
              text: exampleValues[index] || `Header ${index + 1}`
            }))
          });
        }
      }
    }

    // Handle body parameters
    if (component.type === 'BODY' && component.text) {
      const paramMatches = component.text.match(/\{\{\d+\}\}/g) || [];

      if (paramMatches.length > 0) {
        const exampleValues = component.example?.body_text?.[0] || [];

        if (exampleValues.length > 0) {
          const parameters = paramMatches.map((match, index) => ({
            type: 'text',
            text: exampleValues[index] || `Parameter ${index + 1}`
          }));

          components.push({
            type: 'body',
            parameters: parameters
          });
        }
      }
    }

    // Handle button components
    if (component.type === 'BUTTONS' && component.buttons) {
      component.buttons.forEach((button, buttonIndex) => {
        if (button.type === 'URL' && button.url && button.url.includes('{{1}}')) {
          const exampleValues = component.example?.button_text?.[buttonIndex] || [];
          if (exampleValues.length > 0) {
            components.push({
              type: 'button',
              sub_type: 'url',
              index: buttonIndex,
              parameters: [{
                type: 'text',
                text: exampleValues[0]
              }]
            });
          }
        }
      });
    }
  });

  return components;
}

module.exports = { startScheduler, processScheduledBroadcasts };
