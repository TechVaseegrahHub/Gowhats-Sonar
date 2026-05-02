// src/utils/auth.js

const ALLOWED_REDIRECT_ORIGINS = [
  window.location.origin,
  'https://app.billzzy.com', // replace with your real Billzzy domain
];

export const decodeSafeJWT = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b.padEnd(b.length + ((4 - b.length % 4) % 4), '=')));
  } catch { return null; }
};

export const storeTenant = (token) => {
  const p = decodeSafeJWT(token);
  if (!p) return;
  const id = p.tenant_id || p.tenantId;
  if (id) {
    ['tenant_id', 'tenantId', 'x-tenant-id'].forEach(k => localStorage.setItem(k, id));
    // Remove old typo keys from previous versions
    localStorage.removeItem('tenentid');
    localStorage.removeItem('tenantid');
  }
};

export const clearAuthData = () => {
  [
    'token', 'user_id',
    'tenant_id', 'tenantId', 'x-tenant-id',
    'tenentid', 'tenantid' // legacy typo keys
  ].forEach(k => localStorage.removeItem(k));
};

export const safeRedirect = (url) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (ALLOWED_REDIRECT_ORIGINS.includes(parsed.origin)) {
      window.location.href = url;
      return true;
    }
    console.warn('Blocked redirect to untrusted origin:', parsed.origin);
    return false;
  } catch {
    return false;
  }
};
