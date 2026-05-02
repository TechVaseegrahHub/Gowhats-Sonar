const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Tenant = require('../models/Tenant');
const InventoryItem = require('../models/inventory');
const whatsappSync = require('../services/whatsappSync');

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildPrivacyPageHtml = () => {
  const appName = escapeHtml(process.env.PRIVACY_BUSINESS_NAME || 'GoWhats');
  const contactEmail = escapeHtml(
    process.env.PRIVACY_CONTACT_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_FROM ||
    'support@example.com'
  );
  const appUrl = escapeHtml(
    (process.env.APP_URL || process.env.BASE_URL || 'https://bot.gowhats.in').replace(/\/$/, '')
  );
  const effectiveDate = escapeHtml(
    process.env.PRIVACY_EFFECTIVE_DATE ||
    new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${appName} Privacy Policy</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7f4;
        --card: #ffffff;
        --ink: #0f172a;
        --muted: #475569;
        --line: #dbe3dc;
        --brand: #15803d;
        --brand-soft: #ecfdf3;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, 0.12), transparent 28%),
          linear-gradient(180deg, #f7faf8 0%, var(--bg) 100%);
        color: var(--ink);
      }
      .wrap {
        width: min(920px, calc(100% - 32px));
        margin: 40px auto;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.06);
        overflow: hidden;
      }
      .hero {
        padding: 32px;
        background: linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%);
        border-bottom: 1px solid var(--line);
      }
      .hero h1 {
        margin: 0 0 8px;
        font-size: clamp(2rem, 3vw, 2.7rem);
        line-height: 1.05;
      }
      .hero p {
        margin: 0;
        color: var(--muted);
        max-width: 720px;
      }
      .meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--brand-soft);
        color: var(--brand);
        font-size: 0.92rem;
        font-weight: 600;
      }
      .content {
        padding: 28px 32px 36px;
      }
      h2 {
        margin: 24px 0 10px;
        font-size: 1.2rem;
      }
      p, li {
        color: var(--muted);
        line-height: 1.7;
        font-size: 0.98rem;
      }
      ul {
        margin: 10px 0 0 18px;
        padding: 0;
      }
      a {
        color: var(--brand);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
      .footer {
        margin-top: 28px;
        padding-top: 20px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 0.95rem;
      }
      @media (max-width: 640px) {
        .wrap {
          width: min(100% - 20px, 920px);
          margin: 16px auto;
        }
        .hero, .content {
          padding: 22px 18px;
        }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        <header class="hero">
          <h1>${appName} Privacy Policy</h1>
          <p>
            This policy explains what information ${appName} collects, how it is used,
            how long it is retained, and how merchants and customers can request access
            to or deletion of personal data.
          </p>
          <div class="meta">Effective date: ${effectiveDate}</div>
        </header>
        <div class="content">
          <h2>Information We Process</h2>
          <p>
            ${appName} may process merchant account details, store configuration,
            customer contact details, order information, fulfillment events, and message
            history needed to deliver WhatsApp automation, order updates, store integration,
            analytics, and support features.
          </p>

          <h2>How We Use Information</h2>
          <ul>
            <li>To connect merchant stores and synchronize approved Shopify data.</li>
            <li>To send order confirmations, fulfillment updates, and support messages.</li>
            <li>To operate dashboards, analytics, automations, and customer communication tools.</li>
            <li>To secure the service, investigate abuse, and maintain service reliability.</li>
          </ul>

          <h2>Data Sharing</h2>
          <p>
            We share data only with service providers and platform partners that are required
            to operate the product, such as hosting, messaging, payment, and infrastructure
            providers. We do not sell personal information.
          </p>

          <h2>Retention and Deletion</h2>
          <p>
            We retain data only for as long as needed to provide the service, meet legal obligations,
            resolve disputes, and enforce agreements. When Shopify sends compliance webhooks for
            customer access or redaction requests, ${appName} processes those requests and removes
            or anonymizes data as required.
          </p>

          <h2>Shopify and Customer Privacy Rights</h2>
          <p>
            If a merchant or customer requests access to stored personal data or asks for deletion,
            we process those requests through our Shopify compliance workflow. Merchants can also
            contact us directly to request access, correction, export, or deletion of personal data.
          </p>

          <h2>Security</h2>
          <p>
            We use administrative, technical, and organizational safeguards designed to protect
            personal data against unauthorized access, disclosure, alteration, or destruction.
            No system is perfectly secure, but we continuously improve our controls.
          </p>

          <h2>Contact</h2>
          <p>
            Privacy questions or data-rights requests can be sent to
            <a href="mailto:${contactEmail}">${contactEmail}</a>.
          </p>

          <div class="footer">
            <div>App URL: <a href="${appUrl}/privacy">${appUrl}/privacy</a></div>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`;
};

router.get('/privacy', (_req, res) => {
  res.type('html').send(buildPrivacyPageHtml());
});


// ✅ Public API endpoint to get bot phone for an order
router.get('/api/public/order-status/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
    const order = await Order.findOne({ orderId }).lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const tenant = await Tenant.findById(order.tenantId).lean();
    
    let botPhone = null;
    if (tenant && tenant.whatsappConfig?.phoneNumber) {
      // Remove all non-digits for wa.me link
      botPhone = tenant.whatsappConfig.phoneNumber.replace(/\D/g, '');
    }
    
    res.json({
      orderId: order.orderId,
      status: order.status,
      botPhone: botPhone
    });
    
  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/sync-inventory', async (req, res) => {
  try {
    // Verify secret
    if (req.headers['x-sync-secret'] !== process.env.SYNC_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { sku, quantity, price,organisationId } = req.body;

    const item = await InventoryItem.findOne({
      tenant_id: organisationId,
      retailer_id: sku 
    });

    if (!item) return res.status(404).json({ success: false, message: "SKU not found" });

    item.inventory = quantity;
    item.price = price;
    item.isBillzzySynced = true;
    await item.save();

   await whatsappSync.syncSingleProduct(item);


    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/bulk-lock-sync', async (req, res) => {
  try {
    if (req.headers['x-sync-secret'] !== process.env.SYNC_SECRET) {
      return res.status(401).json({ success: false });
    }

    const { organisationId, skus } = req.body;
   console.log("Searching for Tenant:", organisationId, "with SKUs:", skus);

   const count = await InventoryItem.countDocuments({ tenant_id: organisationId.toString() });
    console.log("Total items found for this tenant in GoWhats:", count);

    // This flips the switch in MongoDB!
    const result=await InventoryItem.updateMany(
      { 
        tenant_id: organisationId, 
        retailer_id: { $in: skus } 
      },
      { $set: { isBillzzySynced: true } }
    );
    console.log("Matched items:", result.matchedCount);
    console.log("Modified items:", result.modifiedCount);

    res.status(200).json({ success: true, matched: result.matchedCount });
  } catch (error) {
    console.error("Lock error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
