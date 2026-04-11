const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Broadcast = require('../models/Broadcast');
const Contact = require('../models/Contact');
const Order = require('../models/Order');
const EventTicket = require('../models/EventTicket');
const Tenant = require('../models/Tenant');
const Message = require('../models/Message');
const WhatsAppService = require('../services/whatsappServices');
const { decryptValue, isEncryptionEnabled } = require('../utils/encryption');
const { requireProModule } = require('../middleware/subscriptionMiddleware');
const csv = require('csv-parser');
const xlsx = require('xlsx');

// ==========================================
// 1. MULTER CONFIGURATION
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.user.tenant_id;
    let folder = 'temp';
    if (file.fieldname === 'file') folder = 'imports';
    else folder = 'broadcasts';
    const uploadPath = path.join(__dirname, '..', '..', 'uploads', folder, tenantId.toString());
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9.\-_]/g, '');
    cb(null, `${Date.now()}-${cleanName}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/3gpp',
    'application/pdf',
    'text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 64 * 1024 * 1024 }
}).any();

router.use(auth, requireProModule('broadcast'));

// ==========================================
// 2. CREATE BROADCAST ROUTE
// ==========================================
router.post('/', auth, upload, async (req, res) => {
  try {
    const {
      name,
      templateName,
      templateLanguage,
      audienceType,
      isScheduled,
      scheduledDate,
      scheduledTime,
      isCarousel
    } = req.body;

    let recipients = [];
    try {
      recipients = JSON.parse(req.body.recipients || '[]');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid recipients format' });
    }

    let mediaData = { hasMedia: false, isCarousel: false };
    let carouselCards = [];

    if (isCarousel === 'true' && req.files && req.files.length > 0) {
      mediaData.isCarousel = true;
      req.files.forEach(file => {
        if (file.fieldname.startsWith('carousel_')) {
          const index = parseInt(file.fieldname.split('_')[1]);
          carouselCards.push({
            cardIndex: index,
            mediaUrl: file.path,
            mediaType: file.mimetype.startsWith('video') ? 'video' : 'image',
            mediaMimeType: file.mimetype,
            mediaFileName: file.originalname
          });
        }
      });
      carouselCards.sort((a, b) => a.cardIndex - b.cardIndex);
    } else {
      const mediaFile = req.files ? req.files.find(f => f.fieldname === 'mediaFile') : null;
      if (mediaFile) {
        mediaData = {
          hasMedia: true,
          mediaUrl: mediaFile.path,
          mediaType: mediaFile.mimetype.startsWith('image') ? 'image' :
                     mediaFile.mimetype.startsWith('video') ? 'video' : 'document',
          mediaMimeType: mediaFile.mimetype,
          mediaFileName: mediaFile.originalname
        };
      }
    }

    const newBroadcast = new Broadcast({
      tenantId: req.user.tenant_id,
      userId: req.user.id,
      name,
      templateName,
      templateLanguage: templateLanguage || 'en_US',
      audienceType,
      recipients,
      status: (isScheduled === 'true' || isScheduled === true) ? 'scheduled' : 'processing',
      isScheduled: (isScheduled === 'true' || isScheduled === true),
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      scheduledTime,
      carouselCards,
      ...mediaData
    });

    await newBroadcast.save();

    if (!newBroadcast.isScheduled) {
      processBroadcast(newBroadcast._id, req.user.tenant_id).catch(err => {
        console.error('Background Process Error:', err);
      });
    }

    res.json({ success: true, broadcast: newBroadcast });

  } catch (error) {
    console.error('Create broadcast error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. BROADCAST PROCESSOR
// ==========================================
async function processBroadcast(broadcastId, tenantId) {
  try {
    const broadcast = await Broadcast.findById(broadcastId);
    const tenant = await Tenant.findById(tenantId);
    if (!broadcast || !tenant) return;

    const whatsapp = new WhatsAppService(tenant);
    let sent = 0, failed = 0;

    let isCarouselMode = false;
    let carouselComponents = [];

    let broadcastPayload = {
      templateName: broadcast.templateName,
      language: broadcast.templateLanguage || 'en',
      mediaType: null,
      mediaUrl: null,
      mediaId: null,
      hasFlowButton: false
    };

    // --- 1. CAROUSEL BROADCAST LOGIC ---
    if (broadcast.isCarousel && broadcast.carouselCards?.length > 0) {
      console.log(`🎡 Processing Carousel Broadcast: ${broadcast.carouselCards.length} cards`);
      isCarouselMode = true;

      const cardsList = [];

      for (const card of broadcast.carouselCards) {
        try {
          const absolutePath = path.resolve(card.mediaUrl);
          if (fs.existsSync(absolutePath)) {
            const fileObj = {
              path: absolutePath,
              mimetype: card.mediaMimeType,
              originalname: card.mediaFileName
            };
            console.log(`   📤 Uploading media for Card ${card.cardIndex} (${card.mediaType})...`);
            const uploadResult = await whatsapp.uploadMediaFile(fileObj, card.mediaType);
            console.log(`   ✅ Card ${card.cardIndex} Media Uploaded: ${uploadResult.id}`);
            cardsList.push({
              card_index: card.cardIndex,
              components: [
                {
                  type: 'header',
                  parameters: [
                    {
                      type: card.mediaType,
                      [card.mediaType]: { id: uploadResult.id }
                    }
                  ]
                }
              ]
            });
          } else {
            console.error(`   ❌ Media file missing for card ${card.cardIndex} at ${absolutePath}`);
          }
        } catch (e) {
          console.error(`   ❌ Upload failed for card ${card.cardIndex}:`, e.message);
        }
      }

      if (cardsList.length > 0) {
        carouselComponents.push({ type: 'carousel', cards: cardsList });
        console.log(`🎡 Carousel payload constructed with ${cardsList.length} cards.`);
      } else {
        console.error("❌ Failed to build any carousel cards. Aborting.");
        broadcast.status = 'failed';
        broadcast.processingError = "Failed to upload carousel media";
        await broadcast.save();
        return;
      }
    }

    // --- 2. SINGLE MEDIA PREPARATION ---
    else if (broadcast.hasMedia && broadcast.mediaUrl) {
      try {
        const absolutePath = path.resolve(broadcast.mediaUrl);
        if (fs.existsSync(absolutePath)) {
          const stats = fs.statSync(absolutePath);
          const fileSizeInMB = stats.size / (1024 * 1024);

          if (broadcast.mediaType === 'video' && fileSizeInMB > 16) {
            throw new Error(`Video file too large (${fileSizeInMB.toFixed(2)}MB). Max 16MB allowed.`);
          }

          const fileObj = {
            path: absolutePath,
            mimetype: broadcast.mediaMimeType,
            originalname: broadcast.mediaFileName
          };

          console.log(`📤 Uploading Broadcast Media (${broadcast.mediaType})...`);
          const uploadResult = await whatsapp.uploadMediaFile(fileObj, broadcast.mediaType);

          broadcastPayload.mediaType = broadcast.mediaType;
          broadcastPayload.mediaId = uploadResult.id;

          try {
            const serverBaseUrl = process.env.SERVER_BASE_URL || 'https://api.gowhats.in';
            const uploadsIndex = absolutePath.indexOf('/uploads/');
            if (uploadsIndex !== -1) {
              const relativePath = absolutePath.substring(uploadsIndex);
              broadcastPayload.mediaPublicUrl = `${serverBaseUrl}${relativePath}`;
            } else {
              broadcastPayload.mediaPublicUrl = null;
            }
            console.log(`🔗 Self-Hosted Media URL: ${broadcastPayload.mediaPublicUrl}`);
          } catch(e) {
            console.log('Could not build media public URL:', e.message);
            broadcastPayload.mediaPublicUrl = null;
          }

          console.log(`✅ Media Uploaded. ID: ${uploadResult.id}`);
        } else {
          console.error(`❌ Media file missing at path: ${absolutePath}`);
          broadcast.status = 'failed';
          broadcast.processingError = `Media file missing`;
          await broadcast.save();
          return;
        }
      } catch (e) {
        console.error("❌ Broadcast Media Upload Failed:", e.message);
        broadcast.status = 'failed';
        broadcast.processingError = `Media Upload Failed: ${e.message}`;
        await broadcast.save();
        return;
      }
    }

    // --- 3. DETECT FLOW BUTTON (runs for ALL broadcasts, with or without media) ---
    try {
      console.log(`🔍 Checking template "${broadcast.templateName}" for flow button...`);
      const allTemplates = await whatsapp.getTemplates();
      const tmpl = allTemplates.data?.find(t => t.name === broadcast.templateName);

      console.log(`🔍 Template found: ${!!tmpl}`);
      console.log(`🔍 Template components:`, JSON.stringify(tmpl?.components?.map(c => ({ type: c.type, buttons: c.buttons }))));

      broadcastPayload.hasFlowButton = tmpl?.components?.some(c =>
        c.type === 'BUTTONS' && c.buttons?.some(b => b.type === 'FLOW')
      ) || false;

      console.log(`🔍 Flow button detected: ${broadcastPayload.hasFlowButton}`);
    } catch(e) {
      console.log('Could not detect flow button, defaulting false:', e.message);
      broadcastPayload.hasFlowButton = false;
    }

    // --- SEND LOOP ---
    console.log(`🚀 Sending broadcast to ${broadcast.recipients.length} contacts...`);

    for (const phone of broadcast.recipients) {
      try {
        let response;

        if (isCarouselMode) {
          response = await whatsapp.sendTemplateMessage(
            broadcast.templateName,
            phone,
            carouselComponents,
            broadcast.templateLanguage || 'en'
          );
        } else {
          if (broadcastPayload.hasFlowButton) {
            // Flow button template
            response = await whatsapp.sendTemplateWithMedia(
              broadcast.templateName,
              phone,
              broadcastPayload,
              broadcast.templateLanguage || 'en'
            );
          } else {
            // Normal template (with or without media)
            response = await whatsapp.sendBroadcastTemplate(phone, broadcastPayload);
          }
        }

        // Save Message Record
        await Message.create({
          tenantId: tenant._id,
          from: tenant.whatsappConfig.phoneNumberId,
          to: phone,
          type: 'template',
          templateName: broadcast.templateName,
          text: `Broadcast: ${broadcast.name}`,
          timestamp: new Date(),
          status: 'sent',
          isBroadcastMessage: true,
          broadcastId: broadcast._id,
          messageId: response.messages?.[0]?.id,
          sentFromWABA: true
        });

        sent++;
        console.log(`✅ Sent to ${phone}`);

      } catch (err) {
        console.error(`❌ Failed to ${phone}:`, err.message);

        await Message.create({
          tenantId: tenant._id,
          from: tenant.whatsappConfig.phoneNumberId,
          to: phone,
          type: 'template',
          templateName: broadcast.templateName,
          text: `Failed: ${err.message}`,
          timestamp: new Date(),
          status: 'failed',
          isBroadcastMessage: true,
          broadcastId: broadcast._id
        });

        failed++;
      }

      if ((sent + failed) % 10 === 0) {
        broadcast.sentCount = sent;
        broadcast.failedCount = failed;
        await broadcast.save();
      }

      await new Promise(r => setTimeout(r, 50));
    }

    // --- FINISH ---
    broadcast.sentCount = sent;
    broadcast.failedCount = failed;
    broadcast.status = 'completed';
    broadcast.completedAt = new Date();
    await broadcast.save();

    console.log(`🏁 Broadcast Completed. Sent: ${sent}, Failed: ${failed}`);

  } catch (err) {
    console.error('Broadcast Process Fatal Error:', err);
  }
}

// ==========================================
// 4. OTHER ROUTES
// ==========================================

router.get('/', auth, async (req, res) => {
  try {
    const broadcasts = await Broadcast.find({ tenantId: req.user.tenant_id }).sort({ createdAt: -1 });
    res.json({ success: true, broadcasts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/report', auth, async (req, res) => {
  try {
    const broadcast = await Broadcast.findOne({ _id: req.params.id, tenantId: req.user.tenant_id });
    if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });

    const messages = await Message.find({ broadcastId: req.params.id, tenantId: req.user.tenant_id })
      .select('to status timestamp readAt deliveredAt')
      .sort({ timestamp: -1 });

    res.json({ success: true, broadcast, messages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load report' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Broadcast.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenant_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/audience/preview', auth, async (req, res) => {
  try {
    const { audienceType, filters } = req.body;
    const tenantId = req.user.tenant_id;
    let phoneNumbers = [];

    if (audienceType === 'all') {
      const contacts = await Contact.find({ tenantId }).select('phone_number');
      phoneNumbers = contacts.map(c => c.phone_number);
    }
    else if (audienceType === 'orders') {
      const query = { tenantId };
      const statusFilter = filters?.orderStatus || 'all';

      if (statusFilter === 'all') {
        query.paymentStatus = { $in: ['completed', 'pending'] };
      } else if (statusFilter === 'completed') {
        query.paymentStatus = 'completed';
      } else if (statusFilter === 'pending') {
        query.paymentStatus = 'pending';
      }

      query.status = { $nin: ['cancelled', 'returned', 'refunded', 'failed'] };

      if (filters?.orderFilters?.minAmount) query.totalAmount = { $gte: Number(filters.orderFilters.minAmount) };
      if (filters?.orderFilters?.maxAmount) query.totalAmount = { ...query.totalAmount, $lte: Number(filters.orderFilters.maxAmount) };

      if (isEncryptionEnabled()) {
        const orders = await Order.find(query).select('customerPhone').lean();
        phoneNumbers = orders
          .map((order) => decryptValue(order.customerPhone))
          .filter(Boolean);
      } else {
        phoneNumbers = await Order.distinct('customerPhone', query);
      }
    }
    else if (audienceType === 'bookings') {
      phoneNumbers = await EventTicket.find({ tenantId }).distinct('customerPhone');
    }

    res.json({
      success: true,
      estimatedReach: phoneNumbers.length,
      phoneNumbers: phoneNumbers || []
    });

  } catch (error) {
    console.error("Audience Preview Error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/import/validate', auth, upload, (req, res) => {
  const file = req.files && req.files.length > 0 ? req.files[0] : null;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const results = [];
  try {
    if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv')) {
      fs.createReadStream(file.path).pipe(csv()).on('data', (data) => results.push(data)).on('end', () => {
        fs.unlinkSync(file.path);
        res.json({ success: true, validRows: results.length, data: results.slice(0, 5) });
      });
    } else {
      const workbook = xlsx.readFile(file.path);
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      fs.unlinkSync(file.path);
      res.json({ success: true, validRows: data.length, data: data.slice(0, 5) });
    }
  } catch (e) {
    res.status(500).json({ error: 'Parse failed' });
  }
});

router.post('/import/contacts', auth, upload, (req, res) => {
  const file = req.files && req.files.length > 0 ? req.files[0] : null;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const phoneNumbers = [];
  let processed = 0;
  let skipped = 0;

  const processRow = (row) => {
    processed++;
    const keys = Object.keys(row);
    const phoneKey = keys.find(k => k.match(/phone|mobile|contact|number|whatsapp/i));

    if (phoneKey && row[phoneKey]) {
      let phone = String(row[phoneKey]).trim().replace(/\D/g, '');

      if (phone.length < 8) { skipped++; return; }

      if (phone.length === 10 && !phone.startsWith('91') && !phone.startsWith('65')) {
        phone = '91' + phone;
      } else if (phone.length === 8 && (phone.startsWith('8') || phone.startsWith('9'))) {
        phone = '65' + phone;
      }

      if (phone.length >= 10 && phone.length <= 15) {
        phoneNumbers.push(phone);
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  };

  try {
    if (file.originalname.endsWith('.csv')) {
      fs.createReadStream(file.path)
        .pipe(csv())
        .on('data', processRow)
        .on('end', () => {
          fs.unlinkSync(file.path);
          const uniquePhones = [...new Set(phoneNumbers)];
          res.json({
            success: true,
            phoneNumbers: uniquePhones,
            total: uniquePhones.length,
            stats: { processed, valid: uniquePhones.length, skipped, duplicates: phoneNumbers.length - uniquePhones.length }
          });
        })
        .on('error', (err) => {
          console.error('CSV Parse Error:', err);
          res.status(500).json({ error: 'Failed to parse CSV file' });
        });
    } else {
      const workbook = xlsx.readFile(file.path);
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      data.forEach(processRow);
      fs.unlinkSync(file.path);
      const uniquePhones = [...new Set(phoneNumbers)];
      res.json({
        success: true,
        phoneNumbers: uniquePhones,
        total: uniquePhones.length,
        stats: { processed, valid: uniquePhones.length, skipped, duplicates: phoneNumbers.length - uniquePhones.length }
      });
    }
  } catch (e) {
    console.error('Import Error:', e);
    res.status(500).json({ error: 'Import processing failed: ' + e.message });
  }
});

module.exports = router;

