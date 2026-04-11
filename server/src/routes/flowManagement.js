const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Tenant = require('../models/Tenant');
const auth = require('../middleware/auth');
const checkTenant = require('../middleware/tenantMiddleware');

// 1. GENERATE KEYS WITH PROPER VALIDATION
router.post('/keys/generate', [auth, checkTenant], async (req, res) => {
  try {
    const { passphrase } = req.body;

    // Validate passphrase
    if (!passphrase || passphrase.length < 12) {
      return res.status(400).json({
        success: false,
        message: 'A secure passphrase (minimum 12 characters) is required for WhatsApp Flow encryption'
      });
    }

    console.log('🔑 Generating new RSA key pair for Flow encryption...');

    // Generate RSA key pair specifically for WhatsApp Flow
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: passphrase
      }
    });

    console.log('🧪 Testing generated key pair...');

    // CRITICAL: Test the key pair with WhatsApp's exact encryption method
    try {
      // Test 1: Basic RSA OAEP encryption/decryption
      const testData = crypto.randomBytes(16); // Simulate AES key
      
      const encrypted = crypto.publicEncrypt({
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      }, testData);

      const decrypted = crypto.privateDecrypt({
        key: privateKey,
        passphrase: passphrase,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      }, encrypted);

      if (!testData.equals(decrypted)) {
        throw new Error('Key pair validation failed - decryption mismatch');
      }

      console.log('✅ Key pair validation successful');

      // Test 2: Test with different buffer sizes (WhatsApp might use different sizes)
      for (const size of [16, 32, 64]) {
        const testBuffer = crypto.randomBytes(size);
        try {
          const enc = crypto.publicEncrypt({
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
          }, testBuffer);

          const dec = crypto.privateDecrypt({
            key: privateKey,
            passphrase: passphrase,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
          }, enc);

          if (!testBuffer.equals(dec)) {
            throw new Error(`Validation failed for buffer size ${size}`);
          }
        } catch (error) {
          console.warn(`Warning: Key test failed for buffer size ${size}:`, error.message);
        }
      }

    } catch (testError) {
      console.error('❌ Key pair test failed:', testError);
      return res.status(500).json({
        success: false,
        message: 'Generated key pair failed validation test',
        error: testError.message
      });
    }

    // Save keys and passphrase to tenant
    const updateResult = await Tenant.findByIdAndUpdate(req.user.tenant_id, {
      $set: {
        'flowConfig.publicKey': publicKey,
        'flowConfig.privateKey': privateKey,
        'flowConfig.passphrase': passphrase,
        'flowConfig.keyStatus': 'GENERATED',
        'flowConfig.keysGenerated': new Date(),
        'flowConfig.keyValidated': true,
        'flowConfig.keyGenerationMethod': 'rsa-2048-oaep-sha256'
      }
    }, { new: true });

    if (!updateResult) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    console.log('✅ Keys saved successfully for tenant:', req.user.tenant_id);

    res.json({
      success: true,
      message: 'Flow encryption keys generated and validated successfully',
      keyInfo: {
        keyStatus: 'GENERATED',
        keyLength: 2048,
        hasPassphrase: true,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Key generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate encryption keys',
      error: error.message
    });
  }
});

// 2. CONFIGURE APP SECRET
router.post('/app-secret', [auth, checkTenant], async (req, res) => {
  try {
    const { appSecret } = req.body;

    // Validate App Secret
    if (!appSecret || appSecret.length < 16) {
      return res.status(400).json({
        success: false,
        message: 'App Secret must be at least 16 characters long'
      });
    }

    // Validate App Secret format (should be alphanumeric)
    if (!/^[a-zA-Z0-9]+$/.test(appSecret)) {
      return res.status(400).json({
        success: false,
        message: 'App Secret must be a valid alphanumeric string from Meta Developers Console'
      });
    }

    console.log(`🔑 Configuring App Secret for tenant: ${req.user.tenant_id}`);

    // Store App Secret in tenant's flowConfig
    const updatedTenant = await Tenant.findByIdAndUpdate(req.user.tenant_id, {
      $set: {
        'flowConfig.appSecret': appSecret,
        'flowConfig.appSecretConfigured': true,
        'flowConfig.appSecretUpdatedAt': new Date()
      }
    }, { new: true });

    if (!updatedTenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    console.log('✅ App Secret configured successfully for tenant:', req.user.tenant_id);

    res.json({
      success: true,
      message: 'App Secret configured successfully',
      configured: {
        appSecretConfigured: true,
        updatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ App Secret configuration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to configure App Secret',
      error: error.message
    });
  }
});

// 3. UPLOAD PUBLIC KEY TO WHATSAPP
async function uploadPublicKeyToWhatsApp(tenant) {
  try {
    if (!tenant.flowConfig || !tenant.flowConfig.publicKey) {
      throw new Error('Public key not found');
    }

    if (!tenant.whatsappConfig || !tenant.whatsappConfig.accessToken || !tenant.whatsappConfig.phoneNumberId) {
      throw new Error('WhatsApp configuration missing - need access token and phone number ID');
    }

    console.log('📤 Uploading public key to WhatsApp for tenant:', tenant._id);

    const axios = require('axios');
    
    // Clean the public key (remove extra whitespace)
    const cleanPublicKey = tenant.flowConfig.publicKey.trim();
    
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${tenant.whatsappConfig.phoneNumberId}/whatsapp_business_encryption`,
      { business_public_key: cleanPublicKey },
      {
        headers: {
          'Authorization': `Bearer ${tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    console.log('✅ WhatsApp API response:', response.data);

    if (response.data && response.data.success) {
      return { success: true, data: response.data };
    } else {
      throw new Error('Unexpected response from WhatsApp API: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ WhatsApp API error:', error.response?.data || error.message);
    throw error;
  }
}

router.post('/keys/upload', [auth, checkTenant], async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Validate prerequisites
    const missingConfig = [];
    if (!tenant.whatsappConfig?.phoneNumberId) missingConfig.push('Phone Number ID');
    if (!tenant.whatsappConfig?.accessToken) missingConfig.push('Access Token');
    if (!tenant.flowConfig?.publicKey) missingConfig.push('Public Key');
    if (!tenant.whatsappConfig?.appSecret && !process.env.APP_SECRET) missingConfig.push('App Secret');

    if (missingConfig.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required configuration: ${missingConfig.join(', ')}`,
        missingItems: missingConfig
      });
    }

    // Upload to WhatsApp
    const result = await uploadPublicKeyToWhatsApp(tenant);

    // Update tenant status
    await Tenant.findByIdAndUpdate(tenant._id, {
      $set: {
        'flowConfig.keyStatus': 'UPLOADED',
        'flowConfig.keyUploadedAt': new Date(),
        'flowConfig.whatsappResponse': result.data
      }
    });

    res.json({
      success: true,
      message: 'Public key uploaded to WhatsApp successfully',
      response: result.data
    });

  } catch (error) {
    console.error('❌ Key upload error:', error);

    // Record upload error
    try {
      await Tenant.findByIdAndUpdate(req.user.tenant_id, {
        $set: {
          'flowConfig.keyStatus': 'UPLOAD_FAILED',
          'flowConfig.keyUploadError': error.message,
          'flowConfig.lastUploadAttempt': new Date()
        }
      });
    } catch (dbError) {
      console.error('Failed to update tenant upload error status:', dbError);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload public key to WhatsApp',
      error: error.message
    });
  }
});

// 4. VALIDATE CONFIGURATION
router.get('/config/validate', [auth, checkTenant], async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const validation = {
      whatsappConfig: {
        phoneNumberId: !!tenant.whatsappConfig?.phoneNumberId,
        accessToken: !!tenant.whatsappConfig?.accessToken
      },
      flowConfig: {
        publicKey: !!tenant.flowConfig?.publicKey,
        privateKey: !!tenant.flowConfig?.privateKey,
        passphrase: !!tenant.flowConfig?.passphrase,
        appSecret: !!tenant.flowConfig?.appSecret, // SaaS: Only check tenant's app secret
        keyStatus: tenant.flowConfig?.keyStatus || 'NOT_GENERATED'
      }
    };

    const allValid = Object.values(validation.whatsappConfig).every(Boolean) &&
                     Object.values(validation.flowConfig).every(val => 
                       typeof val === 'boolean' ? val : val === 'VALID' || val === 'UPLOADED'
                     );

    res.json({
      success: true,
      validation,
      isComplete: allValid,
      nextSteps: allValid ? [] : getNextStepsForSaaS(validation)
    });

  } catch (error) {
    console.error('❌ Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate configuration',
      error: error.message
    });
  }
});

function getNextStepsForSaaS(validation) {
  const steps = [];

  if (!validation.whatsappConfig.phoneNumberId) {
    steps.push('Configure WhatsApp Phone Number ID');
  }
  if (!validation.whatsappConfig.accessToken) {
    steps.push('Configure WhatsApp Access Token');
  }
  if (!validation.flowConfig.appSecret) {
    steps.push('Configure Meta App Secret from Developers Console');
  }
  if (!validation.flowConfig.publicKey || !validation.flowConfig.privateKey) {
    steps.push('Generate encryption keys');
  }
  if (!validation.flowConfig.passphrase) {
    steps.push('Set encryption passphrase');
  }
  if (validation.flowConfig.keyStatus === 'GENERATED') {
    steps.push('Upload public key to WhatsApp');
  }

  return steps;
}

// 5. COMPREHENSIVE TEST ENDPOINT
router.post('/test/full-simulation', [auth, checkTenant], async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const { publicKey, privateKey, passphrase } = tenant.flowConfig || {};
    const appSecret = tenant.whatsappConfig?.appSecret || process.env.APP_SECRET;

    if (!publicKey || !privateKey || !passphrase) {
      return res.status(400).json({
        success: false,
        message: 'Encryption keys not configured'
      });
    }

    console.log('🧪 Starting full WhatsApp Flow simulation...');

    // Test data that WhatsApp might send
    const testFlowData = {
      action: "ping",
      screen: "",
      version: "3.0",
      data: {}
    };

    // Step 1: Generate AES key (like WhatsApp does)
    const aesKey = crypto.randomBytes(16); // 128-bit AES key
    const iv = crypto.randomBytes(12);     // 96-bit IV for GCM

    // Step 2: Encrypt flow data with AES-GCM
    const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, iv);
    let encryptedFlowData = cipher.update(JSON.stringify(testFlowData), 'utf8');
    encryptedFlowData = Buffer.concat([encryptedFlowData, cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combinedFlowData = Buffer.concat([encryptedFlowData, authTag]);

    // Step 3: Encrypt AES key with RSA public key
    const encryptedAesKey = crypto.publicEncrypt({
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    }, aesKey);

    // Step 4: Create request body (like WhatsApp sends)
    const requestBody = {
      encrypted_aes_key: encryptedAesKey.toString('base64'),
      encrypted_flow_data: combinedFlowData.toString('base64'),
      initial_vector: iv.toString('base64')
    };

    console.log('🧪 Simulated request created, testing decryption...');

    // Step 5: Test our decryption function
    const { decryptRequest } = require('./flowEndpoint');
    const decryptionResult = decryptRequest(requestBody, privateKey, passphrase);

    // Step 6: Verify decryption worked
    if (JSON.stringify(decryptionResult.decryptedBody) !== JSON.stringify(testFlowData)) {
      throw new Error('Decryption result does not match original data');
    }

    console.log('✅ Full simulation test passed');

    res.json({
      success: true,
      message: 'Full WhatsApp Flow simulation passed successfully',
      testResults: {
        originalData: testFlowData,
        decryptedData: decryptionResult.decryptedBody,
        encryptionSizes: {
          aesKey: encryptedAesKey.length,
          flowData: combinedFlowData.length,
          iv: iv.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Full simulation failed:', error);
    res.status(400).json({
      success: false,
      message: 'Full simulation test failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.post('/debug/test-app-secret', [auth, checkTenant], async (req, res) => {
  try {
    const { testAppSecret, sampleRequestBody } = req.body;
    
    if (!testAppSecret) {
      return res.status(400).json({
        success: false,
        message: 'testAppSecret is required'
      });
    }

    // Get the last failed request from logs to test against
    const tenant = await Tenant.findById(req.user.tenant_id);
    
    // Test signature calculation with the provided App Secret
    const testBody = sampleRequestBody || '{"test": "data"}';
    const testBodyBuffer = Buffer.from(testBody, 'utf8');
    
    const calculatedSignature = crypto
      .createHmac("sha256", testAppSecret)
      .update(testBodyBuffer)
      .digest("hex");

    console.log(`Testing App Secret: ${testAppSecret.substring(0, 8)}...`);
    console.log(`Calculated signature: ${calculatedSignature}`);

    res.json({
      success: true,
      testAppSecret: testAppSecret.substring(0, 8) + '...',
      calculatedSignature,
      instructions: 'Compare this signature with the "received" signature from your logs'
    });

  } catch (error) {
    console.error('App Secret test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test App Secret',
      error: error.message
    });
  }
});

// Endpoint to capture and store failed signature attempts for debugging
router.post('/debug/capture-failed-request', [auth, checkTenant], async (req, res) => {
  try {
    const { receivedSignature, expectedSignature, body, headers } = req.body;
    
    // Store this in your tenant for debugging
    await Tenant.findByIdAndUpdate(req.user.tenant_id, {
      $set: {
        'flowConfig.lastFailedSignature': {
          receivedSignature,
          expectedSignature,
          body,
          headers,
          timestamp: new Date()
        }
      }
    });

    res.json({
      success: true,
      message: 'Failed request captured for debugging'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/keys/status', [auth, checkTenant], async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const flowConfig = tenant.flowConfig || {};
    const whatsappConfig = tenant.whatsappConfig || {};

    // Check configuration completeness for SaaS
    const configurationSteps = {
      whatsappConfig: !!(whatsappConfig.phoneNumberId && whatsappConfig.accessToken),
      keyGeneration: !!(flowConfig.publicKey && flowConfig.privateKey),
      appSecretConfig: !!flowConfig.appSecret, // SaaS: App Secret in flowConfig
      keyUpload: flowConfig.keyStatus === 'VALID' || flowConfig.keyStatus === 'UPLOADED',
      healthCheck: !!flowConfig.lastHealthCheck
    };

    res.json({
      success: true,
      publicKey: !!flowConfig.publicKey,
      status: flowConfig.keyStatus || 'NOT_GENERATED',
      lastChecked: flowConfig.keyCheckedAt || flowConfig.lastHealthCheck,
      configurationSteps,
      keyInfo: {
        hasPrivateKey: !!flowConfig.privateKey,
        hasPassphrase: !!flowConfig.passphrase,
        hasAppSecret: !!flowConfig.appSecret, // SaaS: Only tenant app secret
        keysGenerated: flowConfig.keysGenerated,
        keyUploadedAt: flowConfig.keyUploadedAt,
        appSecretConfigured: flowConfig.appSecretConfigured || false
      }
    });

  } catch (error) {
    console.error('Key status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check key status',
      error: error.message
    });
  }
});

router.delete('/app-secret', [auth, checkTenant], async (req, res) => {
  try {
    await Tenant.findByIdAndUpdate(req.user.tenant_id, {
      $unset: {
        'flowConfig.appSecret': '',
        'flowConfig.appSecretConfigured': '',
        'flowConfig.appSecretUpdatedAt': ''
      }
    });

    res.json({
      success: true,
      message: 'App Secret cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing App Secret:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear App Secret',
      error: error.message
    });
  }
});

// Also add the health verification endpoint
router.get('/health/verify', [auth, checkTenant], async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant_id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Update health check timestamp
    await Tenant.findByIdAndUpdate(tenant._id, {
      $set: {
        'flowConfig.lastHealthCheck': new Date()
      }
    });

    res.json({
      success: true,
      message: 'Health check verification successful',
      status: 'VERIFIED',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Health verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify health check',
      error: error.message
    });
  }
});

router.post('/debug/test-app-secret', [auth, checkTenant], async (req, res) => {
  try {
    const { testAppSecret, testPayload } = req.body;
    
    if (!testAppSecret || !testPayload) {
      return res.status(400).json({
        success: false,
        message: 'testAppSecret and testPayload are required'
      });
    }

    const tenant = await Tenant.findById(req.user.tenant_id);
    const currentAppSecret = tenant.flowConfig?.appSecret || process.env.APP_SECRET;

    // Test with current app secret
    const currentSignature = crypto
      .createHmac("sha256", currentAppSecret)
      .update(testPayload, 'utf8')
      .digest("hex");

    // Test with provided app secret
    const testSignature = crypto
      .createHmac("sha256", testAppSecret)
      .update(testPayload, 'utf8')
      .digest("hex");

    console.log(`Testing App Secrets for tenant: ${req.user.tenant_id}`);
    console.log(`Current: ${currentAppSecret?.substring(0, 8)}...`);
    console.log(`Test: ${testAppSecret.substring(0, 8)}...`);

    res.json({
      success: true,
      currentAppSecret: {
        preview: currentAppSecret?.substring(0, 8) + '...',
        signature: currentSignature,
        length: currentAppSecret?.length || 0
      },
      testAppSecret: {
        preview: testAppSecret.substring(0, 8) + '...',
        signature: testSignature,
        length: testAppSecret.length
      },
      match: currentSignature === testSignature,
      instructions: 'Compare signatures with the received signature from your failed requests'
    });

  } catch (error) {
    console.error('App Secret test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test App Secret',
      error: error.message
    });
  }
});

router.post('/app-secret', [auth, checkTenant], async (req, res) => {
  try {
    const { appSecret } = req.body;

    if (!appSecret || appSecret.length < 16) {
      return res.status(400).json({
        success: false,
        message: 'App Secret must be at least 16 characters long'
      });
    }

    // Validate App Secret format (should be hex)
    if (!/^[a-fA-F0-9]+$/.test(appSecret)) {
      return res.status(400).json({
        success: false,
        message: 'App Secret must be a valid hexadecimal string'
      });
    }

    await Tenant.findByIdAndUpdate(req.user.tenant_id, {
      $set: {
        'flowConfig.appSecret': appSecret,
        'flowConfig.appSecretConfigured': true,
        'flowConfig.appSecretUpdatedAt': new Date()
      }
    });

    console.log('✅ App Secret configured for tenant:', req.user.tenant_id);

    res.json({
      success: true,
      message: 'App Secret configured successfully'
    });

  } catch (error) {
    console.error('❌ App Secret configuration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to configure App Secret',
      error: error.message
    });
  }
});

module.exports = router;
