const BotStatus = require('../models/BotStatus');
const KnowledgeBase = require('../models/KnowledgeBase');
const Settings = require('../models/settings');
const { getAgentResponse } = require('./gowhatsAgentService');

/**
 * Get a tenant's agent API key from their Settings document.
 */
async function getTenantApiKey(tenantId) {
  const settings = await Settings.findOne({ tenant_id: tenantId }).lean();
  return settings?.aiConfig?.agentApiKey || null;
}

/**
 * Generate an AI response for an incoming WhatsApp message.
 * Returns null if the bot should stay silent (bot is off, no KB, etc.)
 *
 * @param {string} userMessage - Raw WhatsApp message text
 * @param {string} tenantId - GoWhats tenant ID
 * @param {string} phoneNumber - Customer phone number (used for conversation memory)
 * @returns {string|null} Response text, or null to stay silent
 */
const findRelevantResponse = async (userMessage, tenantId, phoneNumber = 'unknown') => {
  try {
    console.log(`🤖 Incoming message for tenant ${tenantId} from ${phoneNumber}: "${userMessage.substring(0, 60)}..."`);

    // 1. Check bot is ON
    const botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus || botStatus.status !== 'online') {
      console.log(`❌ Bot is offline for tenant ${tenantId}`);
      return null;
    }

    // 2. Check knowledge base exists
    const knowledgeBase = await KnowledgeBase.findOne({ tenantId, hasKnowledgeBase: true });
    if (!knowledgeBase) {
      console.log(`❌ No knowledge base for tenant ${tenantId}`);
      return null;
    }

    // 3. Get tenant's agent API key
    const tenantApiKey = await getTenantApiKey(tenantId);
    if (!tenantApiKey) {
      console.log(`❌ No agent API key for tenant ${tenantId}`);
      return null;
    }

    // 4. Call Python agent
    const response = await getAgentResponse(userMessage, tenantId, phoneNumber, tenantApiKey);

    if (response && response.trim()) {
      console.log(`✅ Response for tenant ${tenantId}: "${response.substring(0, 80)}..."`);
      return response;
    }

    console.log(`⚠️ Empty response from agent for tenant ${tenantId}`);
    return null;

  } catch (error) {
    console.error('❌ findRelevantResponse error:', error);
    return null;
  }
};

/**
 * Decide whether the bot should respond to this message at all.
 * Fast check — avoids unnecessary DB lookups in the message handler.
 *
 * @param {string} phoneNumber - Customer phone number
 * @param {string} tenantId - GoWhats tenant ID
 * @param {string} message - Raw message text
 * @returns {boolean}
 */
const shouldBotRespond = async (phoneNumber, tenantId, message) => {
  try {
    // Basic validation
    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return false;
    }

    // Check bot status
    const botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus || botStatus.status !== 'online') {
      return false;
    }

    // Check knowledge base
    const knowledgeBase = await KnowledgeBase.findOne({ tenantId, hasKnowledgeBase: true });
    if (!knowledgeBase) {
      return false;
    }

    // Check agent API key exists
    const tenantApiKey = await getTenantApiKey(tenantId);
    if (!tenantApiKey) {
      return false;
    }

    console.log(`✅ Bot will respond to ${phoneNumber} for tenant ${tenantId}`);
    return true;

  } catch (error) {
    console.error('❌ shouldBotRespond error:', error);
    return false;
  }
};

module.exports = {
  findRelevantResponse,
  shouldBotRespond
};
