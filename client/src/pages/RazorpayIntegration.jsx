import React, { useState, useEffect } from 'react';
import axios from '../utils/axios';
import { toast } from 'react-hot-toast';
import { 
  CreditCard, 
  CheckCircle2, 
  ShieldCheck, 
  Unplug, 
  ArrowRight,
  Loader2,
  Zap
} from 'lucide-react';

const RazorpayIntegration = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // 1. Initial Data Fetch
  const fetchData = async () => {
    try {
      setLoading(true);
      const statusRes = await axios.get('/api/razorpay/status');
      setStatus(statusRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 2. Handle OAuth Redirect Return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');

    if (connected === 'true') {
      toast.success('Razorpay Connected Successfully!');
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchData();
    } else if (error) {
      toast.error('Connection Failed: ' + error);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      fetchData();
    }
  }, []);

  // 3. Connect Handler
  const handleConnect = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/razorpay/auth/initiate');
      
      if (response.data.success && response.data.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        toast.error('Failed to get authorization URL');
        setLoading(false);
      }
    } catch (error) {
      console.error('Connection error:', error);
      toast.error('Failed to initiate connection');
      setLoading(false);
    }
  };

  // 4. Disconnect Handler
  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Razorpay?')) return;
    try {
      setLoading(true);
      await axios.post('/api/razorpay/disconnect');
      toast.success('Disconnected successfully');
      setStatus({ connected: false });
    } catch (error) {
      toast.error('Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  // Loading Screen
  if (!status && loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-4 overflow-hidden">
      
      {/* Main Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl shadow-emerald-100/50 border border-emerald-100/50 overflow-hidden">
        
        {/* Top Gradient Bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500"></div>

        <div className="p-8">
          
          {status?.connected ? (
            /* CONNECTED STATE */
            <div className="text-center">
              {/* Success Icon */}
              <div className="relative inline-flex mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                  <CheckCircle2 className="h-10 w-10 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md">
                  <Zap className="h-4 w-4 text-emerald-500" />
                </div>
              </div>

              {/* Status Text */}
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                You're Connected!
              </h1>
              <p className="text-gray-500 text-sm mb-8">
                Razorpay is active and ready to process payments
              </p>

              {/* Status Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-medium text-emerald-700">Live & Active</span>
              </div>

              {/* Disconnect Button */}
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="w-full group flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-2xl hover:bg-red-100 hover:border-red-200 transition-all duration-200 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Unplug className="h-4 w-4" />
                    Disconnect Razorpay
                  </>
                )}
              </button>
            </div>
          ) : (
            /* DISCONNECTED STATE */
            <div className="text-center">
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-50 rounded-full mb-6 border border-gray-200">
                <CreditCard className="h-9 w-9 text-gray-400" />
              </div>

              {/* Text */}
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Connect Razorpay
              </h1>
              <p className="text-gray-500 text-sm mb-8">
                Enable seamless payment collection for your business
              </p>

              {/* Features */}
              <div className="flex items-center justify-center gap-6 mb-8 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span className="text-gray-600">Secure</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-gray-600">Instant</span>
                </span>
              </div>

              {/* Connect Button */}
              <button
                onClick={handleConnect}
                disabled={loading}
                className="w-full group flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl font-semibold shadow-lg shadow-emerald-200 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl hover:shadow-emerald-200 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect Now
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
              
              <p className="mt-4 text-xs text-gray-400">
                Secure OAuth connection via Razorpay
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 flex justify-center items-center gap-2 text-xs text-gray-400 border-t border-gray-100">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          <span>Secured with SSL encryption</span>
        </div>
      </div>
    </div>
  );
};

export default RazorpayIntegration;
