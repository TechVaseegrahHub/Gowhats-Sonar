import { useEffect, useMemo, useState } from 'react'
import {
  Save,
  Play,
  FlaskConical,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings2,
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  Shield,
  BarChart3,
  Download
} from 'lucide-react'
import * as XLSX from 'xlsx'
import api from '../utils/axios'

const SYNC_TIMEOUT_MS = 120000
const SERVICE_ACCOUNT_EMAIL = 'gowhats@gowhats-449105.iam.gserviceaccount.com'

const defaultConfig = {
  enabled: false,
  spreadsheetId: '',
  range: 'Sheet1!A:Z',
  pollIntervalMinutes: 1,
  autoCreateMissingOrder: true,
  lastSyncedAt: null,
  lastSyncSummary: '',
  lastSyncError: ''
}

const SHEET_TEMPLATE_HEADERS = [
  'order_id',
  'customer_name',
  'customer_phone',
  'tracking_number',
  'courier_name',
  'tracking_url',
  'weight',
  'notes',
  'status'
]

const GoogleSheetsTracking = ({ embedded = false }) => {
  const [config, setConfig] = useState(defaultConfig)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showResult, setShowResult] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const report = useMemo(() => {
    if (!result) return null
    return {
      totalRows: Number(result.totalRows || 0),
      processed: Number(result.processed || 0),
      sent: Number(result.sent || 0),
      failed: Number(result.failed || 0),
      skipped: Number(result.skippedRows || 0),
      duplicate: Number(result.duplicateRows || 0),
      errors: Array.isArray(result.errors) ? result.errors : [],
      statusUpdatedRows: Number(result.statusUpdatedRows || 0),
      statusUpdateError: String(result.statusUpdateError || '')
    }
  }, [result])

  const fetchConfig = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/google-sheets-tracking/config')
      setConfig({ ...defaultConfig, ...(res.data?.config || {}) })
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Failed to load configuration'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const onChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const saveConfig = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        enabled: !!config.enabled,
        spreadsheetId: String(config.spreadsheetId || '').trim(),
        range: String(config.range || '').trim() || 'Sheet1!A:Z',
        pollIntervalMinutes: Number(config.pollIntervalMinutes) || 1,
        autoCreateMissingOrder: !!config.autoCreateMissingOrder
      }
      const res = await api.put('/api/google-sheets-tracking/config', payload)
      setConfig({ ...defaultConfig, ...(res.data?.config || payload) })
      setNotice('Configuration saved')
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Failed to save configuration'
      )
    } finally {
      setSaving(false)
    }
  }

  const copyServiceAccountEmail = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL)
        setNotice('Service account email copied')
        return
      }
      setError('Clipboard not supported in this browser. Copy the email manually.')
    } catch (err) {
      setError('Failed to copy email. Copy it manually from the field.')
    }
  }

  const disconnectSheet = async () => {
    setDisconnecting(true)
    setError('')
    setNotice('')
    setResult(null)
    try {
      const payload = {
        enabled: false,
        spreadsheetId: '',
        range: String(config.range || '').trim() || 'Sheet1!A:Z',
        pollIntervalMinutes: Number(config.pollIntervalMinutes) || 1,
        autoCreateMissingOrder: !!config.autoCreateMissingOrder
      }
      const res = await api.put('/api/google-sheets-tracking/config', payload)
      setConfig({ ...defaultConfig, ...(res.data?.config || payload) })
      setNotice('Google Sheets disconnected. Sync disabled and sheet ID cleared.')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const downloadSheetFormat = () => {
    const workbook = XLSX.utils.book_new()

    const sampleRows = [
      SHEET_TEMPLATE_HEADERS,
      [
        '1001',
        'Rahul Kumar',
        '919876543210',
        'CN85765687867IN',
        'ST Courier',
        'https://stcourier.com/track/shipment?awbNo=CN85765687867IN',
        '0.45',
        'Leave at front desk',
        ''
      ],
      ['', '', '', '', '', '', '', '', '']
    ]

    const instructionRows = [
      ['Google Sheets Tracking Format'],
      [''],
      ['Column', 'Required', 'Description'],
      ['order_id', 'Yes', 'Order ID or Order Number'],
      ['customer_name', 'Optional', 'Customer name used in template'],
      ['customer_phone', 'Required if auto-create order is enabled', 'WhatsApp customer number'],
      ['tracking_number', 'Yes', 'Tracking or AWB number'],
      ['courier_name', 'Optional', 'Courier or carrier name'],
      ['tracking_url', 'Optional', 'If blank, system auto-generates tracking link'],
      ['weight', 'Optional', 'Parcel weight'],
      ['notes', 'Optional', 'Extra note for order_track_update template'],
      ['status', 'Optional', 'If value is sent/done/completed/true/1 row will be skipped'],
      [''],
      ['Range Example', 'Sheet1!A:I', 'Use this if you want only the template columns']
    ]

    const templateSheet = XLSX.utils.aoa_to_sheet(sampleRows)
    templateSheet['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 54 },
      { wch: 10 },
      { wch: 24 },
      { wch: 12 }
    ]

    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionRows)
    instructionsSheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 60 }]

    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Sheet1')
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')
    XLSX.writeFile(workbook, 'google-sheets-tracking-format.xlsx')
    setNotice('Excel sheet format downloaded')
    setError('')
  }

  const runSync = async (dryRun = false) => {
    setSyncing(true)
    setError('')
    setNotice('')
    setResult(null)
    try {
      const res = await api.post(
        '/api/google-sheets-tracking/sync',
        { dryRun },
        { timeout: SYNC_TIMEOUT_MS }
      )
      setResult(res.data?.result || null)
      setNotice(dryRun ? 'Dry run completed' : 'Sync completed')
      await fetchConfig()
    } catch (err) {
      if (
        err?.code === 'ECONNABORTED' ||
        String(err?.message || '').includes('timeout')
      ) {
        setError(
          `Sync request timed out after ${Math.round(
            SYNC_TIMEOUT_MS / 1000
          )}s. Check server logs and retry.`
        )
        return
      }
      const backendError = err.response?.data?.error
      const detailsMessage =
        err.response?.data?.details?.error?.message ||
        err.response?.data?.details?.error_description ||
        ''
      const fullMessage = [backendError, detailsMessage].filter(Boolean).join(' | ')
      setError(fullMessage || err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const formattedLastSync = useMemo(() => {
    if (!config.lastSyncedAt) return null
    const date = new Date(config.lastSyncedAt)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString()
  }, [config.lastSyncedAt])

  const timeSinceSync = useMemo(() => {
    if (!config.lastSyncedAt) return null
    const date = new Date(config.lastSyncedAt)
    if (Number.isNaN(date.getTime())) return null
    const diff = Date.now() - date.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }, [config.lastSyncedAt])

  const syncHealthy = !config.lastSyncError && !!config.lastSyncedAt

  if (loading) {
    return (
      <div
        className={
          embedded ? 'bg-transparent p-4 lg:p-8' : 'min-h-screen bg-gray-50 p-4 md:p-6'
        }
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-200">
                <FileSpreadsheet className="w-8 h-8 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">Loading configuration</p>
              <p className="text-xs text-gray-400 mt-1">Please wait...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={
        embedded
          ? 'bg-transparent p-4 lg:p-8'
          : 'min-h-screen bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 p-4 md:p-6 lg:p-8'
      }
    >
      <div className="max-w-4xl mx-auto space-y-5">
        {/* ── Alerts ── */}
        {notice && (
          <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">{notice}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Operation completed successfully
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-800">Something went wrong</p>
              <p className="text-xs text-red-600 mt-0.5 break-words">{error}</p>
            </div>
          </div>
        )}

        {/* ── Status Cards Row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  syncHealthy
                    ? 'bg-emerald-100 text-emerald-600'
                    : config.lastSyncError
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {syncHealthy ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : config.lastSyncError ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {syncHealthy ? 'Healthy' : config.lastSyncError ? 'Error' : 'No Sync'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {timeSinceSync || 'Never synced'}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Interval
              </span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {config.pollIntervalMinutes || 1} min
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Polling frequency</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Last Sync
              </span>
            </div>
            <p className="text-sm font-bold text-gray-900 truncate">
              {formattedLastSync || 'N/A'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {config.lastSyncSummary || 'No sync summary'}
            </p>
          </div>
        </div>

        {/* ── Configuration Card ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Configuration</h2>
              <p className="text-xs text-gray-400">
                Manage your Google Sheets sync settings
              </p>
            </div>
          </div>

          <div className="p-5 md:p-6 space-y-5">
            {/* Enable toggle */}
            <div
              onClick={() => onChange('enabled', !config.enabled)}
              className={`relative flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                config.enabled
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    config.enabled
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Enable Sync Service
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Automatically poll and sync tracking data
                  </p>
                </div>
              </div>
              <div
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  config.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${
                    config.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </div>

            {/* Spreadsheet ID */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Spreadsheet ID
              </label>
              <div className="relative">
                <input
                  value={config.spreadsheetId || ''}
                  onChange={(e) => onChange('spreadsheetId', e.target.value)}
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all pr-10"
                />
                {config.spreadsheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors"
                    title="Open spreadsheet"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Found in the spreadsheet URL between /d/ and /edit
              </p>
            </div>

            {/* Service Account Access */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Service Account Access
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Share your Google Sheet with this account as <span className="font-semibold">Editor</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyServiceAccountEmail}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  Copy Email
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-mono text-amber-900 break-all">
                {SERVICE_ACCOUNT_EMAIL}
              </div>

              <ul className="mt-3 space-y-1 text-xs text-amber-900">
                <li>1. Open your Google Sheet and click <span className="font-semibold">Share</span>.</li>
                <li>2. Add this service account email.</li>
                <li>3. Set role to <span className="font-semibold">Editor</span>.</li>
                <li>4. Turn off <span className="font-semibold">Notify people</span> and save.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Excel Sheet Format
                  </p>
                  <p className="mt-1 text-xs text-emerald-900">
                    Download a ready-to-use Excel sample with the exact Google Sheets tracking columns.
                  </p>
                  <p className="mt-2 text-xs text-emerald-800">
                    Columns: <span className="font-mono">order_id, customer_name, customer_phone, tracking_number, courier_name, tracking_url, weight, notes, status</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={downloadSheetFormat}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-all hover:bg-emerald-700 active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  Download Format
                </button>
              </div>
            </div>

            {/* Range & Interval */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Sheet Range
                </label>
                <input
                  value={config.range || ''}
                  onChange={(e) => onChange('range', e.target.value)}
                  placeholder="Sheet1!A:Z"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Poll Interval (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={config.pollIntervalMinutes ?? 1}
                  onChange={(e) => onChange('pollIntervalMinutes', e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Auto-create toggle */}
            <div
              onClick={() =>
                onChange('autoCreateMissingOrder', !config.autoCreateMissingOrder)
              }
              className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${
                config.autoCreateMissingOrder
                  ? 'border-blue-200 bg-blue-50/50'
                  : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    config.autoCreateMissingOrder
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Auto-Create Missing Orders
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Create order records from unmatched sheet rows
                  </p>
                </div>
              </div>
              <div
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  config.autoCreateMissingOrder ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                    config.autoCreateMissingOrder
                      ? 'translate-x-5'
                      : 'translate-x-0.5'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-5 md:px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={saveConfig}
                disabled={saving || disconnecting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-semibold shadow-sm shadow-emerald-200 hover:from-emerald-700 hover:to-green-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>

              <button
                onClick={disconnectSheet}
                disabled={disconnecting || saving || syncing}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-red-300 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {disconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>

              <div className="flex gap-2 flex-1 sm:justify-end">
                <button
                  onClick={() => runSync(true)}
                  disabled={syncing || disconnecting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 hover:border-gray-400 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all flex-1 sm:flex-initial"
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FlaskConical className="w-4 h-4" />
                  )}
                  <span className="hidden xs:inline">Dry</span> Run
                </button>

                <button
                  onClick={() => runSync(false)}
                  disabled={syncing || disconnecting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-black active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all flex-1 sm:flex-initial"
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Sync Now
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sync Details Card ── */}
        {(config.lastSyncError || result) && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  config.lastSyncError
                    ? 'bg-red-100 text-red-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {config.lastSyncError ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <BarChart3 className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-gray-900">Sync Details</h2>
                <p className="text-xs text-gray-400">
                  Detailed output from the last operation
                </p>
              </div>
            </div>

            <div className="p-5 md:p-6 space-y-4">
              {config.lastSyncError && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700 break-words">
                    {config.lastSyncError}
                  </p>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {report && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                        <p className="text-[11px] font-semibold text-emerald-700">Tracking Sent</p>
                        <p className="mt-1 text-xl font-bold text-emerald-800">{report.sent}</p>
                        <p className="text-[11px] text-emerald-600">Templates sent</p>
                      </div>
                      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                        <p className="text-[11px] font-semibold text-red-700">Failed</p>
                        <p className="mt-1 text-xl font-bold text-red-800">{report.failed}</p>
                        <p className="text-[11px] text-red-600">Failed rows</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-[11px] font-semibold text-gray-600">Processed</p>
                        <p className="mt-1 text-xl font-bold text-gray-800">{report.processed}</p>
                        <p className="text-[11px] text-gray-500">Rows processed</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold text-gray-600">Skipped</p>
                        <p className="mt-1 text-xl font-bold text-gray-800">{report.skipped}</p>
                        <p className="text-[11px] text-gray-500">Ignored rows</p>
                      </div>
                    </div>
                  )}

                  {report?.statusUpdateError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      Status column update failed: {report.statusUpdateError}
                    </div>
                  )}

                  {report && !report.statusUpdateError && report.statusUpdatedRows > 0 && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                      Status column updated for {report.statusUpdatedRows} row(s).
                    </div>
                  )}

                  {report?.errors?.length > 0 && (
                    <div className="rounded-xl border border-red-100 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                        <AlertCircle className="w-4 h-4" />
                        Failed details
                      </div>
                      <div className="mt-3 space-y-2">
                        {report.errors.map((err, idx) => (
                          <div key={`${err.rowNumber || idx}-${idx}`} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">Row:</span> {err.rowNumber ?? '-'}
                              <span className="font-semibold">Order:</span> {err.orderId || '-'}
                            </div>
                            <div className="mt-1 text-[11px] text-red-600">{err.reason || 'Unknown error'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowResult((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors mb-2"
                  >
                    {showResult ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    {showResult ? 'Hide' : 'Show'} Raw Result
                  </button>
                  {showResult && (
                    <pre className="text-xs bg-gray-900 text-green-400 rounded-xl p-4 overflow-auto max-h-80 font-mono leading-relaxed">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GoogleSheetsTracking

