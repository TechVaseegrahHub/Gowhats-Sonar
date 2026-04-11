//components/KeyGenerator.jsx - Updated for SaaS App Secret handling

import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import api from '../utils/axios';

const KeyGenerator = () => {
  // State for tracking key generation and configuration status
  const [keyStatus, setKeyStatus] = useState({
    hasPublicKey: false,
    status: 'PENDING',
    lastChecked: null,
    configurationSteps: {
      whatsappConfig: false,
      keyGeneration: false,
      appSecretConfig: false, // SaaS: App Secret configuration step
      keyUpload: false,
      healthCheck: false
    }
  });

  // Loading states for different actions
  const [loading, setLoading] = useState({
    fetchStatus: false,
    generateKeys: false,
    uploadKey: false,
    verifyHealth: false,
    appSecret: false // SaaS: App Secret loading state
  });

  // Password visibility toggles
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);

  // Form handling with react-hook-form
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm();

  // App Secret form handling
  const {
    register: registerAppSecret,
    handleSubmit: handleAppSecretSubmit,
    formState: { errors: appSecretErrors }
  } = useForm();

  // App Secret submission handler
  const onAppSecretSubmit = async (data) => {
    setLoading(prev => ({ ...prev, appSecret: true }));
    try {
      const response = await api.post('/api/flows/app-secret', {
        appSecret: data.appSecret
      });

      if (response.data.success) {
        toast.success('App Secret configured successfully');
        await fetchKeyStatus(); // Refresh status
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to configure App Secret';
      toast.error(errorMessage);
    } finally {
      setLoading(prev => ({ ...prev, appSecret: false }));
    }
  };

  // Fetch comprehensive key status
  const fetchKeyStatus = useCallback(async () => {
    setLoading(prev => ({ ...prev, fetchStatus: true }));
    try {
      const response = await api.get('/api/flows/keys/status');
      if (response.data.success) {
        setKeyStatus(prev => ({
          ...prev,
          hasPublicKey: response.data.publicKey,
          status: response.data.status || 'PENDING',
          lastChecked: response.data.lastChecked,
          configurationSteps: response.data.configurationSteps || {
            whatsappConfig: false,
            keyGeneration: false,
            appSecretConfig: false,
            keyUpload: false,
            healthCheck: false
          }
        }));
      }
    } catch (error) {
      console.error('Failed to fetch key status:', error);
      toast.error('Could not retrieve key configuration status');
    } finally {
      setLoading(prev => ({ ...prev, fetchStatus: false }));
    }
  }, []);

  // Fetch status on component mount
  useEffect(() => {
    fetchKeyStatus();
  }, [fetchKeyStatus]);

  // Key generation handler
  const onSubmit = async (data) => {
    setLoading(prev => ({ ...prev, generateKeys: true }));
    try {
      const response = await api.post('/api/flows/keys/generate', {
        passphrase: data.passphrase
      });

      if (response.data.success) {
        toast.success('Encryption keys generated successfully');
        await fetchKeyStatus(); // Refresh status
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Key generation failed';
      toast.error(errorMessage);
      console.error('Key generation error:', error);
    } finally {
      setLoading(prev => ({ ...prev, generateKeys: false }));
    }
  };

  // Upload public key handler
  const handleUploadKey = async () => {
    setLoading(prev => ({ ...prev, uploadKey: true }));
    try {
      const response = await api.post('/api/flows/keys/upload');

      if (response.data.success) {
        toast.success('Public key uploaded and signed successfully');
        await fetchKeyStatus(); // Refresh status
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload public key');
    } finally {
      setLoading(prev => ({ ...prev, uploadKey: false }));
    }
  };

  // Health check verification
  const handleVerifyHealth = async () => {
    setLoading(prev => ({ ...prev, verifyHealth: true }));
    try {
      const response = await api.get('/api/flows/health/verify');

      if (response.data.success) {
        toast.success('Health check verified successfully');
        await fetchKeyStatus(); // Refresh status
      }
    } catch (error) {
      toast.error('Failed to verify health check');
    } finally {
      setLoading(prev => ({ ...prev, verifyHealth: false }));
    }
  };

  // Test signature validation
  const handleTestSignature = async () => {
    try {
      const response = await api.post('/api/flows/test/signature-validation');
      if (response.data.success) {
        toast.success('Signature validation test successful');
        console.log('Test result:', response.data.testData);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Signature validation test failed');
    }
  };

  // Render configuration steps progress
  const renderConfigurationSteps = () => {
    const { configurationSteps } = keyStatus;
    return (
      <div className="bg-gray-50 p-4 rounded-lg mb-4">
        <h3 className="font-medium mb-2">Configuration Progress</h3>
        <ul className="space-y-2 text-sm">
          {[
            { key: 'whatsappConfig', label: 'WhatsApp Configuration' },
            { key: 'keyGeneration', label: 'Key Generation' },
            { key: 'appSecretConfig', label: 'Meta App Secret Configuration' }, // SaaS: Updated label
            { key: 'keyUpload', label: 'Key Upload' },
            { key: 'healthCheck', label: 'Health Check' }
          ].map(({ key, label }) => (
            <li key={key} className="flex items-center">
              <span className={`mr-2 ${configurationSteps[key] ? 'text-green-600' : 'text-gray-500'}`}>
                {configurationSteps[key] ? '✓' : '○'}
              </span>
              <span className={configurationSteps[key] ? 'text-green-700' : 'text-gray-600'}>
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg md:p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4">WhatsApp Flow Encryption Setup</h2>

      {/* Configuration Steps Progress */}
      {renderConfigurationSteps()}

      {/* Key Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-2">Current Status</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Public Key:</div>
          <div>{keyStatus.hasPublicKey ?
            <span className="text-green-600 font-medium">Generated</span> :
            <span className="text-gray-500">Not generated</span>}
          </div>

          <div>Signature Status:</div>
          <div>
            {keyStatus.status === 'VALID' ?
              <span className="text-green-600 font-medium">Valid</span> :
              keyStatus.status === 'FAILED' ?
              <span className="text-red-600 font-medium">Failed</span> :
              <span className="text-gray-500">Pending</span>}
          </div>

          {keyStatus.lastChecked && (
            <>
              <div>Last Checked:</div>
              <div>{new Date(keyStatus.lastChecked).toLocaleString()}</div>
            </>
          )}
        </div>
      </div>

      {/* Step 1: Key Generation Form */}
      {!keyStatus.hasPublicKey && (
        <div className="mb-6 p-4 border rounded-lg">
          <h3 className="font-medium mb-3">Step 1: Generate Encryption Keys</h3>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Passphrase (min 8 characters) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassphrase ? "text" : "password"}
                  {...register("passphrase", {
                    required: "Passphrase is required",
                    minLength: {
                      value: 8,
                      message: "Passphrase must be at least 8 characters"
                    }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm text-gray-500"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                >
                  {showPassphrase ? "Hide" : "Show"}
                </button>
              </div>
              {errors.passphrase && (
                <p className="mt-1 text-sm text-red-600">{errors.passphrase.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                <strong>IMPORTANT:</strong> Store this passphrase securely. You won't be able to decrypt messages without it.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading.generateKeys}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading.generateKeys ? "Generating..." : "Generate RSA Key Pair"}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: App Secret Configuration (SaaS) */}
      {keyStatus.hasPublicKey && !keyStatus.configurationSteps.appSecretConfig && (
        <div className="mb-6 p-4 border rounded-lg">
          <h3 className="font-medium mb-3">Step 2: Configure Meta App Secret</h3>
          <p className="text-sm text-gray-600 mb-4">
            Enter your Meta App Secret from the Meta Developers Console. This is required for signature validation.
          </p>
          
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Where to find your App Secret:</h4>
            <ol className="text-sm text-blue-700 space-y-1">
              <li>1. Go to <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="underline">Meta Developers Console</a></li>
              <li>2. Select your App</li>
              <li>3. Go to App Settings → Basic</li>
              <li>4. Copy the "App Secret" (not App ID)</li>
              <li>5. Paste it in the field below</li>
            </ol>
          </div>

          <form onSubmit={handleAppSecretSubmit(onAppSecretSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta App Secret <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showAppSecret ? "text" : "password"}
                  {...registerAppSecret("appSecret", {
                    required: "App Secret is required",
                    minLength: {
                      value: 16,
                      message: "App Secret must be at least 16 characters"
                    },
                    pattern: {
                      value: /^[a-zA-Z0-9]+$/,
                      message: "App Secret must be alphanumeric"
                    }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your Meta App Secret"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm text-gray-500"
                  onClick={() => setShowAppSecret(!showAppSecret)}
                >
                  {showAppSecret ? "Hide" : "Show"}
                </button>
              </div>
              {appSecretErrors.appSecret && (
                <p className="mt-1 text-sm text-red-600">{appSecretErrors.appSecret.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                This will be stored securely in your tenant configuration for signature validation.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading.appSecret}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading.appSecret ? "Configuring..." : "Configure App Secret"}
            </button>
          </form>
        </div>
      )}

      {/* Step 3: Upload Public Key */}
      {keyStatus.hasPublicKey && keyStatus.configurationSteps.appSecretConfig && keyStatus.status !== 'VALID' && (
        <div className="mb-6 p-4 border rounded-lg">
          <h3 className="font-medium mb-3">Step 3: Upload & Sign Public Key</h3>
          <p className="text-sm text-gray-600 mb-4">
            Upload your public key to WhatsApp and get it signed for encryption.
          </p>
          
          <button
            onClick={handleUploadKey}
            disabled={loading.uploadKey}
            className="w-full px-4 py-2 mt-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading.uploadKey ? "Uploading..." : "Upload & Sign Public Key"}
          </button>
        </div>
      )}

      {/* Step 4: Health Check Verification */}
      {keyStatus.status === 'VALID' && (
        <div className="mb-6 p-4 border border-green-200 rounded-lg bg-green-50">
          <h3 className="font-medium mb-3 text-green-800">Step 4: Verify Health Check</h3>
          <p className="text-sm text-green-700 mb-4">
            Your endpoint is configured! Test the health check to ensure everything works.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={handleVerifyHealth}
              disabled={loading.verifyHealth}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading.verifyHealth ? "Verifying..." : "Verify Health Check"}
            </button>

            <button
              onClick={handleTestSignature}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Test Signature Validation
            </button>
          </div>
        </div>
      )}

      {/* Success Message */}
      {keyStatus.status === 'VALID' && keyStatus.configurationSteps.healthCheck && (
        <div className="mb-6 p-4 border border-green-200 rounded-lg bg-green-50">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Configuration Complete!
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>Your WhatsApp Flow endpoint is fully configured and ready to use. All health checks are passing.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Troubleshooting Section */}
      {keyStatus.status === 'FAILED' && (
        <div className="mb-6 p-4 border border-red-200 rounded-lg bg-red-50">
          <h3 className="font-medium mb-3 text-red-800">Troubleshooting</h3>
          <div className="text-sm text-red-700 space-y-2">
            <p>If your health check is failing, check:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>App Secret is correctly copied from Meta Developers Console</li>
              <li>Your endpoint URL is accessible from the internet</li>
              <li>SSL certificate is valid</li>
              <li>Server is returning HTTP 200 responses</li>
            </ul>
            <button
              onClick={handleTestSignature}
              className="mt-3 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
            >
              Test Signature Again
            </button>
          </div>
        </div>
      )}

      {/* Documentation Link */}
      <div className="text-center text-sm text-gray-500 border-t pt-4">
        <a
          href="https://developers.facebook.com/docs/whatsapp/flows/encryption"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline mr-4"
        >
          Flow Encryption Documentation
        </a>
        <a
          href="https://developers.facebook.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Meta Developers Console
        </a>
      </div>
    </div>
  );
};

export default KeyGenerator;

