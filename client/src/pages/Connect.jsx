import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/axios';
import { toast } from 'react-hot-toast';

const Connect = () => {
  const [formData, setFormData] = useState({
    businessAccountId: '',
    phoneNumberId: '',
    accessToken: ''
  });
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [config, setConfig] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const navigate = useNavigate();

  // Check connection status whenever component mounts
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        console.log('Checking WhatsApp connection status...');
        const response = await api.get('/api/whatsapp/status');
        console.log('Status response:', response.data);
        
        if (response.data.success) {
          setIsConnected(response.data.connected);
          if (response.data.config) {
            setConfig(response.data.config);
          }
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        console.error('Failed to check connection status:', error);
        if (error.response?.status === 404) {
          toast.error('WhatsApp status endpoint not found');
        }
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    };

    checkConnectionStatus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setConnecting(true);
    
    try {
      console.log('Attempting to connect WhatsApp...');

      const response = await api.post('/api/whatsapp/connect', formData);
      
      if (response.data.success) {
        toast.success(response.data.message || 'WhatsApp connected successfully');
        setIsConnected(true);
        navigate('/admin/chats');
      } else {
        toast.error(response.data.message || 'Connection failed');
      }
    } catch (error) {
      console.error('WhatsApp connection error:', error);
      
      if (error.response?.status === 409) {
        toast.error('This WhatsApp access token is already in use. Please use a different token or contact support.');
      } else if (error.response?.status === 404) {
        toast.error('WhatsApp connection endpoint not found');
      } else if (error.response?.status === 500) {
        toast.error('Server error. Please check your credentials and try again.');
      } else {
        toast.error(error.response?.data?.message || 'Connection failed');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm('Are you sure you want to disconnect WhatsApp?')) {
      try {
        await api.post('/api/whatsapp/disconnect');
        toast.success('WhatsApp disconnected');
        setIsConnected(false);
        setConfig(null);
      } catch (error) {
        toast.error('Failed to disconnect WhatsApp');
      }
    }
  };

  // Clear form data on mount to prevent auto-fill
  useEffect(() => {
    setFormData({
      businessAccountId: '',
      phoneNumberId: '',
      accessToken: ''
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p>Checking WhatsApp connection...</p>
        </div>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">WhatsApp Connected</h2>
            <p className="text-gray-600 mt-2">Your WhatsApp Business account is ready to use</p>
          </div>

          {config && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-medium text-gray-900 mb-2">Connection Details:</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p><span className="font-medium">Business ID:</span> {config.businessAccountId}</p>
                <p><span className="font-medium">Phone ID:</span> {config.phoneNumberId}</p>
                <p><span className="font-medium">Access Token:</span> {config.hasAccessToken ? '••••••••' : 'Not set'}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => navigate('/admin/chats')}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
            >
              Go to Chats
            </button>
            <button
              onClick={handleDisconnect}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
            >
              Disconnect WhatsApp
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.105"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Connect WhatsApp Business</h2>
          <p className="text-gray-600 mt-2">Enter your WhatsApp Business API credentials</p>
        </div>

        {/* Enhanced form with anti-autofill attributes */}
        <form 
          onSubmit={handleSubmit} 
          className="space-y-4"
          autoComplete="off"
          noValidate
        >
          {/* Hidden dummy fields to prevent autofill */}
          <input
            type="text"
            name="fake-username"
            autoComplete="username"
            style={{ display: 'none' }}
            tabIndex="-1"
          />
          <input
            type="password"
            name="fake-password"
            autoComplete="current-password"
            style={{ display: 'none' }}
            tabIndex="-1"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Account ID
            </label>
            <input
              type="text"
              name="whatsapp-business-id"
              placeholder="Enter your Business Account ID (e.g., 1234567890123456)"
              value={formData.businessAccountId}
              onChange={(e) => setFormData({...formData, businessAccountId: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Find this in your Facebook Business Manager → WhatsApp → Settings
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number ID
            </label>
            <input
              type="text"
              name="whatsapp-phone-id"
              placeholder="Enter your Phone Number ID (e.g., 1234567890123456)"
              value={formData.phoneNumberId}
              onChange={(e) => setFormData({...formData, phoneNumberId: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Find this in your WhatsApp Business API setup
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Access Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                name="whatsapp-access-token"
                placeholder="Enter your Access Token (EAA...)"
                value={formData.accessToken}
                onChange={(e) => setFormData({...formData, accessToken: e.target.value})}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-form-type="other"
                data-lpignore="true"
                required
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showToken ? (
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.464 8.464m1.414 1.414L12 12m6.041-6.041L7.879 9.878" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Generate this token in your Facebook Developer Console
            </p>
          </div>

          <button
            type="submit"
            disabled={connecting}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Connecting...
              </div>
            ) : (
              'Connect WhatsApp'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Need help? Check the{' '}
            <a 
              href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-green-600 hover:text-green-700"
            >
              WhatsApp Business API documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Connect;

