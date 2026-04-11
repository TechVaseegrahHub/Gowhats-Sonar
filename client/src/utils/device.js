// src/utils/device.js

// ─── Device ID & Expiry ───────────────────────────────────
const DEVICE_ID_KEY = 'gw_device_id';
const EXPIRY_KEY = 'gw_device_expiry';

export const getOrCreateDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  let expiry = localStorage.getItem(EXPIRY_KEY);
  const now = Date.now();
  
  // 90 days in milliseconds
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  // If missing or expired (> 90 days), generate a new one
  if (!id || !expiry || now > parseInt(expiry, 10)) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    localStorage.setItem(EXPIRY_KEY, (now + ninetyDays).toString());
  }
  
  return id;
};

// ─── GPU detection via WebGL ──────────────────────────────
const detectGpu = () => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'Unknown';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'Unknown';
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
    if (/nvidia/i.test(renderer)) return 'NVIDIA';
    if (/amd|radeon/i.test(renderer)) return 'AMD';
    if (/intel/i.test(renderer)) return 'Intel';
    if (/apple/i.test(renderer)) return 'Apple';
    return renderer.split(' ')[0] || 'Unknown';
  } catch { return 'Unknown'; }
};

// ─── OS detection ─────────────────────────────────────────
const detectOs = () => {
  const ua = navigator.userAgent;
  if (/Windows NT 11|Windows NT 10\.0.*Win64/.test(ua)) return 'Windows 11';
  if (/Windows NT 10/.test(ua)) return 'Windows 10';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'MacOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
};

// ─── Browser detection ────────────────────────────────────
const detectBrowser = () => {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
};

// ─── Full device info ─────────────────────────────────────
export const getDeviceInfo = () => {
  const os = detectOs();
  const browser = detectBrowser();
  const gpu = detectGpu();
  const cores = navigator.hardwareConcurrency || 0;
  const ram = navigator.deviceMemory || 0;       // GB (rounded, may be undefined)

  const parts = [os, browser];
  if (gpu !== 'Unknown') parts.push(gpu);
  if (cores > 0) parts.push(`${cores}-core`);
  if (ram > 0) parts.push(`${ram}GB RAM`);

  return {
    os,
    browser,
    gpu,
    cpu_cores: cores,
    ram,
    session_name: parts.join(' · '),
  };
};

// ─── Role-based routing ───────────────────────────────────
export const getRolePath = (role) => {
  const map = {
    customer_care: '/admin/chats',
    manager:       '/admin/chats',
    admin:         '/admin',
    accountant:    '/admin/orders',
    developer:     '/admin/developer',
  };
  return map[role] || '/admin';
};

// ─── Heartbeat ────────────────────────────────────────────
let _heartbeatTimer = null;

export const startHeartbeat = (apiInstance) => {
  stopHeartbeat();
  const send = () => apiInstance.post('/api/devices/heartbeat').catch(() => {});
  send(); // immediate first ping
  _heartbeatTimer = setInterval(send, 4 * 60 * 1000); // every 4 min
};

export const stopHeartbeat = () => {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
};
