/**
 * components/AgentKeyManager.jsx
 * Super admin panel — provision and revoke YoWhats Agent API keys per tenant.
 * Shows key status, allows provisioning new keys and revoking existing ones.
 */

import React, { useState, useEffect } from 'react';
import { publicApi } from '../utils/axios.js';
import toast from 'react-hot-toast';
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Shield,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';

const AgentKeyManager = ({ tenantId, tenantName }) => {
  const [keyStatus, setKeyStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [label, setLabel] = useState('');
  const [showConfirmRevoke, setShowConfirmRevoke] = useState(false);

  useEffect(() => {
    if (tenantId) fetchKeyStatus();
  }, [tenantId]);

  const getToken = () => localStorage.getItem('token');

  const fetchKeyStatus = async () => {
    try {
      setLoading(true);
      const response = await publicApi.get(
        `/api/admin/agent-key-status?tenantId=${tenantId}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      if (response.data?.success) {
        setKeyStatus(response.data);
      }
    } catch (error) {
      console.error('Error fetching key status:', error);
      toast.error('Failed to fetch key status');
    } finally {
      setLoading(false);
    }
  };

  const provisionKey = async () => {
    if (!tenantId) return;
    try {
      setProvisioning(true);
      const response = await publicApi.post(
        '/api/admin/provision-agent-key',
        { tenantId, label: label || `Tenant: ${tenantName || tenantId}` },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      if (response.data?.success) {
        toast.success('AI agent key created successfully!');
        setLabel('');
        await fetchKeyStatus();
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to provision key';
      toast.error(msg);
    } finally {
      setProvisioning(false);
    }
  };

  const revokeKey = async () => {
    try {
      setRevoking(true);
      const response = await publicApi.delete(
        '/api/admin/revoke-agent-key',
        {
          data: { tenantId },
          headers: { Authorization: `Bearer ${getToken()}` }
        }
      );
      if (response.data?.success) {
        toast.success('Agent key revoked successfully');
        setShowConfirmRevoke(false);
        await fetchKeyStatus();
      }
    } catch (error) {
      toast.error('Failed to revoke key');
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  const hasKey = keyStatus?.hasAgentKey;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-6 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">AI Agent API Key</h3>
              <p className="text-sm text-gray-500">
                {tenantName || tenantId}
              </p>
            </div>
          </div>
          <button
            onClick={fetchKeyStatus}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Key Status Badge */}
        <div className={`flex items-center space-x-3 p-4 rounded-xl border-2 ${
          hasKey
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          {hasKey ? (
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${hasKey ? 'text-green-900' : 'text-red-900'}`}>
              {hasKey ? 'API Key Configured' : 'No API Key'}
            </p>
            {hasKey && keyStatus?.keyPrefix && (
              <p className="text-xs text-green-700 font-mono mt-0.5 truncate">
                {keyStatus.keyPrefix}
              </p>
            )}
            {!hasKey && (
              <p className="text-xs text-red-700 mt-0.5">
                Tenant cannot use AI bot without a key
              </p>
            )}
          </div>
        </div>

        {/* Provision new key */}
        {!hasKey && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                Key Label <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Tenant: ${tenantName || tenantId}`}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>
            <button
              onClick={provisionKey}
              disabled={provisioning}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3
                         bg-gradient-to-r from-violet-600 to-purple-600 text-white
                         rounded-xl font-semibold text-sm hover:from-violet-700 hover:to-purple-700
                         transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {provisioning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating key...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Provision API Key</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Revoke existing key */}
        {hasKey && !showConfirmRevoke && (
          <button
            onClick={() => setShowConfirmRevoke(true)}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5
                       border-2 border-red-200 text-red-600 rounded-xl font-semibold text-sm
                       hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Revoke Key</span>
          </button>
        )}

        {/* Confirm revoke */}
        {hasKey && showConfirmRevoke && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 font-medium">
                This will disable the AI bot for this tenant immediately. Are you sure?
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={revokeKey}
                disabled={revoking}
                className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2
                           bg-red-600 text-white rounded-lg text-sm font-semibold
                           hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {revoking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{revoking ? 'Revoking...' : 'Yes, Revoke'}</span>
              </button>
              <button
                onClick={() => setShowConfirmRevoke(false)}
                className="flex-1 px-3 py-2 border-2 border-gray-200 text-gray-700
                           rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentKeyManager;
