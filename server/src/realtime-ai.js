const express = require('express');
const router = express.Router();
const axios = require('axios');
const { decryptFields, ORDER_ENCRYPTION_FIELDS, isEncryptionEnabled } = require('./utils/encryption');

// Import ALL GoWhats models
const models = {};
const modelNames = [
  'Order', 'Broadcast', 'Contact', 'Message', 'Template', 
  'Tag', 'QuickResponse', 'WelcomeTemplate', 'FlowRequest',
  'FlowResponse', 'FlowToken', 'FlowUsageStats', 'Integration',
  'BotConfiguration', 'BotStatus', 'Payment', 'Profile',
  'ShippingCalculation', 'ShippingMethod', 'Tenant', 'User'
];

// Load all models with error handling
modelNames.forEach(modelName => {
  try {
    if (modelName === 'Inventory') {
      models[modelName] = require('../models/inventory');
    } else {
      models[modelName] = require(`../models/${modelName}`);
    }
  } catch (e) {
    console.log(`${modelName} model not found:`, e.message);
    models[modelName] = null;
  }
});

// Add Inventory separately due to naming
try {
  models.Inventory = require('../models/inventory');
} catch (e) {
  console.log('Inventory model not found:', e.message);
  models.Inventory = null;
}

// Comprehensive real-time stats endpoint
router.get('/comprehensive/realtime-stats', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    const businessId = req.headers['x-business-id'];
    const accessToken = req.headers['x-access-token'];
    const apiKey = req.headers['x-api-key'];

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Parallel fetch of ALL module data
    const [
      orderStats,
      broadcastStats,
      contactStats,
      messageStats,
      templateStats,
      inventoryStats,
      integrationStats,
      botStats,
      flowStats,
      userStats
    ] = await Promise.allSettled([
      getOrderStats(tenantId, todayStart, monthStart),
      getBroadcastStats(tenantId, todayStart),
      getContactStats(tenantId, todayStart),
      getMessageStats(tenantId, todayStart),
      getTemplateStats(tenantId),
      getInventoryStats(tenantId),
      getIntegrationStats(tenantId),
      getBotStats(tenantId),
      getFlowStats(tenantId),
      getUserStats(tenantId)
    ]);

    res.json({
      orders: orderStats.status === 'fulfilled' ? orderStats.value : null,
      broadcasts: broadcastStats.status === 'fulfilled' ? broadcastStats.value : null,
      contacts: contactStats.status === 'fulfilled' ? contactStats.value : null,
      messages: messageStats.status === 'fulfilled' ? messageStats.value : null,
      templates: templateStats.status === 'fulfilled' ? templateStats.value : null,
      inventory: inventoryStats.status === 'fulfilled' ? inventoryStats.value : null,
      integrations: integrationStats.status === 'fulfilled' ? integrationStats.value : null,
      bot: botStats.status === 'fulfilled' ? botStats.value : null,
      flows: flowStats.status === 'fulfilled' ? flowStats.value : null,
      users: userStats.status === 'fulfilled' ? userStats.value : null,
      // Include authentication context for AI (but not in responses)
      authContext: {
        tenantId,
        businessId,
        hasAccessToken: !!accessToken,
        hasApiKey: !!apiKey
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Comprehensive stats error:', error);
    res.status(500).json({ error: 'Failed to fetch comprehensive stats' });
  }
});

// Helper functions remain the same...
async function getOrderStats(tenantId, todayStart, monthStart) {
  if (!models.Order) return null;

  const [orders, payments] = await Promise.all([
    models.Order.find({ tenantId }).sort({ createdAt: -1 }).limit(20).lean(),
    models.Payment ? models.Payment.find({ tenantId }).lean() : []
  ]);

  if (isEncryptionEnabled()) {
  orders.forEach((order) => decryptFields(order, ORDER_ENCRYPTION_FIELDS));
}

  const todayOrders = orders.filter(o => new Date(o.createdAt) >= todayStart);
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const completedOrders = orders.filter(o => o.status === 'completed');

  return {
    totalOrders: orders.length,
    todayOrders: todayOrders.length,
    pendingOrders: pendingOrders.length,
    completedOrders: completedOrders.length,
    todayRevenue: todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    monthRevenue: orders.filter(o => new Date(o.createdAt) >= monthStart)
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    recentOrders: orders.slice(0, 10),
    paymentMethods: payments.map(p => p.method).filter((v, i, a) => a.indexOf(v) === i)
  };
}

async function getBroadcastStats(tenantId, todayStart) {
  if (!models.Broadcast) return null;

  const broadcasts = await models.Broadcast.find({ tenantId }).lean();
  const todayBroadcasts = broadcasts.filter(b => new Date(b.createdAt) >= todayStart);

  return {
    totalCampaigns: broadcasts.length,
    activeCampaigns: broadcasts.filter(b => b.status === 'sending').length,
    completedCampaigns: broadcasts.filter(b => b.status === 'completed').length,
    todayStats: {
      sent: todayBroadcasts.reduce((sum, b) => sum + (b.sentCount || 0), 0),
      delivered: todayBroadcasts.reduce((sum, b) => sum + (b.deliveredCount || 0), 0),
      read: todayBroadcasts.reduce((sum, b) => sum + (b.readCount || 0), 0)
    },
    recentCampaigns: broadcasts.slice(0, 5)
  };
}

async function getContactStats(tenantId, todayStart) {
  if (!models.Contact) return null;

  const [contacts, tags] = await Promise.all([
    models.Contact.find({ tenantId }).lean(),
    models.Tag ? models.Tag.find({ tenantId }).lean() : []
  ]);

  return {
    totalContacts: contacts.length,
    newContactsToday: contacts.filter(c => new Date(c.createdAt || c.timestamp) >= todayStart).length,
    unreadMessages: contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    activeContacts: contacts.filter(c => c.lastMessage && 
      new Date(c.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length,
    totalTags: tags.length,
    taggedContacts: contacts.filter(c => c.tags && c.tags.length > 0).length
  };
}

async function getMessageStats(tenantId, todayStart) {
  if (!models.Message) return null;

  const messages = await models.Message.find({ tenantId }).lean();
  const todayMessages = messages.filter(m => new Date(m.createdAt) >= todayStart);

  return {
    totalMessages: messages.length,
    todayMessages: todayMessages.length,
    sentMessages: messages.filter(m => m.direction === 'outbound').length,
    receivedMessages: messages.filter(m => m.direction === 'inbound').length,
    unreadMessages: messages.filter(m => !m.read).length,
    messageTypes: {
      text: messages.filter(m => m.type === 'text').length,
      image: messages.filter(m => m.type === 'image').length,
      document: messages.filter(m => m.type === 'document').length,
      audio: messages.filter(m => m.type === 'audio').length
    }
  };
}

async function getTemplateStats(tenantId) {
  if (!models.Template) return null;

  const templates = await models.Template.find({ tenantId }).lean();

  return {
    totalTemplates: templates.length,
    approvedTemplates: templates.filter(t => t.status === 'APPROVED').length,
    pendingTemplates: templates.filter(t => t.status === 'PENDING').length,
    rejectedTemplates: templates.filter(t => t.status === 'REJECTED').length,
    templateCategories: templates.map(t => t.category).filter((v, i, a) => a.indexOf(v) === i),
    recentTemplates: templates.slice(0, 5)
  };
}

async function getInventoryStats(tenantId) {
  if (!models.Inventory) return null;

  const products = await models.Inventory.find({ tenant_id: tenantId }).lean();

  return {
    totalProducts: products.length,
    inStock: products.filter(p => (p.inventory || 0) > 0).length,
    outOfStock: products.filter(p => (p.inventory || 0) === 0).length,
    lowStock: products.filter(p => (p.inventory || 0) < 10 && (p.inventory || 0) > 0).length,
    totalValue: products.reduce((sum, p) => sum + (parseFloat(p.price) * (p.inventory || 0)), 0),
    syncStatus: {
      synced: products.filter(p => p.whatsapp_sync_status === 'success').length,
      pending: products.filter(p => p.whatsapp_sync_status === 'pending').length,
      failed: products.filter(p => p.whatsapp_sync_status === 'failed').length
    }
  };
}

async function getIntegrationStats(tenantId) {
  if (!models.Integration) return null;

  const integrations = await models.Integration.find({ tenantId }).lean();

  return {
    totalIntegrations: integrations.length,
    activeIntegrations: integrations.filter(i => i.isActive).length,
    platforms: integrations.map(i => i.storeType),
    messageEnabledStores: integrations.filter(i => i.isMessageEnabled).length
  };
}

async function getBotStats(tenantId) {
  if (!models.BotConfiguration) return null;

  const [botConfig, botStatus] = await Promise.all([
    models.BotConfiguration.findOne({ tenantId }),
    models.BotStatus ? models.BotStatus.findOne({ tenantId }) : null
  ]);

  return {
    isEnabled: botConfig?.isEnabled || false,
    hasKnowledgeBase: botConfig?.knowledgeBase?.length > 0,
    autoResponseCount: botStatus?.responseCount || 0,
    accuracy: botStatus?.accuracy || 0,
    lastResponse: botStatus?.lastResponseAt
  };
}

async function getFlowStats(tenantId) {
  if (!models.FlowRequest) return null;

  const [flowRequests, flowResponses] = await Promise.all([
    models.FlowRequest.find({ tenantId }).lean(),
    models.FlowResponse ? models.FlowResponse.find({ tenantId }).lean() : []
  ]);

  return {
    totalFlows: flowRequests.length,
    completedFlows: flowResponses.length,
    successRate: flowRequests.length > 0 ? (flowRequests.length / flowRequests.length * 100).toFixed(1) : 0
  };
}

async function getUserStats(tenantId) {
  if (!models.User) return null;

  const users = await models.User.find({ tenant_id: tenantId }).lean();

  return {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive !== false).length,
    adminUsers: users.filter(u => u.role === 'admin').length,
    lastLogin: users.reduce((latest, u) => 
      new Date(u.lastLoginAt || 0) > new Date(latest || 0) ? u.lastLoginAt : latest, null)
  };
}

// Enhanced AI processing WITHOUT recommendations and WITHOUT authentication details
router.post('/process-comprehensive-query', async (req, res) => {
  try {
    const { query, context, timestamp } = req.body;
    const tenantId = req.headers['x-tenant-id'];
    const businessId = req.headers['x-business-id'];
    const accessToken = req.headers['x-access-token'];
    const apiKey = req.headers['x-api-key'];
    
    if (!process.env.DEEPSEEK_API_KEY) {
      const fallbackResponse = getComprehensiveGoWhatsResponse(query, context);
      return res.json({ 
        response: fallbackResponse,
        fallback: true,
        error: 'AI service not configured'
      });
    }

    const safeContext = context || {};
    const lastUpdated = safeContext.lastUpdated || new Date().toISOString();

    // Remove authentication details from context before sending to AI
    const sanitizedContext = { ...safeContext };
    delete sanitizedContext.authContext;

    const enhancedPrompt = `You are a precise AI assistant for GoWhats WhatsApp Business platform. Provide ONLY factual information and direct answers.

STRICT RULES:
- NO recommendations or suggestions unless explicitly asked
- NO advice or optimization tips
- NO "you should" or "consider" statements  
- ONLY provide requested data and facts
- Be concise and to-the-point
- Answer ONLY what was asked
- NEVER include authentication details, tenant IDs, business IDs, access tokens, API keys, or any security-related information in responses
- DO NOT mention authentication status, tenant information, or security credentials

GOWHATS MODULES DATA:
1. Orders & Commerce: Order tracking, payments, revenue
2. Messaging: Templates, contacts, broadcasts
3. Inventory: Products, stock levels, catalog sync
4. Integrations: Connected stores, APIs, webhooks
5. Automation: Bot configuration, flows, responses
6. Analytics: Performance metrics, statistics
7. User Management: Accounts, permissions, activity

Current timestamp: ${timestamp}
Last data update: ${lastUpdated}`;

    const messages = [
      {
        role: 'system',
        content: enhancedPrompt
      },
      {
        role: 'user',
        content: `Query: "${query}"\n\nData: ${JSON.stringify(sanitizedContext, null, 2)}`
      }
    ];

    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 800,
      temperature: 0.1,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiResponse = response.data.choices[0].message.content;
    
    res.json({ 
      response: aiResponse,
      dataTimestamp: lastUpdated,
      usage: response.data.usage,
      queryProcessedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI processing error:', error);
    
    const fallbackResponse = getComprehensiveGoWhatsResponse(req.body.query, req.body.context);
    
    res.json({ 
      response: fallbackResponse,
      fallback: true,
      error: 'Using fallback response'
    });
  }
});

// Updated fallback responses WITHOUT recommendations and WITHOUT authentication details
function getComprehensiveGoWhatsResponse(query, context) {
  const lowerQuery = (query || '').toLowerCase();
  const safeContext = context || {};
  
  if (lowerQuery.includes('template') || lowerQuery.includes('message template')) {
    const templates = safeContext.templates;
    return templates ? `Templates: ${templates.totalTemplates || 0} total, ${templates.approvedTemplates || 0} approved, ${templates.pendingTemplates || 0} pending` : 'Template data unavailable';
  }

  if (lowerQuery.includes('contact') || lowerQuery.includes('customer')) {
    const contacts = safeContext.contacts;
    return contacts ? `Contacts: ${contacts.totalContacts || 0} total, ${contacts.newContactsToday || 0} new today, ${contacts.activeContacts || 0} active` : 'Contact data unavailable';
  }

  if (lowerQuery.includes('order') || lowerQuery.includes('revenue')) {
    const orders = safeContext.orders;
    return orders ? `Orders: ${orders.totalOrders || 0} total, ${orders.todayOrders || 0} today, Revenue: ₹${orders.monthRevenue || 0}` : 'Order data unavailable';
  }

  if (lowerQuery.includes('inventory') || lowerQuery.includes('product')) {
    const inventory = safeContext.inventory;
    return inventory ? `Products: ${inventory.totalProducts || 0} total, ${inventory.inStock || 0} in stock, ${inventory.outOfStock || 0} out of stock` : 'Inventory data unavailable';
  }

  if (lowerQuery.includes('broadcast') || lowerQuery.includes('campaign')) {
    const broadcasts = safeContext.broadcasts;
    return broadcasts ? `Broadcasts: ${broadcasts.totalCampaigns || 0} total campaigns, ${broadcasts.activeCampaigns || 0} active, ${broadcasts.completedCampaigns || 0} completed` : 'Broadcast data unavailable';
  }

  if (lowerQuery.includes('message') && !lowerQuery.includes('template')) {
    const messages = safeContext.messages;
    return messages ? `Messages: ${messages.totalMessages || 0} total, ${messages.todayMessages || 0} today, ${messages.unreadMessages || 0} unread` : 'Message data unavailable';
  }

  if (lowerQuery.includes('integration')) {
    const integrations = safeContext.integrations;
    return integrations ? `Integrations: ${integrations.totalIntegrations || 0} total, ${integrations.activeIntegrations || 0} active` : 'Integration data unavailable';
  }

  if (lowerQuery.includes('bot')) {
    const bot = safeContext.bot;
    return bot ? `Bot: ${bot.isEnabled ? 'Enabled' : 'Disabled'}, ${bot.autoResponseCount || 0} auto-responses, ${bot.accuracy || 0}% accuracy` : 'Bot data unavailable';
  }

  if (lowerQuery.includes('flow')) {
    const flows = safeContext.flows;
    return flows ? `Flows: ${flows.totalFlows || 0} total, ${flows.completedFlows || 0} completed, ${flows.successRate || 0}% success rate` : 'Flow data unavailable';
  }

  if (lowerQuery.includes('user')) {
    const users = safeContext.users;
    return users ? `Users: ${users.totalUsers || 0} total, ${users.activeUsers || 0} active, ${users.adminUsers || 0} admin` : 'User data unavailable';
  }

  if (lowerQuery.includes('full details') || lowerQuery.includes('complete') || lowerQuery.includes('overview')) {
    const orders = safeContext.orders;
    const broadcasts = safeContext.broadcasts;
    const contacts = safeContext.contacts;
    const messages = safeContext.messages;
    const templates = safeContext.templates;
    const inventory = safeContext.inventory;
    const integrations = safeContext.integrations;
    const bot = safeContext.bot;
    const flows = safeContext.flows;
    const users = safeContext.users;

    return `GoWhats Platform Overview:

Orders: ${orders ? `${orders.totalOrders || 0} total, ${orders.todayOrders || 0} today, ${orders.pendingOrders || 0} pending, ${orders.completedOrders || 0} completed. Today revenue: ₹${orders.todayRevenue || 0}, month revenue: ₹${orders.monthRevenue || 0}` : 'Unavailable'}.

Broadcasts: ${broadcasts ? `${broadcasts.totalCampaigns || 0} total campaigns, ${broadcasts.activeCampaigns || 0} active, ${broadcasts.completedCampaigns || 0} completed. Today: ${broadcasts.todayStats?.sent || 0} sent, ${broadcasts.todayStats?.delivered || 0} delivered, ${broadcasts.todayStats?.read || 0} read` : 'Unavailable'}.

Contacts: ${contacts ? `${contacts.totalContacts || 0} total, ${contacts.newContactsToday || 0} new today, ${contacts.unreadMessages || 0} unread messages, ${contacts.activeContacts || 0} active contacts, ${contacts.totalTags || 0} tags` : 'Unavailable'}.

Messages: ${messages ? `${messages.totalMessages || 0} total, ${messages.todayMessages || 0} today, ${messages.sentMessages || 0} sent, ${messages.receivedMessages || 0} received, ${messages.unreadMessages || 0} unread. ${messages.messageTypes?.text || 0} text messages` : 'Unavailable'}.

Templates: ${templates ? `${templates.totalTemplates || 0} total templates, ${templates.approvedTemplates || 0} approved, ${templates.pendingTemplates || 0} pending, ${templates.rejectedTemplates || 0} rejected` : 'Unavailable'}.

Inventory: ${inventory ? `${inventory.totalProducts || 0} total products, ${inventory.inStock || 0} in stock, ${inventory.outOfStock || 0} out of stock, ${inventory.lowStock || 0} low stock, ₹${inventory.totalValue || 0} total value. ${inventory.syncStatus?.synced || 0} synced, ${inventory.syncStatus?.failed || 0} failed` : 'Unavailable'}.

Integrations: ${integrations ? `${integrations.totalIntegrations || 0} total integrations, ${integrations.activeIntegrations || 0} active, ${integrations.messageEnabledStores || 0} message-enabled stores` : 'Unavailable'}.

Bot: ${bot ? `${bot.isEnabled ? 'Enabled' : 'Disabled'}, ${bot.hasKnowledgeBase ? 'has' : 'no'} knowledge base, ${bot.autoResponseCount || 0} auto-responses, ${bot.accuracy || 0}% accuracy` : 'Unavailable'}.

Flows: ${flows ? `${flows.totalFlows || 0} total flows, ${flows.completedFlows || 0} completed, ${flows.successRate || 0}% success rate` : 'Unavailable'}.

Users: ${users ? `${users.totalUsers || 0} total users, ${users.activeUsers || 0} active, ${users.adminUsers || 0} admin` : 'Unavailable'}.`;
  }

  return `GoWhats platform data available for: Orders, Messages, Contacts, Templates, Inventory, Broadcasts, Integrations, Bot, Flows, Users. What specific information do you need?`;
}

module.exports = router;
