import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/axios';
import toast from 'react-hot-toast';
import { stopHeartbeat } from '../utils/device';
import {
  exchangeEmbeddedSessionToken,
  hasEmbeddedLogoutFlag,
  redirectToEmbeddedLogin,
  isShopifyEmbeddedApp
} from '../utils/shopifyEmbedded';

export const AuthContext = createContext();

// Helper function to decode JWT without external dependency
const decodeJWT = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
};

const storeTenantIds = (tenantId) => {
  if (!tenantId) {
    return;
  }

  localStorage.setItem('tenant_id', tenantId);
  localStorage.setItem('tenantId', tenantId);
  localStorage.setItem('x-tenant-id', tenantId);
};

const clearStoredAuthData = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('tenant_id');
  localStorage.removeItem('tenantId');
  localStorage.removeItem('x-tenant-id');
  localStorage.removeItem('user');
};


export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const clearAuthData = () => {
  clearStoredAuthData();
  setUser(null);
  setIsAuthenticated(false);
};

const applyToken = (token) => {
  if (!token) {
    return false;
  }

  localStorage.setItem('token', token);

  const decodedToken = decodeJWT(token);

  if (!decodedToken) {
    clearAuthData();
    return false;
  }

  const currentTime = Date.now() / 1000;
  if (decodedToken.exp && decodedToken.exp <= currentTime) {
    clearAuthData();
    return false;
  }

  setUser(decodedToken);
  setIsAuthenticated(true);

  const tenantId = decodedToken.tenant_id || decodedToken.tenantId;
  if (tenantId) {
    storeTenantIds(tenantId);
  }

  return true;
};
 useEffect(() => {
  let isMounted = true;

  const initializeAuth = async () => {
    try {
      if (hasEmbeddedLogoutFlag()) {
        if (isMounted) {
          clearAuthData();
        }
        return;
      }

      if (isShopifyEmbeddedApp()) {
        try {
          const embeddedSession = await exchangeEmbeddedSessionToken();
          const embeddedToken = embeddedSession?.access_token || embeddedSession?.token;

          if (embeddedToken && isMounted && applyToken(embeddedToken)) {
            console.log('🔐 Embedded Shopify session bootstrapped successfully');
            return;
          }
        } catch (error) {
          console.error('🔐 Embedded Shopify bootstrap failed:', error.message || error);
        }
      }

      const token = localStorage.getItem('token');

      if (token && isMounted && applyToken(token)) {
        console.log('🔐 Valid stored token found');
        return;
      }

      if (isMounted) {
        clearAuthData();
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  initializeAuth();

  return () => {
    isMounted = false;
  };
}, []);

  const login = (token) => {
  if (!token) {
    console.error('No token provided to login function');
    return false;
  }

  console.log('🔐 AuthContext login called');

  const didApply = applyToken(token);
  if (!didApply) {
    console.warn('⚠️ Failed to apply login token');
  }

  return didApply;
};

const logout = () => {
  stopHeartbeat();
  api.post('/api/devices/logout').catch(() => {}); // fire-and-forget, static import
  clearAuthData();

  if (isShopifyEmbeddedApp()) {
    redirectToEmbeddedLogin();
    return;
  }

  toast.success('Logged out successfully');
  window.location.href = '/login';
};

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthProvider;
