import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Monitor, X, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';

const ROLES = [
  { value: 'customer_care', label: 'Customer Care' },
  { value: 'manager',       label: 'Manager' },
  { value: 'admin',         label: 'Admin' },
  { value: 'accountant',    label: 'Accountant' },
  { value: 'developer',     label: 'Developer' },
];

// ── 4-box PIN input ──────────────────────────────────────
function PinInput({ onChange, error }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    onChange(next.join(''));
    if (val && i < 3) refs[i + 1].current?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    const next = ['', '', '', ''];
    pasted.split('').forEach((c, i) => { next[i] = c; });
    setDigits(next);
    onChange(next.join(''));
    const focusIdx = Math.min(pasted.length, 3);
    refs[focusIdx].current?.focus();
  };

  return (
    <div>
      <div className="flex gap-3 justify-center">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={`w-12 h-12 text-center text-lg font-bold rounded-xl border-2 outline-none transition-all
              bg-gray-50 text-gray-900
              ${d ? 'border-[#21b457] bg-white' : 'border-gray-200'}
              focus:border-[#21b457] focus:bg-white focus:ring-4 focus:ring-[#21b457]/10
              ${error ? 'border-red-400 bg-red-50' : ''}`}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-500 text-center mt-2">{error}</p>}
    </div>
  );
}

export default function DeviceModal({
  isExistingUser: initialIsExistingUser,
  defaultName,
  inheritedRole,
  onSubmit,
  onClose,
  securityEnabled = true,
}) {
  const [mode, setMode] = useState(initialIsExistingUser ? 'existing' : 'new');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      person_name: '',
      session_name: defaultName || '',
      role: inheritedRole || 'customer_care',
    }
  });

  const [busy, setBusy] = useState(false);

  const submit = async (data) => {
    if (securityEnabled) {
      if (!pin || pin.length !== 4) {
        setPinError('Enter all 4 digits');
        return;
      }
      if (!/^\d{4}$/.test(pin)) {
        setPinError('Only digits allowed');
        return;
      }
    }
    setPinError('');
    setBusy(true);
    try {
      await onSubmit({ ...data, access_code: pin, isExistingUser: mode === 'existing' });
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl relative"
      >
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#21b457]/10 flex items-center justify-center">
            <Monitor size={20} className="text-[#21b457]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Register this device</h3>
            <p className="text-xs text-gray-500">
              {mode === 'existing' ? 'Verify your identity to continue' : 'First time signing in'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">

          {/* NEW USER FIELDS */}
          {mode === 'new' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Device name</label>
                <input
                  className="w-full h-11 px-3 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
                  placeholder="e.g. Office Laptop"
                  {...register('session_name', { required: 'Device name is required' })}
                />
                {errors.session_name && <p className="text-xs text-red-500">{errors.session_name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Your name</label>
                <input
                  className="w-full h-11 px-3 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
                  placeholder="e.g. Rahul Kumar"
                  {...register('person_name', { required: 'Your name is required' })}
                />
                {errors.person_name && <p className="text-xs text-red-500">{errors.person_name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  className="w-full h-11 px-3 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all"
                  {...register('role', { required: 'Role is required' })}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {errors.role && <p className="text-xs text-red-500">{errors.role.message}</p>}
              </div>
            </>
          )}

          {/* EXISTING USER — show role badge */}
          {mode === 'existing' && inheritedRole && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-[#21b457]/10 flex items-center justify-center">
                <Shield size={14} className="text-[#21b457]" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Account role</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">
                  {inheritedRole.replace('_', ' ')}
                </p>
              </div>
            </div>
          )}

          {/* PIN INPUT — only when security enabled */}
          {securityEnabled && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 text-center">
                {mode === 'existing' ? 'Enter your PIN' : 'Set your PIN'}
              </label>
              <p className="text-xs text-gray-400 text-center">
                {mode === 'existing'
                  ? 'Enter the 4-digit PIN you set earlier'
                  : 'Choose a 4-digit PIN — you\'ll use this on new devices'}
              </p>
              <PinInput onChange={setPin} error={pinError} />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all disabled:opacity-60 text-sm mt-2"
          >
            {busy ? 'Verifying…' : 'Register device'}
          </button>

          {/* FOOTER TOGGLE */}
          <div className="mt-3 pt-3 border-t border-gray-100 text-center">
            {mode === 'new' ? (
              <label className="flex items-center justify-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                <input
                  type="checkbox"
                  onChange={(e) => setMode(e.target.checked ? 'existing' : 'new')}
                  className="rounded border-gray-300 text-[#21b457] focus:ring-[#21b457]"
                />
                I am an existing user linking a new device
              </label>
            ) : (
              <button type="button" onClick={() => setMode('new')} className="text-xs text-[#21b457] font-semibold hover:underline">
                Not an existing user? Register as new
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
