const Settings = require('../models/settings');
const Order = require('../models/Order');
const Tenant = require('../models/Tenant');
const WhatsAppService = require('../services/whatsappServices');
const axios = require('axios');

// ─────────────────────────────────────────────────────────────
// IST today range helper
// ─────────────────────────────────────────────────────────────
const todayRange = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const start = new Date(
    Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate(),
      0, 0, 0, 0
    ) - istOffset
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

// ─────────────────────────────────────────────────────────────
// Aggregate all daily data
// ─────────────────────────────────────────────────────────────
const aggregateDailyData = async (tenantId) => {
  const tenantIdStr = String(tenantId);
  const { start, end } = todayRange();

  const aggregationResult = await Order.aggregate([
    {
      $match: {
        $expr: {
          $eq: [{ $toString: '$tenantId' }, tenantIdStr]
        },
        createdAt: { $gte: start, $lte: end },
        $or: [
          { paymentStatus: 'completed' },
          { 'paymentDetails.status': 'completed' }
        ]
      }
    },
    {
      $facet: {
        // Total orders + revenue
        totals: [
          {
            $group: {
              _id: null,
              totalOrdersCount: { $sum: 1 },
              totalRevenue: { $sum: '$totalAmount' }
            }
          }
        ],
        // Top selling product
        productStats: [
          { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: '$items.name',
              totalQty: { $sum: { $ifNull: ['$items.quantity', 1] } }
            }
          },
          { $sort: { totalQty: -1 } },
          { $limit: 1 }
        ],
        // All products sold today (for AI context)
        allProducts: [
          { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: '$items.name',
              totalQty: { $sum: { $ifNull: ['$items.quantity', 1] } },
              totalRevenue: {
                $sum: {
                  $multiply: [
                    { $ifNull: ['$items.price', 0] },
                    { $ifNull: ['$items.quantity', 1] }
                  ]
                }
              }
            }
          },
          { $sort: { totalQty: -1 } },
          { $limit: 10 }
        ],
        // Average order value
        avgOrder: [
          {
            $group: {
              _id: null,
              avgAmount: { $avg: '$totalAmount' }
            }
          }
        ]
      }
    }
  ]);

  const result = aggregationResult[0];
  const totals = result.totals[0] || { totalOrdersCount: 0, totalRevenue: 0 };
  const topProduct = result.productStats[0] || { _id: 'N/A', totalQty: 0 };
  const allProducts = result.allProducts || [];
  const avgOrder = result.avgOrder[0] || { avgAmount: 0 };

  const totalOrders = totals.totalOrdersCount;
  const totalRevenue = totals.totalRevenue;
  const mostSoldProductName = topProduct._id || 'N/A';
  const mostSoldProductQty = topProduct.totalQty;
  const averageOrderValue = avgOrder.avgAmount || 0;

  // Templates sent today
  const Message = require('../models/Message');
  const totalTemplatesSent = await Message.countDocuments({
    tenantId: tenantIdStr,
    timestamp: { $gte: start, $lte: end },
    $or: [
      { type: 'template' },
      { sentFromWABA: true }
    ]
  });

  // New contacts today
  const Contact = require('../models/Contact');
  const totalNewContacts = await Contact.countDocuments({
    tenantId: tenantIdStr,
    createdAt: { $gte: start, $lte: end }
  });

  // Customer inbound replies today
  const totalInboundMessages = await Message.countDocuments({
    tenantId: tenantIdStr,
    createdAt: { $gte: start, $lte: end },
    direction: 'inbound'
  });

  return {
    totalOrders,
    totalRevenue: totalRevenue.toFixed(2),
    mostSoldProductName,
    mostSoldProductQty,
    totalTemplatesSent,
    totalNewContacts,
    averageOrderValue: averageOrderValue.toFixed(2),
    totalInboundMessages,
    allProducts
  };
};

// ─────────────────────────────────────────────────────────────
// Generate AI summary using DeepSeek (for {{7}})
// ─────────────────────────────────────────────────────────────
const generateAISummary = async (data) => {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      console.warn('[DailySalesAlert] DEEPSEEK_API_KEY not set, using fallback summary');
      return null;
    }

    // Build IST date string
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const dateStr = istNow.toLocaleDateString('en-IN', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    // Product list for AI context
    const productListStr =
      data.allProducts && data.allProducts.length > 0
        ? data.allProducts
            .filter((p) => p._id)
            .map((p) => `${p._id} (qty: ${p.totalQty})`)
            .join(', ')
        : 'No product data';

    const systemPrompt = `You are a warm, friendly business advisor for Vaseegrah Veda, an herbal products brand.

STRICT RULES:
- Write EXACTLY 2 short sentences (max 300 characters total)
- Natural human tone, encouraging and positive
- Naturally include all 7 data points across the 2 sentences
- NO bullet points, NO markdown formatting
- NO special characters except Rs. for rupees
- NO emojis
- Do NOT start with "Here is", "Today", "Based on" or any intro phrase
- Plain text only — this will be inserted into a WhatsApp template variable
- Must be concise and clean`;

    const userPrompt = `Write a 2-sentence warm business summary for ${dateStr} using all 7 data points below:

1. Total Orders: ${data.totalOrders}
2. Total Revenue: Rs.${data.totalRevenue}
3. Top Product: ${data.mostSoldProductName} sold ${data.mostSoldProductQty} units
4. Average Order Value: Rs.${data.averageOrderValue}
5. WhatsApp Templates Sent: ${data.totalTemplatesSent}
6. New Customers Added: ${data.totalNewContacts}
7. Customer Replies Received: ${data.totalInboundMessages}

All products sold today (context): ${productListStr}

Write 2 sentences only. Plain text. No formatting. No emojis.`;

    const response = await axios.post(
      `${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`,
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 150,
        temperature: 0.7,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const raw = response.data.choices?.[0]?.message?.content?.trim();

    if (!raw) {
      console.warn('[DailySalesAlert] Empty AI response, using fallback');
      return null;
    }

    // Strip any markdown characters that would break the template variable
    const cleanSummary = raw
      .replace(/[*_~`#]/g, '')   // remove markdown
      .replace(/\n+/g, ' ')      // flatten newlines to space
      .replace(/\s{2,}/g, ' ')   // collapse multiple spaces
      .trim();

    console.log('[DailySalesAlert] ✅ AI summary generated:', cleanSummary);
    return cleanSummary;

  } catch (error) {
    console.error(
      '[DailySalesAlert] AI summary generation failed:',
      error.response?.data || error.message
    );
    return null; // graceful fallback
  }
};

// ─────────────────────────────────────────────────────────────
// Fallback summary when AI is unavailable
// ─────────────────────────────────────────────────────────────
const buildFallbackSummary = (data) => {
  if (data.totalOrders === 0) {
    return (
      `No completed orders today, but ${data.totalNewContacts} new customers joined ` +
      `and ${data.totalTemplatesSent} templates were sent with ${data.totalInboundMessages} ` +
      `replies received. Keep the momentum going — tomorrow is a fresh opportunity!`
    );
  }

  return (
    `${data.totalOrders} order${data.totalOrders > 1 ? 's' : ''} came in today generating ` +
    `Rs.${data.totalRevenue} in revenue with an avg order value of Rs.${data.averageOrderValue}, ` +
    `led by ${data.mostSoldProductName} selling ${data.mostSoldProductQty} unit${data.mostSoldProductQty > 1 ? 's' : ''}. ` +
    `${data.totalTemplatesSent} templates sent, ${data.totalNewContacts} new customer${data.totalNewContacts !== 1 ? 's' : ''} ` +
    `added, and ${data.totalInboundMessages} customer repl${data.totalInboundMessages !== 1 ? 'ies' : 'y'} received today.`
  );
};

// ─────────────────────────────────────────────────────────────
// Main send function
// ─────────────────────────────────────────────────────────────
const sendDailySalesReport = async (tenantId) => {
  // Check settings
  const setting = await Settings.findOne({ tenant_id: tenantId });
  if (!setting || !setting.dailySalesAlert?.enabled) {
    return {
      success: false,
      reason: 'Daily sales alert not enabled for this tenant.'
    };
  }

  // Check tenant WhatsApp config
  const tenant = await Tenant.findById(tenantId);
  if (!tenant || !tenant.whatsappConfig?.accessToken) {
    return {
      success: false,
      reason: 'Tenant WhatsApp not configured.'
    };
  }

  // Check contacts
  const contacts = setting.dailySalesAlert?.contacts || [];
  if (!contacts.length) {
    return {
      success: false,
      reason: 'No contacts configured.'
    };
  }

  // ── Step 1: Aggregate today's data ──────────────────────────
  console.log('[DailySalesAlert] Aggregating daily data...');
  const data = await aggregateDailyData(tenantId);
  console.log('[DailySalesAlert] Data aggregated:', {
    totalOrders: data.totalOrders,
    totalRevenue: data.totalRevenue,
    mostSoldProductName: data.mostSoldProductName,
    mostSoldProductQty: data.mostSoldProductQty,
    totalTemplatesSent: data.totalTemplatesSent,
    totalNewContacts: data.totalNewContacts,
    averageOrderValue: data.averageOrderValue,
    totalInboundMessages: data.totalInboundMessages
  });

  // ── Step 2: Generate AI summary for {{7}} ───────────────────
  console.log('[DailySalesAlert] Generating AI summary...');
  const aiSummary = await generateAISummary(data);
  const finalSummary = aiSummary || buildFallbackSummary(data);
  const summarySource = aiSummary ? 'ai' : 'fallback';

  console.log(`[DailySalesAlert] Summary source: ${summarySource}`);
  console.log(`[DailySalesAlert] Summary: ${finalSummary}`);

  // ── Step 3: Build WhatsApp template payload ──────────────────
  const whatsappService = new WhatsAppService(tenant);

  const templatePayloadBase = {
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  type: 'template',
  template: {
    name: 'daily_sales_summary_report1',
    language: { code: 'en' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(data.totalOrders) },                       // {{1}}
          { type: 'text', text: String(data.totalRevenue) },                       // {{2}}
          { type: 'text', text: String(data.mostSoldProductName).toLowerCase() },  // {{3}}
          { type: 'text', text: String(data.mostSoldProductQty) },                 // {{4}}
          { type: 'text', text: String(data.totalTemplatesSent) },                 // {{5}}
          { type: 'text', text: String(data.totalNewContacts) },                   // {{6}}
          { type: 'text', text: String(finalSummary) }                             // {{7}}
        ]
      }
    ]
  }
};

  // ── Step 4: Send to each contact ────────────────────────────
  const results = [];

  for (const contact of contacts) {
    if (!contact.phone) continue;

    try {
      const formatted = whatsappService.formatPhoneNumber(contact.phone);
      const url = `${whatsappService.baseUrl}/${whatsappService.phoneNumberId}/messages`;
      const headers = {
        Authorization: `Bearer ${whatsappService.accessToken}`,
        'Content-Type': 'application/json'
      };

      await axios.post(
        url,
        { ...templatePayloadBase, to: formatted },
        { headers }
      );

      results.push({
        label: contact.label,
        phone: contact.phone,
        sent: true,
        summarySource
      });

      console.log(`[DailySalesAlert] ✅ Sent to ${contact.phone} (${contact.label})`);

    } catch (err) {
      console.error(
        `[DailySalesAlert] ❌ Failed to send to ${contact.phone}:`,
        err.response?.data || err.message
      );
      results.push({
        label: contact.label,
        phone: contact.phone,
        sent: false,
        error: err.message
      });
    }
  }

  return {
    success: true,
    data,
    aiSummaryGenerated: !!aiSummary,
    summarySource,
    summaryPreview: finalSummary.substring(0, 200),
    results
  };
};

// ─────────────────────────────────────────────────────────────
// Route Controllers
// ─────────────────────────────────────────────────────────────

exports.getConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id;
    console.log('[getConfig] tenantId:', tenantId);

    const setting = await Settings.findOne({ tenant_id: tenantId }).lean();
    const config = setting?.dailySalesAlert || null;

    res.json({
      success: true,
      config: {
        enabled: config?.enabled === true,
        sendTime: config?.sendTime || '20:00',
        contacts: Array.isArray(config?.contacts) ? config.contacts : []
      }
    });
  } catch (err) {
    console.error('[DailySalesAlert] getConfig error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch config.' });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id;
    console.log('[saveConfig] tenantId:', tenantId);

    const { enabled, sendTime, contacts } = req.body;

    const sanitizedContacts = Array.isArray(contacts)
      ? contacts.map((c) => ({
          label: String(c.label || 'Admin'),
          phone: String(c.phone || '')
        }))
      : [];

    await Settings.findOneAndUpdate(
      { tenant_id: tenantId },
      {
        $set: {
          'dailySalesAlert.enabled': enabled === true,
          'dailySalesAlert.sendTime': sendTime || '20:00',
          'dailySalesAlert.contacts': sanitizedContacts,
          'dailySalesAlert.lastSentDate': ''
        }
      },
      { upsert: true }
    );

    const updated = await Settings.findOne({ tenant_id: tenantId }).lean();
    const savedConfig = updated?.dailySalesAlert;

    res.json({
      success: true,
      config: {
        enabled: savedConfig?.enabled === true,
        sendTime: savedConfig?.sendTime || '20:00',
        contacts: Array.isArray(savedConfig?.contacts) ? savedConfig.contacts : []
      }
    });
  } catch (err) {
    console.error('[DailySalesAlert] saveConfig error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to save config.' });
  }
};

exports.triggerNow = async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id;
    console.log('[triggerNow] tenantId:', tenantId);

    const result = await sendDailySalesReport(tenantId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Daily sales report sent!',
      aiSummaryGenerated: result.aiSummaryGenerated,
      summarySource: result.summarySource,
      summaryPreview: result.summaryPreview,
      results: result.results
    });
  } catch (err) {
    console.error('[DailySalesAlert] triggerNow error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send report.' });
  }
};

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────
module.exports.sendDailySalesReport = sendDailySalesReport;
