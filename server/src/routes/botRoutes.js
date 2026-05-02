const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const BotStatus = require('../models/BotStatus');
const BotConfiguration = require('../models/BotConfiguration');
const KnowledgeBase = require('../models/KnowledgeBase');
const Settings = require('../models/settings');
const authenticateToken = require('../middleware/auth');
const {
  createTenantApiKey,
  ingestTenantFile,
  ingestTenantUrl,
  testAgentConnection,
  testTenantBot,
  getAgentResponse
} = require('../services/gowhatsAgentService');

const upload = multer({ dest: 'uploads/' });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resolveTenantId = (req) => (
  req.user?.tenantId ||
  req.user?.tenant_id ||
  req.query?.tenantId ||
  req.body?.tenantId ||
  req.user?.id
);

/**
 * Get tenant's agent API key from Settings.
 * Returns null if not provisioned or if key is empty/invalid.
 */
async function getTenantApiKey(tenantId) {
  try {
    const settings = await Settings.findOne({ tenant_id: tenantId }).lean();
    const key = settings?.aiConfig?.agentApiKey;
    // Validate it's a real key, not empty string or placeholder
    if (key && typeof key === 'string' && key.startsWith('ywk_live_') && key.length > 20) {
      return key;
    }
    return null;
  } catch (err) {
    console.error(`getTenantApiKey error for ${tenantId}:`, err.message);
    return null;
  }
}

/**
 * Save an agent key to Settings for a tenant.
 */
async function saveTenantApiKey(tenantId, apiKey) {
  let settings = await Settings.findOne({ tenant_id: tenantId });
  if (!settings) {
    settings = new Settings({ tenant_id: tenantId });
  }
  if (!settings.aiConfig) settings.aiConfig = {};
  settings.aiConfig.agentApiKey = apiKey;
  settings.markModified('aiConfig');
  await settings.save();
  return settings;
}

// ─── GET /api/bot/status ──────────────────────────────────────────────────────

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    let botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus) {
      botStatus = new BotStatus({ tenantId, status: 'offline' });
      await botStatus.save();
    }

    const [knowledgeBase, settings] = await Promise.all([
      KnowledgeBase.findOne({ tenantId }),
      Settings.findOne({ tenant_id: tenantId }).lean()
    ]);

    const agentKey = settings?.aiConfig?.agentApiKey;
    const hasAgentKey = Boolean(agentKey && agentKey.startsWith('ywk_live_') && agentKey.length > 20);

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
        uploadedAt: knowledgeBase?.uploadedAt
      },
      aiStack: {
        agent: 'YoWhats Python Agent',
        embeddings: 'all-MiniLM-L6-v2 (FAISS)',
        chatCompletion: 'Claude (Anthropic)',
        keyConfigured: hasAgentKey
      },
      canRespond: botStatus.status === 'online' && knowledgeBase?.hasKnowledgeBase && hasAgentKey
    });

  } catch (error) {
    console.error('Error fetching bot status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/bot/knowledge-base-status ──────────────────────────────────────

router.get('/knowledge-base-status', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const [knowledgeBase, settings] = await Promise.all([
      KnowledgeBase.findOne({ tenantId }),
      Settings.findOne({ tenant_id: tenantId }).select('aiConfig').lean()
    ]);

    const productImageFetchEnabled = Boolean(settings?.aiConfig?.productImageFetchEnabled);
    const agentKey = settings?.aiConfig?.agentApiKey;
    const hasAgentKey = Boolean(agentKey && agentKey.startsWith('ywk_live_') && agentKey.length > 20);

    if (!knowledgeBase) {
      return res.json({
        success: true,
        platform: 'WhatsApp',
        hasKnowledgeBase: false,
        chunksCount: 0,
        uploadInProgress: false,
        productImageFetchEnabled,
        hasAgentKey,
        message: 'No knowledge base uploaded'
      });
    }

    res.json({
      success: true,
      platform: 'WhatsApp',
      hasKnowledgeBase: knowledgeBase.hasKnowledgeBase,
      fileName: knowledgeBase.fileName,
      fileSize: knowledgeBase.fileSize,
      chunksCount: knowledgeBase.chunksCount || 0,
      uploadedAt: knowledgeBase.uploadedAt,
      uploadInProgress: knowledgeBase.uploadInProgress || false,
      websiteUrl: knowledgeBase.websiteUrl || null,
      productImageFetchEnabled,
      hasAgentKey,
      aiStack: {
        agent: 'YoWhats Python Agent',
        embeddings: 'all-MiniLM-L6-v2 (FAISS)',
        chatCompletion: 'Claude (Anthropic)'
      }
    });

  } catch (error) {
    console.error('Error fetching knowledge base status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /api/bot/agent-key-status ───────────────────────────────────────────

router.get('/agent-key-status', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const key = await getTenantApiKey(tenantId);

    res.json({
      success: true,
      hasAgentKey: Boolean(key),
      keyPrefix: key ? key.substring(0, 20) + '...' : null,
      tenantId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/bot/provision-agent-key ───────────────────────────────────────
// Creates a new client key on YoWhats agent and saves it to this tenant's Settings.
// Admin triggers this manually for each tenant from the UI.

router.post('/provision-agent-key', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const tenantLabel = req.user?.businessName || req.user?.name || `GoWhats Tenant: ${tenantId}`;

    console.log(`🔑 Provisioning agent key for tenant ${tenantId} (${tenantLabel})`);

    // Create new key on the Python agent
    let apiKey;
    try {
      apiKey = await createTenantApiKey(tenantId, tenantLabel);
    } catch (agentErr) {
      console.error('Agent key creation failed:', agentErr.message);
      return res.status(503).json({
        success: false,
        message: `Failed to create key on agent: ${agentErr.message}. Check YOWHATS_AGENT_URL and YOWHATS_ADMIN_KEY in .env`
      });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Agent returned empty key. Check agent logs.'
      });
    }

    // Save to MongoDB
    await saveTenantApiKey(tenantId, apiKey);

    console.log(`✅ Agent key provisioned and saved for tenant ${tenantId}: ${apiKey.substring(0, 20)}...`);

    res.json({
      success: true,
      message: 'Agent key provisioned successfully',
      keyPrefix: apiKey.substring(0, 20) + '...',
      tenantId
    });
  } catch (error) {
    console.error('Provision key error:', error);
    res.status(500).json({
      success: false,
      message: `Provision failed: ${error.message}`
    });
  }
});

// ─── POST /api/bot/set-agent-key ─────────────────────────────────────────────
// Admin manually pastes a key from the YoWhats dashboard.
// Use this when auto-provision doesn't work or you want to use a specific key.

router.post('/set-agent-key', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ success: false, message: 'apiKey is required' });
    }
    if (!apiKey.startsWith('ywk_live_') || apiKey.length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Invalid key format. Key must start with ywk_live_ and be a full key from YoWhats dashboard.'
      });
    }

    await saveTenantApiKey(tenantId, apiKey.trim());

    console.log(`✅ Agent key manually set for tenant ${tenantId}: ${apiKey.substring(0, 20)}...`);

    res.json({
      success: true,
      message: 'Agent key saved successfully',
      keyPrefix: apiKey.substring(0, 20) + '...'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/bot/agent-key ────────────────────────────────────────────────

router.delete('/agent-key', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const settings = await Settings.findOne({ tenant_id: tenantId });

    if (settings?.aiConfig) {
      settings.aiConfig.agentApiKey = null;
      settings.markModified('aiConfig');
      await settings.save();
    }

    res.json({ success: true, message: 'Agent key cleared. Bot will no longer respond.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/bot/test-agent-key ────────────────────────────────────────────
// Tests that the stored key actually reaches the agent and gets a reply.

router.post('/test-agent-key', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const key = await getTenantApiKey(tenantId);

    if (!key) {
      return res.json({
        success: false,
        message: 'No agent key configured for this tenant'
      });
    }

    const start = Date.now();
    const reply = await getAgentResponse(
      'hello, what products do you have?',
      tenantId,
      'test_user_healthcheck',
      key
    );
    const ms = Date.now() - start;

    if (reply && reply.trim()) {
      res.json({
        success: true,
        message: `Agent responded in ${ms}ms`,
        preview: reply.substring(0, 120) + (reply.length > 120 ? '...' : ''),
        responseTime: `${ms}ms`
      });
    } else {
      res.json({
        success: false,
        message: 'Agent key is valid but returned empty response. Make sure the knowledge base is uploaded.',
        responseTime: `${ms}ms`
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/bot/toggle ─────────────────────────────────────────────────────

router.post('/toggle', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { status } = req.body;

    if (!['online', 'offline'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Use "online" or "offline"'
      });
    }

    if (status === 'online') {
      // Check knowledge base exists
      const knowledgeBase = await KnowledgeBase.findOne({ tenantId, hasKnowledgeBase: true });
      if (!knowledgeBase) {
        return res.status(400).json({
          success: false,
          message: 'Cannot turn bot ON: No knowledge base uploaded. Please upload your product catalog first.',
          requiredAction: 'Upload knowledge base file'
        });
      }

      // Check agent key exists — NO auto-provision here, must be set manually first
      const apiKey = await getTenantApiKey(tenantId);
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: 'Cannot turn bot ON: No agent key configured. Use the "Provision Key" or "Paste Key" button in AI Bot settings.',
          requiredAction: 'Configure agent API key'
        });
      }
    }

    let botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus) {
      botStatus = new BotStatus({ tenantId, status });
    } else {
      botStatus.status = status;
      botStatus.lastUpdated = new Date();
    }
    await botStatus.save();

    // Keep BotConfiguration in sync
    await BotConfiguration.findOneAndUpdate(
      { tenant_id: tenantId },
      { isActive: status === 'online' },
      { upsert: false }
    );

    res.json({
      success: true,
      platform: 'WhatsApp',
      status: botStatus.status,
      message: `WhatsApp bot ${status === 'online' ? 'enabled' : 'disabled'} successfully`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error toggling bot:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/bot/upload-knowledge-base ─────────────────────────────────────

router.post('/upload-knowledge-base', authenticateToken, upload.single('file'), async (req, res) => {
  const tenantId = resolveTenantId(req);

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Check if upload already in progress
    const existingKB = await KnowledgeBase.findOne({ tenantId });
    if (existingKB?.uploadInProgress) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(409).json({
        success: false,
        message: 'Upload already in progress. Please wait.'
      });
    }

    // Get the tenant's agent key — must exist before upload
    const tenantApiKey = await getTenantApiKey(tenantId);

    if (!tenantApiKey) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'No agent key configured. Please set up the Agent API Key in AI Bot settings first, then upload the knowledge base.',
        requiredAction: 'Configure agent API key first'
      });
    }

    // Mark upload in progress
    let knowledgeBase = existingKB || new KnowledgeBase({ tenantId });
    knowledgeBase.uploadInProgress = true;
    knowledgeBase.hasKnowledgeBase = false;
    await knowledgeBase.save();

    console.log(`📁 Ingesting file for tenant ${tenantId}: ${req.file.originalname} (key: ${tenantApiKey.substring(0, 20)}...)`);

    // Send file to Python agent using THIS TENANT'S key
    const result = await ingestTenantFile(
      req.file.path,
      req.file.originalname,
      tenantId,
      tenantApiKey
    );

    // Clean up temp file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    if (!result.success) {
      knowledgeBase.uploadInProgress = false;
      await knowledgeBase.save();
      return res.status(500).json({
        success: false,
        message: result.error || 'File ingestion failed. Please try again.'
      });
    }

    // Optionally ingest website URL (fire and forget)
    const websiteUrl = req.body.websiteUrl?.trim() || null;
    if (websiteUrl) {
      ingestTenantUrl(websiteUrl, tenantId, tenantApiKey).catch(err => {
        console.error(`URL ingest failed for tenant ${tenantId}:`, err.message);
      });
    }

    // Save record in MongoDB
    knowledgeBase.fileName = req.file.originalname;
    knowledgeBase.fileSize = req.file.size;
    knowledgeBase.chunksCount = result.chunks || 0;
    knowledgeBase.hasKnowledgeBase = true;
    knowledgeBase.uploadInProgress = false;
    knowledgeBase.uploadedAt = new Date();
    knowledgeBase.websiteUrl = websiteUrl;
    knowledgeBase.vectors = [];
    await knowledgeBase.save();

    console.log(`✅ KB ready for tenant ${tenantId}: ${result.chunks} chunks`);

    res.json({
      success: true,
      message: 'Knowledge base uploaded successfully',
      stats: {
        fileName: req.file.originalname,
        chunksCount: result.chunks || 0,
        websiteUrl: websiteUrl || null,
        aiStack: 'YoWhats Agent (FAISS + Claude)'
      }
    });

  } catch (error) {
    console.error('❌ KB upload error:', error);

    try {
      const kb = await KnowledgeBase.findOne({ tenantId });
      if (kb) { kb.uploadInProgress = false; await kb.save(); }
    } catch (_) {}

    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.status(500).json({
      success: false,
      message: error.message || 'Upload failed. Please try again.'
    });
  }
});

// ─── DELETE /api/bot/knowledge-base ──────────────────────────────────────────

router.delete('/knowledge-base', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const knowledgeBase = await KnowledgeBase.findOne({ tenantId });
    if (knowledgeBase?.uploadInProgress) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete while upload is in progress'
      });
    }

    await KnowledgeBase.findOneAndDelete({ tenantId });

    await BotStatus.findOneAndUpdate(
      { tenantId },
      { status: 'offline', lastUpdated: new Date() }
    );

    res.json({
      success: true,
      platform: 'WhatsApp',
      message: 'Knowledge base removed (bot automatically turned OFF)'
    });

  } catch (error) {
    console.error('Error removing KB:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/bot/test ───────────────────────────────────────────────────────

router.post('/test', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required' });
    }

    const botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus || botStatus.status !== 'online') {
      return res.json({
        success: false,
        message: 'Bot is offline',
        test: { query, response: 'Bot is offline — turn it ON first', responseTime: '0ms' }
      });
    }

    const tenantApiKey = await getTenantApiKey(tenantId);
    if (!tenantApiKey) {
      return res.json({
        success: false,
        message: 'No agent key configured',
        test: { query, response: 'Agent not configured', responseTime: '0ms' }
      });
    }

    const { response, responseTime } = await testTenantBot(query, tenantId, tenantApiKey);

    res.json({
      success: true,
      platform: 'WhatsApp',
      test: {
        query,
        response,
        responseTime,
        tenantId,
        aiStack: 'YoWhats Agent (FAISS + Claude)'
      }
    });

  } catch (error) {
    console.error('Bot test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/bot/test-connection ────────────────────────────────────────────

router.get('/test-connection', authenticateToken, async (req, res) => {
  try {
    const ok = await testAgentConnection();
    res.json({
      success: ok,
      platform: 'WhatsApp',
      message: ok ? 'YoWhats Agent is reachable' : 'YoWhats Agent is unreachable',
      agentUrl: process.env.YOWHATS_AGENT_URL || 'http://localhost:8000',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/bot/health ──────────────────────────────────────────────────────

router.get('/health', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const [botStatus, knowledgeBase, agentKey] = await Promise.all([
      BotStatus.findOne({ tenantId }),
      KnowledgeBase.findOne({ tenantId }),
      getTenantApiKey(tenantId)
    ]);

    const hasAgentKey = Boolean(agentKey);
    const canRespond = botStatus?.status === 'online' && knowledgeBase?.hasKnowledgeBase && hasAgentKey;

    let message = '';
    if (canRespond)                             message = '✅ WhatsApp bot is ready and operational';
    else if (botStatus?.status !== 'online')    message = '⚠️ Bot is offline';
    else if (!knowledgeBase?.hasKnowledgeBase)  message = '❌ No knowledge base uploaded';
    else if (!hasAgentKey)                      message = '❌ No agent API key configured';

    res.json({
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
        fileName: knowledgeBase?.fileName,
        websiteUrl: knowledgeBase?.websiteUrl || null
      },
      aiStack: {
        agent: 'YoWhats Python Agent',
        keyConfigured: hasAgentKey,
        keyPrefix: agentKey ? agentKey.substring(0, 20) + '...' : null
      },
      operational: { canRespond },
      message
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/bot/product-image-module ───────────────────────────────────────

router.get('/product-image-module', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const settings = await Settings.findOne({ tenant_id: tenantId }).lean();
    const enabled = Boolean(settings?.aiConfig?.productImageFetchEnabled);
    return res.json({ success: true, enabled, module: 'product_image_fetch_ai' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/bot/product-image-module ──────────────────────────────────────

router.post('/product-image-module', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Only super_admin can change this setting.'
      });
    }

    const tenantId = resolveTenantId(req);
    const { enabled } = req.body || {};

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled must be a boolean' });
    }

    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) settings = new Settings({ tenant_id: tenantId });
    if (!settings.aiConfig) settings.aiConfig = {};

    settings.aiConfig.productImageFetchEnabled = enabled;
    settings.markModified('aiConfig');
    await settings.save();

    return res.json({
      success: true,
      enabled: settings.aiConfig.productImageFetchEnabled,
      module: 'product_image_fetch_ai',
      message: `Product image AI ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /api/bot/set-chatbot-active ────────────────────────────────────────
// Called by frontend toggle to sync BotConfiguration.isActive field

router.post('/set-chatbot-active', authenticateToken, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { active } = req.body;

    await BotConfiguration.findOneAndUpdate(
      { tenant_id: tenantId },
      { isActive: Boolean(active) },
      { upsert: false }
    );

    res.json({ success: true, active: Boolean(active) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
