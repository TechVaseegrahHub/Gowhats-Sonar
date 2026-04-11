import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell, Plus, Trash2, Send, Save, Clock, ToggleLeft, ToggleRight,
  Phone, CheckCircle, XCircle, Loader2, MessageSquare, User
} from 'lucide-react';
import { COUNTRIES, defaultCountry } from '../utils/countries';
import api from '../utils/axios';

// ── WhatsApp message preview ────────────────────────────────────────────────
const MessagePreview = ({ contacts }) => (
  <div style={{
    background: '#e5ddd5',
    borderRadius: '12px',
    padding: '16px',
    minWidth: '280px',
    maxWidth: '340px',
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
    fontSize: '14px'
  }}>
    <div style={{ marginBottom: '8px', color: '#667781', fontSize: '12px', fontWeight: 600 }}>
      Preview — WhatsApp Message
    </div>
    <div style={{
      background: '#fff',
      borderRadius: '8px 8px 8px 0',
      padding: '10px 14px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.13)',
      lineHeight: '1.6'
    }}>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>📊 Daily Business Report</div>
      <div>📦 <strong>Total Orders Today:</strong> <strong>--</strong></div>
      <div>💰 <strong>Total Revenue:</strong> <strong>₹--</strong></div>
      <div>🏆 <strong>Most Sold Product:</strong> <strong>--</strong> (Sold: <strong>--</strong>)</div>
      <div>📩 <strong>Templates Sent Today:</strong> <strong>--</strong></div>
      <div>👥 <strong>Unique Contacts Messaged:</strong> <strong>--</strong></div>
      <div style={{ marginTop: '10px', color: '#667781', fontSize: '12px', fontStyle: 'italic' }}>
        Report generated at {new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
          year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
        })}
      </div>
    </div>
    <div style={{ marginTop: '6px', color: '#667781', fontSize: '11px' }}>
      Sent to {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
    </div>
  </div>
);

// ── Toast helper ─────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  const bg = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6';
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: bg, color: '#fff', padding: '12px 20px', borderRadius: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '14px', fontWeight: 500, maxWidth: '380px', animation: 'slideIn 0.3s ease'
    }}>
      {type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
      {msg}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const format12Hour = (time24) => {
  if (!time24) return '08:00 PM';
  const [h, m] = time24.split(':');
  const hours = parseInt(h, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

export default function DailySalesAlertSettings() {
  const [config, setConfig] = useState({ enabled: false, sendTime: '20:00', contacts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast] = useState(null);

  // New contact form state
  const [newLabel, setNewLabel] = useState('CEO');
  const [newDialCode, setNewDialCode] = useState(defaultCountry); // country code key
  const [newPhone, setNewPhone] = useState('');

  const showToast = (msg, type = 'success') => setToast({ msg, type });
  const hideToast = useCallback(() => setToast(null), []);

  const authHeader = () => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  };

  // ── Load config ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/daily-sales-alert/config');
        const data = res.data;
        if (data.success && data.config) {
          setConfig({
            enabled: data.config.enabled === true,
            sendTime: data.config.sendTime || '20:00',
            contacts: Array.isArray(data.config.contacts) ? data.config.contacts : []
          });
        }
      } catch {
        showToast('Failed to load configuration.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save config ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.post('/api/daily-sales-alert/config', {
        enabled: config.enabled,
        sendTime: config.sendTime,
        contacts: config.contacts
      });
      const data = res.data;
      if (data.success && data.config) {
        setConfig({
          enabled: data.config.enabled === true,
          sendTime: data.config.sendTime || '20:00',
          contacts: Array.isArray(data.config.contacts) ? data.config.contacts : []
        });
        showToast('Configuration saved successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to save.', 'error');
      }
    } catch {
      showToast('Network error while saving.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Trigger now ────────────────────────────────────────────────────────────
  const handleTriggerNow = async () => {
    setTriggering(true);
    try {
      const res = await api.post('/api/daily-sales-alert/trigger');
      const data = res.data;
      if (data.success) {
        const sentCount = data.results?.filter(r => r.sent).length ?? 0;
        showToast(`Report sent to ${sentCount} contact(s)! ✅`, 'success');
      } else {
        showToast(data.reason || data.error || 'Failed to send.', 'error');
      }
    } catch {
      showToast('Network error while triggering.', 'error');
    } finally {
      setTriggering(false);
    }
  };

  // ── Contact helpers ────────────────────────────────────────────────────────
  const addContact = () => {
    if (!newPhone.trim()) return showToast('Please enter a phone number.', 'error');
    const country = COUNTRIES.find(c => c.code === newDialCode);
    const dialCode = country?.dialCode || '91';
    const fullPhone = `${dialCode}${newPhone.replace(/\D/g, '')}`;
    setConfig(prev => ({
      ...prev,
      contacts: [...prev.contacts, { label: newLabel, phone: fullPhone }]
    }));
    setNewPhone('');
  };

  const removeContact = (idx) =>
    setConfig(prev => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== idx) }));

  const updateContact = (idx, field, value) =>
    setConfig(prev => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => i === idx ? { ...c, [field]: value } : c)
    }));

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card = {
    background: '#fff',
    borderRadius: '14px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  };

  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' };
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #d1d5db', fontSize: '14px', outline: 'none',
    transition: 'border-color 0.2s', boxSizing: 'border-box', color: '#111827'
  };
  const btnStyle = (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '10px 20px', borderRadius: '9px', border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: '14px', background: color, color: '#fff',
    transition: 'opacity 0.2s, transform 0.1s', width: '100%', justifyContent: 'center'
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '240px' }}>
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#16a34a' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(30px); opacity:0 } to { transform: translateX(0); opacity:1 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .dsa-input:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.12) !important; }
        .dsa-btn:hover { opacity: 0.88 !important; transform: translateY(-1px) !important; }
        .dsa-btn:active { transform: translateY(0) !important; }
        .dsa-del-btn:hover { background: #fee2e2 !important; }
        @media (max-width: 640px) {
          .dsa-card { padding: 16px !important; }
          .dsa-main-flex { gap: 20px !important; }
        }
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={hideToast} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', borderRadius: '12px', padding: '10px' }}>
          <Bell size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#111827' }}>
            Daily Sales Alert
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Send an automated WhatsApp sales summary to your team every day.
          </p>
        </div>
      </div>

      {/* Toggle + Time */}
      <div className="dsa-card dsa-main-flex" style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: '28px', alignItems: 'flex-start' }}>
        {/* Enable Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 200px' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Automated Daily Report</span>
          <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            Enable to automatically send the report at your set time each day.
          </p>
          <button
            id="dsa-toggle"
            onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: config.enabled ? '#dcfce7' : '#f3f4f6',
              border: '1.5px solid', borderColor: config.enabled ? '#16a34a' : '#d1d5db',
              borderRadius: '24px', padding: '8px 16px', cursor: 'pointer',
              fontSize: '14px', fontWeight: 600,
              color: config.enabled ? '#15803d' : '#6b7280',
              transition: 'all 0.2s', width: 'fit-content'
            }}
          >
            {config.enabled
              ? <><ToggleRight size={22} color="#16a34a" /> Enabled</>
              : <><ToggleLeft size={22} color="#9ca3af" /> Disabled</>
            }
          </button>
        </div>

        {/* Time Picker */}
        <div style={{ flex: '1 1 300px' }}>
          <label style={labelStyle}>
            <Clock size={14} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }} />
            Daily Send Time
          </label>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#9ca3af' }}>
            The report will be sent at this time every day (IST).
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={(parseInt((config.sendTime || '20:00').split(':')[0], 10) % 12 || 12).toString().padStart(2, '0')}
              onChange={e => {
                const newH12 = e.target.value;
                const [oldH, oldM] = (config.sendTime || '20:00').split(':');
                const ampm = parseInt(oldH, 10) >= 12 ? 'PM' : 'AM';
                let hh = parseInt(newH12, 10);
                if (ampm === 'PM' && hh !== 12) hh += 12;
                if (ampm === 'AM' && hh === 12) hh = 0;
                setConfig(prev => ({ ...prev, sendTime: `${hh.toString().padStart(2, '0')}:${oldM}` }));
              }}
              className="dsa-input"
              style={{ ...inputStyle, width: '70px', padding: '9px 8px', textAlign: 'center' }}
            >
              {Array.from({ length: 12 }, (_, i) => {
                const h = (i + 1).toString().padStart(2, '0');
                return <option key={h} value={h}>{h}</option>;
              })}
            </select>
            <span style={{ fontWeight: 700, color: '#374151' }}>:</span>
            <input
              type="text"
              maxLength="2"
              value={(config.sendTime || '20:00').split(':')[1]}
              onChange={e => {
                let newM = e.target.value.replace(/\D/g, '');
                if (parseInt(newM, 10) > 59) newM = '59';
                const hh = (config.sendTime || '20:00').split(':')[0];
                setConfig(prev => ({ ...prev, sendTime: `${hh}:${newM}` }));
              }}
              onBlur={e => {
                let newM = e.target.value;
                if (!newM) newM = '00';
                newM = newM.padStart(2, '0');
                const hh = (config.sendTime || '20:00').split(':')[0];
                setConfig(prev => ({ ...prev, sendTime: `${hh}:${newM}` }));
              }}
              className="dsa-input"
              style={{ ...inputStyle, width: '70px', padding: '9px 8px', textAlign: 'center' }}
            />
            <select
              value={parseInt((config.sendTime || '20:00').split(':')[0], 10) >= 12 ? 'PM' : 'AM'}
              onChange={e => {
                const newAmPm = e.target.value;
                const [oldH, oldM] = (config.sendTime || '20:00').split(':');
                let hh = parseInt(oldH, 10);
                const isCurrentlyPM = hh >= 12;
                if (newAmPm === 'PM' && !isCurrentlyPM) hh += 12;
                if (newAmPm === 'AM' && isCurrentlyPM) hh -= 12;
                setConfig(prev => ({ ...prev, sendTime: `${hh.toString().padStart(2, '0')}:${oldM}` }));
              }}
              className="dsa-input"
              style={{ ...inputStyle, width: '80px', padding: '9px 8px', textAlign: 'center', background: '#f8fafc' }}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contacts */}
      <div className="dsa-card" style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Phone size={16} color="#16a34a" />
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>WhatsApp Contacts</span>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
          Enter the numbers for CEO and Admin who should receive the daily report.
        </p>

        {/* Existing contacts */}
        {config.contacts.length === 0 ? (
          <div className="text-center p-8 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50 mb-4">
            <p className="text-sm text-slate-400 font-medium">No recipients added yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-6">
            {config.contacts.map((c, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-slate-50 border border-slate-200 p-3 rounded-xl">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <User size={16} className="text-green-600" />
                  </div>
                  <select
                    value={c.label}
                    onChange={e => updateContact(idx, 'label', e.target.value)}
                    className="flex-1 sm:w-28 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold focus:border-green-500 outline-none"
                  >
                    <option>CEO</option>
                    <option>Admin</option>
                    <option>Manager</option>
                    <option>Sales</option>
                    <option>Owner</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 truncate">
                    +{c.phone}
                  </div>
                  <button
                    onClick={() => removeContact(idx)}
                    className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new contact form */}
        <div className="bg-green-50/40 border-2 border-dashed border-green-200 rounded-2xl p-4 sm:p-6">
          <p className="text-sm font-black text-green-700 mb-4 uppercase tracking-wider flex items-center gap-2">
            <Plus size={18} /> Add New Business Recipient
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-green-600 mb-1 ml-1">Role</label>
              <select
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-green-500 outline-none"
              >
                <option>CEO</option>
                <option>Admin</option>
                <option>Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-green-600 mb-1 ml-1">Country</label>
              <select
                value={newDialCode}
                onChange={e => setNewDialCode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-green-500 outline-none"
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.name || c.code} (+{c.dialCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-green-600 mb-1 ml-1">Phone Number</label>
              <div className="flex gap-1">
                <div className="bg-green-100 border border-green-200 rounded-xl px-2.5 flex items-center text-xs font-black text-green-700">
                  +{COUNTRIES.find(c => c.code === newDialCode)?.dialCode || '91'}
                </div>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="9876543210"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-green-500 outline-none"
                  onKeyDown={e => e.key === 'Enter' && addContact()}
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={addContact}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-2.5 rounded-xl shadow-lg shadow-green-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={18} /> ADD
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="dsa-card" style={{ ...card, marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827', marginBottom: '4px' }}>Actions</div>

        <button
          id="dsa-save"
          onClick={handleSave}
          disabled={saving}
          className="dsa-btn"
          style={btnStyle('#16a34a')}
        >
          {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>

        <button
          id="dsa-send-now"
          onClick={handleTriggerNow}
          disabled={triggering}
          className="dsa-btn"
          style={btnStyle('#2563eb')}
        >
          {triggering ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
          {triggering ? 'Sending…' : 'Send Report Now'}
        </button>

        <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af', lineHeight: '1.5' }}>
          <strong>Send Report Now</strong> lets you test immediately without waiting for the scheduled time.
        </p>

        <div style={{
          background: '#f0fdf4', borderRadius: '8px', padding: '10px 12px',
          border: '1px solid #bbf7d0', fontSize: '12px', color: '#15803d', lineHeight: '1.5'
        }}>
          ✅ Scheduled: Daily at <strong>{format12Hour(config.sendTime || '20:00')}</strong> IST
          {config.enabled
            ? <div style={{ color: '#16a34a', marginTop: '2px' }}>● Active</div>
            : <div style={{ color: '#6b7280', marginTop: '2px' }}>○ Disabled</div>
          }
        </div>
      </div>
    </div>
  );
}
