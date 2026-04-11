// services/botService.js - IMPROVED VERSION
const BotStatus = require('../models/BotStatus');
const BotConfiguration = require('../models/BotConfiguration'); // Use correct model
const KnowledgeBase = require('../models/KnowledgeBase');
const { getWhatsAppRAGResponse } = require('./openaiService');

const findRelevantResponse = async (userMessage, tenantId, phoneNumber = 'unknown') => {
  try {
    console.log(`🤖 Bot query for tenant ${tenantId}: "${userMessage.substring(0, 50)}..."`);

    // STEP 1: Check if bot is ON
    const botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus || botStatus.status !== 'online') {
      console.log(`❌ Bot is OFF for tenant ${tenantId}`);
      return null; // Don't respond when bot is off
    }

    // STEP 2: Check knowledge base exists and has data
    const knowledgeBase = await KnowledgeBase.findOne({
      tenantId,
      hasKnowledgeBase: true
    });

    if (!knowledgeBase || !knowledgeBase.vectors || knowledgeBase.vectors.length === 0) {
      console.log(`❌ No knowledge base data for tenant ${tenantId}`);
      return "I don't have access to our product information right now. Please contact our support team for assistance.";
    }

    console.log(`✅ Knowledge base found: ${knowledgeBase.chunksCount} chunks, ${knowledgeBase.vectors.filter(v => v.embedding?.length > 0).length} embeddings`);

    // STEP 3: Get RAG response with improved error handling
    const response = await getWhatsAppRAGResponse(userMessage, knowledgeBase, tenantId, phoneNumber);

    if (response && response.trim() && !response.includes('I cannot find information')) {
      console.log(`✅ Generated response for tenant ${tenantId}: ${response.substring(0, 100)}...`);
      return response;
    }

    // Enhanced fallback for unmatched queries
    console.log(`❌ No relevant match found for: "${userMessage}"`);
    return "I can help you with information about our products and services. Could you please rephrase your question or ask about a specific product?";

  } catch (error) {
    console.error('❌ Bot response error:', error);
    return "I'm experiencing some technical difficulties. Please try again in a moment or contact our support team.";
  }
};

// Enhanced bot decision logic
const shouldBotRespond = async (phoneNumber, tenantId, message, contact, isNewContact) => {
  try {
    console.log(`🔍 Checking if bot should respond for ${phoneNumber}:`, {
      messageLength: message?.length,
      tenantId,
      isNewContact
    });

    // Basic validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      console.log(`❌ Invalid message - no response`);
      return false;
    }

    // Check if message is too short (likely not a real question)
    if (message.trim().length < 3) {
      console.log(`❌ Message too short - no response`);
      return false;
    }

    // Check bot status
    const botStatus = await BotStatus.findOne({ tenantId });
    if (!botStatus || botStatus.status !== 'online') {
      console.log(`❌ Bot is offline for tenant ${tenantId}`);
      return false;
    }

    // Check knowledge base
    const knowledgeBase = await KnowledgeBase.findOne({
      tenantId,
      hasKnowledgeBase: true
    });

    if (!knowledgeBase || !knowledgeBase.vectors || knowledgeBase.vectors.length === 0) {
      console.log(`❌ No knowledge base - no response`);
      return false;
    }

    console.log(`✅ Bot will respond to ${phoneNumber}`);
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
