import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/axios';

const DEFAULT_SUBSCRIPTION = {
  plan: 'free_trial',
  isPro: false,
  hasProAccess: false,
  trial: {
    totalDays: 14,
    startsAt: null,
    endsAt: null,
    daysLeft: 0,
    isActive: false,
    isExpired: false
  },
  pro: {
    totalDays: 30,
    startsAt: null,
    endsAt: null,
    daysLeft: null,
    isActive: false,
    isExpired: false
  },
  pricing: {
    proPrice: 999,
    currency: 'INR',
    billingCycleDays: 30
  },
  billing: {
    provider: 'internal',
    requiresShopifyBilling: false,
    hasActiveShopifySubscription: false,
    subscriptionId: ''
  },
  referral: {
    hasReferral: false,
    referralCode: '',
    partnerBusinessName: '',
    subscriptionAmount: 0,
    partnerShareAmount: 0,
    gowhatsShareAmount: 0,
    paymentStatus: 'not_started',
    status: 'signed_up'
  },
  proOnlyModules: ['broadcast', 'packing', 'tracking', 'holding'],
  websiteIntegration: {
    orderConfirmationLimit: 100,
    orderConfirmationSent: 0,
    orderConfirmationRemaining: 100
  }
};

const getSocketBaseUrl = () => {
  const configuredBaseUrl =
    api.defaults.baseURL ||
    import.meta.env.VITE_API_BASE_URL ||
    'https://bot.gowhats.in';

  return String(configuredBaseUrl).replace(/\/api\/?$/, '');
};

export default function useSubscription(options = {}) {
  const {
    autoRefresh = false,
    refreshIntervalMs = 15000,
    liveUpdates = false
  } = options;
  const [subscription, setSubscription] = useState(DEFAULT_SUBSCRIPTION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/tenant/subscription');
      const payload = response?.data?.subscription || DEFAULT_SUBSCRIPTION;
      setSubscription({
        ...DEFAULT_SUBSCRIPTION,
        ...payload,
        trial: {
          ...DEFAULT_SUBSCRIPTION.trial,
          ...(payload.trial || {})
        },
        pro: {
          ...DEFAULT_SUBSCRIPTION.pro,
          ...(payload.pro || {})
        },
        pricing: {
          ...DEFAULT_SUBSCRIPTION.pricing,
          ...(payload.pricing || {})
        },
        billing: {
          ...DEFAULT_SUBSCRIPTION.billing,
          ...(payload.billing || {})
        },
        referral: {
          ...DEFAULT_SUBSCRIPTION.referral,
          ...(payload.referral || {})
        },
        websiteIntegration: {
          ...DEFAULT_SUBSCRIPTION.websiteIntegration,
          ...(payload.websiteIntegration || {})
        }
      });
    } catch (err) {
      setError(err);
      setSubscription(DEFAULT_SUBSCRIPTION);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      refreshSubscription();
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshIntervalMs, refreshSubscription]);

  useEffect(() => {
    if (!liveUpdates) {
      return undefined;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    const socketBaseUrl = getSocketBaseUrl();

    const socket = io(socketBaseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    const applySubscriptionUpdate = (payload) => {
      const nextSubscription = payload?.subscription || payload;
      if (!nextSubscription) {
        return;
      }

      const preserveResolvedPricing = payload?.source === 'website_order_confirmation';

      setSubscription((prev) => ({
        ...prev,
        ...nextSubscription,
        trial: {
          ...prev.trial,
          ...(nextSubscription.trial || {})
        },
        pro: {
          ...prev.pro,
          ...(nextSubscription.pro || {})
        },
        pricing: preserveResolvedPricing
          ? prev.pricing
          : {
              ...prev.pricing,
              ...(nextSubscription.pricing || {})
            },
        billing: {
          ...prev.billing,
          ...(nextSubscription.billing || {})
        },
        referral: preserveResolvedPricing
          ? prev.referral
          : {
              ...prev.referral,
              ...(nextSubscription.referral || {})
            },
        websiteIntegration: {
          ...prev.websiteIntegration,
          ...(nextSubscription.websiteIntegration || {})
        }
      }));
    };

    socket.on('subscription_usage_updated', applySubscriptionUpdate);
    socket.on('subscription_plan_updated', applySubscriptionUpdate);

    return () => {
      socket.off('subscription_usage_updated', applySubscriptionUpdate);
      socket.off('subscription_plan_updated', applySubscriptionUpdate);
      socket.disconnect();
    };
  }, [liveUpdates]);

  return {
    subscription,
    loading,
    error,
    refreshSubscription
  };
}

