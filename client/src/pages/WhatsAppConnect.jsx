import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/axios';
import { toast } from 'react-hot-toast';
import { 
  MessageSquare, 
  CheckCircle, 
  AlertCircle, 
  Smartphone, 
  LogOut, 
  ArrowRight,
  Loader2,
  ShieldCheck
} from 'lucide-react';

const WhatsAppConnect = () => {
  // ==========================================
  // LOGIC (UNCHANGED)
  // ==========================================
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [config, setConfig] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [coexistenceMode, setCoexistenceMode] = useState(false);

  const signupDataRef = useRef({
    code: null,
    wabaId: null,
    phoneNumberId: null,
    businessId: null,
    isCoexistence: false,
    processingComplete: false
  });

  const navigate = useNavigate();

  const APP_ID = '1213807479723042';
  const CONFIGURATION_ID = '1411808236443131';

  // Check connection status
  const checkConnectionStatus = async () => {
    try {
      const response = await api.get('/api/whatsapp/status');
      if (response.data.success && response.data.connected) {
        setIsConnected(true);
        setConfig(response.data.config || null);
        return true;
      } else {
        setIsConnected(false);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to check connection status:', error);
      setIsConnected(false);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Poll for connection status
  const pollConnectionStatus = async (maxAttempts = 30) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const response = await api.get('/api/whatsapp/connection-status');
        if (response.data.connected) {
          setSuccess('WhatsApp connected successfully!');
          toast.success('WhatsApp connected successfully!');
          setConnecting(false);
          setTimeout(() => navigate('/admin/chats'), 1500);
          return true;
        }
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setConnecting(false);
          setSuccess('Connection is being configured. Please refresh the page in a moment.');
          toast.success('Connection initiated. Please refresh the page in 10 seconds.');
        }
      } catch (error) {
        if (attempts < maxAttempts) setTimeout(poll, 2000);
        else {
          setConnecting(false);
          setError('Unable to verify connection. Please refresh the page.');
        }
      }
    };
    poll();
  };

  // Universal Signup Handler
  const handleCompleteSignup = async () => {
    const data = signupDataRef.current;

    if (data.processingComplete) return;

    if (!data.code) {
      console.log('⏳ Waiting for authorization code...');
      return;
    }

    if (!data.wabaId || !data.phoneNumberId) {
      console.log('⏳ Waiting for WABA/Phone ID...');
      return;
    }

    console.log('✅ All data present. Starting connection...');

    data.processingComplete = true;
    setConnecting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        businessPortfolioId: data.businessId,
        isCoexistence: data.isCoexistence,
        code: data.code
      };

      const response = await api.post('/api/whatsapp/connect-embedded', payload);

      if (response.data.success) {
        const message = data.isCoexistence
          ? 'Configuring WhatsApp Business App connection...'
          : 'Configuring WhatsApp connection...';
        setSuccess(message);
        toast.success(message);
        pollConnectionStatus();
      } else {
        throw new Error(response.data.message || 'Connection failed');
      }
    } catch (error) {
      console.error('❌ WhatsApp connection error:', error);
      data.processingComplete = false; 

      let errorMessage = 'Connection failed';
      if (error.response?.data?.message) errorMessage = error.response.data.message;

      toast.error(errorMessage);
      setError(errorMessage);
      setConnecting(false);
    }
  };

  useEffect(() => {
    const loadFacebookSDK = () => {
      if (document.getElementById('facebook-jssdk')) {
        if (window.FB) setSdkReady(true);
        return;
      }
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    };

    window.fbAsyncInit = function() {
      window.FB.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v21.0'
      });
      setSdkReady(true);
    };

    loadFacebookSDK();

    const handleMessage = (event) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || data.event === 'FINISH') {
            const isCoexist = data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';

            signupDataRef.current.isCoexistence = isCoexist;
            signupDataRef.current.wabaId = data.data.waba_id;
            signupDataRef.current.phoneNumberId = data.data.phone_number_id;
            signupDataRef.current.businessId = data.data.business_id;

            if (isCoexist) setCoexistenceMode(true);

            handleCompleteSignup();
          } else if (data.event === 'CANCEL') {
            setError('Signup Cancelled');
            setConnecting(false);
            signupDataRef.current.processingComplete = false;
          }
        }
      } catch (err) {
        console.warn('Parse error', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const launchWhatsAppSignup = () => {
    if (!sdkReady || !window.FB) {
      toast.error('Facebook SDK not ready');
      return;
    }

    setConnecting(true);
    setError(null);
    setSuccess(null);
    setCoexistenceMode(false);

    signupDataRef.current = {
      code: null, wabaId: null, phoneNumberId: null, businessId: null,
      isCoexistence: false, processingComplete: false
    };

    window.FB.login(
      (response) => {
        if (response.authResponse && response.authResponse.code) {
          console.log('✅ Authorization code received');
          signupDataRef.current.code = response.authResponse.code;
          handleCompleteSignup();
        } else {
          console.error('❌ FB.login failed');
          setConnecting(false);
        }
      },
      {
        config_id: CONFIGURATION_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3'
        },
      }
    );
  };

  const handleDisconnect = async () => {
    if (window.confirm('Are you sure you want to disconnect WhatsApp?')) {
      try {
        await api.post('/api/whatsapp/disconnect');
        toast.success('Disconnected');
        setIsConnected(false);
        setConfig(null);
      } catch (error) {
        toast.error('Failed to disconnect');
      }
    }
  };

  // ==========================================
  // UPDATED UI
  // ==========================================

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-green-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Checking connection status...</p>
      </div>
    );
  }

  // --- CONNECTED STATE UI ---
  if (isConnected) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-green-50 border-b border-green-100 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4 shadow-sm">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">WhatsApp Connected</h2>
            <p className="text-green-700 font-medium">Your business account is active and ready.</p>
          </div>

          <div className="p-8">
            {/* Configuration Details Grid */}
            {config && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Smartphone className="w-5 h-5 text-gray-500" />
                    <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Connected Phone</span>
                  </div>
                  <p className="text-lg font-mono text-gray-900">{config.displayPhoneNumber || 'Unknown'}</p>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-3 mb-2">
                    <ShieldCheck className="w-5 h-5 text-gray-500" />
                    <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Connection Mode</span>
                  </div>
                  <p className="text-lg font-medium text-gray-900">
                    {config.connectedVia === 'waba_coexistence' ? 'Business App (Coexistence)' : 'Cloud API (Standard)'}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => navigate('/admin/chats')} 
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transition flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-5 h-5" /> Go to Chats
              </button>
              
              <button 
                onClick={handleDisconnect} 
                className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold py-3 px-6 rounded-xl transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" /> Disconnect
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- DISCONNECTED (SIGNUP) STATE UI ---
  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[70vh]">
      
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-green-600 text-white mb-6 shadow-lg shadow-green-200">
          <MessageSquare className="w-10 h-10" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Connect WhatsApp Business</h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
          Link your WhatsApp number to GoWhats to automate replies, send broadcasts, and manage customer conversations from a single dashboard.
        </p>
      </div>

      <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl border border-gray-100 max-w-xl w-full text-center relative overflow-hidden">
        
        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 text-left">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold">Connection Failed</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl flex items-center gap-3 text-left">
            <CheckCircle className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold">Success</p>
              <p className="text-sm">{success}</p>
            </div>
          </div>
        )}

        {/* Feature List */}
        <div className="grid grid-cols-2 gap-4 mb-8 text-left">
          {[
            "Send Bulk Broadcasts", 
            "Automated Chatbots",
            "Order Notifications",
            "Multi-Agent Support"
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-gray-600 text-sm font-medium">
              <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                <CheckCircle className="w-3 h-3" />
              </div>
              {feature}
            </div>
          ))}
        </div>

        {/* Main Action Button */}
        <button
          onClick={launchWhatsAppSignup}
          disabled={connecting || !sdkReady}
          className={`
            w-full py-4 px-6 rounded-xl font-bold text-white text-lg shadow-md transition-all flex items-center justify-center gap-3
            ${connecting || !sdkReady ? 'bg-blue-400 cursor-not-allowed' : 'bg-[#1877F2] hover:bg-[#166fe5] hover:shadow-lg hover:-translate-y-0.5'}
          `}
        >
          {connecting ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" /> Connecting...
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Connect with Facebook
            </>
          )}
        </button>
        
        <p className="mt-4 text-xs text-gray-400">
          By connecting, you agree to Meta's Business Terms.
        </p>
      </div>
    </div>
  );
};

export default WhatsAppConnect;
