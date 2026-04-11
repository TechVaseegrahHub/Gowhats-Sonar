const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const BotStatus = require('../models/BotStatus');
const KnowledgeBase = require('../models/KnowledgeBase');
const Settings = require('../models/settings');
const authenticateToken = require('../middleware/auth');
const { createEmbedding, testWhatsAppRAGConnection, getWhatsAppRAGResponse } = require('../services/openaiService');

const upload = multer({ dest: 'uploads/' });

const resolveTenantId = (req) => (
  req.user?.tenantId ||
  req.user?.tenant_id ||
  req.query?.tenantId ||
  req.body?.tenantId ||
  req.user?.id
);

// Get WhatsApp bot status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    let botStatus = await BotStatus.findOne({ tenantId });

    if (!botStatus) {
      botStatus = new BotStatus({ tenantId, status: 'offline' });
      await botStatus.save();
    }

    const knowledgeBase = await KnowledgeBase.findOne({ tenantId });

    res.json({
      success: true,
      platform: 'WhatsApp',
      bot: {
        status: botStatus.status,
        isOnline: botStatus.status === 'online',
        lastUpdated: botStatus.lastUpdated
      },
      knowledgeBase: {
        exists: !!knowledgeBase,
        hasData: knowledgeBase?.hasKnowledgeBase || false,
        fileName: knowledgeBase?.fileName,
        fileSize: knowledgeBase?.fileSize,
        chunksCount: knowledgeBase?.chunksCount || 0,
        embeddingsCount: knowledgeBase?.vectors?.filter(v => v.embedding?.length > 0).length || 0,
        uploadedAt: knowledgeBase?.uploadedAt
      },
      aiStack: {
        embeddings: 'OpenAI text-embedding-ada-002',
        chatCompletion: 'DeepSeek Chat',
        similarityThreshold: 0.70
      },
      canRespond: (botStatus.status === 'online') && (knowledgeBase?.hasKnowledgeBase)
    });
  } catch (error) {
    console.error('Error fetching WhatsApp bot status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get independent Product Image AI module status
router.get('/product-image-module', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
      await settings.save();
    }

    const enabled = Boolean(settings?.aiConfig?.productImageFetchEnabled);

    return res.json({
      success: true,
      enabled,
      module: 'product_image_fetch_ai'
    });
  } catch (error) {
    console.error('Error fetching product image AI module status:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Toggle independent Product Image AI module
router.post('/product-image-module', authenticateToken, async (req, res) => {
  try {

      if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Product Image AI toggle can only be changed from Admin Dashboard.'
      });
    }

    const tenantId = resolveTenantId(req);
    const { enabled } = req.body || {};

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean value'
      });
    }

    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
    }

    if (!settings.aiConfig) {
      settings.aiConfig = {};
    }

    settings.aiConfig.productImageFetchEnabled = enabled;
    settings.markModified('aiConfig');
    await settings.save();

    return res.json({
      success: true,
      enabled: settings.aiConfig.productImageFetchEnabled,
      module: 'product_image_fetch_ai',
      message: `Product image fetching AI ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Error updating product image AI module status:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Toggle WhatsApp bot status
router.post('/toggle', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { status } = req.body;

    if (!['online', 'offline'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Use "online" or "offline"' });
    }

    // Check knowledge base when turning ON
    if (status === 'online') {
      const knowledgeBase = await KnowledgeBase.findOne({ 
        tenantId,
        hasKnowledgeBase: true 
      });

      if (!knowledgeBase) {
        return res.status(400).json({
          success: false,
          message: 'Cannot turn WhatsApp bot ON: No knowledge base uploaded. Please upload your product catalog first.',
          requiredAction: 'Upload knowledge base file'
        });
      }

      console.log(`WhatsApp bot turning ON with ${knowledgeBase.chunksCount} chunks`);
    }

    let botStatus = await BotStatus.findOne({ tenantId });

    if (!botStatus) {
      botStatus = new BotStatus({ tenantId, status });
    } else {
      botStatus.status = status;
      botStatus.lastUpdated = new Date();
    }

    await botStatus.save();

    console.log(`WhatsApp bot ${status} for tenant ${tenantId}`);

    res.json({
      success: true,
      platform: 'WhatsApp',
      status: botStatus.status,
      message: `WhatsApp bot ${status === 'online' ? 'enabled' : 'disabled'} successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error toggling WhatsApp bot status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get WhatsApp knowledge base status
router.get('/knowledge-base-status', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const [knowledgeBase, settings] = await Promise.all([
      KnowledgeBase.findOne({ tenantId }),
      Settings.findOne({ tenant_id: tenantId }).select('aiConfig.productImageFetchEnabled').lean()
    ]);

    const productImageFetchEnabled = Boolean(settings?.aiConfig?.productImageFetchEnabled);

    if (!knowledgeBase) {
      return res.json({
        success: true,
        platform: 'WhatsApp',
        hasKnowledgeBase: false,
        chunksCount: 0,
        embeddingsCount: 0,
        embeddingCoverage: 0,
        uploadInProgress: false,
        productImageFetchEnabled,
	message: 'No knowledge base uploaded'
      });
    }

    const embeddingsCount = knowledgeBase.vectors ?
      knowledgeBase.vectors.filter(v => v.embedding && v.embedding.length > 0).length : 0;

    res.json({
      success: true,
      platform: 'WhatsApp',
      hasKnowledgeBase: knowledgeBase.hasKnowledgeBase,
      fileName: knowledgeBase.fileName,
      fileSize: knowledgeBase.fileSize,
      chunksCount: knowledgeBase.chunksCount,
      embeddingsCount: embeddingsCount,
      embeddingCoverage: knowledgeBase.chunksCount > 0 ?
        Math.round((embeddingsCount / knowledgeBase.chunksCount) * 100) : 0,
      uploadedAt: knowledgeBase.uploadedAt,
      uploadInProgress: knowledgeBase.uploadInProgress || false,
      productImageFetchEnabled,  	
      aiStack: {
        embeddings: 'OpenAI text-embedding-ada-002',
        chatCompletion: 'DeepSeek Chat'
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp knowledge base status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// Upload knowledge base with OpenAI embeddings for WhatsApp
router.post('/upload-knowledge-base', authenticateToken, upload.single('file'), async (req, res) => {
  const tenantId = resolveTenantId(req);
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Check if upload is already in progress for this tenant
    const existingKB = await KnowledgeBase.findOne({ tenantId });
    if (existingKB && existingKB.uploadInProgress) {
      // Clean up the uploaded file
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(409).json({ 
        success: false, 
        message: 'Upload already in progress for this account. Please wait for the current upload to complete.' 
      });
    }

    console.log(`📁 Processing knowledge base for tenant ${tenantId}`);

    // Mark upload as in progress
    if (existingKB) {
      existingKB.uploadInProgress = true;
      await existingKB.save();
    } else {
      const tempKB = new KnowledgeBase({ 
        tenantId, 
        uploadInProgress: true,
        hasKnowledgeBase: false
      });
      await tempKB.save();
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // IMPROVED: Better text chunking strategy
    const improvedChunks = createImprovedChunks(fileContent);

    let knowledgeBase = await KnowledgeBase.findOne({ tenantId });

    if (!knowledgeBase) {
      knowledgeBase = new KnowledgeBase({ tenantId });
    }

    knowledgeBase.fileName = req.file.originalname;
    knowledgeBase.fileSize = req.file.size;
    knowledgeBase.content = fileContent;
    knowledgeBase.chunksCount = improvedChunks.length;
    knowledgeBase.hasKnowledgeBase = false; // Set to true only after successful embedding creation
    knowledgeBase.uploadedAt = new Date();
    knowledgeBase.uploadInProgress = true;

    console.log(`🔄 Creating embeddings for ${improvedChunks.length} chunks...`);
    knowledgeBase.vectors = [];

    let embeddingsCreated = 0;
    const batchSize = 5; // Process in batches to avoid rate limits

    for (let i = 0; i < improvedChunks.length; i += batchSize) {
      const batch = improvedChunks.slice(i, i + batchSize);

      await Promise.all(batch.map(async (chunk, batchIndex) => {
        const actualIndex = i + batchIndex;
        try {
          console.log(`📊 Creating embedding ${actualIndex + 1}/${improvedChunks.length}`);
          const embedding = await createEmbedding(chunk.toLowerCase());

          knowledgeBase.vectors.push({
            text: chunk.toLowerCase(),
            embedding: embedding,
            lastUpdated: new Date()
          });
          embeddingsCreated++;

        } catch (embeddingError) {
          console.error(`❌ Embedding failed for chunk ${actualIndex + 1}:`, embeddingError);
          // Add chunk without embedding as fallback
          knowledgeBase.vectors.push({
            text: chunk.toLowerCase(),
            embedding: [],
            lastUpdated: new Date()
          });
        }
      }));

      // Rate limiting between batches
      if (i + batchSize < improvedChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Mark as complete
    knowledgeBase.hasKnowledgeBase = true;
    knowledgeBase.uploadInProgress = false;
    await knowledgeBase.save();

    // Clean up uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`✅ Knowledge base processed: ${improvedChunks.length} chunks, ${embeddingsCreated} embeddings`);

    res.json({
      success: true,
      message: `Knowledge base uploaded with ${embeddingsCreated} embeddings`,
      stats: {
        fileName: req.file.originalname,
        chunksCount: improvedChunks.length,
        embeddingsCount: embeddingsCreated,
        coverage: Math.round((embeddingsCreated / improvedChunks.length) * 100)
      }
    });

  } catch (error) {
    console.error('❌ Knowledge base upload error:', error);
    
    // Clear the upload in progress flag on error
    try {
      const kb = await KnowledgeBase.findOne({ tenantId });
      if (kb) {
        kb.uploadInProgress = false;
        await kb.save();
      }
    } catch (cleanupError) {
      console.error('Error clearing upload flag:', cleanupError);
    }

    // Clean up uploaded file
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ 
      success: false, 
      message: error.message || 'Upload failed. Please try again.' 
    });
  }
});


function createImprovedChunks(content) {
  // Split by double newlines first (paragraphs)
  let chunks = content.split('\n\n').filter(chunk => chunk.trim().length > 0);
  
  const improvedChunks = [];
  
  chunks.forEach(chunk => {
    const trimmed = chunk.trim();
    
    // If chunk is too large (>1000 chars), split further
    if (trimmed.length > 1000) {
      // Split by sentences
      const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0);
      let currentChunk = '';
      
      sentences.forEach(sentence => {
        if ((currentChunk + sentence).length < 1000) {
          currentChunk += sentence + '. ';
        } else {
          if (currentChunk.trim()) {
            improvedChunks.push(currentChunk.trim());
          }
          currentChunk = sentence + '. ';
        }
      });
      
      if (currentChunk.trim()) {
        improvedChunks.push(currentChunk.trim());
      }
    } else if (trimmed.length > 50) { // Skip very small chunks
      improvedChunks.push(trimmed);
    }
  });
  
  console.log(`📝 Chunking: ${content.length} chars → ${improvedChunks.length} chunks`);
  return improvedChunks;
}

// Delete WhatsApp knowledge base
router.delete('/knowledge-base', authenticateToken, async (req, res) => {
  try {
     const tenantId = resolveTenantId(req);

    // Check if upload is in progress
    const knowledgeBase = await KnowledgeBase.findOne({ tenantId });
    if (knowledgeBase && knowledgeBase.uploadInProgress) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete knowledge base while upload is in progress'
      });
    }

    await KnowledgeBase.findOneAndDelete({ tenantId });

    // Also set bot status to offline when knowledge base is deleted
    await BotStatus.findOneAndUpdate(
      { tenantId },
      { status: 'offline', lastUpdated: new Date() }
    );

    console.log(`WhatsApp knowledge base removed for tenant ${tenantId}`);

    res.json({
      success: true,
      platform: 'WhatsApp',
      message: 'WhatsApp knowledge base removed successfully (bot automatically turned OFF)'
    });
  } catch (error) {
    console.error('Error removing WhatsApp knowledge base:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Test WhatsApp bot with sample query
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { query, phoneNumber = 'test_user' } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required for testing' });
    }

    // Check if bot is online
    const botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus || botStatus.status !== 'online') {
      return res.json({
        success: false,
        platform: 'WhatsApp',
        message: 'WhatsApp bot is offline',
        test: {
          query,
          response: 'Bot is offline - turn it ON first',
          responseTime: '0ms'
        }
      });
    }

    // Get knowledge base
    const knowledgeBase = await KnowledgeBase.findOne({ tenantId });
    if (!knowledgeBase || !knowledgeBase.hasKnowledgeBase) {
      return res.json({
        success: false,
        platform: 'WhatsApp',
        message: 'No knowledge base found',
        test: {
          query,
          response: 'No knowledge base uploaded',
          responseTime: '0ms'
        }
      });
    }

    console.log(`Testing WhatsApp bot for tenant ${tenantId} with query: "${query}"`);

    const startTime = Date.now();
    const response = await getWhatsAppRAGResponse(query, knowledgeBase, tenantId, phoneNumber);
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      platform: 'WhatsApp',
      test: {
        query,
        response: response || 'No response generated',
        responseTime: `${responseTime}ms`,
        tenantId,
        aiStack: 'OpenAI embeddings + DeepSeek chat'
      }
    });

  } catch (error) {
    console.error('WhatsApp bot test error:', error);
    res.status(500).json({
      success: false,
      platform: 'WhatsApp',
      error: error.message
    });
  }
});

// Test WhatsApp RAG AI connection
router.get('/test-connection', authenticateToken, async (req, res) => {
  try {
    console.log('Testing WhatsApp RAG AI connection...');
    
    const connectionTest = await testWhatsAppRAGConnection();
    
    res.json({
      success: connectionTest,
      platform: 'WhatsApp',
      message: connectionTest ? 
        'WhatsApp RAG AI stack is working correctly' : 
        'WhatsApp RAG AI connection failed',
      aiStack: {
        openai: process.env.OPENAI_API_KEY ? 'Configured' : 'Missing',
        deepseek: process.env.DEEPSEEK_API_KEY ? 'Configured' : 'Missing',
        embedding_model: 'text-embedding-ada-002',
        chat_model: 'deepseek-chat'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({
      success: false,
      platform: 'WhatsApp',
      error: error.message
    });
  }
});

// Get WhatsApp bot health summary
router.get('/health', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const [botStatus, knowledgeBase] = await Promise.all([
      BotStatus.findOne({ tenantId }),
      KnowledgeBase.findOne({ tenantId })
    ]);

    const health = {
      tenantId,
      platform: 'WhatsApp',
      timestamp: new Date().toISOString(),
      
      bot: {
        status: botStatus?.status || 'offline',
        isOnline: botStatus?.status === 'online',
        lastUpdated: botStatus?.lastUpdated
      },

      knowledgeBase: {
        exists: !!knowledgeBase,
        hasData: knowledgeBase?.hasKnowledgeBase || false,
        chunks: knowledgeBase?.chunksCount || 0,
        embeddings: knowledgeBase?.vectors?.filter(v => v.embedding?.length > 0).length || 0,
        fileName: knowledgeBase?.fileName
      },

      aiStack: {
        embeddings: 'OpenAI text-embedding-ada-002',
        chatCompletion: 'DeepSeek Chat',
        similarityThreshold: 0.70,
        rateLimit: '5 requests per minute per user'
      },

      operational: {
        canRespond: (botStatus?.status === 'online') && (knowledgeBase?.hasKnowledgeBase),
        responseMode: 'RAG-only (strict)',
        fallbackMode: 'Silent (no response when no match)'
      }
    };

    // Status message
    if (health.operational.canRespond) {
      health.message = '✅ WhatsApp bot is ready and operational';
    } else if (!health.bot.isOnline) {
      health.message = '⚠️ WhatsApp bot is offline';
      health.action = 'Turn bot ON using /toggle endpoint';
    } else if (!health.knowledgeBase.hasData) {
      health.message = '❌ WhatsApp bot is online but no knowledge base';
      health.action = 'Upload knowledge base using /upload-knowledge-base endpoint';
    } else {
      health.message = '❓ WhatsApp bot status unclear';
    }

    res.json(health);

  } catch (error) {
    console.error('WhatsApp bot health check error:', error);
    res.status(500).json({
      success: false,
      platform: 'WhatsApp',
      error: error.message
    });
  }
});

module.exports = router;
