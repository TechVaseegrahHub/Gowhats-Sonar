const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || 'https://bot.gowhats.in';

const getSearchParams = () => {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
};

export const hasEmbeddedLogoutFlag = () => getSearchParams().get('logged_out') === '1';

export const isShopifyEmbeddedApp = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const params = getSearchParams();

  if (typeof window.shopify?.idToken === 'function') {
    return true;
  }

  if (params.get('embedded') === '1' || params.has('host') || params.has('shop')) {
    return true;
  }

  try {
    return window.self !== window.top;
  } catch (_error) {
    return true;
  }
};

export const waitForShopifyGlobal = async (timeoutMs = 5000) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (typeof window.shopify?.idToken === 'function') {
      return window.shopify;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  return null;
};

const buildLoggedOutLoginUrl = () => {
  const loginUrl = new URL(`${window.location.origin}/login`);
  const params = getSearchParams();

  loginUrl.searchParams.set('logged_out', '1');

  if (isShopifyEmbeddedApp()) {
    loginUrl.searchParams.set('embedded', '1');

    if (params.has('host')) {
      loginUrl.searchParams.set('host', params.get('host'));
    }

    if (params.has('shop')) {
      loginUrl.searchParams.set('shop', params.get('shop'));
    }
  }

  return loginUrl.toString();
};

export const redirectToEmbeddedLogin = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.location.replace(buildLoggedOutLoginUrl());
  } catch (_error) {
    window.location.href = buildLoggedOutLoginUrl();
  }
};

export const getShopifyIdToken = async () => {
  const shopify = await waitForShopifyGlobal();

  if (!shopify) {
    return '';
  }

  try {
    return await shopify.idToken();
  } catch (error) {
    console.error('[Shopify Embedded] Failed to fetch Shopify ID token:', error);
    return '';
  }
};

export const exchangeEmbeddedSessionToken = async () => {
  const idToken = await getShopifyIdToken();

  if (!idToken) {
    return null;
  }

  const response = await fetch(`${getApiBaseUrl()}/api/shopify/embedded/session`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || 'Failed to authenticate embedded Shopify session');
  }

  return response.json();
};

