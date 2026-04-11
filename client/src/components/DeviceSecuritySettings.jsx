import React, { useState, useEffect } from 'react';
import api from '../utils/axios';
import toast from 'react-hot-toast';
import { Shield, MonitorSmartphone, Save, Laptop, Globe, Clock, Trash2, User, Activity } from 'lucide-react';

export default function DeviceSecuritySettings() {
  const [enabled, setEnabled] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
    // Refresh sessions every 30 seconds to update online status
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchSettings(), fetchSessions()]);
    setLoading(false);
  };

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/api/devices/settings');
      setEnabled(data.enabled);
    } catch (err) {
      toast.error('Failed to load device settings');
    }
  };

  const fetchSessions = async () => {
    try {
      const { data } = await api.get('/api/devices');
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/api/devices/settings', { enabled });
      toast.success('Device security settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (deviceId) => {
    if (!window.confirm("Are you sure you want to revoke access for this device? The user will be logged out immediately.")) return;
    
    try {
      await api.delete(`/api/devices/${deviceId}`);
      setSessions(prev => prev.filter(s => s.device_id !== deviceId));
      toast.success('Device access revoked');
    } catch (err) {
      toast.error('Failed to revoke device');
    }
  };

  // Helper to determine if a device is online (heartbeat within last 5 mins)
  const isOnline = (lastSeen) => {
    if (!lastSeen) return false;
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastSeen) > fiveMinsAgo;
  };

  // Helper to format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString([], { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  if (loading) return <div className="p-8 text-center text-gray-500 flex items-center justify-center h-full"><Activity className="animate-spin mr-2" /> Loading device data...</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-6">
      
      {/* ─── SETTINGS CARD ─── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-6 border-b border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg text-white">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Device Security Configuration</h1>
            <p className="text-sm text-gray-600 mt-1">Require team members to set and use a PIN on new devices.</p>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Shield size={18} className={enabled ? 'text-emerald-500' : 'text-gray-400'} />
                Require Device PIN Registration
              </h3>
              <p className="text-sm text-gray-500 mt-1 max-w-lg">
                When enabled, every user must set a 4-digit PIN the first time they log in. 
                They will be required to enter this personal PIN whenever they log into a new computer or phone.
              </p>
            </div>
            
            <label className="relative inline-flex items-center cursor-pointer mt-1">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={enabled} 
                onChange={(e) => setEnabled(e.target.checked)} 
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="pt-6 mt-6 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all shadow-sm disabled:opacity-70"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── ACTIVE SESSIONS CARD ─── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <MonitorSmartphone size={20} className="text-emerald-600" />
              Active Device Sessions
            </h2>
            <p className="text-sm text-gray-500 mt-1">Manage and revoke access for devices currently logged into your workspace.</p>
          </div>
          <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
            {sessions.length} Active {sessions.length === 1 ? 'Device' : 'Devices'}
          </div>
        </div>

        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No active sessions found.</div>
          ) : (
            sessions.map((session) => {
              const online = isOnline(session.last_seen_at);
              
              return (
                <div key={session.device_id} className="p-6 hover:bg-gray-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  
                  {/* Left: Device & User Info */}
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center relative">
                        <Laptop size={18} className="text-gray-600" />
                        <span className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${online ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {session.session_name}
                        {online && <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Online</span>}
                      </h4>
                      
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center text-xs text-gray-600 gap-1.5">
                          <User size={13} className="text-gray-400" />
                          <span className="font-medium text-gray-800">{session.account_id?.name || 'Unknown User'}</span>
                          <span className="text-gray-300">•</span>
                          <span className="capitalize text-emerald-600 font-medium">{session.role.replace('_', ' ')}</span>
                        </div>
                        
                        <div className="flex items-center text-xs text-gray-500 gap-1.5">
                          <Globe size={13} className="text-gray-400" />
                          <span>{session.browser || 'Unknown Browser'} on {session.os || 'Unknown OS'}</span>
                          {session.ip_address && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span>IP: {session.ip_address}</span>
                            </>
                          )}
                        </div>
                        
                        <div className="flex items-center text-xs text-gray-500 gap-1.5">
                          <Clock size={13} className="text-gray-400" />
                          <span>Last active: {formatDate(session.last_seen_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex-shrink-0 md:ml-auto">
                    <button
                      onClick={() => handleRevoke(session.device_id)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                    >
                      <Trash2 size={16} />
                      Revoke Access
                    </button>
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
