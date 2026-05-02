import React, { useContext, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { AuthContext } from '../context/AuthContext';
import InstallPrompt from "./InstallPrompt";
import useSubscription from '../hooks/useSubscription';
import UpgradeToProButton from './UpgradeToProButton';
import api from '../utils/axios';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function Layout() {
  const { loading } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isChatsPage = location.pathname.startsWith('/admin/chats');
  const isDashboardPage =
    location.pathname === '/admin' ||
    location.pathname === '/admin/' ||
    location.pathname === '/admin/dashboard';
  const { subscription, loading: subscriptionLoading, refreshSubscription } = useSubscription({ liveUpdates: true });
  const proExpired = subscription?.pro?.isExpired;
  const dueAmount = subscription?.pricing?.proPrice ?? 999;
  const currency = subscription?.pricing?.currency || 'INR';
  const [dismissedPaymentDue, setDismissedPaymentDue] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('stripe_session_id');
    const shopifyBillingStatus = params.get('shopify_billing');

    if (shopifyBillingStatus) {
      if (shopifyBillingStatus === 'active') {
        toast.success('Shopify subscription active. Pro plan enabled.');
        refreshSubscription();
      } else if (shopifyBillingStatus === 'pending') {
        toast('Shopify billing approval is still pending.');
        refreshSubscription();
      } else if (shopifyBillingStatus === 'error') {
        toast.error('Shopify billing could not be verified.');
      }
      navigate(location.pathname, { replace: true });
      return;
    }

    if (!sessionId) return;

    const verifyStripePayment = async () => {
      try {
        const response = await api.post('/api/tenant/subscription/stripe/verify', { session_id: sessionId });
        if (response?.data?.success) {
          toast.success('Payment successful. Pro plan activated.');
          await refreshSubscription();
        } else {
          toast.error(response?.data?.message || 'Stripe payment verification failed');
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Stripe payment verification failed');
      } finally {
        navigate(location.pathname, { replace: true });
      }
    };

    verifyStripePayment();
  }, [location.search, location.pathname, navigate, refreshSubscription]);

  useEffect(() => {
    const endsAt = subscription?.pro?.endsAt;
    if (!endsAt) return undefined;
    const endTime = new Date(endsAt).getTime();
    if (Number.isNaN(endTime)) return undefined;
    const now = Date.now();
    if (endTime <= now) return undefined;
    const timeoutId = setTimeout(() => {
      refreshSubscription();
    }, endTime - now + 1000);
    return () => clearTimeout(timeoutId);
  }, [subscription?.pro?.endsAt, refreshSubscription]);

  useEffect(() => {
    if (!proExpired) {
      setDismissedPaymentDue(false);
    }
  }, [proExpired]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-3 border-emerald-200 border-t-emerald-500 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <Sidebar />
      
      {/* Payment Due Modal - Glass Theme */}
      <AnimatePresence>
        {!subscriptionLoading && proExpired && !dismissedPaymentDue && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md"
            >
              {/* Glass Card */}
              <div className="relative bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-red-500/10 border border-white overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-red-900">Payment Due</h2>
                      <p className="text-sm text-red-700/80 mt-0.5">
                        Your Pro subscription has expired
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDismissedPaymentDue(true)}
                      className="p-2 rounded-xl bg-white/80 hover:bg-white text-red-400 hover:text-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                
                {/* Content */}
                <div className="px-6 py-6 space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-emerald-50/30 border border-gray-100">
                    <span className="text-sm font-semibold text-gray-600">Amount Due</span>
                    <span className="text-xl font-bold text-gray-900">
                      {currency === 'INR' ? `₹${dueAmount}` : `${dueAmount} ${currency}`}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600">
                    Renew now to unlock all premium features and continue your workflow.
                  </p>
                  
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setDismissedPaymentDue(true)}
                      className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      Continue Free
                    </button>
                    <UpgradeToProButton
                      label="Pay Now"
                      className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25"
                      onSuccess={() => refreshSubscription()}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className={`
        ${(isChatsPage || isDashboardPage) ? 'pt-16 pb-0' : 'pt-16 pb-20'} 
        md:pt-0 md:pb-0 md:ml-16 
        transition-all duration-300
      `}>
        <main className="max-w-full overflow-x-hidden">
          <Outlet />
        </main>
        <InstallPrompt />
      </div>
    </div>
  );
}

export default Layout;

