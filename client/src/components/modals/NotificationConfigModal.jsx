import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Save, Loader2, ToggleLeft, ToggleRight, MessageSquare } from 'lucide-react';
import { toast } from 'react-toastify';

const NotificationConfigModal = ({ isOpen, onClose, type, title }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullConfig, setFullConfig] = useState({});
  const [localData, setLocalData] = useState({
    enabled: true,
    customContent: { header: '', body: '', footer: '' }
  });

  useEffect(() => {
    if (isOpen) fetchConfig();
  }, [isOpen, type]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/notification-config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFullConfig(response.data);
      if (response.data[type]) setLocalData(response.data[type]);
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error("Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    setLocalData(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleInputChange = (field, value) => {
    setLocalData(prev => ({
      ...prev,
      customContent: { ...prev.customContent, [field]: value }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = { ...fullConfig, [type]: localData };
      await axios.post('/api/notification-config', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`${title} settings saved!`);
      onClose();
    } catch (error) {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><MessageSquare className="w-5 h-5" /></div>
            <h3 className="font-bold text-gray-900 text-lg">{title} Settings</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {loading ? (
            <div className="flex justify-center h-20 items-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : (
            <div className="space-y-6">
              {/* Toggle */}
              <div className={`flex items-center justify-between p-4 rounded-xl border ${localData.enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div>
                  <h4 className={`font-bold ${localData.enabled ? 'text-green-800' : 'text-gray-600'}`}>{localData.enabled ? 'Active' : 'Disabled'}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{localData.enabled ? 'Notifications will be sent.' : 'No notifications sent.'}</p>
                </div>
                <button onClick={handleToggle}>
                  {localData.enabled ? <ToggleRight className="w-10 h-10 text-green-600" /> : <ToggleLeft className="w-10 h-10 text-gray-400" />}
                </button>
              </div>

              {/* Editor */}
              <div className={`space-y-4 ${!localData.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2"><span className="h-4 w-1 bg-blue-500 rounded-full"></span><h4 className="font-bold text-gray-800 text-sm uppercase">Content Preview</h4></div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Header</label>
                  <input value={localData.customContent?.header || ''} onChange={(e) => handleInputChange('header', e.target.value)} className="w-full border p-2 rounded" placeholder="Header" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Body</label>
                  <textarea value={localData.customContent?.body || ''} onChange={(e) => handleInputChange('body', e.target.value)} className="w-full border p-2 rounded min-h-[80px]" placeholder="Body text..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Footer</label>
                  <input value={localData.customContent?.footer || ''} onChange={(e) => handleInputChange('footer', e.target.value)} className="w-full border p-2 rounded" placeholder="Footer" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationConfigModal;
