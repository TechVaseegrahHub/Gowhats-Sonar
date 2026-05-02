const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const checkTenant = require('./middleware/tenantMiddleware');
const auth = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const fs = require('fs-extra');
const { scheduleSyncTask } = require('./scheduler/syncScheduler');
const { getEncryptionMode } = require('./utils/encryption');

// Import routes
const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const webhookRoutes = require('./routes/webhook');
const templatesRoutes = require('./routes/templates');
const messagesRouter = require('./routes/messages');
const whatsappRoutes = require('./routes/whatsapp');
const inventoryRoutes = require('./routes/inventory');
const catalogSettingsRoutes = require('./routes/catalogSettings');
const tagRoutes = require('./routes/Tag');
const flowEndpointRouter = require('./routes/flowEndpoint');
const flowManagementRouter = require('./routes/flowManagement');
const flowStudioRoutes = require('./routes/flowStudio');
const quickResponseRoutes = require('./routes/quickresponse');
const autocorrectRoutes = require('./routes/autocorrect');
const welcomeroutes = require('./routes/WelcomeTemplates.js');
const broadcastsRoutes = require('./routes/broadcasts');
const integrationsRoutes = require('./routes/integrations');
const { startScheduler } = require('./services/broadcastScheduler');
const dashboardRoutes = require('./routes/dashboard');
const adminDashboardRoutes = require('./routes/adminDashboard');
const flowConfiguration = require('./routes/flowConfiguration.js');
const shipping = require('./routes/shipping.js');
const orders = require('./routes/orders.js');
const tracking = require('./routes/tracking.js');
const holding = require('./routes/holding.js');
const printingRoutes = require('./routes/printing');
const packingRoutes = require('./routes/packing');
const orderUpdateRoutes = require('./routes/orderUpdate');
const botRoutes = require('./routes/botRoutes');
const realtimeAIRoutes = require('./routes/realtime-ai');
const redisService = require('./services/redisService');
const tenantConfigRoutes = require('./routes/tenantConfigRoutes');
const registrationConfigRoutes = require('./routes/registrationConfig');
const orderStatusRoutes = require('./routes/orderStatus');
const ticketRoutes = require('./routes/tickets');
const razorpayOAuthRoutes = require('./routes/razorpayOAuth');
const { startAbandonedCartScheduler } = require('./scheduler/abandonedCart');
const { startGoogleSheetsTrackingScheduler } = require('./scheduler/googleSheetsTracking');
const { startWooCommerceRestockScheduler } = require('./scheduler/woocommerceRestock');
const { startDailySalesAlertScheduler } = require('./scheduler/dailySalesAlert');
const publicRoutes = require('./routes/publicRoutes');
const apiKeysRoutes = require('./routes/apiKeys');
const publicApiRoutes = require('./routes/publicApi');
const flowSubmissions = require('./routes/flowSubmissions');
const googleSheetsTracking = require('./routes/googleSheetsTracking');
const googleCalendarRoutes = require('./routes/googleCalendarRoutes');
const referralPartnerRoutes = require('./routes/referralPartners');
const shopifyAuthRoutes = require('./routes/shopifyAuth');
const { handleShopifyCallback } = shopifyAuthRoutes;
const shopifyComplianceRoutes = require('./routes/shopifyCompliance');
const shopifyRestockProxyRoutes = require('./routes/shopifyRestockProxy');
const wooCommerceRestockRoutes = require('./routes/woocommerceRestock');
const dailySalesAlertRoutes = require('./routes/dailySalesAlert');
const callingRoutes = require('./routes/calling');
const devicesRoutes = require('./routes/devices');
const pushRoutes = require('./routes/push');
const billingV1 = require('./routes/v1/billing');

// Start schedulers
startAbandonedCartScheduler();
startGoogleSheetsTrackingScheduler();
startWooCommerceRestockScheduler();
startDailySalesAlertScheduler();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const server = http.createServer(app);

function resolveFrontendDistPath() {
  const candidatePaths = [
    path.join(__dirname, '../dist'),
    path.join(__dirname, '../../client/dist')
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return candidatePaths[0];
}

const frontendDistDir = resolveFrontendDistPath();

app.use((req, res, next) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com;"
  );

  if (isHttps) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
});

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://bot.gowhats.in", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Apply CORS middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://bot.gowhats.in'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id']
}));

/**
 * ✅ UNIVERSAL WEBHOOK BUFFER FIX
 * This replaces all the manual app.use('/webhook'...) listeners.
 * It captures the raw bytes required for Stripe/WhatsApp Flow security checks.
 */
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    const url = req.originalUrl;
    if (url.includes('/stripe') || url.includes('/flow-endpoint') || url.includes('/webhook')) {
      req.rawBody = buf;
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Rate Limiting
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => req.path.includes('/webhook') || req.path.includes('/flow-endpoint'),
});
app.use('/api/', generalApiLimiter);

// ==========================================
// ✅ ROUTES
// ==========================================
app.use('/api/webhooks', integrationsRoutes);
app.use('/api/shopify', shopifyAuthRoutes);
app.use('/app-proxy/restock', shopifyRestockProxyRoutes);
app.use('/api/woocommerce-restock', wooCommerceRestockRoutes);
app.get('/auth/callback', handleShopifyCallback);
app.get('/auth/shopify/callback', handleShopifyCallback);
app.get('/shopify/auth/callback', handleShopifyCallback);
app.use('/webhooks', shopifyComplianceRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/flow-endpoint', flowEndpointRouter);
app.use('/api/autocorrect', autocorrectRoutes);
app.use('/api/whatsapp', auth, whatsappRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/razorpay', razorpayOAuthRoutes);
app.use('/api/messages', [auth, checkTenant], messagesRouter);
app.use('/api/contacts', [auth, checkTenant], contactsRoutes);
app.use('/api/templates', [auth, checkTenant], templatesRoutes);
app.use('/api/calling', callingRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/v1/billing', billingV1);

app.get('/api/inventory/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs allowed' });
  }

  try {
    const axios = require('axios');
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GoWhats/1.0)',
        'Accept': 'image/*,*/*'
      },
      maxContentLength: 10 * 1024 * 1024 // 10MB max
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';

    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL does not point to an image' });
    }

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400', // cache 24 hours
      'Access-Control-Allow-Origin': '*'
    });

    res.send(Buffer.from(response.data));

  } catch (error) {
    console.error('Proxy image error:', error.message);
    // Return transparent 1x1 PNG instead of crashing
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    res.set('Content-Type', 'image/png');
    res.send(transparentPng);
  }
});
app.use('/api/inventory', [auth, checkTenant], inventoryRoutes);
app.use('/api/tags', [auth, checkTenant], tagRoutes);
app.use('/api/flows', [auth, checkTenant], flowManagementRouter);
app.use('/api/flow-studio', [auth, checkTenant], flowStudioRoutes);
app.use('/api/quick-responses', [auth, checkTenant], quickResponseRoutes);
app.use('/api/welcome-message', [auth, checkTenant], welcomeroutes);
app.use('/api/broadcasts', broadcastsRoutes);
app.use('/api/flow-routes', [auth, checkTenant], flowConfiguration);
app.use('/api/realtime-ai', [auth, checkTenant], realtimeAIRoutes);
app.use('/api/bot', [auth, checkTenant], botRoutes);
app.use('/api/order-update', [auth, checkTenant], orderUpdateRoutes);
app.use('/api/tenant', tenantConfigRoutes);
app.use('/api/dashboard', [auth, checkTenant], dashboardRoutes);
app.use('/api/admin-dashboard', adminDashboardRoutes);
app.use('/api/referral', referralPartnerRoutes);
app.use('/api/integrations', [auth, checkTenant], integrationsRoutes);
app.use('/api/shipping', [auth, checkTenant], shipping);
app.use('/api/orders', [auth, checkTenant], orders);
app.use('/api/tracking', [auth, checkTenant], tracking);
app.use('/api/google-sheets-tracking', [auth, checkTenant], googleSheetsTracking);
app.use('/api/calendar', googleCalendarRoutes);
app.use('/api/holding', [auth, checkTenant], holding);
app.use('/api/packing', [auth, checkTenant], packingRoutes);
app.use('/api/printing', [auth, checkTenant], printingRoutes);
app.use('/api/order-status', [auth, checkTenant], orderStatusRoutes);
app.use('/api/tickets', [auth, checkTenant], ticketRoutes);
app.use('/api/push', [auth, checkTenant], pushRoutes);
app.use('/api/catalog-settings', [auth, checkTenant], catalogSettingsRoutes);
app.use('/api/registration-config', [auth, checkTenant], registrationConfigRoutes);
app.use('/', publicRoutes);
app.use('/api/api-keys', [auth, checkTenant], apiKeysRoutes);
app.use('/api/v1', publicApiRoutes);
app.use('/api/flow-submissions', flowSubmissions);
app.use('/api/daily-sales-alert', dailySalesAlertRoutes);

// ✅ FRONTEND SERVING & CATCH-ALL (Fixes 404 on refresh)
app.use(express.static(frontendDistDir));

app.get('*', (req, res) => {
  // If it's an API/Webhook route that reached here, it's actually a 404
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  // Otherwise, serve the React App
  res.sendFile(path.join(frontendDistDir, 'index.html'));
});

// Database & Server Start
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB Connected');
    console.log(`Customer data encryption mode: ${getEncryptionMode()}`);
    const redisConnected = await redisService.ping();
    if (redisConnected) console.log('✅ Redis connected');
    scheduleSyncTask();
  })
  .catch((err) => console.error('MongoDB Error:', err));

startScheduler();

// Socket IO Logic
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.tenant_id = decoded.tenant_id;
    socket.user_id = decoded.id || decoded._id;
    next();
  } catch (err) { next(new Error("Invalid token")); }
});

io.on('connection', (socket) => {
  if (socket.tenant_id) socket.join(socket.tenant_id);
  socket.on('disconnect', () => {});
});

global.io = io;

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
