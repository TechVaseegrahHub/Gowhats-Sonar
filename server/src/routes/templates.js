const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const Template = require('../models/Template');
const WhatsAppService = require('../services/whatsappServices');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// ==========================================
// 1. MULTER CONFIG (Image / Video / PDF Upload)
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tenantId = req.user.tenant_id;
    const uploadDir = path.join('uploads', 'templates', tenantId.toString());

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('video/') ||
    file.mimetype === 'application/pdf'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only Images, Videos, and PDFs allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter
}).any();

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

// ==========================================
// 2. ROUTES
// ==========================================

// ------------------------------------------
// GET ALL TEMPLATES
// ------------------------------------------
router.get('/', auth, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required',
        templates: []
      });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found',
        templates: []
      });
    }

    if (!tenant.whatsappConfig?.accessToken) {
      return res.json({
        success: true,
        message: 'WhatsApp not configured',
        templates: []
      });
    }

    const whatsapp = new WhatsAppService(tenant);

    const response = await Promise.race([
      whatsapp.getTemplates(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      )
    ]);

const metaTemplates = Array.isArray(response?.data) ? response.data : [];

    // Cache templates locally for resilience when Meta API intermittently fails.
    if (metaTemplates.length > 0) {
      const allowedStatus = new Set(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
      await Promise.all(
        metaTemplates.map((tpl) =>
          Template.updateOne(
            {
              tenantId: String(tenantId),
              name: tpl.name,
              language: tpl.language || 'en'
            },
            {
              $set: {
                category: tpl.category || 'UTILITY',
                components: Array.isArray(tpl.components) ? tpl.components : [],
                whatsappTemplateId: tpl.id || tpl.whatsappTemplateId || null,
                status: allowedStatus.has(tpl.status) ? tpl.status : 'PENDING'
              }
            },
            { upsert: true }
          )
        )
      );
    }

    if (metaTemplates.length === 0 && response?.error) {
      const cachedTemplates = await Template.find({ tenantId: String(tenantId) }).lean();
      return res.json({
        success: true,
        templates: cachedTemplates,
        source: 'cache',
        warning: `Meta templates unavailable (${response.error.status || 500})`
      });
    }
   
 res.json({
      success: true,
      templates: metaTemplates
    });
  } catch (error) {
    console.error('❌ Get Templates Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      templates: []
    });
  }
});

// ------------------------------------------
// CREATE TEMPLATE (Text / Media / Carousel)
// ------------------------------------------
router.post('/create', auth, upload, async (req, res) => {
  try {
    const {
      name,
      category,
      language,
      headerType,
      bodyText,
      footerText,
      buttons,
      cards,
      headerExamples,
      bodyExamples
    } = req.body;

    const tenant = await Tenant.findById(req.user.tenant_id);
    const whatsapp = new WhatsAppService(tenant);

    let templateData = {
      name,
      category,
      language,
      headerType,
      bodyText,
      footerText
    };

    // ---------- CAROUSEL TEMPLATE ----------
    if (headerType === 'CAROUSEL') {
      const parsedCards = JSON.parse(cards || '[]');
      const cardFiles = {};

      if (req.files) {
        req.files.forEach(file => {
          if (file.fieldname.startsWith('cardMedia_')) {
            const index = parseInt(file.fieldname.split('_')[1], 10);
            cardFiles[index] = file;
          }
        });
      }

      templateData.cards = parsedCards;
      templateData.cardFiles = cardFiles;
      templateData.bodyExamples = parseJsonField(bodyExamples, []);
    }
    // ---------- STANDARD TEMPLATE ----------
    else {
      if (req.files?.length > 0) {
        templateData.mediaFile = req.files[0];
      }

      templateData.headerText = req.body.headerText;
      templateData.buttons = JSON.parse(buttons || '[]');
      templateData.headerExamples = parseJsonField(headerExamples, []);
      templateData.bodyExamples = parseJsonField(bodyExamples, []);
    }

    const response = await whatsapp.createTemplate(templateData);
    res.json({ success: true, data: response });

  } catch (error) {
    console.error('❌ Create Template Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ------------------------------------------
// DELETE TEMPLATE
// ------------------------------------------
router.delete('/:name', auth, async (req, res) => {
  try {
    const templateName = req.params.name;
    console.log(`🗑️ Deleting template: ${templateName}`);

    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { businessAccountId, accessToken } = tenant.whatsappConfig;

    const url = `https://graph.facebook.com/v23.0/${businessAccountId}/message_templates?name=${encodeURIComponent(templateName)}`;

    await axios.delete(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

await Template.deleteMany({
      tenantId: String(req.user.tenant_id),
      name: templateName
    });

    console.log(`✅ Template ${templateName} deleted successfully`);
    res.json({ success: true, message: 'Template deleted' });

  } catch (error) {
    const apiError =
      error.response?.data?.error?.message || error.message;

    console.error('❌ Delete Template Error:', apiError);
    res.status(500).json({ error: apiError });
  }
});

// ------------------------------------------
// GET TEMPLATE DETAILS
// ------------------------------------------
router.get('/:name/details', auth, async (req, res) => {
  try {
    const templateName = req.params.name;

    const tenant = await Tenant.findById(req.user.tenant_id);
    const whatsapp = new WhatsAppService(tenant);

    const templates = await whatsapp.getTemplates();
    const template = templates.data?.find(t => t.name === templateName);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('❌ Get Template Details Error:', error.message);
    res.status(500).json({ message: 'Failed to fetch template details' });
  }
});

module.exports = router;

