import React, { useState, useEffect } from 'react';
import api from '../utils/axios';
import { toast } from 'react-toastify';
import Swal from 'sweetalert2';
import { Store, Plug, Link2, Trash2, Copy, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import useSubscription from '../hooks/useSubscription';
import UpgradeToProButton from '../components/UpgradeToProButton';

const normalizeShopifyDomain = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed || trimmed.includes('@')) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.replace(/^www\./, '');
    return host.endsWith('.myshopify.com') ? host : null;
  } catch (_error) {
    return null;
  }
};

const normalizeIntegrationStoreUrl = (storeType, value = '') => {
  const trimmed = String(value || '').trim();

  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (storeType === 'woocommerce') {
      const pathname = parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname.replace(/\/+$/, '')
        : '';

      return `${parsed.protocol}//${host}${pathname}`;
    }

    return host;
  } catch (_error) {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
};

const dedupeIntegrations = (items = []) => {
  const uniqueByStore = new Map();

  items
    .filter((item) => item?.isActive !== false)
    .forEach((item) => {
      const storeKey = `${item?.storeType || 'unknown'}:${normalizeIntegrationStoreUrl(item?.storeType, item?.storeUrl) || item?.id || ''}`;

      if (!uniqueByStore.has(storeKey)) {
        uniqueByStore.set(storeKey, item);
      }
    });

  return Array.from(uniqueByStore.values());
};

const navigateToShopifyInstall = (installUrl) => {
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = installUrl;
      return;
    }
  } catch (error) {
    console.warn('Top window redirect failed, falling back to same-window navigation:', error);
  }

  try {
    window.location.assign(installUrl);
  } catch (error) {
    console.warn('Same-window redirect failed, opening new tab:', error);
    window.open(installUrl, '_blank', 'noopener,noreferrer');
  }
};

function StoreIntegration({ embedded = false }) {
  const { subscription } = useSubscription({
    liveUpdates: true
  });
  const [storeType, setStoreType] = useState('');
  const [storeUrl, setStoreUrl] = useState('');

  // For WooCommerce
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [approvedTemplates, setApprovedTemplates] = useState([]);
  const [retryingWebhookId, setRetryingWebhookId] = useState('');

  useEffect(() => {
    loadIntegrations();
    loadTemplates();

    const searchParams = new URLSearchParams(window.location.search);
    const shopParam = normalizeShopifyDomain(searchParams.get('shop'));
    const shopifyStatus = searchParams.get('shopify');
    const shopifyMessage = searchParams.get('message');

    if (shopParam) {
      setStoreType('shopify');
      setStoreUrl(shopParam);
    }

    if (shopifyStatus === 'connected') {
      Swal.fire({
        title: 'Shopify Connected',
        text: `GoWhats is now linked to ${shopParam || 'your Shopify store'}.`,
        icon: 'success',
        confirmButtonColor: '#10B981',
      });
    } else if (shopifyStatus === 'error' && shopifyMessage) {
      toast.error(shopifyMessage);
    }

    if (shopifyStatus) {
      searchParams.delete('shopify');
      searchParams.delete('message');
      const nextSearch = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  const loadIntegrations = async () => {
    try {
      const response = await api.get('/api/integrations');
      setIntegrations(dedupeIntegrations(response.data || []));
    } catch (error) {
      console.error('Failed to load integrations:', error);
      toast.error('Failed to load integrations');
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await api.get('/api/templates');
      const templates = Array.isArray(response.data?.templates) ? response.data.templates : [];
      setApprovedTemplates(templates.filter((template) => template.status === 'APPROVED'));
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const resetForm = () => {
    setApiKey('');
    setApiSecret('');
    setStoreUrl('');
    setStoreType('');
  };

  const handleConnect = async () => {
    if (!storeType || !storeUrl) {
      toast.error('Please fill Store Type and URL');
      return;
    }

    if (storeType === 'woocommerce' && (!apiKey || !apiSecret)) {
        toast.error('Consumer Key and Secret are required for WooCommerce');
        return;
    }

    setIsLoading(true);
    try {
      if (storeType === 'shopify') {
        const normalizedShop = normalizeShopifyDomain(storeUrl);

        if (!normalizedShop) {
          toast.error('Enter your Shopify domain like your-store.myshopify.com. Do not use an email address.');
          return;
        }

        const response = await api.post('/api/shopify/install-link', {
          shop: normalizedShop
        });

        if (!response.data?.installUrl) {
          throw new Error('Missing Shopify install URL');
        }

        console.log('Redirecting Shopify install to:', response.data.installUrl);
        navigateToShopifyInstall(response.data.installUrl);
        return;
      }

      const response = await api.post('/api/integrations/connect', {
        storeType,
        storeUrl,
        apiKey,
        apiSecret,
      });

      if (response.data.success) {
        resetForm();
        await loadIntegrations();
        Swal.fire({

          title: response.data.existing ? 'Already Connected' : 'Connected!',
          text: response.data.message || 'Store integrated successfully!',
          icon: response.data.existing ? 'info' : 'success',
          confirmButtonColor: '#10B981',
        });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const updateIntegrationSettings = async (integrationId, settings) => {
    try {
      const response = await api.patch(`/api/integrations/${integrationId}/update-setting`, settings);
      if (response.data.success) {
        setIntegrations((prev) => prev.map((i) => (i.id === integrationId ? response.data.integration : i)));
        const [firstKey] = Object.keys(settings);
        const firstValue = settings[firstKey];
        if (typeof firstValue === 'boolean' || firstKey === 'abandonedCartDelay' || firstKey.startsWith('restock')) {
          toast.success('Integration settings updated');
        }
      } else { toast.error('Failed to update setting'); }
    } catch (error) { toast.error('Failed to update setting'); }
  };

  const updateIntegrationSetting = async (integrationId, settingKey, value) => {
    await updateIntegrationSettings(integrationId, { [settingKey]: value });
  };

  const updateAdminToken = async (integrationId) => {
    const { value: token } = await Swal.fire({
      title: 'Update Token',
      input: 'password',
      inputPlaceholder: 'shpat_xxxxxxxxxxxxxxxx',
      confirmButtonText: 'Update',
      showCancelButton: true,
      confirmButtonColor: '#10B981'
    });

    if (token) {
      try {
        const res = await api.patch(`/api/integrations/${integrationId}/update-admin-token`, { adminAccessToken: token });
        if (res.data.success) {
            loadIntegrations();
            toast.success('Token updated!');
        }
      } catch { toast.error('Failed to update token'); }
    }
  };

  const retryShopifyWebhooks = async (integrationId) => {
    setRetryingWebhookId(integrationId);

    try {
      const response = await api.post(`/api/integrations/${integrationId}/retry-webhooks`);
      const updatedIntegration = response.data?.integration;

      if (updatedIntegration) {
        setIntegrations((prev) => prev.map((item) => (
          item.id === integrationId ? updatedIntegration : item
        )));
      } else {
        await loadIntegrations();
      }

      if (updatedIntegration?.shopifyWebhookStatus?.status === 'success') {
        toast.success('Shopify webhooks are active now.');
      } else if (updatedIntegration?.shopifyWebhookStatus?.requiresProtectedCustomerData) {
        toast.error('Shopify still requires Protected Customer Data approval before order webhooks can be created.');
      } else {
        toast.info('Shopify webhook sync completed. Check the status message below.');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to retry Shopify webhooks');
    } finally {
      setRetryingWebhookId('');
    }
  };

  const copyWebhookUrl = (url) => { navigator.clipboard.writeText(url); toast.success('Webhook URL copied!'); };

  const deleteIntegration = async (integrationId, storeType) => {
    const res = await Swal.fire({
      title: `Disconnect ${storeType}?`,
      text: 'This will remove the integration.',
      icon: 'warning',
      confirmButtonText: 'Disconnect',
      confirmButtonColor: '#DC2626',
      showCancelButton: true,
    });
    if (res.isConfirmed) {
      try {
        await api.delete(`/api/integrations/${integrationId}`);
        await loadIntegrations();
        toast.success(`${storeType} disconnected.`);
      } catch { toast.error('Failed to remove integration.'); }
    }
  };

  const connectedPlatforms = integrations.map((i) => i.storeType);
  const confirmationUsage = subscription.websiteIntegration || {};
  const confirmationLimit = confirmationUsage.orderConfirmationLimit || 100;
  const confirmationSent = confirmationUsage.orderConfirmationSent || 0;
  const confirmationRemaining = confirmationUsage.orderConfirmationRemaining ?? Math.max(confirmationLimit - confirmationSent, 0);
  const hasProAccess = subscription?.hasProAccess ?? subscription?.isPro ?? false;
  const isTrialActive = subscription?.trial?.isActive;
  const trialDaysLeft = subscription?.trial?.daysLeft ?? 0;
  const proExpired = subscription?.pro?.isExpired;
  const isLimitReached = !hasProAccess && confirmationRemaining <= 0;
  const usagePercent = Math.min((confirmationSent / confirmationLimit) * 100, 100);

  return (
    <div className={`${embedded ? 'p-0 sm:p-2' : 'p-4 sm:p-6 lg:p-10 mt-2 sm:mt-4'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 sm:p-8 mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-green-600 to-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md">
            <Store className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Store Integration</h1>
            <p className="text-sm text-gray-600">Connect and manage your Shopify or WooCommerce store connections.</p>
          </div>
        </div>
 
        <div className={`rounded-2xl border p-5 mb-8 ${isLimitReached ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className={`text-xs font-bold uppercase tracking-wide ${isLimitReached ? 'text-red-700' : 'text-amber-700'}`}>
                {proExpired ? 'Subscription Expired' : subscription.isPro ? 'Pro Plan' : isTrialActive ? 'Free Trial' : 'Free Trial Ended'}
              </p>
              <h3 className={`text-lg font-semibold ${isLimitReached ? 'text-red-900' : 'text-amber-900'}`}>
                Website order confirmation messages: {confirmationSent} / {confirmationLimit}
              </h3>
              <p className={`text-sm ${isLimitReached ? 'text-red-700' : 'text-amber-700'}`}>
                {subscription.isPro && hasProAccess
                  ? 'You have unlimited order confirmation messaging.'
                  : proExpired
                    ? 'Your Pro subscription has expired. Please pay to continue using website order confirmations.'
                  : isTrialActive
                    ? `Free trial active. ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left.`
                    : isLimitReached
                      ? 'Limit reached. New website order confirmations are blocked. Upgrade to Pro for unlimited messages.'
                      : `${confirmationRemaining} messages remaining in Free Trial.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!hasProAccess && (
                <UpgradeToProButton
                  label={proExpired ? 'Pay Now' : 'Upgrade to Pro'}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${isLimitReached ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                />
              )}
            </div>
          </div>
          {!hasProAccess && (
            <div className="mt-3 w-full bg-white/60 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all ${isLimitReached ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Connected Stores List */}
        {integrations.length > 0 && (
          <div className="mb-8 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Connected Stores</h2>
            {integrations.map((integration) => (
              <div key={integration.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-6 hover:shadow-md transition">
                {integration.storeType === 'shopify' && integration.connectedVia === 'oauth' && (
                  <div
                    className={`mb-5 rounded-2xl border p-4 ${
                      integration.shopifyWebhookStatus?.status === 'success'
                        ? 'border-emerald-200 bg-emerald-50'
                        : integration.shopifyWebhookStatus?.requiresProtectedCustomerData
                          ? 'border-amber-200 bg-amber-50'
                          : integration.shopifyWebhookStatus?.status === 'error' || integration.shopifyWebhookStatus?.status === 'partial'
                            ? 'border-red-200 bg-red-50'
                            : 'border-blue-200 bg-blue-50'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-tight text-gray-900">
                          {integration.shopifyWebhookStatus?.status === 'success'
                            ? 'Shopify webhooks active'
                            : integration.shopifyWebhookStatus?.requiresProtectedCustomerData
                              ? 'Protected customer data approval required'
                              : integration.shopifyWebhookStatus?.status === 'partial'
                                ? 'Shopify webhooks partially active'
                                : integration.shopifyWebhookStatus?.status === 'error'
                                  ? 'Shopify webhook setup failed'
                                  : 'Shopify webhook setup pending'}
                        </h4>
                        <p className="mt-1 text-sm text-gray-700">
                          {integration.shopifyWebhookStatus?.status === 'success'
                            ? 'Order confirmation, fulfillment, and other Shopify webhooks are connected for this store.'
                            : integration.shopifyWebhookStatus?.requiresProtectedCustomerData
                              ? 'Shopify connected successfully, but GoWhats cannot create order-related webhooks yet because Shopify Protected Customer Data approval is still required for customer phone, name, address, or email.'
                              : integration.shopifyWebhookStatus?.status === 'partial'
                                ? 'Some Shopify webhooks were created, but at least one topic still failed. Review the error below and retry after fixing permissions.'
                                : integration.shopifyWebhookStatus?.status === 'error'
                                  ? 'Shopify connected successfully, but webhook setup failed. Order confirmations will not send until webhook sync succeeds.'
                                  : 'GoWhats is still checking Shopify webhook subscriptions for this store.'}
                        </p>
                        {integration.shopifyWebhookStatus?.lastErrorMessage && (
                          <p className="mt-2 text-xs text-gray-600">
                            Last Shopify response: {integration.shopifyWebhookStatus.lastErrorMessage}
                          </p>
                        )}
                        {integration.shopifyWebhookStatus?.requiresProtectedCustomerData && (
                          <a
                            href="https://shopify.dev/docs/apps/launch/protected-customer-data"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-xs font-semibold text-amber-800 underline underline-offset-2"
                          >
                            Open Shopify protected customer data guide
                          </a>
                        )}
                      </div>
                      {integration.shopifyWebhookStatus?.status !== 'success' && (
                        <button
                          onClick={() => retryShopifyWebhooks(integration.id)}
                          disabled={retryingWebhookId === integration.id}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {retryingWebhookId === integration.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Retry Shopify Webhooks
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Store Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold capitalize text-gray-800 flex items-center gap-2">
                      <Plug className="w-5 h-5 text-green-600" /> {integration.storeType}
                    </h3>
                    <p className="text-sm text-gray-500">{integration.storeUrl}</p>
                    {integration.storeType === 'shopify' && (
                      <p className="text-xs text-gray-400 mt-1">
                        {integration.connectedVia === 'oauth'
                          ? 'Connected through Shopify app install'
                          : 'Legacy Admin API token connection'}
                      </p>
                    )}
                  </div>
                  <button onClick={() => deleteIntegration(integration.id, integration.storeType)} className="text-red-600 hover:text-red-700 text-sm font-semibold flex items-center gap-1 w-fit">
                    <Trash2 className="w-4 h-4" /> Disconnect
                  </button>
                </div>

                {/* Toggles & Settings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  {[
                    {
                      label: 'Order Confirmations',
                      key: 'isMessageEnabled',
                      value: integration.isMessageEnabled,
                    },
                    {
                      label: 'Abandoned Cart',
                      key: 'isAbandonedCartEnabled',
                      value: integration.isAbandonedCartEnabled,
                      showTimer: true
                    },
                    {
                      label: 'Dispatch Notifications',
                      key: 'isDispatchedMessageEnabled',
                      value: integration.isDispatchedMessageEnabled,
                    },
                  ]
                  .filter(opt => (integration.storeType === 'shopify') || (opt.key !== 'isDispatchedMessageEnabled'))
                  .map((opt) => (
                    <div key={opt.key} className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col justify-between">

                      {/* Top Row: Label + Toggle */}
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className="font-bold text-gray-700 text-sm uppercase tracking-tight">{opt.label}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(opt.value)}
                            onChange={() => updateIntegrationSetting(integration.id, opt.key, !opt.value)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:h-5 after:w-5 after:rounded-full after:transition-all peer-checked:after:translate-x-full"></div>
                        </label>
                      </div>

                      {/* ✅ ENHANCED TIMER UI: Only for Abandoned Cart when Enabled */}
                      {opt.showTimer && opt.value && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] font-bold text-gray-500 uppercase flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Delay
                                </span>
                                <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg px-2 py-1 shadow-sm">
                                    <input
                                        type="number"
                                        className="w-10 text-center text-sm font-bold text-green-700 focus:outline-none"
                                        value={integration.abandonedCartDelay || 30}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setIntegrations(prev => prev.map(i => i.id === integration.id ? {...i, abandonedCartDelay: val} : i));
                                        }}
                                        onBlur={(e) => {
                                            const val = parseInt(e.target.value);
                                            if(val > 0) updateIntegrationSetting(integration.id, 'abandonedCartDelay', val);
                                        }}
                                    />
                                    <span className="text-[10px] text-gray-400 font-bold border-l pl-1">MINS</span>
                                </div>
                            </div>

                            {/* Quick Presets */}
                            <div className="flex gap-1.5">
                                {[30, 60, 360, 1440].map((mins) => (
                                    <button
                                        key={mins}
                                        onClick={() => updateIntegrationSetting(integration.id, 'abandonedCartDelay', mins)}
                                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
                                            integration.abandonedCartDelay === mins
                                                ? 'bg-green-600 border-green-600 text-white shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600'
                                        }`}
                                    >
                                        {mins < 60 ? `${mins}M` : mins >= 1440 ? `${mins / 1440}D` : `${mins / 60}H`}
                                    </button>
                                ))}
                            </div>
                        </div>
                      )}

                    </div>
                  ))}
                </div>

                {/* Token Update Button (Shopify Only) */}
                {integration.storeType === 'shopify' && integration.connectedVia !== 'oauth' && (
                    <div className="flex justify-end mb-4">
                         <button onClick={() => updateAdminToken(integration.id)} className="text-blue-600 hover:text-blue-700 text-sm font-medium underline">
                            Update Legacy Admin API Token
                         </button>
                    </div>
                )}

                {integration.storeType === 'shopify' && (
                  <div className="mb-6 p-5 rounded-2xl border border-emerald-100 bg-emerald-50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-tight text-emerald-900">Restock Alerts</h4>
                        <p className="text-sm text-emerald-800 mt-1">
                          Capture out-of-stock requests from the Shopify product page and send an approved WhatsApp template when the variant comes back in stock.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(integration.isRestockEnabled)}
                          onChange={() => updateIntegrationSetting(integration.id, 'isRestockEnabled', !integration.isRestockEnabled)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:h-5 after:w-5 after:rounded-full after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>

                    {integration.isRestockEnabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                        <div>
                          <label className="font-semibold text-sm text-emerald-900">Approved WhatsApp Template</label>
                          <select
                            value={integration.restockTemplateName || ''}
                            onChange={(e) => {
                              const selectedTemplate = approvedTemplates.find((template) => template.name === e.target.value);
                              updateIntegrationSettings(integration.id, {
                                restockTemplateName: e.target.value,
                                restockTemplateLanguage: selectedTemplate?.language || 'en'
                              });
                            }}
                            className="w-full mt-2 border border-emerald-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 outline-none"
                          >
                            <option value="">Select approved template</option>
                            {approvedTemplates.map((template) => (
                              <option key={`${template.name}-${template.language}`} value={template.name}>
                                {template.name} ({template.language})
                              </option>
                            ))}
                          </select>
                          <p className="mt-2 text-xs text-emerald-800">
                            Best for v1: use a simple text template. Variable order used by GoWhats is customer name, product title, product link, variant title, shop name, stock quantity.
                          </p>
                        </div>

                        <div>
                          <label className="font-semibold text-sm text-emerald-900">Notify Limit</label>
                          <select
                            value={integration.restockNotificationMode || 'available_quantity'}
                            onChange={(e) => updateIntegrationSetting(integration.id, 'restockNotificationMode', e.target.value)}
                            className="w-full mt-2 border border-emerald-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 outline-none"
                          >
                            <option value="available_quantity">Match available quantity</option>
                            <option value="fixed_cap">Fixed cap</option>
                          </select>

                          {integration.restockNotificationMode === 'fixed_cap' && (
                            <div className="mt-3">
                              <label className="font-semibold text-sm text-emerald-900">Fixed cap per restock event</label>
                              <input
                                type="number"
                                min="1"
                                value={integration.restockFixedCap || 30}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value, 10);
                                  setIntegrations((prev) =>
                                    prev.map((item) => (
                                      item.id === integration.id
                                        ? { ...item, restockFixedCap: Number.isFinite(value) ? value : '' }
                                        : item
                                    ))
                                  );
                                }}
                                onBlur={(e) => {
                                  const value = parseInt(e.target.value, 10);
                                  if (value > 0) {
                                    updateIntegrationSetting(integration.id, 'restockFixedCap', value);
                                  }
                                }}
                                className="w-full mt-2 border border-emerald-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 outline-none"
                              />
                              <p className="mt-2 text-xs text-emerald-800">
                                Example: if stock returns with 30 units, GoWhats will notify the first 30 waiting customers.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {integration.storeType === 'woocommerce' && (
                  <div className="mb-6 p-5 rounded-2xl border border-purple-100 bg-purple-50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-tight text-purple-900">Restock Alerts</h4>
                        <p className="text-sm text-purple-800 mt-1">
                          Capture out-of-stock requests from WooCommerce product pages and send an approved WhatsApp template when stock comes back.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(integration.isRestockEnabled)}
                          onChange={() => updateIntegrationSetting(integration.id, 'isRestockEnabled', !integration.isRestockEnabled)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-purple-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:h-5 after:w-5 after:rounded-full after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>

                    {integration.isRestockEnabled && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                          <div>
                            <label className="font-semibold text-sm text-purple-900">Approved WhatsApp Template</label>
                            <select
                              value={integration.restockTemplateName || ''}
                              onChange={(e) => {
                                const selectedTemplate = approvedTemplates.find((template) => template.name === e.target.value);
                                updateIntegrationSettings(integration.id, {
                                  restockTemplateName: e.target.value,
                                  restockTemplateLanguage: selectedTemplate?.language || 'en'
                                });
                              }}
                              className="w-full mt-2 border border-purple-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-purple-500 outline-none"
                            >
                              <option value="">Select approved template</option>
                              {approvedTemplates.map((template) => (
                                <option key={`${template.name}-${template.language}`} value={template.name}>
                                  {template.name} ({template.language})
                                </option>
                              ))}
                            </select>
                            <p className="mt-2 text-xs text-purple-800">
                              Variable order used by GoWhats is customer name, product title, product link, variant title, shop name, stock quantity.
                            </p>
                          </div>

                          <div>
                            <label className="font-semibold text-sm text-purple-900">Notify Limit</label>
                            <select
                              value={integration.restockNotificationMode || 'available_quantity'}
                              onChange={(e) => updateIntegrationSetting(integration.id, 'restockNotificationMode', e.target.value)}
                              className="w-full mt-2 border border-purple-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-purple-500 outline-none"
                            >
                              <option value="available_quantity">Match available quantity</option>
                              <option value="fixed_cap">Fixed cap</option>
                            </select>

                            {integration.restockNotificationMode === 'fixed_cap' && (
                              <div className="mt-3">
                                <label className="font-semibold text-sm text-purple-900">Fixed cap per restock event</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={integration.restockFixedCap || 30}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    setIntegrations((prev) =>
                                      prev.map((item) => (
                                        item.id === integration.id
                                          ? { ...item, restockFixedCap: Number.isFinite(value) ? value : '' }
                                          : item
                                      ))
                                    );
                                  }}
                                  onBlur={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    if (value > 0) {
                                      updateIntegrationSetting(integration.id, 'restockFixedCap', value);
                                    }
                                  }}
                                  className="w-full mt-2 border border-purple-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-purple-500 outline-none"
                                />
                                <p className="mt-2 text-xs text-purple-800">
                                  Example: if stock returns with 40 units, GoWhats will notify the first 40 waiting customers.
                                </p>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="font-semibold text-sm text-purple-900">CTA Button</label>
                            <input
                              type="text"
                              value={integration.restockCtaLabel || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setIntegrations((prev) => prev.map((item) => (
                                  item.id === integration.id ? { ...item, restockCtaLabel: value } : item
                                )));
                              }}
                              onBlur={(e) => updateIntegrationSetting(integration.id, 'restockCtaLabel', e.target.value.trim() || 'Request stock')}
                              className="w-full mt-2 border border-purple-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-purple-500 outline-none"
                              placeholder="Request stock"
                            />
                          </div>

                          <div>
                            <label className="font-semibold text-sm text-purple-900">Phone Placeholder</label>
                            <input
                              type="text"
                              value={integration.restockPhonePlaceholder || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setIntegrations((prev) => prev.map((item) => (
                                  item.id === integration.id ? { ...item, restockPhonePlaceholder: value } : item
                                )));
                              }}
                              onBlur={(e) => updateIntegrationSetting(integration.id, 'restockPhonePlaceholder', e.target.value.trim() || 'Enter your WhatsApp number')}
                              className="w-full mt-2 border border-purple-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-purple-500 outline-none"
                              placeholder="Enter your WhatsApp number"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="font-semibold text-sm text-purple-900">Success Description</label>
                            <textarea
                              rows="3"
                              value={integration.restockSuccessDescription || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setIntegrations((prev) => prev.map((item) => (
                                  item.id === integration.id ? { ...item, restockSuccessDescription: value } : item
                                )));
                              }}
                              onBlur={(e) => updateIntegrationSetting(integration.id, 'restockSuccessDescription', e.target.value.trim() || 'Get notified on WhatsApp when the product comes back in stock')}
                              className="w-full mt-2 border border-purple-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-purple-500 outline-none"
                              placeholder="Get notified on WhatsApp when the product comes back in stock"
                            />
                          </div>

                          <div>
                            <label className="font-semibold text-sm text-purple-900">Default Country Code</label>
                            <input
                              type="text"
                              maxLength="4"
                              value={integration.restockDefaultCountry || 'IN'}
                              onChange={(e) => {
                                const value = e.target.value.toUpperCase();
                                setIntegrations((prev) => prev.map((item) => (
                                  item.id === integration.id ? { ...item, restockDefaultCountry: value } : item
                                )));
                              }}
                              onBlur={(e) => updateIntegrationSetting(integration.id, 'restockDefaultCountry', (e.target.value || 'IN').trim().toUpperCase())}
                              className="w-full mt-2 border border-purple-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700 focus:border-purple-500 outline-none"
                              placeholder="IN"
                            />
                            <p className="mt-2 text-xs text-purple-800">
                              Use a short country code like `IN`, `US`, or `AE` for the Woo widget.
                            </p>
                          </div>
                        </div>


			<div className="mt-5 rounded-2xl border border-purple-200 bg-white p-4 space-y-3">

 			<div>
                            <h5 className="text-sm font-bold uppercase tracking-tight text-purple-900">Woo Plugin Setup</h5>
                            <p className="mt-1 text-xs text-purple-800">
                              Install the WooCommerce restock plugin on your store, then use these GoWhats endpoints and secret for server-to-server calls.
                            </p>
			  </div>

			  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                              Restock request dashboard
                            </p>
                            <p className="mt-1 text-xs text-emerald-700">
                              Open the product-wise customer list page to review waiting phone numbers and manually send selected restock alerts.
                            </p>
                            <a
                              href={`/admin/restock/woocommerce/${integration.id}`}
                              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                            >
                              Open restock dashboard
                            </a>
                          </div>

                          {[
                            { label: 'Subscribe URL', value: integration.restockSubscribeUrl },
                            { label: 'Status URL', value: integration.restockStatusUrl },
                            { label: 'Stock Update URL', value: integration.restockStockUpdateUrl },
                            { label: 'Shared Secret', value: integration.restockSharedSecret }
                          ].map((item) => (
                            <div key={item.label}>
                              <label className="text-[10px] font-bold text-purple-800 uppercase">{item.label}</label>
                              <div className="mt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                  type="text"
                                  readOnly
                                  value={item.value || ''}
                                  className="flex-1 bg-purple-50 border border-purple-200 text-xs text-gray-700 rounded-lg px-3 py-2 focus:outline-none min-w-0"
                                />
                                <button
                                  onClick={() => copyWebhookUrl(item.value || '')}
                                  className="bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 p-2 rounded-lg transition shadow-sm"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                 
                {/* Webhook URL */}
                <div className="mt-2 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <label className="text-[10px] font-bold text-blue-800 uppercase flex items-center gap-1 mb-2">
                    <Link2 className="w-3 h-3" /> {integration.storeType === 'shopify' && integration.connectedVia === 'oauth'
                      ? 'Shopify webhook endpoint'
                      : 'Webhook URL (Copy this to your store)'}
                  </label>
                  {integration.storeType === 'shopify' && integration.connectedVia === 'oauth' && (
                    <p className="mb-2 text-xs text-blue-700">
                      Shopify app install manages this endpoint automatically. You do not need to paste it into Shopify manually.
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input type="text" readOnly value={integration.webhookUrl} className="flex-1 bg-white border border-blue-200 text-xs text-gray-600 rounded-lg px-3 py-2 focus:outline-none min-w-0" />
                    <button onClick={() => copyWebhookUrl(integration.webhookUrl)} className="bg-white border border-blue-200 text-blue-600 hover:bg-blue-100 p-2 rounded-lg transition shadow-sm">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* Connect New Store Form */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Plug className="w-5 h-5 text-green-600" /> Connect New Store
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="md:col-span-2">
              <label className="font-semibold text-sm text-gray-700">Store Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-2">
                 <button
                    onClick={() => setStoreType('shopify')}
                    disabled={connectedPlatforms.includes('shopify')}
                    className={`p-4 border-2 rounded-xl flex items-center justify-center gap-2 font-medium transition ${storeType === 'shopify' ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-200 hover:border-gray-300 disabled:opacity-50'}`}
                 >
                    Shopify
                 </button>
                 <button
                    onClick={() => setStoreType('woocommerce')}
                    disabled={connectedPlatforms.includes('woocommerce')}
                    className={`p-4 border-2 rounded-xl flex items-center justify-center gap-2 font-medium transition ${storeType === 'woocommerce' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-gray-300 disabled:opacity-50'}`}
                 >
                    WooCommerce
                 </button>
              </div>
            </div>

            {storeType && (
                <>
                    <div className="md:col-span-2">
                    <label className="font-semibold text-sm text-gray-700">Store URL</label>
                    <input
                        type="text"
                        placeholder={storeType === 'shopify' ? "your-store.myshopify.com" : "https://your-store.com"}
                        value={storeUrl}
                        onChange={(e) => setStoreUrl(e.target.value)}
                        className="w-full mt-2 border-2 border-gray-300 rounded-xl px-3 py-2 focus:border-green-500 outline-none"
                    />
                    {storeType === 'shopify' && (
                      <p className="mt-2 text-xs text-gray-500">
                        Use your Shopify shop domain only, for example `your-store.myshopify.com`. Do not enter an email address.
                      </p>
                    )}
                    </div>

                    {storeType === 'shopify' && (
                        <div className="md:col-span-2">
                            <div className="flex items-start gap-2 mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Connect with Shopify app install</p>
                                    <p>GoWhats will redirect you to Shopify so the merchant can approve the app install and required scopes. No pasted Admin API token is needed for this flow.</p>
                                </div>
                            </div>
                        </div>
                    )}

                 {storeType === 'woocommerce' && (
  <>
    <div className="md:col-span-2">
      <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">

          <div className="space-y-3">
                                        <div className="flex items-start gap-2 text-sm text-purple-900">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">WooCommerce setup order</p>
                                                <p className="text-xs text-purple-800 mt-1">1. Install the GoWhats WooCommerce restock plugin in WordPress.</p>
                                                <p className="text-xs text-purple-800 mt-1">2. Create WooCommerce REST API keys from WooCommerce / Settings / Advanced / REST API.</p>
                                                <p className="text-xs text-purple-800 mt-1">3. Paste Store URL, Consumer Key, and Consumer Secret here.</p>
                                                <p className="text-xs text-purple-800 mt-1">4. After connecting, open Restock Alerts and copy the plugin URLs and shared secret into the WordPress plugin page.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div>
      <label className="font-semibold text-sm text-gray-700">Consumer Key</label>
      <input
        type="text"
        placeholder="ck_xxxxxxxxxxxxxxxx"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="w-full mt-2 border-2 border-gray-300 rounded-xl px-3 py-2 focus:border-green-500 outline-none"
      />
      <p className="mt-2 text-xs text-gray-500">
        Use the WooCommerce REST API key like `ck_...`, not your email address.
      </p>
    </div>

    <div>
      <label className="font-semibold text-sm text-gray-700">Consumer Secret</label>
      <input
        type="password"
        placeholder="cs_xxxxxxxxxxxxxxxx"
        value={apiSecret}
        onChange={(e) => setApiSecret(e.target.value)}
        className="w-full mt-2 border-2 border-gray-300 rounded-xl px-3 py-2 focus:border-green-500 outline-none"
      />
      <p className="mt-2 text-xs text-gray-500">
        Use the WooCommerce REST API secret like `cs_...`.
      </p>
    </div>
  </>
)}

                </>
            )}
          </div>

          <div className="flex justify-end mt-8">
            <button
              onClick={handleConnect}
              disabled={isLoading || !storeType}
              className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              {isLoading
                ? (storeType === 'shopify' ? 'Redirecting to Shopify...' : 'Connecting...')
                : (storeType === 'shopify' ? 'Install Shopify App' : 'Connect Store')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoreIntegration;

