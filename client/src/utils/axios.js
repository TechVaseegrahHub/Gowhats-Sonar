import axios from 'axios';
import {
  isShopifyEmbeddedApp,
  redirectToEmbeddedLogin
} from './shopifyEmbedded';
import { getOrCreateDeviceId } from './device';

// Get base URL from environment
const getBaseURL = () => {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
};

// Regular API instance (requires auth)
const api = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

const clearStoredAuthData = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('tenant_id');
  localStorage.removeItem('tenantId');
  localStorage.removeItem('x-tenant-id');
  localStorage.removeItem('user');
};

const redirectToLogin = () => {
  if (isShopifyEmbeddedApp()) {
    redirectToEmbeddedLogin();
    return;
  }
  window.location.href = '/login';
};

// Shared 401 handler — only logs out if token is actually expired
const handle401 = (label = 'API') => {
  const token = localStorage.getItem('token');
  if (!token) {
    // No token at all — redirect to login
    redirectToLogin();
    return;
  }
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const isExpired = payload.exp * 1000 < Date.now();
    if (isExpired) {
      console.log(`🔐 ${label}: Token genuinely expired, logging out`);
      clearStoredAuthData();
      redirectToLogin();
    } else {
      console.warn(`⚠️ ${label}: Got 401 but token is still valid — likely a permission issue, not logging out`);
    }
  } catch {
    console.error(`🔐 ${label}: Failed to decode token, logging out`);
    clearStoredAuthData();
    redirectToLogin();
  }
};

// Public API instance (no auth required)
export const publicApi = axios.create({
  baseURL: getBaseURL(),
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Dashboard API instance (special handling for CORS issues)
export const dashboardApi = axios.create({
  baseURL: getBaseURL(),
  withCredentials: false,
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Enhanced request interceptor for authenticated API
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenant_id') ||
                    localStorage.getItem('tenantId') ||
                    localStorage.getItem('x-tenant-id');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (tenantId) {
      config.headers['x-tenant-id'] = tenantId;
    }
    const deviceId = getOrCreateDeviceId();
    config.headers['X-Device-ID'] = deviceId;

    const accountId = localStorage.getItem('user_id') || '';
    if (accountId) config.headers['X-Account-ID'] = accountId;
    console.log('📡 Request config:', {
      url: config.url,
      method: config.method,
      headers: {
        Authorization: config.headers.Authorization ? 'Bearer [TOKEN]' : 'none',
        'x-tenant-id': config.headers['x-tenant-id'] || 'none'
      }
    });

    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Dashboard API request interceptor
dashboardApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenant_id') ||
                    localStorage.getItem('tenantId') ||
                    localStorage.getItem('x-tenant-id');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (tenantId) {
      config.headers['x-tenant-id'] = tenantId;
    }

    console.log('📊 Dashboard Request config:', {
      url: config.url,
      method: config.method,
      headers: {
        Authorization: config.headers.Authorization ? 'Bearer [TOKEN]' : 'none',
        'x-tenant-id': config.headers['x-tenant-id'] || 'none'
      }
    });

    return config;
  },
  (error) => {
    console.error('Dashboard Request error:', error);
    return Promise.reject(error);
  }
);

// Enhanced response interceptor for authenticated API
api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('❌ API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data || error.message
    });

    if (error.response?.status === 401) {
      handle401('API');
    }

    return Promise.reject(error);
  }
);

// Dashboard API response interceptor
dashboardApi.interceptors.response.use(
  (response) => {
    console.log('✅ Dashboard API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('❌ Dashboard API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data || error.message
    });

    if (error.response?.status === 401) {
      handle401('Dashboard API');
    }

    return Promise.reject(error);
  }
);

// Public API response interceptor
publicApi.interceptors.response.use(
  (response) => {
    console.log('✅ Public API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('❌ Public API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data || error.message
    });
    return Promise.reject(error);
  }
);

export default api;
