/**
 * services/gowhatsAgentService.js
 * Handles all communication with the Python AI Agent (YoWhats).
 * Each tenant uses their own API key stored in Settings.aiConfig.agentApiKey
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const AGENT_BASE_URL = process.env.YOWHATS_AGENT_URL || 'http://localhost:8000';
const AGENT_ADMIN_KEY = process.env.YOWHATS_ADMIN_KEY || '';

function buildAgentClient(apiKey) {
  return axios.create({
    baseURL: AGENT_BASE_URL,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
}

function buildAdminClient() {
  if (!AGENT_ADMIN_KEY) {
    throw new Error('YOWHATS_ADMIN_KEY is not set in environment variables');
  }
  return buildAgentClient(AGENT_ADMIN_KEY);
}

/**
 * Create a new client-role API key in the Python agent for a tenant.
 * Returns the full key string.
 */
async function createTenantApiKey(tenantId, label) {
  try {
    const adminClient = buildAdminClient();

    const response = await adminClient.post('/admin/keys', {
      role: 'client',
      label: label || `GoWhats Tenant: ${tenantId}`,
      metadata: { tenantId, createdBy: 'gowhats' }
    });

    const key = response.data?.data?.key;
    if (!key) {
      console.error('Agent response:', JSON.stringify(response.data));
      throw new Error('No key returned from agent — check response structure');
    }

    console.log(`✅ Created agent API key for tenant ${tenantId}: ${key.substring(0, 20)}...`);
    return key;

  } catch (error) {
    console.error('❌ Failed to create tenant API key:', error.response?.data || error.message);
    throw error;
  }
}

async function revokeTenantApiKey(keyId) {
  try {
    const adminClient = buildAdminClient();
    await adminClient.post(`/admin/keys/${keyId}/revoke`);
    console.log(`✅ Revoked agent API key: ${keyId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to revoke tenant API key:', error.message);
    return false;
  }
}

/**
 * Send a message to the Python agent and get a response.
 * This is the MAIN function called from webhook.js for bot replies.
 */
async function getAgentResponse(userMessage, tenantId, phoneNumber, tenantApiKey) {
  try {
    if (!tenantApiKey) {
      console.error(`❌ No API key found for tenant ${tenantId}`);
      return null;
    }

    const client = buildAgentClient(tenantApiKey);

    console.log(`🤖 Calling agent for tenant ${tenantId}, user ${phoneNumber}, message: "${userMessage.substring(0, 50)}"`);

    const response = await client.post('/chat', {
      message: userMessage,
      user_id: `${tenantId}_${phoneNumber}`
    });

    // Debug: log full response structure once
    console.log(`📨 Agent response structure:`, JSON.stringify(response.data).substring(0, 300));

    // Handle different response field names the Python agent might use
    const reply =
      response.data?.response ||
      response.data?.answer ||
      response.data?.text ||
      response.data?.message ||
      (typeof response.data === 'string' ? response.data : null);

    if (!reply || !reply.trim()) {
      console.warn(`⚠️ Empty/null reply from agent for tenant ${tenantId}. Full response:`, response.data);
      return null;
    }

    console.log(`✅ Agent replied (${reply.length} chars): "${reply.substring(0, 80)}..."`);
    return reply.trim();

  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error(`❌ Agent auth failed for tenant ${tenantId} — key may be revoked or invalid`);
    } else {
      console.error(`❌ Agent chat error for tenant ${tenantId}:`, error.response?.data || error.message);
    }
    return null;
  }
}

/**
 * Upload a RAG file for a tenant to the Python agent.
 */
async function ingestTenantFile(filePath, fileName, tenantId, tenantApiKey) {
  try {
    if (!tenantApiKey) {
      throw new Error(`No API key found for tenant ${tenantId}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), fileName);

    const response = await axios.post(
      `${AGENT_BASE_URL}/client/ingest`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-API-Key': tenantApiKey
        },
        timeout: 120000
      }
    );

    const chunks = response.data?.chunks || response.data?.doc_count || 0;
    console.log(`✅ File ingested for tenant ${tenantId}: ${chunks} chunks`);
    return { success: true, chunks };

  } catch (error) {
    console.error(`❌ File ingest error for tenant ${tenantId}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function ingestTenantUrl(websiteUrl, tenantId, tenantApiKey) {
  try {
    if (!tenantApiKey) {
      throw new Error(`No API key found for tenant ${tenantId}`);
    }

    const client = buildAgentClient(tenantApiKey);
    await client.post('/client/ingest-url', { url: websiteUrl });

    console.log(`✅ URL ingested for tenant ${tenantId}: ${websiteUrl}`);
    return { success: true };

  } catch (error) {
    console.error(`❌ URL ingest error for tenant ${tenantId}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function testAgentConnection() {
  try {
    const response = await axios.get(`${AGENT_BASE_URL}/health`, { timeout: 5000 });
    return response.data?.status === 'ok';
  } catch {
    return false;
  }
}

async function testTenantBot(query, tenantId, tenantApiKey) {
  const start = Date.now();
  const response = await getAgentResponse(query, tenantId, 'test_user', tenantApiKey);
  return {
    response: response || 'No response generated',
    responseTime: `${Date.now() - start}ms`
  };
}

module.exports = {
  createTenantApiKey,
  revokeTenantApiKey,
  getAgentResponse,
  ingestTenantFile,
  ingestTenantUrl,
  testAgentConnection,
  testTenantBot
};
