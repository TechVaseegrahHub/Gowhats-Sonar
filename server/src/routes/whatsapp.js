const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Tenant = require('../models/Tenant');

// ==========================================
// 1. STATUS ENDPOINT
// Checks if the tenant has a valid configuration
// ==========================================
router.get('/status', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const tenant = await Tenant.findById(tenantId).lean();

    if (!tenant) {
      return res.json({ success: true, connected: false, config: null });
    }

    // Check if essential config exists
    const isConnected = !!(
      tenant.whatsappConfig &&
      tenant.whatsappConfig.businessAccountId &&
      tenant.whatsappConfig.phoneNumberId &&
      tenant.whatsappConfig.accessToken
    );

    const response = {
      success: true,
      connected: isConnected
    };

    if (isConnected) {
      response.config = {
        businessAccountId: tenant.whatsappConfig.businessAccountId,
        phoneNumberId: tenant.whatsappConfig.phoneNumberId,
        displayPhoneNumber: tenant.whatsappConfig.displayPhoneNumber || null,
        connectedVia: tenant.whatsappConfig.connectedVia || 'embedded_signup',
        isWhatsAppBusinessApp: tenant.whatsappConfig.isWhatsAppBusinessApp || false,
        connectedAt: tenant.whatsappConfig.connectedAt || null
      };
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. CONNECT ENDPOINT (Universal)
// Handles both Cloud API and Coexistence
// ==========================================
router.post('/connect-embedded', auth, async (req, res) => {
  const startTime = Date.now();

  try {
    const { code, wabaId, phoneNumberId, isCoexistence } = req.body;
    const tenantId = req.user.tenant_id;

    console.log('🔄 Starting WhatsApp connection for tenant:', tenantId);

    // 🚨 CRITICAL: The 'code' is required for BOTH flows to generate a valid User Token.
    // Without this, we cannot send messages or subscribe to webhooks.
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is missing. Please try the signup flow again.'
      });
    }

    if (!wabaId || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        message: 'WABA ID and Phone Number ID are required'
      });
    }

    // ✅ Respond immediately to UI (Non-blocking)
    res.json({
      success: true,
      message: 'Connection initiated. Please wait while we configure your account...',
      status: 'processing',
      connectionDetails: {
        businessAccountId: wabaId,
        phoneNumberId: phoneNumberId,
        connectedVia: isCoexistence ? 'waba_coexistence' : 'embedded_signup'
      }
    });

    // ✅ Continue processing in background
    processWhatsAppConnection({
      code,
      wabaId,
      phoneNumberId,
      isCoexistence,
      tenantId,
      startTime
    }).catch(error => {
      console.error('❌ Background processing error:', error);
    });

  } catch (error) {
    console.error('❌ Connect error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate connection'
    });
  }
});

// ==========================================
// 3. BACKGROUND PROCESSOR
// Does the heavy lifting: Token Exchange, Validation, Saving
// ==========================================
async function processWhatsAppConnection({
  code,
  wabaId,
  phoneNumberId,
  isCoexistence,
  tenantId,
  startTime
}) {
  console.log('🔄 [BACKGROUND] Starting WhatsApp configuration...');

  // Helper: Fetch with timeout
  const fetchWithTimeout = async (url, options = {}, timeout = 30000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  };

  try {
    let businessToken;
    let displayPhoneNumber = null;

    // ---------------------------------------------------------
    // STEP 1: Exchange Auth Code for User Access Token
    // ---------------------------------------------------------
    // We MUST do this for Coexistence too, otherwise we get an "App Token"
    // which cannot send messages.
    console.log('🔑 [BACKGROUND] Exchanging code for User Access Token...');
    
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token`;
    const tokenParams = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      code: code,
    });

    const tokenResponse = await fetchWithTimeout(`${tokenUrl}?${tokenParams}`, {}, 15000);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('❌ Token Exchange Failed:', tokenData);
      throw new Error('Failed to exchange authorization code for access token');
    }

    businessToken = tokenData.access_token;
    console.log('✅ [BACKGROUND] Valid User Token obtained');

    // ---------------------------------------------------------
    // STEP 2: Get Phone Details & Subscribe to Webhooks
    // ---------------------------------------------------------
    console.log('📞 [BACKGROUND] Fetching phone details & Subscribing Webhooks...');
    
    const phoneCheckUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,is_on_biz_app,platform_type`;

    const [phoneCheckResponse, webhookResponse] = await Promise.allSettled([
      // A. Get Phone Details
      fetchWithTimeout(phoneCheckUrl, {
        headers: { 'Authorization': `Bearer ${businessToken}` }
      }, 15000),
      
      // B. Subscribe App (Required for receiving messages)
      fetchWithTimeout(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${businessToken}` }
      }, 15000)
    ]);

    if (phoneCheckResponse.status !== 'fulfilled' || !phoneCheckResponse.value.ok) {
        throw new Error('Failed to fetch phone number details from Meta');
    }

    const phoneCheckData = await phoneCheckResponse.value.json();
    displayPhoneNumber = phoneCheckData.display_phone_number;
    
    // Check if number is actually on the business app (True Coexistence)
    const isWABANumber = phoneCheckData.is_on_biz_app === true; 
    const finalCoexistenceStatus = isCoexistence || isWABANumber;

    console.log('📱 [BACKGROUND] Phone Info:', {
        number: displayPhoneNumber,
        isOnBizApp: isWABANumber,
        webhookStatus: webhookResponse.status
    });

    // ---------------------------------------------------------
    // STEP 3: Registration (The Critical Logic)
    // ---------------------------------------------------------
    // If it's Coexistence (isOnBizApp), we MUST NOT call /register 
    // because that disconnects the physical phone.
    // If it's Cloud API (new number), we MUST call /register.
    
    if (!finalCoexistenceStatus) {
      console.log('📝 [BACKGROUND] Standard Cloud API: Registering phone number...');
      const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;

      try {
        const registerResponse = await fetchWithTimeout(registerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${businessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            pin: process.env.WHATSAPP_PIN || '654321',
          }),
        }, 20000);

        const registerData = await registerResponse.json();
        if (!registerResponse.ok && registerData.error?.code !== 33) { 
            // Code 33 means "already registered", which is fine.
            console.warn('⚠️ Registration warning:', registerData.error?.message);
        } else {
            console.log('✅ [BACKGROUND] Phone registered successfully');
        }
      } catch (regError) {
        console.warn('⚠️ Registration network error (non-fatal):', regError.message);
      }
    } else {
      console.log('ℹ️ [BACKGROUND] Coexistence Mode: SKIPPING registration to preserve phone app connection.');
    }

    // ---------------------------------------------------------
    // STEP 4: Save Configuration to Database
    // ---------------------------------------------------------
    console.log('💾 [BACKGROUND] Saving configuration...');

    const configToSave = {
      businessAccountId: wabaId,
      phoneNumberId: phoneNumberId,
      displayPhoneNumber: displayPhoneNumber || null,
      accessToken: businessToken,
      connectedVia: finalCoexistenceStatus ? 'waba_coexistence' : 'embedded_signup',
      isWhatsAppBusinessApp: finalCoexistenceStatus,
      connectedAt: new Date(),
      lastSyncedAt: null
    };

    await Tenant.findByIdAndUpdate(
      tenantId,
      { $set: { whatsappConfig: configToSave } },
      { new: true, upsert: false }
    );

    console.log('✅ [BACKGROUND] Configuration saved');

    // ---------------------------------------------------------
    // STEP 5: Data Sync (Only for Coexistence)
    // ---------------------------------------------------------
    if (finalCoexistenceStatus) {
      console.log('🔄 [BACKGROUND] Triggering Coexistence History Sync...');
      
      // Don't await this, let it run
      setTimeout(async () => {
        try {
            const syncUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/smb_app_data`;
            
            // 1. Sync App State
            await fetch(syncUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${businessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' })
            });

            // 2. Sync History
            await fetch(syncUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${businessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'history' })
            });

            // Update Last Sync Time
            await Tenant.findByIdAndUpdate(tenantId, { 
                $set: { 'whatsappConfig.lastSyncedAt': new Date() } 
            });
            
            console.log('✅ [BACKGROUND] History sync triggered');
        } catch (syncError) {
            console.error('❌ Sync trigger failed:', syncError.message);
        }
      }, 2000);
    }

    console.log('🎉 [BACKGROUND] Setup completed successfully in', Date.now() - startTime, 'ms');

  } catch (error) {
    console.error('❌ [BACKGROUND] Process failed:', error.message);
    // NOTE: Since this is background, the frontend is already polling connection-status.
    // If this fails, the frontend polling will time out after 30s.
  }
}

// ==========================================
// 4. CHECK PROGRESS ENDPOINT
// Frontend polls this to see if background job finished
// ==========================================
router.get('/connection-status', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const tenant = await Tenant.findById(tenantId).select('whatsappConfig').lean();

    if (!tenant?.whatsappConfig?.accessToken) {
      return res.json({
        success: true,
        status: 'not_connected',
        connected: false
      });
    }

    return res.json({
      success: true,
      status: 'connected',
      connected: true,
      config: {
        businessAccountId: tenant.whatsappConfig.businessAccountId,
        phoneNumberId: tenant.whatsappConfig.phoneNumberId,
        displayPhoneNumber: tenant.whatsappConfig.displayPhoneNumber,
        connectedVia: tenant.whatsappConfig.connectedVia,
        isWhatsAppBusinessApp: tenant.whatsappConfig.isWhatsAppBusinessApp
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. DISCONNECT ENDPOINT
// ==========================================
router.post('/disconnect', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    // Simply unset the config
    await Tenant.findByIdAndUpdate(
      tenantId,
      { $unset: { whatsappConfig: "" } }
    );

    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully'
    });

  } catch (error) {
    console.error('❌ Disconnect error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
