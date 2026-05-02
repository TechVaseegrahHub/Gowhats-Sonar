import axios from 'axios';
import { isShopifyEmbeddedApp, redirectToEmbeddedLogin } from './shopifyEmbedded';
import { getOrCreateDeviceId } from './device';
import { clearAuthData } from './auth';

const isDev = import.meta.env.DEV;
const log = (...args) => { if (isDev) console.log(...args); };
const logError = (...args) => { if (isDev) console.error(...args); };

const getBaseURL = () => import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
  headers: { 'Content-Type': 'application/json' }
});

export const publicApi = axios.create({
  baseURL: getBaseURL(),
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

export const dashboardApi = axios.create({
  baseURL: getBaseURL(),
  withCredentials: false,
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
  headers: { 'Content-Type': 'application/json' }
});

const redirectToLogin = () => {
  if (isShopifyEmbeddedApp()) {
    redirectToEmbeddedLogin();
    return;
  }
  window.location.href = '/login';
};

// No client-side JWT decoding — trust the server's 401
const handle401 = () => {
  clearAuthData();
  redirectToLogin();
};

// ─── Authenticated API interceptors ──────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenant_id') ||
                     localStorage.getItem('tenantId') ||
                     localStorage.getItem('x-tenant-id');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (tenantId) config.headers['x-tenant-id'] = tenantId;
    config.headers['X-Device-ID'] = getOrCreateDeviceId();
    const accountId = localStorage.getItem('user_id') || '';
    if (accountId) config.headers['X-Account-ID'] = accountId;
    log('📡 Request:', { url: config.url, method: config.method });
    return config;
  },
  (error) => {
    logError('Request error:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    log('✅ API Response:', { url: response.config.url, status: response.status });
    return response;
  },
  (error) => {
    logError('❌ API Error:', { url: error.config?.url, status: error.response?.status });
    if (error.response?.status === 401) handle401();
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timed out. Please check your connection and try again.';
    }
    return Promise.reject(error);
  }
);

// ─── Dashboard API interceptors ───────────────────────────
dashboardApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenant_id') ||
                     localStorage.getItem('tenantId') ||
                     localStorage.getItem('x-tenant-id');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (tenantId) config.headers['x-tenant-id'] = tenantId;
    log('📊 Dashboard Request:', { url: config.url, method: config.method });
    return config;
  },
  (error) => {
    logError('Dashboard Request error:', error);
    return Promise.reject(error);
  }
);

dashboardApi.interceptors.response.use(
  (response) => {
    log('✅ Dashboard Response:', { url: response.config.url, status: response.status });
    return response;
  },
  (error) => {
    logError('❌ Dashboard Error:', { url: error.config?.url, status: error.response?.status });
    if (error.response?.status === 401) handle401();
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timed out. Please check your connection and try again.';
    }
    return Promise.reject(error);
  }
);

// ─── Public API interceptors ──────────────────────────────
publicApi.interceptors.response.use(
  (response) => {
    log('✅ Public API Response:', { url: response.config.url, status: response.status });
    return response;
  },
  (error) => {
    logError('❌ Public API Error:', { url: error.config?.url, status: error.response?.status });
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timed out. Please check your connection and try again.';
    }
    return Promise.reject(error);
  }
);

export default api;
