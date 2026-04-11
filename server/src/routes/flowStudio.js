const express = require('express');
const axios = require('axios');
const FlowStudio = require('../models/FlowStudio');
const FlowTrigger = require('../models/FlowTrigger');
const Tenant = require('../models/Tenant');

const router = express.Router();

function createTerminalFlowJson({ version = '3.1', includeDataApiVersion = false, screenId, title, children, submitLabel, payload }) {
  return {
    version,
    ...(includeDataApiVersion ? { data_api_version: '3.0' } : {}),
    screens: [
      {
        id: screenId,
        title,
        terminal: true,
        data: {},
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'Form',
              name: 'form',
              children: [
                ...children,
                {
                  type: 'Footer',
                  label: submitLabel,
                  'on-click-action': {
                    name: 'complete',
                    payload
                  }
                }
              ]
            }
          ]
        }
      }
    ]
  };
}

const FLOW_TEMPLATES = [
  {
    key: 'lead_generation',
    name: 'Lead Generation',
    category: 'lead_generation',
    requiresEndpoint: true,
    description: 'Capture customer details and route qualified leads into GoWhats.',
    screens: [{ id: 'LEAD_FORM', title: 'Lead Form', type: 'form', summary: 'Name, phone, budget, interest' }],
    samplePayload: { name: '', phone: '', budget: '', interest: '' },
    flowJson: createTerminalFlowJson({
      includeDataApiVersion: true,
      screenId: 'LEAD_FORM',
      title: 'Lead Registration',
      submitLabel: 'Submit Lead',
      children: [
        { type: 'TextHeading', text: 'Tell us a little about your requirement' },
        { type: 'TextBody', text: 'We will capture your details and reach out with the right offer.' },
        { type: 'TextInput', required: true, label: 'Full Name', name: 'name' },
        { type: 'TextInput', required: true, label: 'Phone Number', name: 'phone' },
        { type: 'TextInput', required: false, label: 'Budget', name: 'budget' },
        { type: 'TextArea', required: true, label: 'What are you interested in?', name: 'interest' }
      ],
      payload: {
        name: '${form.name}', phone: '${form.phone}',
        budget: '${form.budget}', interest: '${form.interest}',
        flow_key: 'lead_generation'
      }
    }),
    responseMapping: [
      { sourceField: 'name', targetField: 'contact.name', required: true },
      { sourceField: 'phone', targetField: 'contact.phone', required: true },
      { sourceField: 'interest', targetField: 'lead.interest', required: false }
    ]
  },
  {
    key: 'appointment_booking',
    name: 'Appointment Booking',
    category: 'appointment_booking',
    requiresEndpoint: true,
    description: 'Guide customers through appointment slots and capture booking intent.',
    screens: [{ id: 'APPOINTMENT', title: 'Appointment', type: 'form', summary: 'Department, date, time' }],
    samplePayload: { department: '', date: '', time: '', customer_name: '' },
    flowJson: createTerminalFlowJson({
      includeDataApiVersion: true,
      screenId: 'APPOINTMENT',
      title: 'Appointment Booking',
      submitLabel: 'Book Appointment',
      children: [
        { type: 'TextHeading', text: 'Book your appointment' },
        { type: 'TextBody', text: 'Share the department, preferred date, and time. Our team will confirm shortly.' },
        { type: 'TextInput', required: true, label: 'Customer Name', name: 'customer_name' },
        { type: 'TextInput', required: true, label: 'Department', name: 'department' },
        { type: 'TextInput', required: true, label: 'Preferred Date', name: 'date' },
        { type: 'TextInput', required: true, label: 'Preferred Time', name: 'time' }
      ],
      payload: {
        customer_name: '${form.customer_name}', department: '${form.department}',
        date: '${form.date}', time: '${form.time}',
        flow_key: 'appointment_booking'
      }
    }),
    responseMapping: [
      { sourceField: 'department', targetField: 'booking.department', required: true },
      { sourceField: 'date', targetField: 'booking.date', required: true },
      { sourceField: 'time', targetField: 'booking.time', required: true }
    ]
  },
  {
    key: 'customer_support',
    name: 'Customer Support',
    category: 'customer_support',
    requiresEndpoint: false,
    description: 'Collect issue type and route support conversations without endpoint logic.',
    screens: [{ id: 'SUPPORT', title: 'Support Request', type: 'form', summary: 'Issue category and description' }],
    samplePayload: { issue_type: '', order_id: '', message: '' },
    flowJson: createTerminalFlowJson({
      screenId: 'SUPPORT',
      title: 'Support Request',
      submitLabel: 'Submit',
      children: [
        { type: 'TextHeading', text: 'Need help?' },
        { type: 'TextInput', required: true, label: 'Issue Type', name: 'issue_type' },
        { type: 'TextInput', required: false, label: 'Order ID', name: 'order_id' },
        { type: 'TextArea', required: true, label: 'Describe your issue', name: 'message' },
        { type: 'TextBody', text: 'We will respond as soon as possible.' }
      ],
      payload: {
        issue_type: '${form.issue_type}', order_id: '${form.order_id}',
        message: '${form.message}', flow_key: 'customer_support'
      }
    }),
    responseMapping: [
      { sourceField: 'issue_type', targetField: 'support.issueType', required: true },
      { sourceField: 'order_id', targetField: 'support.orderId', required: false },
      { sourceField: 'message', targetField: 'support.message', required: true }
    ]
  },
  {
    key: 'shopping',
    name: 'Shopping',
    category: 'shopping',
    requiresEndpoint: true,
    description: 'Support product choice, delivery selection, and checkout handoff.',
    screens: [{ id: 'ORDER_DETAILS', title: 'Order Details', type: 'form', summary: 'Product, quantity, and shipping info' }],
    samplePayload: { product_id: '', quantity: 1, city: '', pincode: '' },
    flowJson: createTerminalFlowJson({
      includeDataApiVersion: true,
      screenId: 'ORDER_DETAILS',
      title: 'Order Details',
      submitLabel: 'Continue',
      children: [
        { type: 'TextHeading', text: 'Share your order details' },
        { type: 'TextInput', required: true, label: 'Product ID', name: 'product_id' },
        { type: 'TextInput', required: true, label: 'Quantity', name: 'quantity' },
        { type: 'TextInput', required: true, label: 'City', name: 'city' },
        { type: 'TextInput', required: true, label: 'Pincode', name: 'pincode' }
      ],
      payload: {
        product_id: '${form.product_id}', quantity: '${form.quantity}',
        city: '${form.city}', pincode: '${form.pincode}',
        flow_key: 'shopping'
      }
    }),
    responseMapping: [
      { sourceField: 'product_id', targetField: 'cart.productId', required: true },
      { sourceField: 'quantity', targetField: 'cart.quantity', required: true },
      { sourceField: 'pincode', targetField: 'shipping.pincode', required: true }
    ]
  },
  {
    key: 'survey',
    name: 'Survey',
    category: 'survey',
    requiresEndpoint: false,
    description: 'Capture customer feedback, CSAT, or internal survey responses quickly.',
    screens: [{ id: 'SURVEY_SCREEN', title: 'Survey', type: 'questionnaire', summary: 'Rating and remarks' }],
    samplePayload: { rating: '', comments: '' },
    flowJson: createTerminalFlowJson({
      screenId: 'SURVEY_SCREEN',
      title: 'Customer Feedback',
      submitLabel: 'Send Feedback',
      children: [
        { type: 'TextHeading', text: 'Rate your experience' },
        {
          type: 'RadioButtonsGroup',
          required: true,
          name: 'rating',
          'data-source': [
            { id: '5', title: '5 - Excellent' }, { id: '4', title: '4 - Good' },
            { id: '3', title: '3 - Average' }, { id: '2', title: '2 - Poor' },
            { id: '1', title: '1 - Very Poor' }
          ]
        },
        { type: 'TextArea', required: false, label: 'Comments', name: 'comments' }
      ],
      payload: { rating: '${form.rating}', comments: '${form.comments}', flow_key: 'survey' }
    }),
    responseMapping: [
      { sourceField: 'rating', targetField: 'feedback.rating', required: true },
      { sourceField: 'comments', targetField: 'feedback.comments', required: false }
    ]
  }
];

const META_GRAPH_BASE_URL = process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com';
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v22.0';
const PUBLIC_BASE_URL_KEYS = ['FLOW_PUBLIC_BASE_URL', 'PUBLIC_BASE_URL', 'APP_URL', 'BASE_URL'];

function getTenantId(req) {
  return req.user?.tenantId || req.user?.tenant_id;
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'flow';
}

function getConfiguredBaseUrl() {
  const configuredBaseUrl = PUBLIC_BASE_URL_KEYS.map((key) => process.env[key]).find((value) => String(value || '').trim());
  return configuredBaseUrl ? String(configuredBaseUrl).trim().replace(/\/$/, '') : '';
}

function getRequestBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  return `${protocol}://${req.get('host')}`;
}

function getBaseUrl(req) {
  return getConfiguredBaseUrl() || getRequestBaseUrl(req);
}

function buildEndpointUriFromBase(baseUrl, tenantId) {
  return `${String(baseUrl || '').replace(/\/$/, '')}/flow-endpoint/${tenantId}`;
}

function buildHealthUriFromBase(baseUrl, tenantId) {
  return `${String(baseUrl || '').replace(/\/$/, '')}/flow-endpoint/health/${tenantId}`;
}

function buildTenantEndpointUri(req, tenantId) {
  return buildEndpointUriFromBase(getBaseUrl(req), tenantId);
}

function buildHealthUri(req, tenantId) {
  return buildHealthUriFromBase(getBaseUrl(req), tenantId);
}

function isLocalHostName(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(String(hostname || '').toLowerCase());
}

function validateMetaEndpointUri(endpointUri) {
  if (!endpointUri) throw new Error('Endpoint URI is missing');

  let parsedUrl;
  try {
    parsedUrl = new URL(endpointUri);
  } catch (error) {
    throw new Error('Endpoint URI is not a valid URL');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Meta requires an HTTPS endpoint URI for flow publishing');
  }

  if (isLocalHostName(parsedUrl.hostname)) {
    throw new Error('Meta cannot use localhost as the endpoint URI. Set FLOW_PUBLIC_BASE_URL to a public HTTPS domain');
  }

  return parsedUrl.toString();
}

function resolveTenantEndpointUri(req, tenantId, tenant = null) {
  const storedEndpointUri = String(tenant?.flowConfig?.endpointUri || '').trim();

  if (storedEndpointUri) {
    try {
      return validateMetaEndpointUri(storedEndpointUri);
    } catch (error) {
      const configuredBaseUrl = getConfiguredBaseUrl();
      if (!configuredBaseUrl) return storedEndpointUri;
    }
  }

  return buildTenantEndpointUri(req, tenantId);
}

function resolveTenantHealthUri(req, tenantId) {
  return buildHealthUriFromBase(getBaseUrl(req), tenantId);
}

function extractMetaErrorMessage(error) {
  const metaError = error.response?.data?.error || {};
  const messageParts = [
    metaError.message,
    metaError.error_user_title,
    metaError.error_user_msg,
    metaError.error_data?.details,
    error.response?.data?.message,
    error.message
  ].filter(Boolean).map((value) => String(value).trim());

  return [...new Set(messageParts)].join(' | ') || 'Meta flow sync failed';
}

function isMetaFlowNameConflict(message) {
  return String(message || '').toLowerCase().includes('flow name should be unique within one whatsapp business account');
}

function isMetaApplicationBusinessMismatch(message) {
  return String(message || '').toLowerCase().includes('application business does not match flow business');
}

function getTemplateDefinition(templateKey) {
  return FLOW_TEMPLATES.find((template) => template.key === templateKey) || FLOW_TEMPLATES[0];
}

function buildTemplateSeed(templateKey) {
  const template = getTemplateDefinition(templateKey);
  return {
    template,
    flowJson: JSON.stringify(template.flowJson, null, 2),
    builder: {
      entryScreen: template.screens[0]?.id || 'WELCOME',
      previewMode: 'mobile',
      screens: template.screens,
      samplePayload: template.samplePayload,
      responseMapping: template.responseMapping
    }
  };
}

function toSafeTemplates() {
  return FLOW_TEMPLATES.map((template) => ({
    key: template.key,
    name: template.name,
    category: template.category,
    requiresEndpoint: template.requiresEndpoint,
    description: template.description,
    screens: template.screens
  }));
}

function normalizeBuilder(builder = {}) {
  return {
    entryScreen: builder.entryScreen || 'WELCOME',
    previewMode: builder.previewMode === 'desktop' ? 'desktop' : 'mobile',
    screens: Array.isArray(builder.screens) ? builder.screens : [],
    samplePayload: typeof builder.samplePayload === 'object' && builder.samplePayload !== null ? builder.samplePayload : {},
    responseMapping: Array.isArray(builder.responseMapping) ? builder.responseMapping : []
  };
}

function parseTriggerKeywords(triggerWord = '') {
  return [...new Set(
    String(triggerWord || '')
      .split(/[\n,]+/)
      .map((value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' '))
      .filter(Boolean)
  )];
}

function normalizeTriggerPayload(payload = {}) {
  const triggerWord = String(payload.triggerWord || '').trim();
  const flowId = String(payload.flowId || '').trim();
  const messageText = String(payload.messageText || '').trim();
  const buttonLabel = String(payload.buttonLabel || '').trim();

  return {
    triggerWord,
    flowId,
    messageText: messageText || 'Please fill out the form below.',
    buttonLabel: buttonLabel || 'Open Flow',
    isActive: payload.isActive !== false,
    keywords: parseTriggerKeywords(triggerWord)
  };
}

function serializeTrigger(trigger) {
  const data = trigger.toObject ? trigger.toObject() : trigger;
  return {
    ...data,
    keywords: Array.isArray(data.keywords) ? data.keywords : parseTriggerKeywords(data.triggerWord)
  };
}

function isLegacyPlaceholderFlowJson(flowJson) {
  if (!String(flowJson || '').trim()) return true;

  try {
    const parsed = JSON.parse(flowJson);
    if (!Array.isArray(parsed?.screens) || !parsed.screens.length) return true;
    return parsed.screens.every((screen) => {
      const keys = Object.keys(screen || {});
      return keys.length > 0 && keys.every((key) => ['id', 'title'].includes(key));
    });
  } catch (error) {
    return false;
  }
}

function ensurePublishableStarterJson(flow) {
  if (!flow || !isLegacyPlaceholderFlowJson(flow.flowJson)) return;

  const seed = buildTemplateSeed(flow.templateKey);
  const existingEntryScreen = flow.builder?.entryScreen;
  const nextScreens = seed.builder.screens;
  const nextEntryScreen = nextScreens.some((screen) => screen.id === existingEntryScreen)
    ? existingEntryScreen
    : seed.builder.entryScreen;

  flow.flowJson = seed.flowJson;
  flow.builder = normalizeBuilder({
    ...seed.builder,
    ...flow.builder?.toObject?.(),
    entryScreen: nextEntryScreen,
    previewMode: flow.builder?.previewMode || seed.builder.previewMode,
    samplePayload: flow.builder?.samplePayload || seed.builder.samplePayload,
    responseMapping: Array.isArray(flow.builder?.responseMapping) && flow.builder.responseMapping.length
      ? flow.builder.responseMapping
      : seed.builder.responseMapping,
    screens: nextScreens
  });
}

function getMetaGraphUrl(pathname) {
  return `${META_GRAPH_BASE_URL}/${META_GRAPH_API_VERSION}/${pathname}`;
}

function getMetaContext(tenant) {
  const accessToken = tenant?.whatsappConfig?.accessToken;
  const wabaId = tenant?.whatsappConfig?.businessAccountId;

  if (!accessToken) throw new Error('Meta access token is missing for this tenant');
  if (!wabaId) throw new Error('WhatsApp Business Account ID is missing for this tenant');

  return { accessToken, wabaId };
}

function mapCategoryToMeta(category) {
  const categoryMap = {
    lead_generation: 'LEAD_GENERATION',
    appointment_booking: 'APPOINTMENT_BOOKING',
    customer_support: 'CUSTOMER_SUPPORT',
    shopping: 'SHOPPING',
    survey: 'SURVEY',
    registration: 'SIGN_UP',
    custom: 'OTHER'
  };
  return categoryMap[category] || 'OTHER';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function metaRequest(tenant, method, pathname, options = {}) {
  const { accessToken } = getMetaContext(tenant);

  return axios({
    method,
    url: getMetaGraphUrl(pathname),
    params: options.params,
    data: options.data,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    },
    maxBodyLength: Infinity
  });
}

async function refreshMetaFlowState(tenant, flow) {
  if (!flow.metaFlowId) return flow;

  const response = await metaRequest(tenant, 'get', flow.metaFlowId, {
    params: {
      fields: 'id,name,status,preview.invalidate(false),categories,data_channel_uri,validation_errors'
    }
  });

  flow.meta.status = String(response.data?.status || '');
  flow.meta.previewUrl = String(response.data?.preview?.preview_url || response.data?.preview || '');
  flow.meta.lastSyncedAt = new Date();
  flow.meta.lastError = '';
  flow.meta.validationErrors = Array.isArray(response.data?.validation_errors) ? response.data.validation_errors : [];

  // Log data_channel_uri for visibility — this is read-only and set by Meta
  const dataChannelUri = response.data?.data_channel_uri || '';
  if (dataChannelUri) {
    console.log(`[Flow ${flow.metaFlowId}] data_channel_uri confirmed by Meta: ${dataChannelUri}`);
  } else {
    console.warn(`[Flow ${flow.metaFlowId}] data_channel_uri not yet visible on Meta's side (this can be normal for new drafts)`);
  }

  return flow;
}

async function createMetaFlowDraft(tenant, flow, endpointUri) {
  const { wabaId } = getMetaContext(tenant);

  const form = new FormData();
  form.append('name', String(flow.name || '').trim());
  form.append('categories', JSON.stringify([mapCategoryToMeta(flow.category)]));

  // endpoint_uri during creation is how Meta binds the data_channel_uri internally
  if (flow.requiresEndpoint && endpointUri) {
    form.append('endpoint_uri', endpointUri);
  }

  const response = await metaRequest(tenant, 'post', `${wabaId}/flows`, { data: form });

  const metaFlowId = String(response.data?.id || response.data?.flow_id || '');
  if (!metaFlowId) throw new Error('Meta did not return a Flow ID after creating the draft');

  flow.metaFlowId = metaFlowId;
  flow.meta.syncStatus = 'draft_created';
  flow.meta.lastSyncedAt = new Date();
  flow.meta.lastError = '';

  console.log(`[Flow ${metaFlowId}] Draft created successfully`);

  return flow;
}

// ─── FIX: Only send endpoint_uri via FormData — data_channel_uri is READ-ONLY on Meta's side ───
// Meta populates data_channel_uri internally when it accepts endpoint_uri.
// Attempting to POST data_channel_uri directly causes a 400 "No properties to update" error.
async function updateMetaFlowMetadata(tenant, flow, endpointUri) {
  if (!flow.metaFlowId) throw new Error('Meta Flow ID is missing');

  const form = new FormData();
  form.append('name', String(flow.name || '').trim());
  form.append('categories', JSON.stringify([mapCategoryToMeta(flow.category)]));

  // endpoint_uri is the ONLY valid way to request a data channel binding from Meta.
  // Meta will then set data_channel_uri on their side — we cannot set it directly.
  if (flow.requiresEndpoint && endpointUri) {
    form.append('endpoint_uri', endpointUri);
  }

  await metaRequest(tenant, 'post', flow.metaFlowId, { data: form });

  // Give Meta a brief moment to process the endpoint binding before uploading JSON
  if (flow.requiresEndpoint && endpointUri) {
    await delay(1000);
  }

  console.log(`[Flow ${flow.metaFlowId}] Metadata updated (endpoint_uri: ${endpointUri || 'not required'})`);
}

async function uploadMetaFlowJson(tenant, flow) {
  if (!flow.metaFlowId) throw new Error('Meta Flow ID is missing');

  const flowJson = String(flow.flowJson || '').trim();
  if (!flowJson) throw new Error('Flow JSON is required before syncing to Meta');

  JSON.parse(flowJson); // validate — throws if invalid

  const form = new FormData();
  form.append('file', new Blob([flowJson], { type: 'application/json' }), 'flow.json');
  form.append('name', 'flow.json');
  form.append('asset_type', 'FLOW_JSON');

  await metaRequest(tenant, 'post', `${flow.metaFlowId}/assets`, { data: form });

  console.log(`[Flow ${flow.metaFlowId}] Flow JSON uploaded successfully`);
}

async function publishMetaFlow(tenant, flow) {
  if (!flow.metaFlowId) throw new Error('Meta Flow ID is missing');
  await metaRequest(tenant, 'post', `${flow.metaFlowId}/publish`);
  console.log(`[Flow ${flow.metaFlowId}] Published to Meta successfully`);
}

// ─── MAIN SYNC FUNCTION ───
// Key fix summary:
//   REMOVED setMetaDataChannelUri() — data_channel_uri is a READ-ONLY field on Meta's Graph API.
//   Posting it directly causes: "Invalid parameter | No properties to update | 400"
//   The correct flow is:
//     1. Create draft with endpoint_uri  (Meta binds data_channel_uri internally)
//     2. Update metadata with endpoint_uri on each sync  (re-affirms the binding)
//     3. Upload flow JSON
//     4. Publish (optional)
//   Meta will populate data_channel_uri on their side — we only read it back via refreshMetaFlowState.
async function syncFlowToMeta(tenant, flow, endpointUri, { publish = false } = {}) {
  try {
    ensurePublishableStarterJson(flow);

    const publishableEndpointUri = flow.requiresEndpoint
      ? validateMetaEndpointUri(endpointUri)
      : endpointUri;

    // Step 1: Create draft if this flow has never been synced to Meta
    if (!flow.metaFlowId) {
      await createMetaFlowDraft(tenant, flow, publishableEndpointUri);
    }

    // Step 2: Update name, category, and endpoint_uri on the existing draft.
    // This is the ONLY valid way to bind/re-bind the endpoint — Meta sets data_channel_uri from this.
    await updateMetaFlowMetadata(tenant, flow, publishableEndpointUri);

    // Step 3: Upload the Flow JSON asset
    await uploadMetaFlowJson(tenant, flow);

    // Step 4: Optionally publish
    if (publish) {
      await publishMetaFlow(tenant, flow);
      flow.meta.syncStatus = 'published';
    } else {
      flow.meta.syncStatus = 'synced';
    }

    // Step 5: Refresh local state from Meta (reads back status, preview URL, validation errors, data_channel_uri)
    await refreshMetaFlowState(tenant, flow);

    // Step 6: Check for validation errors returned by Meta after JSON upload
    if (Array.isArray(flow.meta.validationErrors) && flow.meta.validationErrors.length > 0) {
      const validationMessage = flow.meta.validationErrors
        .map((item) => item?.message || item?.error || item?.error_type)
        .filter(Boolean)
        .slice(0, 3)
        .join(' | ');
      throw new Error(`Flow JSON validation failed: ${validationMessage}`);
    }

    flow.meta.lastError = '';
    return flow;
  } catch (error) {
    flow.meta.syncStatus = 'error';
    flow.meta.lastError = extractMetaErrorMessage(error);
    flow.meta.lastSyncedAt = new Date();
    console.error('Flow Studio Meta sync error:', {
      tenantId: flow.tenantId,
      flowId: flow._id?.toString?.() || '',
      metaFlowId: flow.metaFlowId,
      status: error.response?.status,
      data: error.response?.data || null,
      message: flow.meta.lastError
    });
    throw error;
  }
}

function serializeFlow(flow, tenantSetup) {
  const data = flow.toObject();
  const effectiveEndpointHealth = data.requiresEndpoint
    ? tenantSetup.healthStatus || data.endpoint?.healthStatus || 'pending'
    : 'not_required';

  return {
    ...data,
    linkedPhoneNumberId: data.linkedPhoneNumberId || tenantSetup.linkedPhoneNumberId,
    endpoint: {
      ...(data.endpoint || {}),
      uri: data.endpoint?.uri || tenantSetup.endpointUri,
      healthStatus: effectiveEndpointHealth,
      lastCheckedAt: data.endpoint?.lastCheckedAt || tenantSetup.lastHealthCheck
    }
  };
}

async function ensureUniqueSlug(tenantId, desiredSlug, excludeId = null) {
  let candidate = desiredSlug;
  let suffix = 1;

  while (true) {
    const existing = await FlowStudio.findOne({
      tenantId,
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {})
    }).select('_id');

    if (!existing) return candidate;

    suffix += 1;
    candidate = `${desiredSlug}-${suffix}`;
  }
}

async function buildDashboard(req, tenantId) {
  const tenant = await Tenant.findById(tenantId).select('name whatsappConfig flowConfig');
  if (!tenant) return null;

  const endpointUri = resolveTenantEndpointUri(req, tenantId, tenant);
  const linkedPhoneNumberId = tenant.flowConfig?.linkedPhoneNumberId || tenant.whatsappConfig?.phoneNumberId || '';
  const keyStatus = tenant.flowConfig?.keyStatus || 'NOT_GENERATED';
  const healthStatus = tenant.flowConfig?.healthCheckStatus || 'pending';

  const tenantSetup = {
    endpointUri,
    healthUri: resolveTenantHealthUri(req, tenantId),
    appId: tenant.flowConfig?.appId || '',
    linkedPhoneNumberId,
    businessAccountId: tenant.whatsappConfig?.businessAccountId || '',
    hasAccessToken: Boolean(tenant.whatsappConfig?.accessToken),
    hasPhoneNumber: Boolean(linkedPhoneNumberId),
    hasAppSecret: Boolean(tenant.flowConfig?.appSecret),
    keyStatus,
    keyUploaded: ['VALID', 'UPLOADED'].includes(keyStatus),
    healthStatus,
    lastHealthCheck: tenant.flowConfig?.lastHealthCheck || null,
    connectedToMeta: Boolean(tenant.whatsappConfig?.accessToken && linkedPhoneNumberId),
    checklist: [
      {
        id: 'endpoint',
        title: 'Set endpoint URI',
        description: 'Use the GoWhats tenant endpoint in Meta Flow settings.',
        done: Boolean(endpointUri)
      },
      {
        id: 'phone_number',
        title: 'Add phone number',
        description: 'Link a WhatsApp phone number that will send this flow.',
        done: Boolean(linkedPhoneNumberId)
      },
      {
        id: 'keys',
        title: 'Sign public key',
        description: 'Generate and upload your encryption key pair.',
        done: ['VALID', 'UPLOADED'].includes(keyStatus)
      },
      {
        id: 'meta_app',
        title: 'Connect Meta app',
        description: 'Store App ID/App Secret and keep tenant WhatsApp credentials connected.',
        done: Boolean(tenant.flowConfig?.appId && tenant.flowConfig?.appSecret && tenant.whatsappConfig?.accessToken)
      },
      {
        id: 'health',
        title: 'Health check',
        description: 'Verify the shared endpoint is reachable and healthy.',
        done: healthStatus === 'healthy'
      }
    ]
  };

  const flows = await FlowStudio.find({ tenantId, isActive: true }).sort({ updatedAt: -1 });
  const serializedFlows = flows.map((flow) => serializeFlow(flow, tenantSetup));
  const triggers = await FlowTrigger.find({ tenantId }).sort({ updatedAt: -1 });
  const serializedTriggers = triggers.map((trigger) => serializeTrigger(trigger));

  const summary = {
    totalFlows: serializedFlows.length,
    draftFlows: serializedFlows.filter((flow) => flow.status === 'draft').length,
    publishedFlows: serializedFlows.filter((flow) => flow.status === 'published').length,
    endpointReadyFlows: serializedFlows.filter((flow) => !flow.requiresEndpoint || tenantSetup.healthStatus === 'healthy').length,
    unhealthyFlows: serializedFlows.filter((flow) => flow.requiresEndpoint && tenantSetup.healthStatus === 'error').length
  };

  const triggerSummary = {
    totalTriggers: serializedTriggers.length,
    activeTriggers: serializedTriggers.filter((trigger) => trigger.isActive).length,
    inactiveTriggers: serializedTriggers.filter((trigger) => !trigger.isActive).length
  };

  const availableMetaFlows = serializedFlows
    .filter((flow) => String(flow.metaFlowId || '').trim())
    .map((flow) => ({
      id: flow._id,
      name: flow.name,
      flowId: flow.metaFlowId,
      status: flow.status,
      version: flow.version || 0
    }));

  return {
    tenant: { id: tenant._id, name: tenant.name || 'GoWhats Workspace' },
    summary,
    triggerSummary,
    setup: tenantSetup,
    templates: toSafeTemplates(),
    flows: serializedFlows,
    triggers: serializedTriggers,
    availableMetaFlows
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROUTES
   ═══════════════════════════════════════════════════════════════════════════ */

router.get('/dashboard', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const dashboard = await buildDashboard(req, tenantId);
    if (!dashboard) return res.status(404).json({ success: false, message: 'Tenant not found' });
    res.json({ success: true, ...dashboard });
  } catch (error) {
    console.error('Flow Studio dashboard error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to load Flow Studio' });
  }
});

router.post('/setup', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { appId = '', linkedPhoneNumberId = '' } = req.body || {};
    const endpointUri = buildTenantEndpointUri(req, tenantId);

    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      {
        $set: {
          'flowConfig.appId': String(appId || '').trim(),
          'flowConfig.endpointUri': endpointUri,
          'flowConfig.linkedPhoneNumberId': String(linkedPhoneNumberId || '').trim(),
          'flowConfig.flowStudioConfiguredAt': new Date(),
          'flowConfig.configurationSteps.flowSetup': true
        }
      },
      { new: true }
    );

    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    await FlowStudio.updateMany(
      { tenantId, isActive: true },
      {
        $set: {
          linkedPhoneNumberId: String(linkedPhoneNumberId || '').trim(),
          'endpoint.uri': endpointUri
        }
      }
    );

    const dashboard = await buildDashboard(req, tenantId);
    res.json({ success: true, message: 'Flow Studio setup saved', ...dashboard });
  } catch (error) {
    console.error('Flow Studio setup error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to save setup' });
  }
});

router.post('/flows', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tenant = await Tenant.findById(tenantId).select('whatsappConfig flowConfig');
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const { name, category, templateKey = 'lead_generation', description = '' } = req.body || {};

    if (!name || String(name).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Flow name must be at least 3 characters' });
    }

    const seed = buildTemplateSeed(templateKey);
    const slug = await ensureUniqueSlug(tenantId, slugify(name));
    const endpointUri = resolveTenantEndpointUri(req, tenantId, tenant);
    const linkedPhoneNumberId = tenant.flowConfig?.linkedPhoneNumberId || tenant.whatsappConfig?.phoneNumberId || '';

    const flow = await FlowStudio.create({
      tenantId,
      name: String(name).trim(),
      slug,
      description: String(description || seed.template.description || '').trim(),
      category: category || seed.template.category,
      templateKey,
      status: 'draft',
      requiresEndpoint: seed.template.requiresEndpoint,
      linkedPhoneNumberId,
      flowJson: seed.flowJson,
      builder: normalizeBuilder(seed.builder),
      endpoint: {
        uri: endpointUri,
        method: 'POST',
        healthStatus: seed.template.requiresEndpoint
          ? (tenant.flowConfig?.healthCheckStatus || 'pending')
          : 'not_required',
        lastCheckedAt: tenant.flowConfig?.lastHealthCheck || null
      },
      createdBy: String(req.user?.id || req.user?._id || '')
    });

    let message = 'Flow created locally';

    if (tenant.whatsappConfig?.accessToken && tenant.whatsappConfig?.businessAccountId) {
      try {
        await syncFlowToMeta(tenant, flow, endpointUri, { publish: false });
        await flow.save();
        message = `Flow created and synced to Meta as draft (${flow.metaFlowId})`;
      } catch (metaError) {
        try { await flow.save(); } catch (saveError) {
          console.error('Flow save after Meta draft error failed:', saveError.message);
        }
        message = `Flow created locally, but Meta draft sync failed: ${flow.meta.lastError}`;
      }
    }

    res.status(201).json({ success: true, message, flow });
  } catch (error) {
    console.error('Flow create error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to create flow' });
  }
});

router.put('/flows/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const flow = await FlowStudio.findOne({ _id: req.params.id, tenantId, isActive: true });
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });

    const { name, description, category, templateKey, metaFlowId, requiresEndpoint, linkedPhoneNumberId, flowJson, builder } = req.body || {};

    if (typeof name === 'string' && name.trim()) {
      flow.name = name.trim();
      flow.slug = await ensureUniqueSlug(tenantId, slugify(flow.name), flow._id);
    }
    if (typeof description === 'string') flow.description = description.trim();
    if (typeof category === 'string') flow.category = category;
    if (typeof templateKey === 'string' && templateKey.trim()) flow.templateKey = templateKey.trim();
    if (typeof metaFlowId === 'string') flow.metaFlowId = metaFlowId.trim();
    if (typeof requiresEndpoint === 'boolean') {
      flow.requiresEndpoint = requiresEndpoint;
      if (!requiresEndpoint) flow.endpoint.healthStatus = 'not_required';
    }
    if (typeof linkedPhoneNumberId === 'string') flow.linkedPhoneNumberId = linkedPhoneNumberId.trim();
    if (typeof flowJson === 'string') {
      try { JSON.parse(flowJson); } catch (error) {
        return res.status(400).json({ success: false, message: 'Flow JSON must be valid JSON before saving' });
      }
      flow.flowJson = flowJson;
    }
    if (builder) flow.builder = normalizeBuilder(builder);
    flow.updatedBy = String(req.user?.id || req.user?._id || '');

    const tenant = await Tenant.findById(tenantId).select('whatsappConfig flowConfig');
    const endpointUri = resolveTenantEndpointUri(req, tenantId, tenant);

    let message = 'Flow saved';

    if (tenant?.whatsappConfig?.accessToken && tenant?.whatsappConfig?.businessAccountId) {
      try {
        await syncFlowToMeta(tenant, flow, endpointUri, { publish: false });
        message = flow.metaFlowId
          ? `Flow saved and synced to Meta${flow.meta.status ? ` (${flow.meta.status})` : ''}`
          : 'Flow saved and synced to Meta';
      } catch (metaError) {
        message = `Flow saved locally, but Meta sync failed: ${flow.meta.lastError}`;
      }
    }

    await flow.save();
    res.json({ success: true, message, flow });
  } catch (error) {
    console.error('Flow update error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to save flow' });
  }
});

router.post('/flows/:id/publish', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { note = '' } = req.body || {};
    const flow = await FlowStudio.findOne({ _id: req.params.id, tenantId, isActive: true });
    const tenant = await Tenant.findById(tenantId).select('whatsappConfig flowConfig');

    if (!flow || !tenant) {
      return res.status(404).json({ success: false, message: 'Flow or tenant not found' });
    }

    const missingItems = [];
    const linkedPhoneNumberId = flow.linkedPhoneNumberId
      || tenant.flowConfig?.linkedPhoneNumberId
      || tenant.whatsappConfig?.phoneNumberId;

    if (!linkedPhoneNumberId) missingItems.push('linked phone number');

    if (flow.requiresEndpoint) {
      if (!tenant.flowConfig?.appSecret) missingItems.push('Meta App Secret');
      if (!['GENERATED', 'UPLOADED', 'VALID'].includes(tenant.flowConfig?.keyStatus || '')) {
        missingItems.push('encryption keys');
      }
    }

    if (missingItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Finish setup before publishing: ${missingItems.join(', ')}`
      });
    }

    if (!tenant.whatsappConfig?.accessToken) {
      return res.status(400).json({ success: false, message: 'Meta access token is missing for this tenant' });
    }

    if (!tenant.whatsappConfig?.businessAccountId) {
      return res.status(400).json({ success: false, message: 'WhatsApp Business Account ID is missing for this tenant' });
    }

    const endpointUri = resolveTenantEndpointUri(req, tenantId, tenant);

    try {
      await syncFlowToMeta(tenant, flow, endpointUri, { publish: true });
    } catch (metaError) {
      // Safe save: never let this suppress the error response
      try { await flow.save(); } catch (saveError) {
        console.error('Flow save after Meta publish error failed:', saveError.message);
      }

      if (isMetaFlowNameConflict(flow.meta.lastError)) {
        return res.status(409).json({
          success: false,
          message: 'Meta flow name already exists in this WhatsApp Business Account. Change the Flow Name and publish again.'
        });
      }

      if (isMetaApplicationBusinessMismatch(flow.meta.lastError)) {
        return res.status(400).json({
          success: false,
          message: 'Meta rejected the update because this flow draft is linked to a different app. Archive this flow, create a new one, and publish fresh.'
        });
      }

      return res.status(502).json({
        success: false,
        message: `Meta publish failed: ${flow.meta.lastError}`
      });
    }

    const nextVersion = (flow.publishHistory[flow.publishHistory.length - 1]?.version || 0) + 1;
    flow.status = 'published';
    flow.version = nextVersion;
    flow.lastPublishedAt = new Date();
    flow.publishHistory.push({
      version: nextVersion,
      publishedAt: new Date(),
      note: String(note || 'Published from Flow Studio')
    });

    await flow.save();

    res.json({
      success: true,
      message: `Published ${flow.name} to Meta as version ${nextVersion}`,
      flow
    });
  } catch (error) {
    console.error('Flow publish error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to publish flow' });
    }
  }
});

router.post('/flows/:id/clone', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const sourceFlow = await FlowStudio.findOne({ _id: req.params.id, tenantId, isActive: true }).lean();
    if (!sourceFlow) return res.status(404).json({ success: false, message: 'Flow not found' });

    const baseName = `${sourceFlow.name} Copy`;
    const slug = await ensureUniqueSlug(tenantId, slugify(baseName));

    const clone = await FlowStudio.create({
      ...sourceFlow,
      _id: undefined,
      name: baseName,
      slug,
      status: 'draft',
      version: 0,
      metaFlowId: '',
      meta: { syncStatus: 'not_synced', status: '', previewUrl: '', lastSyncedAt: null, lastError: '' },
      publishHistory: [],
      lastPublishedAt: null,
      createdAt: undefined,
      updatedAt: undefined
    });

    res.status(201).json({ success: true, message: 'Flow cloned', flow: clone });
  } catch (error) {
    console.error('Flow clone error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to clone flow' });
  }
});

router.delete('/flows/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const flow = await FlowStudio.findOneAndUpdate(
      { _id: req.params.id, tenantId, isActive: true },
      { $set: { isActive: false, status: 'deprecated', updatedBy: String(req.user?.id || req.user?._id || '') } },
      { new: true }
    );

    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    res.json({ success: true, message: 'Flow archived successfully' });
  } catch (error) {
    console.error('Flow delete error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to archive flow' });
  }
});

router.post('/triggers', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const normalized = normalizeTriggerPayload(req.body || {});

    if (!normalized.keywords.length) {
      return res.status(400).json({ success: false, message: 'Enter at least one trigger word' });
    }

    if (!normalized.flowId) {
      return res.status(400).json({ success: false, message: 'Flow ID is required' });
    }

    const linkedFlow = await FlowStudio.findOne({
      tenantId,
      metaFlowId: normalized.flowId,
      isActive: true
    }).select('name metaFlowId');

    const trigger = await FlowTrigger.create({
      tenantId,
      triggerWord: normalized.triggerWord,
      keywords: normalized.keywords,
      flowId: normalized.flowId,
      flowName: linkedFlow?.name || '',
      messageText: normalized.messageText,
      buttonLabel: normalized.buttonLabel,
      isActive: normalized.isActive,
      createdBy: String(req.user?.id || req.user?._id || ''),
      updatedBy: String(req.user?.id || req.user?._id || '')
    });

    res.status(201).json({
      success: true,
      message: 'Flow trigger created',
      trigger: serializeTrigger(trigger)
    });
  } catch (error) {
    console.error('Flow trigger create error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to create flow trigger' });
  }
});

router.put('/triggers/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const trigger = await FlowTrigger.findOne({ _id: req.params.id, tenantId });
    if (!trigger) return res.status(404).json({ success: false, message: 'Flow trigger not found' });

    const normalized = normalizeTriggerPayload(req.body || {});

    if (!normalized.keywords.length) {
      return res.status(400).json({ success: false, message: 'Enter at least one trigger word' });
    }

    if (!normalized.flowId) {
      return res.status(400).json({ success: false, message: 'Flow ID is required' });
    }

    const linkedFlow = await FlowStudio.findOne({
      tenantId,
      metaFlowId: normalized.flowId,
      isActive: true
    }).select('name metaFlowId');

    trigger.triggerWord = normalized.triggerWord;
    trigger.keywords = normalized.keywords;
    trigger.flowId = normalized.flowId;
    trigger.flowName = linkedFlow?.name || '';
    trigger.messageText = normalized.messageText;
    trigger.buttonLabel = normalized.buttonLabel;
    trigger.isActive = normalized.isActive;
    trigger.updatedBy = String(req.user?.id || req.user?._id || '');

    await trigger.save();

    res.json({
      success: true,
      message: 'Flow trigger updated',
      trigger: serializeTrigger(trigger)
    });
  } catch (error) {
    console.error('Flow trigger update error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to update flow trigger' });
  }
});

router.patch('/triggers/:id/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const isActive = req.body?.isActive !== false;

    const trigger = await FlowTrigger.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      {
        $set: {
          isActive,
          updatedBy: String(req.user?.id || req.user?._id || '')
        }
      },
      { new: true }
    );

    if (!trigger) return res.status(404).json({ success: false, message: 'Flow trigger not found' });

    res.json({
      success: true,
      message: `Flow trigger ${isActive ? 'activated' : 'deactivated'}`,
      trigger: serializeTrigger(trigger)
    });
  } catch (error) {
    console.error('Flow trigger status error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to update flow trigger status' });
  }
});

router.delete('/triggers/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const trigger = await FlowTrigger.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!trigger) return res.status(404).json({ success: false, message: 'Flow trigger not found' });

    res.json({ success: true, message: 'Flow trigger deleted' });
  } catch (error) {
    console.error('Flow trigger delete error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to delete flow trigger' });
  }
});

// ─── Reset Meta binding for a stale draft ───
// Use this when a flow's metaFlowId points to a stale/broken Meta draft.
// After calling this, the next save or publish will create a fresh Meta draft.
router.post('/flows/:id/reset-meta', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const flow = await FlowStudio.findOne({ _id: req.params.id, tenantId, isActive: true });
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });

    const previousMetaFlowId = flow.metaFlowId || '';

    flow.metaFlowId = '';
    flow.meta.syncStatus = 'not_synced';
    flow.meta.status = '';
    flow.meta.lastError = '';
    flow.meta.previewUrl = '';
    flow.meta.lastSyncedAt = new Date();
    flow.updatedBy = String(req.user?.id || req.user?._id || '');

    await flow.save();

    console.log(`[Flow ${flow._id}] Meta binding reset. Previous metaFlowId: ${previousMetaFlowId || 'none'}`);

    res.json({
      success: true,
      message: previousMetaFlowId
        ? `Meta binding cleared (was: ${previousMetaFlowId}). Next sync will create a fresh Meta draft.`
        : 'Meta binding cleared. Next sync will create a fresh Meta draft.',
      flow
    });
  } catch (error) {
    console.error('Flow reset-meta error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to reset Meta binding' });
  }
});

router.post('/health-check', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const endpointUri = buildTenantEndpointUri(req, tenantId);
    const healthUri = buildHealthUri(req, tenantId);
    const startedAt = Date.now();

    const response = await axios.get(healthUri, { timeout: 8000, validateStatus: () => true });
    const latencyMs = Date.now() - startedAt;
    const success = response.status >= 200 && response.status < 300;
    const message = success
      ? 'GoWhats flow endpoint responded successfully'
      : `Endpoint responded with ${response.status}`;

    await Tenant.findByIdAndUpdate(tenantId, {
      $set: {
        'flowConfig.endpointUri': endpointUri,
        'flowConfig.lastHealthCheck': new Date(),
        'flowConfig.healthCheckStatus': success ? 'healthy' : 'error',
        'flowConfig.configurationSteps.healthCheck': success
      }
    });

    await FlowStudio.updateMany(
      { tenantId, isActive: true, requiresEndpoint: true },
      {
        $set: {
          'endpoint.uri': endpointUri,
          'endpoint.lastCheckedAt': new Date(),
          'endpoint.lastLatencyMs': latencyMs,
          'endpoint.lastMessage': message,
          'endpoint.healthStatus': success ? 'healthy' : 'error'
        }
      }
    );

    if (!success) {
      return res.status(400).json({ success: false, status: 'error', latencyMs, endpointUri, message });
    }

    res.json({ success: true, status: 'healthy', latencyMs, endpointUri, message });
  } catch (error) {
    const tenantId = getTenantId(req);
    const endpointUri = buildTenantEndpointUri(req, tenantId);

    await Tenant.findByIdAndUpdate(tenantId, {
      $set: {
        'flowConfig.endpointUri': endpointUri,
        'flowConfig.lastHealthCheck': new Date(),
        'flowConfig.healthCheckStatus': 'error',
        'flowConfig.configurationSteps.healthCheck': false
      }
    });

    await FlowStudio.updateMany(
      { tenantId, isActive: true, requiresEndpoint: true },
      {
        $set: {
          'endpoint.uri': endpointUri,
          'endpoint.lastCheckedAt': new Date(),
          'endpoint.lastMessage': error.message,
          'endpoint.healthStatus': 'error'
        }
      }
    );

    console.error('Flow Studio health check error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, status: 'error', endpointUri, message: error.message || 'Health check failed' });
    }
  }
});

module.exports = router;

