import React, { useState } from 'react';
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

export default function DeviceModal({
  isExistingUser: initialIsExistingUser,
  defaultName,
  inheritedRole,
  onSubmit,
  onClose,
  securityEnabled = true,
}) {
  const [mode, setMode] = useState(initialIsExistingUser ? 'existing' : 'new');
  
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      person_name: '',
      session_name: defaultName || '',
      role: inheritedRole || 'customer_care',
      access_code: '',
    }
  });
  
  const [busy, setBusy] = useState(false);

  const submit = async (data) => {
    setBusy(true);
    try {
      // We pass the current mode back to Login.jsx handler
      await onSubmit({ ...data, isExistingUser: mode === 'existing' });
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
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100"
          >
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
              {mode === 'existing'
                ? 'Verify your identity to continue'
                : 'First time signing in'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">

          {/* ── NEW USER FIELDS ─────────────────────────────── */}
          {mode === 'new' && (
            <>
              {/* DEVICE NAME MOVED TO TOP */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Device name</label>
                <input
                  className="w-full h-11 px-3 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
                  placeholder="e.g. Office Laptop"
                  {...register('session_name', { required: 'Device name is required' })}
                />
                {errors.session_name && <p className="text-xs text-red-500">{errors.session_name.message}</p>}
              </div>

              {/* YOUR NAME MOVED TO SECOND */}
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
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {errors.role && <p className="text-xs text-red-500">{errors.role.message}</p>}
              </div>
            </>
          )}

          {/* ── EXISTING USER FIELDS ────────────────────────── */}
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

          {/* ── SHARED ACCESS CODE (If Security Enabled) ────── */}
          {securityEnabled && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Shield size={13} className="text-[#21b457]" />
                {mode === 'existing' ? 'Enter access code' : 'Set / Enter access code'}
              </label>
              <input
                type="password"
                maxLength={4}
                className="w-full h-11 px-3 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400 tracking-[0.5em] text-center font-bold"
                placeholder="••••"
                {...register('access_code', {
                  required: 'Access code is required',
                  pattern: { value: /^\d{4}$/, message: 'Must be exactly 4 digits' }
                })}
              />
              {errors.access_code && <p className="text-xs text-red-500">{errors.access_code.message}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all disabled:opacity-60 text-sm mt-2"
          >
            {busy ? 'Verifying…' : 'Register device'}
          </button>

          {/* ── FOOTER TOGGLE ───────────────────────────────── */}
          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
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
              <button 
                type="button" 
                onClick={() => setMode('new')} 
                className="text-xs text-[#21b457] font-semibold hover:underline"
              >
                Not an existing user? Register as new
              </button>
            )}
          </div>

        </form>
      </motion.div>
    </div>
  );
}
