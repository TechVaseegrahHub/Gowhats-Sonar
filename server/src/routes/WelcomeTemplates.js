const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const auth = require('../middleware/auth');
const checkTenant = require('../middleware/tenantMiddleware');
const BotConfiguration = require('../models/WelcomeTemplates');

console.log('WelcomeTemplates routes loaded');

// Configure storage for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, `../uploads/${req.tenantId}`);
    fs.ensureDirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter for uploads
const fileFilter = (req, file, cb) => {
  const mediaType = req.body.mediaType?.toLowerCase() || file.mimetype.split('/')[0];
  console.log('File filter checking:', file.mimetype, 'mediaType:', mediaType);

  if (file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    console.log('Accepting file:', file.mimetype);
    cb(null, true);
  } else {
    console.log('Rejecting file:', file.mimetype);
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * @route   GET api/welcome-message
 * @desc    Get welcome message configuration for a tenant
 * @access  Private
 */
router.get('/', auth, checkTenant, async (req, res) => {
  try {
    console.log('GET /api/welcome-message - Tenant ID:', req.tenantId);
    
    let config = await BotConfiguration.findOne({ tenant_id: req.tenantId });
    
    if (!config) {
      config = new BotConfiguration({ tenant_id: req.tenantId });
      await config.save();
    }
    
    res.json(config);
  } catch (err) {
    console.error('❌ Error fetching welcome message configuration:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST api/welcome-message
 * @desc    Update welcome message configuration for a tenant
 * @access  Private
 */
router.post('/', auth, checkTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const updateData = req.body;

    console.log('POST /api/welcome-message - SAVING CONFIGURATION');
    console.log('Received data from frontend:', JSON.stringify(updateData, null, 2));

    // Find the existing configuration or create a new one if it doesn't exist
    let config = await BotConfiguration.findOne({ tenant_id: tenantId });
    if (!config) {
      config = new BotConfiguration({ tenant_id: tenantId });
    }

    // --- THIS IS THE CRITICAL FIX ---
    // Update all the properties on the document directly.
    // This is more reliable than using $set for nested objects.
    config.welcomeMessageType = updateData.welcomeMessageType;
    config.interactiveType = updateData.interactiveType;
    config.headerText = updateData.headerText;
    config.messageBody = updateData.messageBody;
    config.workflows = updateData.workflows;
    config.workflowMessages = updateData.workflowMessages; // This will now save correctly
    config.isActive = updateData.isActive;
    config.triggerWords = updateData.triggerWords;
    config.updatedAt = Date.now();

    // Save the entire updated document.
    const savedConfig = await config.save();

    console.log('✅ Configuration successfully saved to database for tenant:', tenantId);
    console.log('CONFIRMING SAVED MESSAGES:', JSON.stringify(savedConfig.workflowMessages, null, 2));

    res.json({ success: true, data: savedConfig });

  } catch (err) {
    console.error('❌ Error saving welcome message configuration:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   GET api/welcome-message/debug-triggers
 * @desc    Debug trigger words configuration
 * @access  Private
 */
router.get('/debug-triggers', auth, checkTenant, async (req, res) => {
  try {
    const config = await BotConfiguration.findOne({ tenant_id: req.tenantId });
    
    const debugInfo = {
      tenantId: req.tenantId,
      configExists: !!config,
      isActive: config?.isActive || false,
      triggerWords: config?.triggerWords || [],
      triggerWordsCount: config?.triggerWords?.length || 0,
      welcomeMessageType: config?.welcomeMessageType,
      messageBody: config?.messageBody ? 'exists' : 'missing',
      workflows: config?.workflows || [],
      hasProductSuggestionsWorkflow: config?.workflows?.some(w => w.workflow === 'Product Suggestions') || false
    };
    
    console.log('🔍 Trigger words debug:', debugInfo);
    
    res.json({
      success: true,
      debug: debugInfo,
      recommendations: generateTriggerRecommendations(debugInfo)
    });
    
  } catch (error) {
    console.error('❌ Debug triggers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function generateTriggerRecommendations(debugInfo) {
  const recommendations = [];
  
  if (!debugInfo.configExists) {
    recommendations.push("❌ No bot configuration found - create welcome message first");
  }
  
  if (!debugInfo.isActive) {
    recommendations.push("⚠️ Bot configuration exists but not active - turn on bot status");
  }
  
  if (debugInfo.triggerWordsCount === 0) {
    recommendations.push("❌ No trigger words configured - add trigger words");
  } else if (debugInfo.triggerWordsCount < 3) {
    recommendations.push("⚠️ Only few trigger words - consider adding more variations");
  }
  
  if (debugInfo.triggerWordsCount > 0 && debugInfo.isActive) {
    recommendations.push("✅ Trigger words configured and bot active - should work!");
  }
  
  if (debugInfo.hasProductSuggestionsWorkflow) {
    recommendations.push("🤖 Product Suggestions workflow configured - ensure AI assistant is set up");
  }
  
  recommendations.push(`💡 Current trigger words: ${debugInfo.triggerWords.join(', ')}`);
  
  return recommendations;
}

/**
 * @route   POST api/welcome-message/workflow-message
 * @desc    Update specific workflow message for a tenant
 * @access  Private
 */
router.post('/workflow-message', auth, checkTenant, async (req, res) => {
  try {
    console.log('POST /api/welcome-message/workflow-message - Updating workflow message');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Tenant ID:', req.tenantId);

    const { workflow, message } = req.body;

    if (!workflow || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Workflow type and message are required' 
      });
    }

    // Validate workflow type
    const validWorkflows = ['Shop Our Collection', 'Talk with Our Team', 'Product Suggestions'];
    if (!validWorkflows.includes(workflow)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid workflow type' 
      });
    }

    // Find existing configuration
    let config = await BotConfiguration.findOne({ tenant_id: req.tenantId });

    if (!config) {
      // Create new config with default values
      config = new BotConfiguration({
        tenant_id: req.tenantId,
        workflowMessages: [
          {
            workflow: 'Shop Our Collection',
            message: "To shop our products, click the 'WhatsApp Shop' button above.",
            isCustomized: false
          },
          {
            workflow: 'Talk with Our Team', 
            message: "Hi 👋 Our customer support executive will get in touch with you soon!",
            isCustomized: false
          },
          {
            workflow: 'Product Suggestions',
            message: "🤖 AI Assistant activated! I'm here to help you find the perfect products.",
            isCustomized: false
          }
        ]
      });
    }

    // Update or add the specific workflow message
    const existingMessageIndex = config.workflowMessages.findIndex(wm => wm.workflow === workflow);
    
    if (existingMessageIndex !== -1) {
      // Update existing message
      config.workflowMessages[existingMessageIndex].message = message;
      config.workflowMessages[existingMessageIndex].isCustomized = true;
    } else {
      // Add new message
      config.workflowMessages.push({
        workflow: workflow,
        message: message,
        isCustomized: true
      });
    }

    config.updatedAt = Date.now();
    await config.save();

    console.log('✅ Workflow message updated successfully for tenant:', req.tenantId);
    console.log('✅ Updated workflow:', workflow);

    res.json({ 
      success: true, 
      data: {
        workflow: workflow,
        message: message,
        isCustomized: true,
        updatedAt: config.updatedAt
      }
    });

  } catch (err) {
    console.error('❌ Error updating workflow message:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.get('/workflow-messages', auth, checkTenant, async (req, res) => {
  try {
    console.log('GET /api/welcome-message/workflow-messages - Tenant ID:', req.tenantId);

    let config = await BotConfiguration.findOne({ tenant_id: req.tenantId });

    if (!config) {
      // Return default messages
      const defaultMessages = [
        {
          workflow: 'Shop Our Collection',
          message: "To shop our products, click the 'WhatsApp Shop' button above.",
          isCustomized: false
        },
        {
          workflow: 'Talk with Our Team',
          message: "Hi 👋 Our customer support executive will get in touch with you soon!",
          isCustomized: false
        },
        {
          workflow: 'Product Suggestions',
          message: "🤖 AI Assistant activated! I'm here to help you find the perfect products. Tell me what you're looking for or describe your needs, and I'll provide personalized recommendations.",
          isCustomized: false
        }
      ];

      return res.json({
        success: true,
        workflowMessages: defaultMessages
      });
    }

    res.json({
      success: true,
      workflowMessages: config.workflowMessages || []
    });

  } catch (err) {
    console.error('❌ Error fetching workflow messages:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST api/welcome-message/bot-status
 * @desc    Toggle bot active status
 * @access  Private
 */
router.post('/bot-status', auth, checkTenant, async (req, res) => {
  try {
    const { isActive } = req.body;
    
    if (isActive === undefined) {
      return res.status(400).json({ success: false, message: 'isActive status is required' });
    }
    
    let config = await BotConfiguration.findOne({ tenant_id: req.tenantId });
    
    if (config) {
      config = await BotConfiguration.findOneAndUpdate(
        { tenant_id: req.tenantId },
        { $set: { isActive, updatedAt: Date.now() } },
        { new: true }
      );
    } else {
      config = new BotConfiguration({
        tenant_id: req.tenantId,
        isActive
      });
      
      await config.save();
    }
    
    res.json({ success: true, isActive: config.isActive });
  } catch (err) {
    console.error('❌ Error updating bot status:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST api/welcome-message/upload-media
 * @desc    Upload media file for welcome message header
 * @access  Private
 */
router.post('/upload-media', auth, checkTenant, upload.single('file'), async (req, res) => {
  console.log('Upload media request received');
  console.log('Tenant ID:', req.tenantId);
  
  try {
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    console.log('File received:', req.file.originalname, req.file.mimetype, req.file.size);
    
    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
    const fileUrl = `${baseUrl}/uploads/${req.tenantId}/${req.file.filename}`;
    
    console.log('File uploaded successfully to:', req.file.path);
    console.log('Public URL:', fileUrl);
    
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

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        message: 'File size exceeds the 5MB limit' 
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  
  if (err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  
  next(err);
});

module.exports = router;
