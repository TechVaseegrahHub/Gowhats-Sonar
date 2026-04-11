import React, { useState, useEffect } from 'react';
import {
  FiCopy, 
  FiTrash2, 
  FiKey, 
  FiActivity,
  FiBook
} from 'react-icons/fi';
import { Key, Settings2, Loader2, X } from 'lucide-react';
import axios from '../../utils/axios';
import toast from 'react-hot-toast';

const ApiKeys = () => {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [selectedKeyUsage, setSelectedKeyUsage] = useState(null);
  const [activeTab, setActiveTab] = useState('keys');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    permissions: ['orders.read', 'messages.send'],
    expiresInDays: 365,
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerDay: 10000
    }
  });

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get('/api/api-keys', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApiKeys(response.data.apiKeys);
    } catch (error) {
      toast.error('Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post('/api/api-keys', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewKey(response.data.apiKey);
      fetchApiKeys();
      
      setFormData({
        name: '',
        permissions: ['orders.read', 'messages.send'],
        expiresInDays: 365,
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerDay: 10000
        }
      });
      
      toast.success('API key created successfully');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create API key');
    }
  };

  const handleRevokeKey = async (keyId, keyName) => {
    if (!window.confirm(`Are you sure you want to revoke "${keyName}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/api-keys/${keyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchApiKeys();
      toast.success('API key revoked successfully');
    } catch (error) {
      toast.error('Failed to revoke API key');
    }
  };

  const viewKeyUsage = async (keyId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`/api/api-keys/${keyId}/usage`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedKeyUsage(response.data);
      setShowUsageModal(true);
    } catch (error) {
      toast.error('Failed to fetch usage data');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('API key copied to clipboard');
  };

  const permissionOptions = [
    { value: 'orders.read', label: 'Read Orders', description: 'View order details and list' },
    { value: 'orders.write', label: 'Create Orders', description: 'Create new orders' },
    { value: 'orders.update', label: 'Update Orders', description: 'Modify order status and details' },
    { value: 'messages.read', label: 'Read Messages', description: 'View message history' },
    { value: 'messages.send', label: 'Send Messages', description: 'Send WhatsApp messages' },
    { value: 'contacts.read', label: 'Read Contacts', description: 'View contact information' },
    { value: 'contacts.write', label: 'Write Contacts', description: 'Create and update contacts' },
    { value: 'inventory.read', label: 'Read Inventory', description: 'View product catalog' },
    { value: 'inventory.write', label: 'Write Inventory', description: 'Manage products' },
    { value: 'webhooks.manage', label: 'Manage Webhooks', description: 'Configure webhook endpoints' }
  ];

  const togglePermission = (permission) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between gap-4 px-8 py-6 bg-green-50 border-b border-gray-100 rounded-t-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
              <Key className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">API Keys</h2>
              <p className="text-sm text-gray-600">
                Manage API keys for integrating GoWhats with external applications
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold flex items-center gap-2"
          >
            <Key className="w-5 h-5" />
            Create API Key
          </button>
        </div>

        {/* Info Alert */}
        <div className="mx-8 mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <Settings2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-900">API Integration</p>
              <p className="text-sm text-blue-800 mt-1">
                Use API keys to securely connect external applications to your GoWhats account.
                Each key can have specific permissions and rate limits.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-8 mt-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('keys')}
              className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
                activeTab === 'keys'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Active Keys
              </div>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
                activeTab === 'docs'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <FiBook className="w-4 h-4" />
                Documentation
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {activeTab === 'keys' ? (
            loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-12">
                <Key className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No API keys created yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold"
                >
                  Create Your First API Key
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Key</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Permissions</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Usage</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Last Used</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((key) => (
                      <tr key={key.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4 font-medium">{key.name}</td>
                        <td className="py-4 px-4">
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                            {key.prefix}_••••••••
                          </code>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-wrap gap-1">
                            {key.permissions.slice(0, 2).map((perm) => (
                              <span
                                key={perm}
                                className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                              >
                                {perm.split('.')[1]}
                              </span>
                            ))}
                            {key.permissions.length > 2 && (
                              <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                                +{key.permissions.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm">{key.usageCount || 0} calls</td>
                        <td className="py-4 px-4 text-sm text-gray-600">
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt).toLocaleDateString()
                            : 'Never'}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => viewKeyUsage(key.id)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="View Usage"
                            >
                              <FiActivity className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => handleRevokeKey(key.id, key.name)}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                              title="Revoke Key"
                            >
                              <FiTrash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // Documentation Tab
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-lg">Authentication</h3>
                <p className="text-gray-700">Include your API key in the Authorization header:</p>
                <code className="block bg-white p-4 rounded-lg border border-gray-200">
                  Authorization: Bearer gw_your_api_key_here
                </code>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-lg">Base URL</h3>
                <code className="block bg-white p-4 rounded-lg border border-gray-200">
                  {window.location.origin}/api/v1
                </code>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-lg">Example Endpoints</h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold mb-2">Get Orders</p>
                    <code className="block bg-white p-4 rounded-lg border border-gray-200">
                      GET /api/v1/orders
                    </code>
                  </div>

                  <div>
                    <p className="font-semibold mb-2">Send Message</p>
                    <code className="block bg-white p-4 rounded-lg border border-gray-200 whitespace-pre">
{`POST /api/v1/messages/send
Content-Type: application/json

{
  "to": "+919876543210",
  "text": "Hello from API!"
}`}
                    </code>
                  </div>

                  <div>
                    <p className="font-semibold mb-2">Get Contacts</p>
                    <code className="block bg-white p-4 rounded-lg border border-gray-200">
                      GET /api/v1/contacts
                    </code>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-lg">Rate Limits</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Default: 60 requests per minute</li>
                  <li>• Daily: 10,000 requests per day</li>
                  <li className="text-sm text-gray-600">
                    Rate limits can be customized per API key
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold">
                {newKey ? '🎉 API Key Created' : 'Create New API Key'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKey(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {newKey ? (
                <>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <p className="font-semibold text-yellow-900">Save this key securely!</p>
                    <p className="text-sm text-yellow-800 mt-1">
                      This is the only time you'll see the full key. Store it safely.
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold mb-2">Your API Key</label>
                    <div className="flex gap-2">
                      <code className="flex-1 bg-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                        {newKey.key}
                      </code>
                      <button
                        onClick={() => copyToClipboard(newKey.key)}
                        className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg"
                        title="Copy to clipboard"
                      >
                        <FiCopy className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-xl p-4">
                    <p className="font-semibold mb-2 text-sm">Usage Example:</p>
                    <code className="block bg-white p-3 rounded-lg text-xs overflow-x-auto">
{`curl -H "Authorization: Bearer ${newKey.key}" \\
  ${window.location.origin}/api/v1/orders`}
                    </code>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block font-semibold mb-2">
                      Key Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Production App, WooCommerce Integration"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-3">Permissions</label>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {permissionOptions.map((option) => (
                        <label
                          key={option.value}
                          className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.permissions.includes(option.value)}
                            onChange={() => togglePermission(option.value)}
                            className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                          />
                          <div>
                            <p className="font-medium">{option.label}</p>
                            <p className="text-sm text-gray-600">{option.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold mb-2">Expiration</label>
                    <select
                      value={formData.expiresInDays}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          expiresInDays: parseInt(e.target.value)
                        })
                      }
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 outline-none"
                    >
                      <option value={30}>30 days</option>
                      <option value={90}>90 days</option>
                      <option value={365}>1 year</option>
                      <option value={0}>Never expire</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-2">Rate Limit (per minute)</label>
                    <input
                      type="number"
                      value={formData.rateLimit.requestsPerMinute}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rateLimit: {
                            ...formData.rateLimit,
                            requestsPerMinute: parseInt(e.target.value)
                          }
                        })
                      }
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              {newKey ? (
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewKey(null);
                  }}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-100 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={!formData.name}
                    className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Key
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Usage Modal */}
      {showUsageModal && selectedKeyUsage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold">API Key Usage</h3>
              <button
                onClick={() => setShowUsageModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="font-semibold text-gray-700">Total Requests</p>
                <p className="text-3xl font-bold text-gray-900">
                  {selectedKeyUsage.summary.totalRequests}
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-700">Last Used</p>
                <p className="text-lg">
                  {selectedKeyUsage.summary.lastUsed
                    ? new Date(selectedKeyUsage.summary.lastUsed).toLocaleString()
                    : 'Never'}
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowUsageModal(false)}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeys;
