import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/axios';
import { useAuth } from '../context/AuthContext';
import { isShopifyEmbeddedApp } from '../utils/shopifyEmbedded';

const loadRazorpayScript = () => new Promise((resolve) => {
  if (typeof window === 'undefined') {
    resolve(false);
    return;
  }

  if (window.Razorpay) {
    resolve(true);
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

const UpgradeToProButton = ({
  label = 'Upgrade to Pro',
  className = '',
  icon = null,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const decodeTokenPhone = () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload?.phone_number || '';
    } catch {
      return '';
    }
  };

  const normalizePhone = (value) =>
    String(value || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');

  const isIndiaPhone = (value) => {
    const normalized = normalizePhone(value);
    return normalized.startsWith('+91') || normalized.startsWith('91');
  };

  const resolvePhoneNumber = async () => {
    if (user?.phone_number) return user.phone_number;
    const tokenPhone = decodeTokenPhone();
    if (tokenPhone) return tokenPhone;
    try {
      const profileRes = await api.get('/api/auth/user/profile');
      return profileRes?.data?.phone_number || '';
    } catch {
      return '';
    }
  };

  const startStripeUpgrade = async () => {
    try {
      const response = await api.post('/api/tenant/subscription/stripe/checkout');
      if (!response?.data?.success || !response?.data?.url) {
        toast.error(response?.data?.message || 'Failed to initiate Stripe payment');
        setLoading(false);
        return;
      }
      window.location.href = response.data.url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start Stripe payment');
      setLoading(false);
    }
  };

 const startShopifyUpgrade = async () => {
    try {
      const response = await api.post('/api/tenant/subscription/shopify/create');
      if (!response?.data?.success) {
        toast.error(response?.data?.message || 'Failed to start Shopify billing');
        setLoading(false);
        return;
      }

      if (response.data.alreadyActive) {
        toast.success('Shopify subscription is active. Pro plan enabled.');
        if (onSuccess) {
          onSuccess(response.data);
        } else {
          navigate('/admin');
        }
        setLoading(false);
        return;
      }

      if (!response.data.confirmationUrl) {
        toast.error('Shopify did not return a billing approval URL.');
        setLoading(false);
        return;
      }

      const targetWindow = window.top || window;
      targetWindow.location.href = response.data.confirmationUrl;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start Shopify billing');
      setLoading(false);
    }
  };

  const startUpgrade = async () => {
    if (loading) return;
    setLoading(true);

    try {
      if (isShopifyEmbeddedApp()) {
        await startShopifyUpgrade();
        return;
      }

      const phoneNumber = await resolvePhoneNumber();
      if (!isIndiaPhone(phoneNumber)) {
        await startStripeUpgrade();
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Failed to load Razorpay checkout. Please try again.');
        setLoading(false);
        return;
      }

      const response = await api.post('/api/tenant/subscription/razorpay/order');
      if (!response?.data?.success) {
        toast.error(response?.data?.message || 'Failed to initiate payment');
        setLoading(false);
        return;
      }

      const { keyId, order, name, description, prefill } = response.data;

      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: name || 'GoWhats',
        description: description || 'GoWhats Pro Subscription',
        order_id: order.id,
        prefill: prefill || {},
        theme: { color: '#16a34a' },
        handler: async (paymentResponse) => {
          try {
            const verifyRes = await api.post('/api/tenant/subscription/razorpay/verify', paymentResponse);
            if (verifyRes?.data?.success) {
              toast.success('Payment successful. Pro plan activated.');
              if (onSuccess) {
                onSuccess(verifyRes.data);
              } else {
                navigate('/admin');
              }
            } else {
              toast.error(verifyRes?.data?.message || 'Payment verification failed');
            }
          } catch (err) {
            toast.error(err.response?.data?.message || 'Payment verification failed');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false)
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', (error) => {
        toast.error(error?.error?.description || 'Payment failed');
        setLoading(false);
      });
      razorpay.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start payment');
      setLoading(false);
    }
  };

  const baseClass = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#22c55e] text-white font-semibold hover:bg-[#16a34a] transition-colors disabled:opacity-60';

  return (
    <button
      type="button"
      onClick={startUpgrade}
      disabled={loading}
      className={`${baseClass} ${className}`}
    >
      {loading ? 'Opening...' : (
        <>
          {label}
          {icon}
        </>
      )}
    </button>
  );
};

export default UpgradeToProButton;
