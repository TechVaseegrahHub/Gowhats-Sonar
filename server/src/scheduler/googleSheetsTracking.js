const cron = require('node-cron');
const Settings = require('../models/settings');
const {
  hasGoogleServiceAccountCredentials,
  syncTrackingFromGoogleSheet
} = require('../services/googleSheetsTrackingService');

let isJobRunning = false;
let hasWarnedMissingCredentials = false;
const GOOGLE_SHEETS_TRACKING_LOGS_ENABLED =
  String(process.env.GOOGLE_SHEETS_TRACKING_LOGS_ENABLED ?? 'false').toLowerCase() === 'true';

function logGoogleSheetsTracking(...args) {
  if (GOOGLE_SHEETS_TRACKING_LOGS_ENABLED) console.log(...args);
}

function warnGoogleSheetsTracking(...args) {
  if (GOOGLE_SHEETS_TRACKING_LOGS_ENABLED) console.warn(...args);
}

function errorGoogleSheetsTracking(...args) {
  if (GOOGLE_SHEETS_TRACKING_LOGS_ENABLED) console.error(...args);
}

function clampPollMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(60, Math.floor(parsed)));
}

function startGoogleSheetsTrackingScheduler() {
  const schedulerEnabled = String(
    process.env.GOOGLE_SHEETS_TRACKING_SCHEDULER_ENABLED ?? 'true'
  ).toLowerCase() !== 'false';

  if (!schedulerEnabled) {
    logGoogleSheetsTracking('📄 Google Sheets tracking scheduler disabled by env');
    return;
  }

  const cronExpression = process.env.GOOGLE_SHEETS_TRACKING_CRON || '* * * * *';
  logGoogleSheetsTracking(`📄 Initializing Google Sheets tracking scheduler (${cronExpression})`);

  cron.schedule(cronExpression, async () => {
    if (isJobRunning) {
      logGoogleSheetsTracking('📄 Google Sheets tracking scheduler is still running, skipping this tick');
      return;
    }

    isJobRunning = true;

    try {
      const settingsWithSheetSync = await Settings.find({
        'automationConfig.trackingSheet.enabled': true,
        'automationConfig.trackingSheet.spreadsheetId': { $exists: true, $ne: '' }
      }).select('tenant_id automationConfig.trackingSheet.pollIntervalMinutes automationConfig.trackingSheet.lastSyncedAt');

      if (settingsWithSheetSync.length === 0) {
        hasWarnedMissingCredentials = false;
        return;
      }

      if (!hasGoogleServiceAccountCredentials()) {
        if (!hasWarnedMissingCredentials) {
           warnGoogleSheetsTracking(
            '⚠️ Google Sheets tracking scheduler skipped: missing GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY'
          );
          hasWarnedMissingCredentials = true;
        }
        return;
      }
      hasWarnedMissingCredentials = false;

      for (const setting of settingsWithSheetSync) {
        const tenantId = setting.tenant_id;
        const trackingSheetConfig = setting.automationConfig?.trackingSheet || {};
        const pollIntervalMinutes = clampPollMinutes(trackingSheetConfig.pollIntervalMinutes);
        const lastSyncedAt = trackingSheetConfig.lastSyncedAt ? new Date(trackingSheetConfig.lastSyncedAt) : null;

        if (
          lastSyncedAt &&
          Date.now() - lastSyncedAt.getTime() < pollIntervalMinutes * 60 * 1000
        ) {
          continue;
        }

        try {
          const result = await syncTrackingFromGoogleSheet({
            tenantId,
            initiatedBy: 'scheduler',
            silent: true
          });

          if (result.sent > 0 || result.failed > 0) {
            logGoogleSheetsTracking(
              `📄 Sheet sync tenant=${tenantId} sent=${result.sent} failed=${result.failed} skipped=${result.skippedRows}`
            );
          }
        } catch (error) {
          errorGoogleSheetsTracking(
            `❌ Google Sheets tracking sync failed for tenant ${tenantId}:`,
            error.message
          );
        }
      }
    } catch (error) {
      errorGoogleSheetsTracking('❌ Google Sheets tracking scheduler error:', error.message);
    } finally {
      isJobRunning = false;
    }
  });
}

module.exports = { startGoogleSheetsTrackingScheduler };

