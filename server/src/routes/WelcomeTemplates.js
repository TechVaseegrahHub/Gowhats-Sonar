// routes/WelcomeTemplates.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const auth = require('../middleware/auth');
const checkTenant = require('../middleware/tenantMiddleware');
const BotConfiguration = require('../models/WelcomeTemplates');

const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');

const VALID_WORKFLOWS = ['Shop Our Collection', 'Talk with Our Team', 'Product Suggestions', 'Visit Website'];

const DEFAULT_WORKFLOW_MESSAGES = [
  {
    // ✅ FIX: No hardcoded URL — tenant must configure their own
    workflow: 'Visit Website',
    message: "Click the link below to visit our website! 🙏",
    url: null,
    isCustomized: false
  },
  {
    workflow: 'Shop Our Collection',
    message: "To shop our products, click the 'WhatsApp Shop' button above.",
    url: null,
    isCustomized: false
  },
  {
    workflow: 'Talk with Our Team',
    message: "Hi 👋 Our customer support executive will get in touch with you soon!",
    url: null,
    isCustomized: false
  },
  {
    workflow: 'Product Suggestions',
    message: "🤖 AI Assistant activated! I'm here to help you find the perfect products. Tell me what you're looking for and I'll provide personalized recommendations.",
    url: null,
    isCustomized: false
  }
];

// ==========================================
// FILE UPLOAD CONFIG
// ==========================================

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.pdf', '.doc', '.docx']);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // ✅ FIX 2: Path traversal protection — resolve and verify destination stays within uploads root
    const tenantUploadDir = path.resolve(UPLOADS_ROOT, req.tenantId);
    if (!tenantUploadDir.startsWith(UPLOADS_ROOT)) {
      return cb(new Error('Invalid upload destination'));
    }
    fs.ensureDirSync(tenantUploadDir);
    cb(null, tenantUploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // ✅ FIX 8: Validate extension against whitelist instead of trusting originalname
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Invalid file extension'));
    }
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // ✅ FIX 6: Do NOT use req.body.mediaType here — it's unreliable during multer processing.
  // Validate only by MIME type which is set by the client before upload starts.
  const allowed = (
    file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('video/') ||
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'application/msword' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );

  if (allowed) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: images, videos, PDF, Word documents.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ==========================================
// ROUTES
// ==========================================

/**
 * @route   GET /api/welcome-message
 * @desc    Get welcome message configuration for a tenant
 * @access  Private
 */
router.get('/', auth, checkTenant, async (req, res) => {
  try {
    let config = await BotConfiguration.findOne({ tenant_id: req.tenantId });

    // ✅ FIX 4: Do NOT create a DB record on GET — return a default object without saving.
    if (!config) {
      return res.json({
        tenant_id: req.tenantId,
        isActive: false,
        triggerWords: [],
        workflows: [],
        workflowMessages: DEFAULT_WORKFLOW_MESSAGES
      });
    }

    res.json(config);
  } catch (err) {
    console.error('❌ Error fetching welcome message configuration:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST /api/welcome-message
 * @desc    Update welcome message configuration for a tenant
 * @access  Private
 */
router.post('/', auth, checkTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // ✅ FIX 1: Whitelist only the fields we expect — never spread raw req.body onto a model.
    const {
      welcomeMessageType,
      interactiveType,
      headerText,
      messageBody,
      workflows,
      workflowMessages,
      isActive,
      triggerWords
    } = req.body;

    // ✅ FIX 1: Input validation — enforce types and size limits
    if (triggerWords !== undefined && (!Array.isArray(triggerWords) || triggerWords.length > 100)) {
      return res.status(400).json({ success: false, message: 'triggerWords must be an array of up to 100 items' });
    }

    if (workflows !== undefined && (!Array.isArray(workflows) || workflows.length > 50)) {
      return res.status(400).json({ success: false, message: 'workflows must be an array of up to 50 items' });
    }

    if (workflowMessages !== undefined && (!Array.isArray(workflowMessages) || workflowMessages.length > 50)) {
      return res.status(400).json({ success: false, message: 'workflowMessages must be an array of up to 50 items' });
    }

    if (headerText && typeof headerText === 'string' && headerText.length > 500) {
      return res.status(400).json({ success: false, message: 'headerText must be 500 characters or less' });
    }

    if (messageBody && typeof messageBody === 'string' && messageBody.length > 4096) {
      return res.status(400).json({ success: false, message: 'messageBody must be 4096 characters or less' });
    }

    // ✅ FIX: If workflowMessages contains a Visit Website entry, validate its URL
    if (Array.isArray(workflowMessages)) {
      for (const wm of workflowMessages) {
        if (wm.workflow === 'Visit Website' && wm.url !== undefined && wm.url !== null) {
          try {
            const parsed = new URL(wm.url);
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Bad protocol');
          } catch {
            return res.status(400).json({ success: false, message: 'Invalid URL in workflowMessages for Visit Website. Must be http or https.' });
          }
        }
      }
    }

    // Build a safe update object from whitelisted fields only
    const safeUpdate = {};
    if (welcomeMessageType !== undefined) safeUpdate.welcomeMessageType = welcomeMessageType;
    if (interactiveType !== undefined) safeUpdate.interactiveType = interactiveType;
    if (headerText !== undefined) safeUpdate.headerText = headerText;
    if (messageBody !== undefined) safeUpdate.messageBody = messageBody;
    if (workflows !== undefined) safeUpdate.workflows = workflows;
    if (workflowMessages !== undefined) safeUpdate.workflowMessages = workflowMessages;
    if (isActive !== undefined) safeUpdate.isActive = isActive;
    if (triggerWords !== undefined) safeUpdate.triggerWords = triggerWords;
    safeUpdate.updatedAt = Date.now();

    let config = await BotConfiguration.findOne({ tenant_id: tenantId });
    if (!config) {
      config = new BotConfiguration({ tenant_id: tenantId });
    }

    Object.assign(config, safeUpdate);
    const savedConfig = await config.save();

    console.log('✅ Configuration saved for tenant:', tenantId);
    res.json({ success: true, data: savedConfig });

  } catch (err) {
    console.error('❌ Error saving welcome message configuration:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   GET /api/welcome-message/workflow-messages
 * @access  Private
 */
router.get('/workflow-messages', auth, checkTenant, async (req, res) => {
  try {
    const config = await BotConfiguration.findOne({ tenant_id: req.tenantId });

    if (!config) {
      return res.json({ success: true, workflowMessages: DEFAULT_WORKFLOW_MESSAGES });
    }

    res.json({ success: true, workflowMessages: config.workflowMessages || [] });
  } catch (err) {
    console.error('❌ Error fetching workflow messages:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST /api/welcome-message/workflow-message
 * @desc    Update specific workflow message for a tenant
 * @access  Private
 */
router.post('/workflow-message', auth, checkTenant, async (req, res) => {
  try {
    const { workflow, message, url } = req.body; // ✅ FIX: Extract url

    if (!workflow || !message) {
      return res.status(400).json({ success: false, message: 'Workflow type and message are required' });
    }

    if (!VALID_WORKFLOWS.includes(workflow)) {
      return res.status(400).json({ success: false, message: 'Invalid workflow type' });
    }

    // ✅ FIX 5: Enforce message length limit
    if (typeof message !== 'string' || message.length > 4096) {
      return res.status(400).json({ success: false, message: 'Message must be a string of up to 4096 characters' });
    }

    // ✅ FIX: Validate URL for Visit Website workflow — required and must be http/https
    if (workflow === 'Visit Website') {
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, message: 'A URL is required for the Visit Website workflow' });
      }
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Bad protocol');
        }
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid URL format. Must be http or https.' });
      }
    }

    let config = await BotConfiguration.findOne({ tenant_id: req.tenantId });

    if (!config) {
      config = new BotConfiguration({
        tenant_id: req.tenantId,
        workflowMessages: [...DEFAULT_WORKFLOW_MESSAGES]
      });
    }

    const existingIndex = config.workflowMessages.findIndex(wm => wm.workflow === workflow);

    // ✅ FIX: Build update entry — only set url for Visit Website
    const updatedEntry = {
      message,
      isCustomized: true,
      ...(workflow === 'Visit Website' && { url })
    };

    if (existingIndex !== -1) {
      Object.assign(config.workflowMessages[existingIndex], updatedEntry);
    } else {
      config.workflowMessages.push({ workflow, ...updatedEntry });
    }

    config.updatedAt = Date.now();
    await config.save();

    console.log('✅ Workflow message updated for tenant:', req.tenantId, '| workflow:', workflow);

    res.json({
      success: true,
      data: {
        workflow,
        message,
        url: workflow === 'Visit Website' ? url : null,
        isCustomized: true,
        updatedAt: config.updatedAt
      }
    });

  } catch (err) {
    console.error('❌ Error updating workflow message:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST /api/welcome-message/bot-status
 * @desc    Toggle bot active status
 * @access  Private
 */
router.post('/bot-status', auth, checkTenant, async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
    }

    // ✅ FIX 3: Single upsert query instead of findOne + findOneAndUpdate (race condition + 2 DB hits)
    const config = await BotConfiguration.findOneAndUpdate(
      { tenant_id: req.tenantId },
      { $set: { isActive, updatedAt: Date.now() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, isActive: config.isActive });
  } catch (err) {
    console.error('❌ Error updating bot status:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST /api/welcome-message/upload-media
 * @desc    Upload media file for welcome message header
 * @access  Private
 */
router.post('/upload-media', auth, checkTenant, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
    const fileUrl = `${baseUrl}/uploads/${req.tenantId}/${req.file.filename}`;

    console.log('✅ File uploaded for tenant:', req.tenantId, '| size:', req.file.size);

    res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error('❌ File upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ FIX 7: /debug-triggers removed from production.
//    If needed for debugging, add it only under: if (process.env.NODE_ENV !== 'production') { ... }

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File size exceeds the 5MB limit' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }

  if (err && err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }

  next(err);
});

module.exports = router;
