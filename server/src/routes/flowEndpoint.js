// routes/flowEndpoint.js - Complete SaaS Multi-Tenant Flow Endpoint
const express = require('express');
const crypto = require('crypto');
const Tenant = require('../models/Tenant');
const tenantCache = new Map();
const TENANT_CACHE_TTL = 15 * 60 * 1000;
const router = express.Router();
const tenantRateLimits = new Map();

// Custom exception for Flow endpoint errors
class FlowEndpointException extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'FlowEndpointException';
    this.statusCode = statusCode;
  }
}

// Decrypt request handler
function decryptRequest(body, privateKeyString, passphrase) {
  try {
    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

    if (!privateKeyString) {
      throw new FlowEndpointException(421, "Private key not found");
    }

    const keyOptions = {
      key: privateKeyString,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    };

    if (passphrase && passphrase.length > 0) {
      keyOptions.passphrase = passphrase;
    }

    console.log("Attempting to decrypt with key format:",
                privateKeyString.substring(0, 27) + "..." +
                privateKeyString.substring(privateKeyString.length - 24));

    let decryptedAesKey;
    try {
      decryptedAesKey = crypto.privateDecrypt(
        keyOptions,
        Buffer.from(encrypted_aes_key, "base64")
      );
    } catch (decryptError) {
      console.error("AES key decryption error details:", {
        message: decryptError.message,
        code: decryptError.code,
        opensslErrors: decryptError.opensslErrorStack || []
      });
      throw new FlowEndpointException(421, "Failed to decrypt AES key");
    }

    const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
    const initialVectorBuffer = Buffer.from(initial_vector, "base64");
    const TAG_LENGTH = 16;

    const encrypted_flow_data_body = flowDataBuffer.subarray(0, -TAG_LENGTH);
    const encrypted_flow_data_tag = flowDataBuffer.subarray(-TAG_LENGTH);

    const decipher = crypto.createDecipheriv(
      "aes-128-gcm",
      decryptedAesKey,
      initialVectorBuffer
    );
    decipher.setAuthTag(encrypted_flow_data_tag);

    const decryptedJSONString = Buffer.concat([
      decipher.update(encrypted_flow_data_body),
      decipher.final(),
    ]).toString("utf-8");

    return {
      decryptedBody: JSON.parse(decryptedJSONString),
      aesKeyBuffer: decryptedAesKey,
      initialVectorBuffer,
    };
  } catch (error) {
    if (error instanceof FlowEndpointException) {
      throw error;
    }
    console.error("Decryption error:", error);
    throw new FlowEndpointException(421, "Failed to decrypt request");
  }
}

// Encrypt response handler
function encryptResponse(response, aesKeyBuffer, initialVectorBuffer) {
  try {
    const flipped_iv = Buffer.alloc(initialVectorBuffer.length);
    for (let i = 0; i < initialVectorBuffer.length; i++) {
      flipped_iv[i] = ~initialVectorBuffer[i];
    }

    const cipher = crypto.createCipheriv(
      "aes-128-gcm",
      aesKeyBuffer,
      flipped_iv
    );

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(response), "utf-8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

    return encrypted.toString("base64");
  } catch (error) {
    console.error("Encryption error:", error);
    throw new FlowEndpointException(500, "Failed to encrypt response");
  }
}

// Validate request signature
function isRequestSignatureValid(req, appSecret) {
  if (req.path === '/health' ||
      req.path.includes('/health') ||
      req.method === 'GET' ||
      req.body?.action === 'ping') {
    console.log('Health check request - bypassing signature validation');
    return true;
  }

  if (!appSecret) {
    console.warn("App Secret is not set. Allowing request (not recommended for production)");
    return true;
  }

  // Check if request is coming through AWS ALB
  const isFromALB = req.get('x-amzn-trace-id') !== undefined;

  if (isFromALB) {
    console.log('⚠️ Request coming through AWS ALB - known to modify request bodies');
    console.log('⚠️ ALB modifies requests which breaks HMAC signature validation');
    console.log('⚠️ Consider: 1) Moving to direct connection, or 2) Using AWS API Gateway with signature validation');

    if (!req.body || typeof req.body !== 'object') {
      console.error('❌ Invalid request body structure');
      return false;
    }

    const hasFlowFields = req.body.encrypted_flow_data &&
                         req.body.encrypted_aes_key &&
                         req.body.initial_vector;

    if (!hasFlowFields) {
      console.error('❌ Missing required Flow encryption fields');
      return false;
    }

    const userAgent = req.get('user-agent') || '';
    const isMetaUA = userAgent.toLowerCase().includes('meta') ||
                     userAgent.toLowerCase().includes('facebook') ||
                     userAgent.toLowerCase().includes('whatsapp');

    if (!isMetaUA) {
      console.warn('⚠️ User-Agent does not appear to be from Meta:', userAgent);
    }

    const clientIP = req.get('x-real-ip') || req.get('x-forwarded-for')?.split(',')[0];
    console.log('Request from IP:', clientIP);

    console.log('✅ Request structure validated (signature check skipped due to ALB)');
    return true;
  }

  const signatureHeader256 = req.get("x-hub-signature-256");
  const signatureHeader = req.get("x-hub-signature");
  const headerToUse = signatureHeader256 || signatureHeader;

  if (!headerToUse) {
    console.error("No signature header found");
    return false;
  }

  if (!req.rawBody) {
    console.error("Request body is empty or not properly captured");
    return false;
  }

  try {
    const receivedSignature = headerToUse.replace(/^(sha256=|sha1=)/, "");
    const bodyForHashing = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);

    let expectedSignature = crypto
      .createHmac("sha256", appSecret)
      .update(bodyForHashing)
      .digest("hex");

    let isValid = false;

    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(receivedSignature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch (e) {
      expectedSignature = crypto
        .createHmac("sha1", appSecret)
        .update(bodyForHashing)
        .digest("hex");

      try {
        isValid = crypto.timingSafeEqual(
          Buffer.from(receivedSignature, "hex"),
          Buffer.from(expectedSignature, "hex")
        );
      } catch (e2) {
        console.error("Both SHA256 and SHA1 validation failed");
      }
    }

    if (isValid) {
      console.log("✅ Signature validation passed");
      return true;
    }

    console.log("❌ Signature validation failed");
    return false;

  } catch (error) {
    console.error("Signature validation error:", error);
    return false;
  }
}

// Flow logic handler
async function getNextScreen(decryptedBody, tenant) {
  const { screen, data, version, action, flow_token } = decryptedBody;

  console.log("DETAILED FLOW REQUEST:", {
    action,
    screen,
    version,
    flow_token: flow_token ? flow_token.substring(0, 8) + '...' : null,
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    tenant: tenant._id,
    fullDecryptedBody: JSON.stringify(decryptedBody, null, 2)
  });

  // Health check
  if (action === "ping") {
    console.log("Health check ping received");
    return {
      data: {
        status: "active",
      },
    };
  }

  // Error handling
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        acknowledged: true,
      },
    };
  }

  if (action === "INIT") {
    console.log("PROCESSING INIT REQUEST - flow_token:", flow_token);

    try {
        const FlowToken = require('../models/FlowToken');
        const tokenRecord = await FlowToken.findOne({ 
            token: flow_token,
            status: 'active'
        });

        console.log("Flow token record found:", JSON.stringify(tokenRecord?.contextData));

        // ✅ Check contextData flag instead of flowType
        if (tokenRecord?.contextData?.isQuestionsFlow === true) {
            console.log("Returning speakers for QUESTIONS screen");
            return {
                screen: "QUESTIONS",
                data: {
                    speakers: [
                        { id: 'vijaya', title: 'Vijaya Mahadevan - Founder of Vaseegara Vedha' },
                        { id: 'sudhan', title: 'Sudhan P - Director, Sudhan Holdings' },
                        { id: 'habib', title: 'Habib - Director, LinkMeU' },
                        { id: 'srikanth', title: 'Srikanth - Director, Super Deluxe Kitchen' },
                        { id: 'rithik', title: 'Rithik Pandian - CEO, Zap Creations Media' },
                        { id: 'naresh', title: 'Naresh - Content Creator' },
                        { id: 'sree', title: 'Sree Karthikeyan - CEO & Founder, Tech Vaseegrah' }
                    ]
                }
            };
        }
    } catch(e) {
        console.log("Could not look up flow token:", e.message);
    }

    // ✅ Default order flow - untouched
    const stateData = [
        {"id": "AP", "title": "Andhra Pradesh"},
        {"id": "AR", "title": "Arunachal Pradesh"},
        {"id": "AS", "title": "Assam"},
        {"id": "BR", "title": "Bihar"},
        {"id": "CT", "title": "Chhattisgarh"},
        {"id": "GA", "title": "Goa"},
        {"id": "GJ", "title": "Gujarat"},
        {"id": "HR", "title": "Haryana"},
        {"id": "HP", "title": "Himachal Pradesh"},
        {"id": "JH", "title": "Jharkhand"},
        {"id": "KA", "title": "Karnataka"},
        {"id": "KL", "title": "Kerala"},
        {"id": "MP", "title": "Madhya Pradesh"},
        {"id": "MH", "title": "Maharashtra"},
        {"id": "MN", "title": "Manipur"},
        {"id": "ML", "title": "Meghalaya"},
        {"id": "MZ", "title": "Mizoram"},
        {"id": "NL", "title": "Nagaland"},
        {"id": "OR", "title": "Odisha"},
        {"id": "PB", "title": "Punjab"},
        {"id": "RJ", "title": "Rajasthan"},
        {"id": "SK", "title": "Sikkim"},
        {"id": "TN", "title": "Tamil Nadu"},
        {"id": "TG", "title": "Telangana"},
        {"id": "TR", "title": "Tripura"},
        {"id": "UP", "title": "Uttar Pradesh"},
        {"id": "UT", "title": "Uttarakhand"},
        {"id": "WB", "title": "West Bengal"},
        {"id": "AN", "title": "Andaman and Nicobar Islands"},
        {"id": "CH", "title": "Chandigarh"},
        {"id": "DN", "title": "Dadra and Nagar Haveli and Daman and Diu"},
        {"id": "DL", "title": "Delhi"},
        {"id": "JK", "title": "Jammu and Kashmir"},
        {"id": "LA", "title": "Ladakh"},
        {"id": "LD", "title": "Lakshadweep"},
        {"id": "PY", "title": "Puducherry"}
    ];

    return {
        screen: "DETAILS",
        data: { state: stateData }
    };
}


  // Data exchange logic
  if (action === "data_exchange") {
    console.log("PROCESSING DATA EXCHANGE:", {
      screen,
      dataReceived: data,
      dataKeys: data ? Object.keys(data) : []
    });

    switch (screen) {

      // ✅ Digital Sakthi: Handle speaker question submission
      case "QUESTIONS": {
        const { speaker, question } = data || {};

        console.log("✅ QUESTIONS submission received:", { speaker, question, flow_token });

        // Save to DB - try/catch so a DB error doesn't break the flow response
        try {
          const mongoose = require('mongoose');

          // Use a simple dynamic model if FlowSubmission model doesn't exist
          let FlowSubmission;
          try {
            FlowSubmission = mongoose.model('FlowSubmission');
          } catch (e) {
            const submissionSchema = new mongoose.Schema({
              tenantId: String,
              flowToken: String,
              screen: String,
              speaker: String,
              question: String,
              submittedAt: { type: Date, default: Date.now }
            });
            FlowSubmission = mongoose.model('FlowSubmission', submissionSchema);
          }

          await FlowSubmission.create({
            tenantId: tenant._id.toString(),
            flowToken: flow_token,
            screen: 'QUESTIONS',
            speaker,
            question,
            submittedAt: new Date()
          });

          console.log(`✅ Question saved to DB: speaker=${speaker}, question=${question}`);
        } catch (dbError) {
          console.error('⚠️ Failed to save question to DB (flow will still complete):', dbError.message);
        }

        // Return SUCCESS to close the flow on the user's phone
        return {
          screen: "SUCCESS",
          data: {
            extension_message_response: {
              params: {
                flow_token,
                speaker,
                question,
                status: 'submitted'
              }
            }
          }
        };
      }

      case "DETAILS": {
        console.log("Form submission received:", data);

        const requiredFields = ['name', 'address', 'zip_code', 'city', 'state', 'country', 'phone_number'];
        const missingFields = requiredFields.filter(field => !data || !data[field]);

        if (missingFields.length > 0) {
          console.warn("Form validation failed:", missingFields);
          return {
            screen: "DETAILS",
            data: {
              error: `Missing: ${missingFields.join(', ')}`
            }
          };
        }

        const customerDetails = {
          name: data.name,
          address: data.address,
          zip_code: data.zip_code,
          city: data.city,
          state: data.state,
          country: data.country,
          phone_number: data.phone_number,
          submitted_at: new Date().toISOString()
        };

        return {
          screen: "SUCCESS",
          data: {
            extension_message_response: {
              params: {
                flow_token,
                order_confirmed: true,
                order_id: 'ORD-' + Date.now(),
                status: 'completed',
                customer_details: customerDetails
              }
            }
          }
        };
      }

      default:
        console.error(`Unknown screen in data_exchange: ${screen}`);
        throw new Error(`Unhandled screen: ${screen}`);
    }
  }

  console.error(`Unknown action: ${action}`);
  throw new Error(`Unhandled flow request: action=${action}, screen=${screen || 'none'}`);
}

// Rate limiting
function checkTenantRateLimit(tenantId) {
  const now = Date.now();
  const limit = 100;
  const window = 60 * 1000;

  if (!tenantRateLimits.has(tenantId)) {
    tenantRateLimits.set(tenantId, []);
  }

  const requests = tenantRateLimits.get(tenantId);

  while (requests.length > 0 && requests[0] < now - window) {
    requests.shift();
  }

  if (requests.length >= limit) {
    return false;
  }

  requests.push(now);
  return true;
}

// Debug middleware
router.use('/:tenantId', (req, res, next) => {
  console.log('FLOW REQUEST DEBUG:', {
    method: req.method,
    path: req.path,
    tenantId: req.params.tenantId,
    headers: Object.keys(req.headers),
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    rawBodySize: req.rawBody ? req.rawBody.length : 0,
    timestamp: new Date().toISOString()
  });
  next();
});

// MAIN FLOW ENDPOINT - SaaS Multi-Tenant Version
router.post('/:tenantId', async (req, res) => {
  const requestedTenantId = req.params.tenantId;

  try {
    console.log(`Flow endpoint called with tenant ID: ${requestedTenantId}`);

    if (req.body?.action === 'ping') {
      console.log("Health check ping detected - responding immediately");
      return res.json({
        data: {
          status: "active"
        }
      });
    }

    const tenants = await Tenant.find({
      'flowConfig.privateKey': { $exists: true },
      'flowConfig.keyStatus': { $in: ['VALID', 'UPLOADED', 'GENERATED'] }
    }).select('_id name flowConfig whatsappConfig');

    console.log(`Found ${tenants.length} tenants with flow configuration`);

    if (tenants.length === 0) {
      return res.status(404).send('No configured tenants found');
    }

    let matchedTenant = null;
    let decryptedRequest = null;

    const requestedTenant = tenants.find(t => t._id.toString() === requestedTenantId);
    if (requestedTenant) {
      console.log(`Trying requested tenant: ${requestedTenant._id} (${requestedTenant.name || 'Unnamed'})`);

      try {
        const appSecret = requestedTenant.flowConfig?.appSecret ||
                         requestedTenant.whatsappConfig?.appSecret ||
                         process.env.APP_SECRET;

        if (isRequestSignatureValid(req, appSecret)) {
          console.log(`Signature valid for requested tenant: ${requestedTenant._id}`);

          decryptedRequest = decryptRequest(
            req.body,
            requestedTenant.flowConfig.privateKey,
            requestedTenant.flowConfig.passphrase
          );

          matchedTenant = requestedTenant;
          console.log(`Successfully matched requested tenant: ${matchedTenant._id}`);
        }
      } catch (error) {
        console.log(`Failed to process with requested tenant ${requestedTenant._id}:`, error.message);
      }
    }

    if (!matchedTenant || !decryptedRequest) {
      return res.status(421).send('Unable to process request for the requested tenant configuration');
    }

    console.log(`Processing flow with tenant: ${matchedTenant._id} (${matchedTenant.name || 'Unnamed'})`);

    const screenResponse = await getNextScreen(decryptedRequest.decryptedBody, matchedTenant);

    const encryptedResponse = encryptResponse(
      screenResponse,
      decryptedRequest.aesKeyBuffer,
      decryptedRequest.initialVectorBuffer
    );

    console.log(`Flow response sent successfully for tenant: ${matchedTenant._id}`);
    res.send(encryptedResponse);

  } catch (error) {
    console.error(`Flow endpoint error for requested tenant ${requestedTenantId}:`, {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode
    });

    if (error instanceof FlowEndpointException) {
      return res.status(error.statusCode).send(error.message);
    }

    res.status(500).send('Internal server error');
  }
});

// Auto-detect endpoint
router.post('/auto-detect', async (req, res) => {
  try {
    if (req.body?.action === 'ping') {
      return res.json({ data: { status: "active" } });
    }

    const tenants = await Tenant.find({
      'flowConfig.privateKey': { $exists: true },
      'flowConfig.keyStatus': { $in: ['VALID', 'UPLOADED', 'GENERATED'] }
    }).select('_id name flowConfig whatsappConfig');

    let matchedTenant = null;
    let decryptedRequest = null;

    for (const tenant of tenants) {
      try {
        const appSecret = tenant.flowConfig?.appSecret ||
                         tenant.whatsappConfig?.appSecret ||
                         process.env.APP_SECRET;

        if (isRequestSignatureValid(req, appSecret)) {
          decryptedRequest = decryptRequest(
            req.body,
            tenant.flowConfig.privateKey,
            tenant.flowConfig.passphrase
          );
          matchedTenant = tenant;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!matchedTenant) {
      return res.status(421).send('No tenant could handle this request');
    }

    const screenResponse = await getNextScreen(decryptedRequest.decryptedBody, matchedTenant);
    const encryptedResponse = encryptResponse(
      screenResponse,
      decryptedRequest.aesKeyBuffer,
      decryptedRequest.initialVectorBuffer
    );

    res.send(encryptedResponse);

  } catch (error) {
    console.error('Auto-detect flow error:', error);
    res.status(500).send('Internal server error');
  }
});

// Health check endpoints
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'active',
    timestamp: new Date().toISOString(),
    message: 'Flow endpoint is functioning correctly'
  });
});

router.get('/health/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;

  try {
    const tenant = await Tenant.findOne({
      $or: [
        { _id: tenantId },
        { 'whatsappConfig.businessAccountId': tenantId },
        { 'whatsappConfig.phoneNumberId': tenantId }
      ]
    }).select('_id flowConfig whatsappConfig');

    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }

    await Tenant.findByIdAndUpdate(tenant._id, {
      $set: {
        'flowConfig.lastHealthCheck': new Date(),
        'flowConfig.healthCheckStatus': 'healthy'
      }
    });

    res.json({
      status: 'active',
      tenant_id: tenant._id,
      timestamp: new Date().toISOString(),
      keyStatus: tenant.flowConfig?.keyStatus || 'PENDING',
      configured: {
        publicKey: !!tenant.flowConfig?.publicKey,
        privateKey: !!tenant.flowConfig?.privateKey,
        passphrase: !!tenant.flowConfig?.passphrase,
        appSecret: !!(tenant.flowConfig?.appSecret || tenant.whatsappConfig?.appSecret)
      }
    });

  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

router.get('/debug/tenants', async (req, res) => {
  try {
    const tenants = await Tenant.find({}).select('_id name flowConfig.keyStatus flowConfig.appSecret whatsappConfig.businessAccountId whatsappConfig.appSecret');

    res.json({
      totalTenants: tenants.length,
      tenants: tenants.map(t => ({
        id: t._id.toString(),
        name: t.name || 'Unnamed',
        keyStatus: t.flowConfig?.keyStatus || 'Not configured',
        businessAccountId: t.whatsappConfig?.businessAccountId || 'None'
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tenantCache.entries()) {
    if (now - value.timestamp > TENANT_CACHE_TTL) {
      tenantCache.delete(key);
    }
  }
}, 60000);

module.exports = router;

