const axios = require('axios');
const jwt = require('jsonwebtoken');

const Settings = require('../models/settings');
const Tenant = require('../models/Tenant');
const { canAccessModule } = require('./subscriptionService');
const { sendTrackingNotification } = require('./trackingDispatchService');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const DEFAULT_TRACKING_SHEET_CONFIG = {
  enabled: false,
  spreadsheetId: '',
  range: 'Sheet1!A:Z',
  pollIntervalMinutes: 1,
  autoCreateMissingOrder: true,
  lastSyncedAt: null,
  lastSyncSummary: '',
  lastSyncError: ''
};

const ROW_STATUS_DONE_VALUES = new Set([
  'sent',
  'done',
  'processed',
  'completed',
  'success',
  'yes',
  'true',
  '1'
]);

const COLUMN_ALIASES = {
  orderId: ['order_id', 'orderid', 'order_number', 'order_no', 'orderno', 'order'],
  customerName: ['customer_name', 'customer', 'name'],
  customerPhone: [
    'customer_phone',
    'customer_mobile',
    'phone',
    'phone_number',
    'mobile',
    'whatsapp_number',
    'whatsapp'
  ],
  trackingNumber: [
    'tracking_number',
    'tracking_no',
    'trackingid',
    'awb',
    'awb_number',
    'tracking'
  ],
  courierService: ['courier_name', 'courier', 'courier_service', 'carrier', 'shipping_company'],
  trackingUrl: ['tracking_url', 'tracking_link', 'track_url', 'url'],
  weight: ['weight', 'parcel_weight'],
  notes: ['notes', 'note', 'customer_note', 'remarks', 'remark', 'comment', 'comments'],
  status: ['status', 'send_status', 'sent_status', 'dispatch_status']
};

let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

function createServiceError(message, statusCode = 500, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details !== null && details !== undefined) {
    error.details = details;
  }
  return error;
}

function parseHttpError(error) {
  return {
    status: Number(error?.response?.status || 0),
    data: error?.response?.data || null,
    message:
      error?.response?.data?.error?.message ||
      error?.response?.data?.error_description ||
      error?.message ||
      'Unknown error'
  };
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeHeader(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function clampPollMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TRACKING_SHEET_CONFIG.pollIntervalMinutes;
  return Math.max(1, Math.min(60, Math.floor(parsed)));
}

function normalizeRangeInput(value) {
  const raw = normalizeText(value);
  if (!raw) return DEFAULT_TRACKING_SHEET_CONFIG.range;

  // Allow tab name only (e.g. "Sheet1") by auto-expanding to full range.
  if (!raw.includes('!')) {
    const sheetName = raw.replace(/\.+$/, '').trim();
    if (!sheetName) return DEFAULT_TRACKING_SHEET_CONFIG.range;
    return `${sheetName}!A:Z`;
  }

  if (raw.endsWith('!')) {
    return `${raw}A:Z`;
  }

  return raw;
}

function sanitizeConfigInput(input = {}) {
  const output = {};

  if (typeof input.enabled === 'boolean') output.enabled = input.enabled;
  if (typeof input.spreadsheetId === 'string') output.spreadsheetId = input.spreadsheetId.trim();
  if (typeof input.range === 'string' && input.range.trim()) {
    output.range = normalizeRangeInput(input.range);
  }
  if (typeof input.autoCreateMissingOrder === 'boolean') {
    output.autoCreateMissingOrder = input.autoCreateMissingOrder;
  }
  if (input.pollIntervalMinutes !== undefined) {
    output.pollIntervalMinutes = clampPollMinutes(input.pollIntervalMinutes);
  }

  return output;
}

function getServiceAccountCredentials() {
  const clientEmail = normalizeText(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL);
  const privateKey = normalizeText(process.env.GOOGLE_SHEETS_PRIVATE_KEY).replace(/\\n/g, '\n');
  const subject = normalizeText(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_SUBJECT);

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Missing Google service account credentials. Set GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY.'
    );
  }

  return { clientEmail, privateKey, subject };
}

function hasGoogleServiceAccountCredentials() {
  return (
    !!normalizeText(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL) &&
    !!normalizeText(process.env.GOOGLE_SHEETS_PRIVATE_KEY)
  );
}

async function getGoogleAccessToken() {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry - 60000) {
    return cachedAccessToken;
  }

  const { clientEmail, privateKey, subject } = getServiceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);

  const jwtPayload = {
    iss: clientEmail,
    scope: SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  if (subject) {
    jwtPayload.sub = subject;
  }

  const assertion = jwt.sign(jwtPayload, privateKey, {
    algorithm: 'RS256',
    header: { typ: 'JWT' }
  });

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', assertion);

  let response;
  try {
    response = await axios.post(GOOGLE_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000
    });
  } catch (error) {
    const parsed = parseHttpError(error);
    const messageLower = String(parsed.message || '').toLowerCase();

    if (messageLower.includes('invalid_grant') || messageLower.includes('invalid jwt signature')) {
      throw createServiceError(
        'Google authentication failed (invalid service account key). Verify GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY.',
        parsed.status || 401,
        parsed.data
      );
    }

    throw createServiceError(
      `Failed to authenticate with Google OAuth: ${parsed.message}`,
      parsed.status || 500,
      parsed.data
    );
  }

  cachedAccessToken = response.data?.access_token || null;
  cachedAccessTokenExpiry = Date.now() + (Number(response.data?.expires_in || 3600) * 1000);

  if (!cachedAccessToken) {
    throw new Error('Failed to receive Google OAuth access token');
  }

  return cachedAccessToken;
}

async function fetchSheetValues(spreadsheetId, range) {
  const token = await getGoogleAccessToken();
  const normalizedRange = normalizeText(range) || DEFAULT_TRACKING_SHEET_CONFIG.range;
  const normalizedSpreadsheetId = normalizeText(spreadsheetId);

  if (!normalizedSpreadsheetId) {
    throw new Error('Google Sheet spreadsheetId is required');
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    normalizedSpreadsheetId
  )}/values/${encodeURIComponent(normalizedRange)}?majorDimension=ROWS`;

  let response;
  try {
    response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000
    });
  } catch (error) {
    const parsed = parseHttpError(error);
    const serviceAccountEmail = normalizeText(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL);

    if (parsed.status === 403) {
      throw createServiceError(
        `Google Sheets access denied (403). Share the sheet with service account "${serviceAccountEmail}" and verify the range "${normalizedRange}".`,
        403,
        parsed.data
      );
    }

    if (parsed.status === 404) {
      throw createServiceError(
        'Spreadsheet not found (404). Check Spreadsheet ID and ensure the sheet exists.',
        404,
        parsed.data
      );
    }

    throw createServiceError(
      `Failed to read Google Sheet: ${parsed.message}`,
      parsed.status || 500,
      parsed.data
    );
  }

  return response.data?.values || [];
}

function getSheetNameFromRange(rangeValue) {
  const raw = normalizeText(rangeValue);
  if (!raw) return 'Sheet1';
  if (raw.includes('!')) {
    const [sheetName] = raw.split('!');
    return sheetName || 'Sheet1';
  }
  if (raw.includes(':')) {
    return 'Sheet1';
  }
  return raw;
}

function getColumnIndex(headers, aliases = []) {
  if (!Array.isArray(headers) || headers.length === 0) return -1;
  const normalizedAliases = new Set(aliases.map((value) => normalizeHeader(value)));
  return headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
}

function columnIndexToLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || 'A';
}

async function updateSheetStatusValues(spreadsheetId, range, statusColumnIndex, updates) {
  if (!updates.length) return { updated: 0 };
  const token = await getGoogleAccessToken();
  const sheetName = getSheetNameFromRange(range);
  const columnLetter = columnIndexToLetter(statusColumnIndex);
  const data = updates.map((update) => ({
    range: `${sheetName}!${columnLetter}${update.rowNumber}`,
    values: [[update.value]]
  }));

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values:batchUpdate`;

  await axios.post(
    url,
    {
      valueInputOption: 'RAW',
      data
    },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000
    }
  );

  return { updated: updates.length };
}

function extractValue(record, aliases) {
  for (const key of aliases) {
    const value = normalizeText(record[key]);
    if (value) return value;
  }
  return '';
}

function rowToRecord(headers, rowValues) {
  const record = {};
  headers.forEach((header, index) => {
    if (!header) return;
    record[header] = normalizeText(rowValues[index]);
  });
  return record;
}

function mapRowToTrackingPayload(rowRecord) {
  return {
    orderId: extractValue(rowRecord, COLUMN_ALIASES.orderId),
    customerName: extractValue(rowRecord, COLUMN_ALIASES.customerName),
    customerPhone: extractValue(rowRecord, COLUMN_ALIASES.customerPhone),
    trackingNumber: extractValue(rowRecord, COLUMN_ALIASES.trackingNumber),
    courierService: extractValue(rowRecord, COLUMN_ALIASES.courierService),
    trackingUrl: extractValue(rowRecord, COLUMN_ALIASES.trackingUrl),
    weight: extractValue(rowRecord, COLUMN_ALIASES.weight),
    notes: extractValue(rowRecord, COLUMN_ALIASES.notes),
    status: extractValue(rowRecord, COLUMN_ALIASES.status)
  };
}

async function getTenantTrackingSheetConfig(tenantId) {
  const settings = await Settings.findOne({ tenant_id: tenantId }).lean();
  const storedConfig = settings?.automationConfig?.trackingSheet || {};

  return {
    ...DEFAULT_TRACKING_SHEET_CONFIG,
    ...storedConfig,
    pollIntervalMinutes: clampPollMinutes(
      storedConfig.pollIntervalMinutes ?? DEFAULT_TRACKING_SHEET_CONFIG.pollIntervalMinutes
    )
  };
}

async function saveTenantTrackingSheetConfig(tenantId, configInput) {
  const currentConfig = await getTenantTrackingSheetConfig(tenantId);
  const sanitizedInput = sanitizeConfigInput(configInput);
  const mergedConfig = {
    ...currentConfig,
    ...sanitizedInput
  };

  await Settings.findOneAndUpdate(
    { tenant_id: tenantId },
    {
      $set: {
        'automationConfig.trackingSheet.enabled': mergedConfig.enabled,
        'automationConfig.trackingSheet.spreadsheetId': mergedConfig.spreadsheetId,
        'automationConfig.trackingSheet.range': mergedConfig.range,
        'automationConfig.trackingSheet.pollIntervalMinutes': mergedConfig.pollIntervalMinutes,
        'automationConfig.trackingSheet.autoCreateMissingOrder': mergedConfig.autoCreateMissingOrder
      },
      $setOnInsert: { tenant_id: tenantId }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return getTenantTrackingSheetConfig(tenantId);
}

async function updateTrackingSheetSyncState(tenantId, syncData) {
  const setPayload = {
    'automationConfig.trackingSheet.lastSyncedAt': new Date(),
    'automationConfig.trackingSheet.lastSyncSummary': normalizeText(syncData.summary),
    'automationConfig.trackingSheet.lastSyncError': normalizeText(syncData.error)
  };

  await Settings.findOneAndUpdate(
    { tenant_id: tenantId },
    { $set: setPayload, $setOnInsert: { tenant_id: tenantId } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function syncTrackingFromGoogleSheet(options = {}) {
  const tenantId = normalizeText(options.tenantId);
  const silent = options.silent !== false;
  if (!tenantId) throw new Error('tenantId is required for Google Sheet sync');

  const configured = await getTenantTrackingSheetConfig(tenantId);
  const effectiveConfig = {
    ...configured,
    ...sanitizeConfigInput(options.configOverride || {})
  };

  if (!options.ignoreEnabled && !effectiveConfig.enabled) {
    return {
      success: true,
      skipped: true,
      reason: 'disabled',
      sent: 0,
      failed: 0,
      skippedRows: 0,
      processed: 0,
      totalRows: 0
    };
  }

  if (!effectiveConfig.spreadsheetId) {
    throw new Error('Google Sheet spreadsheetId is missing in tracking configuration');
  }

  if (!hasGoogleServiceAccountCredentials()) {
    throw new Error(
      'Google service account credentials are missing. Configure GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY.'
    );
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const access = canAccessModule(tenant, 'tracking');
  if (!access.allowed) {
    return {
      success: true,
      skipped: true,
      reason: 'pro_required',
      sent: 0,
      failed: 0,
      skippedRows: 0,
      processed: 0,
      totalRows: 0
    };
  }

  const values = await fetchSheetValues(effectiveConfig.spreadsheetId, effectiveConfig.range);
  if (!Array.isArray(values) || values.length <= 1) {
    const emptySummary = {
      success: true,
      skipped: false,
      reason: 'no_rows',
      totalRows: Math.max((values?.length || 0) - 1, 0),
      processed: 0,
      sent: 0,
      failed: 0,
      skippedRows: 0,
      duplicateRows: 0,
      errors: []
    };

    await updateTrackingSheetSyncState(tenantId, {
      summary: 'No pending rows found in Google Sheet.',
      error: ''
    });

    return emptySummary;
  }

  const headers = values[0].map(normalizeHeader);
  const rows = values.slice(1);
  const statusColumnIndex = getColumnIndex(headers, COLUMN_ALIASES.status);
  const statusUpdates = [];
  const pushStatusUpdate = (rowNumber, value) => {
    if (statusColumnIndex < 0) return;
    if (!value) return;
    statusUpdates.push({ rowNumber, value });
  };

  const summary = {
    success: true,
    skipped: false,
    reason: '',
    totalRows: rows.length,
    processed: 0,
    sent: 0,
    failed: 0,
    skippedRows: 0,
    duplicateRows: 0,
    errors: [],
    statusUpdatedRows: 0,
    statusUpdateError: ''
  };

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const rowRecord = rowToRecord(headers, rows[index] || []);
    const rowPayload = mapRowToTrackingPayload(rowRecord);

    if (!rowPayload.orderId || !rowPayload.trackingNumber) {
      summary.skippedRows += 1;
      summary.failed += 1;
      summary.processed += 1;
      pushStatusUpdate(rowNumber, 'failed');
      if (summary.errors.length < 25) {
        summary.errors.push({
          rowNumber,
          orderId: rowPayload.orderId || '',
          reason: 'Missing order_id or tracking_number'
        });
      }
      continue;
    }

    if (ROW_STATUS_DONE_VALUES.has(normalizeText(rowPayload.status).toLowerCase())) {
      summary.skippedRows += 1;
      continue;
    }

    try {
      if (options.dryRun) {
        summary.processed += 1;
        continue;
      }

      const result = await sendTrackingNotification({
        tenantId,
        orderId: rowPayload.orderId,
        trackingNumber: rowPayload.trackingNumber,
        customerName: rowPayload.customerName,
        customerPhone: rowPayload.customerPhone,
        courierService: rowPayload.courierService,
        trackingUrl: rowPayload.trackingUrl,
        weight: rowPayload.weight,
        notes: rowPayload.notes,
        templateName: 'order_track_update',
        allowCreateMissingOrder: !!effectiveConfig.autoCreateMissingOrder,
        dedupeByTracking: true,
        silent
      });

      summary.processed += 1;

      if (result?.skipped) {
        summary.skippedRows += 1;
        if (result.reason === 'already_sent') {
          summary.duplicateRows += 1;
          pushStatusUpdate(rowNumber, 'sent');
        } else {
          pushStatusUpdate(rowNumber, 'skipped');
        }
      } else {
        summary.sent += 1;
        pushStatusUpdate(rowNumber, 'sent');
      }
    } catch (error) {
      summary.failed += 1;
      summary.processed += 1;
      pushStatusUpdate(rowNumber, 'failed');
      if (summary.errors.length < 25) {
        summary.errors.push({
          rowNumber,
          orderId: rowPayload.orderId,
          reason: error.message
        });
      }
    }
  }

  if (!options.dryRun && statusColumnIndex >= 0 && statusUpdates.length) {
    try {
      const statusUpdateResult = await updateSheetStatusValues(
        effectiveConfig.spreadsheetId,
        effectiveConfig.range,
        statusColumnIndex,
        statusUpdates
      );
      summary.statusUpdatedRows = statusUpdateResult.updated || 0;
    } catch (error) {
      summary.statusUpdateError = error.message || 'Failed to update status column';
    }
  }

  
  const summaryText = `Rows=${summary.totalRows}, Sent=${summary.sent}, Failed=${summary.failed}, Skipped=${summary.skippedRows}`;
  const summaryError = summary.failed > 0 ? `${summary.failed} row(s) failed` : '';

  await updateTrackingSheetSyncState(tenantId, {
    summary: options.dryRun ? `[DRY RUN] ${summaryText}` : summaryText,
    error: summaryError
  });

  return summary;
}

module.exports = {
  DEFAULT_TRACKING_SHEET_CONFIG,
  getTenantTrackingSheetConfig,
  saveTenantTrackingSheetConfig,
  hasGoogleServiceAccountCredentials,
  syncTrackingFromGoogleSheet
};

