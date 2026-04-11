import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { publicApi } from '../utils/axios';
import toast from 'react-hot-toast';
import {
  Eye,
  EyeOff,
  ArrowLeft,
  Shield,
  ChevronRight,
  Mail,
  Lock,
  Phone,
  User,
  Building2,
  Tag
} from 'lucide-react';
import { COUNTRIES, defaultCountry } from '../utils/countries';
import AuthLayout from '../components/AuthLayout';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../images/golo1.png';

const GOOGLE_CLIENT_ID =
  '939627024065-0fure8e4mbmmsdb4ubu214f17n3v4749.apps.googleusercontent.com';

const loadGoogleScript = () =>
  new Promise((resolve) => {
    if (document.getElementById('google-gsi')) return resolve();
    const s = document.createElement('script');
    s.id = 'google-gsi';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    document.head.appendChild(s);
  });

const decodeGoogleJWT = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b.padEnd(b.length + ((4 - (b.length % 4)) % 4), '=')));
  } catch {
    return null;
  }
};

const storeTenant = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return;
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(b.padEnd(b.length + ((4 - (b.length % 4)) % 4), '=')));
    const id = p.tenant_id || p.tenantId;
    if (id) {
      ['tenentid', 'tenantid', 'tenant_id', 'tenantId', 'x-tenant-id'].forEach((k) =>
        localStorage.setItem(k, id)
      );
    }
  } catch {}
};

const normalizeReferralCode = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 18 18">
    <path
      fill="#4285F4"
      d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"
    />
    <path
      fill="#34A853"
      d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"
    />
    <path
      fill="#FBBC05"
      d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"
    />
    <path
      fill="#EA4335"
      d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"
    />
  </svg>
);

function StepIndicator({ current, total, labels }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < current
                  ? 'bg-[#21b457] text-white'
                  : i === current
                    ? 'bg-[#21b457] text-white ring-4 ring-[#21b457]/20'
                    : 'bg-gray-100 text-gray-400 border border-gray-200'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </div>
            {labels && (
              <span
                className={`text-xs font-semibold hidden sm:block ${
                  i === current ? 'text-gray-900' : 'text-gray-400'
                }`}
              >
                {labels[i]}
              </span>
            )}
          </div>
          {i < total - 1 && (
            <div
              className={`flex-1 h-[2px] rounded transition-all ${
                i < current ? 'bg-[#21b457]' : 'bg-gray-200'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function PhoneVerifyStep({ onVerified, onBack, title, subtitle }) {
  const [country, setCountry] = useState(defaultCountry);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState('phone');
  const [fullPhone, setFullPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const sendOtp = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 6) return toast.error('Enter a valid phone number');
    const dial = COUNTRIES.find((c) => c.code === country)?.dialCode || '91';
    const e164 = `+${dial}${clean}`;
    setBusy(true);
    try {
      await publicApi.post('/api/auth/whatsapp/send-otp', { phone: e164 });
      setFullPhone(e164);
      setStep('otp');
      setTimer(60);
      toast.success('OTP sent to WhatsApp!');
      setTimeout(() => refs.current[0]?.focus(), 100);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  };

  const change = (i, v) => {
    if (!/^\d?$/.test(v)) return;
    const n = [...otp];
    n[i] = v;
    setOtp(n);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const keydown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const verify = async () => {
    const code = otp.join('');
    if (code.length < 6) return toast.error('Enter all 6 digits');
    setBusy(true);
    try {
      await publicApi.post('/api/auth/whatsapp/check-otp', { phone: fullPhone, otp: code });
      onVerified({ phone: fullPhone, otp: code });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'phone')
    return (
      <div className="space-y-5">
        {title && (
          <div className="mb-2">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
        )}

        <div className="p-3.5 rounded-xl flex items-start gap-3 bg-[#21b457]/5 border border-[#21b457]/20">
          <Shield className="text-[#21b457] w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 font-medium">
            WhatsApp verification is required to secure your account.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">WhatsApp Number</label>
          <div className="w-full h-11 flex items-center overflow-hidden border border-gray-200 bg-gray-50 rounded-xl focus-within:bg-white focus-within:border-[#21b457] focus-within:ring-4 focus-within:ring-[#21b457]/10 transition-all">
            <select
              className="bg-transparent h-full w-[95px] pl-3 pr-1 text-sm font-semibold text-gray-700 border-none focus:ring-0 outline-none cursor-pointer appearance-none"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={busy}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} +{c.dialCode}
                </option>
              ))}
            </select>
            <div className="w-px h-5 bg-gray-200 shrink-0" />
            <div className="relative flex-1 h-full">
              <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 z-10">
                <Phone size={16} />
              </div>
              <input
                className="bg-transparent h-full w-full pl-9 pr-3 text-sm text-gray-900 border-none focus:ring-0 outline-none placeholder:text-gray-400"
                type="tel"
                placeholder="Phone number"
                maxLength={15}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-11 px-4 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 transition-all flex items-center gap-2 text-sm"
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button
            onClick={sendOtp}
            disabled={busy}
            className="flex-1 h-11 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 group disabled:opacity-60 text-sm"
          >
            {busy ? (
              'Sending...'
            ) : (
              <>
                <span>Send OTP</span>
                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      <button
        onClick={() => {
          setStep('phone');
          setOtp(['', '', '', '', '', '']);
        }}
        className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={15} /> Back
      </button>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Enter Code</h2>
        <p className="text-sm text-gray-500 mt-1">
          6-digit code sent to <span className="font-semibold text-gray-900">{fullPhone}</span>
        </p>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {otp.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            className="w-full aspect-square border border-gray-200 bg-gray-50 rounded-xl text-center text-xl font-bold text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all"
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => change(i, e.target.value)}
            onKeyDown={(e) => keydown(i, e)}
          />
        ))}
      </div>

      <button
        onClick={verify}
        disabled={busy || otp.join('').length < 6}
        className="w-full h-11 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all disabled:opacity-60 text-sm"
      >
        {busy ? 'Verifying...' : 'Verify & Continue'}
      </button>

      <div className="text-center">
        {timer > 0 ? (
          <p className="text-sm text-gray-500">
            Resend in <span className="text-[#21b457] font-bold">{timer}s</span>
          </p>
        ) : (
          <button onClick={sendOtp} className="text-sm font-semibold text-[#21b457] hover:underline">
            Resend Code
          </button>
        )}
      </div>
    </div>
  );
}

function EmailDetailsForm({ onNext, referralCode, setReferralCode }) {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = (data) => {
    setBusy(true);
    onNext(data);
    setBusy(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Full Name</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
              <User size={16} />
            </div>
            <input
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
              placeholder="Name"
              disabled={busy}
              {...register('name', {
                required: 'Required',
                minLength: { value: 2, message: 'Min 2' }
              })}
            />
          </div>
          {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Company</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
              <Building2 size={16} />
            </div>
            <input
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
              placeholder="Company"
              disabled={busy}
              {...register('company_name', { required: 'Required' })}
            />
          </div>
          {errors.company_name && (
            <p className="text-xs text-red-500">{errors.company_name.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
              <Mail size={16} />
            </div>
            <input
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
              placeholder="you@company.com"
              disabled={busy}
              {...register('email', {
                required: 'Required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid'
                }
              })}
            />
          </div>
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
              <Lock size={16} />
            </div>
            <input
              type={showPwd ? 'text' : 'password'}
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-9 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
              placeholder="Min 6 chars"
              disabled={busy}
              {...register('password', {
                required: 'Required',
                minLength: { value: 6, message: 'Min 6' }
              })}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
              onClick={() => setShowPwd((p) => !p)}
            >
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Referral Code <span className="text-gray-400">(optional)</span>
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
            <Tag size={16} />
          </div>
          <input
            className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400 uppercase"
            placeholder="Enter referral code"
            value={referralCode}
            onChange={(e) => setReferralCode(normalizeReferralCode(e.target.value))}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full h-11 mt-1 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 group text-sm"
      >
        <span>Next — Verify Phone</span>
        <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
      </button>
    </form>
  );
}

function WaSignupForm({ navigate, login, referralCode, setReferralCode }) {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState('form');
  const [formData, setFormData] = useState(null);
  const [country, setCountry] = useState(defaultCountry);
  const [fullPhone, setFullPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const onDetails = async (data) => {
    const clean = data.phone_number.replace(/\D/g, '');
    const dial = COUNTRIES.find((c) => c.code === country)?.dialCode || '91';
    const e164 = `+${dial}${clean}`;
    setBusy(true);
    try {
      await publicApi.post('/api/auth/whatsapp/send-otp', { phone: e164 });
      setFormData({ ...data, phone_number: e164 });
      setFullPhone(e164);
      setStep('otp');
      setTimer(60);
      toast.success('OTP sent!');
      setTimeout(() => refs.current[0]?.focus(), 100);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  };

  const change = (i, v) => {
    if (!/^\d?$/.test(v)) return;
    const n = [...otp];
    n[i] = v;
    setOtp(n);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const keydown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const verify = async () => {
    const code = otp.join('');
    if (code.length < 6) return toast.error('Enter all 6 digits');
    setBusy(true);
    try {
      const res = await publicApi.post('/api/auth/whatsapp/register', {
        ...formData,
        otp: code,
        referral_code: referralCode
      });
      const token = res.data.access_token || res.data.token;
      if (token) {
        storeTenant(token);
        if (login && login(token)) {
          toast.success('Welcome to GoWhats! 🎉');
          navigate('/admin');
          return;
        }
      }
      toast.success('Account created! Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'otp')
    return (
      <div className="space-y-5">
        <button
          className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
          onClick={() => {
            setStep('form');
            setOtp(['', '', '', '', '', '']);
          }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div>
          <h2 className="text-xl font-bold text-gray-900">Enter Code</h2>
          <p className="text-sm text-gray-500 mt-1">
            6-digit code sent to <span className="font-semibold text-gray-900">{fullPhone}</span>
          </p>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="w-full aspect-square border border-gray-200 bg-gray-50 rounded-xl text-center text-xl font-bold text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all"
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => change(i, e.target.value)}
              onKeyDown={(e) => keydown(i, e)}
            />
          ))}
        </div>

        <button
          className="w-full h-11 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all disabled:opacity-60 text-sm"
          onClick={verify}
          disabled={busy || otp.join('').length < 6}
        >
          {busy ? 'Verifying...' : 'Verify & Create Account'}
        </button>

        <div className="text-center">
          {timer > 0 ? (
            <p className="text-sm text-gray-500">
              Resend in <span className="text-[#21b457] font-bold">{timer}s</span>
            </p>
          ) : (
            <button onClick={() => onDetails(formData)} className="text-sm font-semibold text-[#21b457] hover:underline">
              Resend Code
            </button>
          )}
        </div>
      </div>
    );

  return (
    <form onSubmit={handleSubmit(onDetails)} className="space-y-3.5">
      <div className="p-3.5 rounded-xl flex items-start gap-3 bg-[#21b457]/5 border border-[#21b457]/20">
        <Shield className="text-[#21b457] w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 font-medium">
          We'll verify your WhatsApp number with a one-time code.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Full Name</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
              <User size={16} />
            </div>
            <input
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
              placeholder="John Doe"
              disabled={busy}
              {...register('name', {
                required: 'Required',
                minLength: { value: 2, message: 'Min 2' }
              })}
            />
          </div>
          {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Company</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
              <Building2 size={16} />
            </div>
            <input
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
              placeholder="Acme Corp"
              disabled={busy}
              {...register('company_name', { required: 'Required' })}
            />
          </div>
          {errors.company_name && (
            <p className="text-xs text-red-500">{errors.company_name.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Email Address</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
            <Mail size={16} />
          </div>
          <input
            className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
            placeholder="you@company.com"
            disabled={busy}
            {...register('email', {
              required: 'Required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid'
              }
            })}
          />
        </div>
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">WhatsApp Number</label>
        <div className="w-full h-11 flex items-center overflow-hidden border border-gray-200 bg-gray-50 rounded-xl focus-within:bg-white focus-within:border-[#21b457] focus-within:ring-4 focus-within:ring-[#21b457]/10 transition-all">
          <select
            className="bg-transparent h-full w-[95px] pl-3 pr-1 text-sm font-semibold text-gray-700 border-none focus:ring-0 outline-none cursor-pointer appearance-none"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={busy}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} +{c.dialCode}
              </option>
            ))}
          </select>
          <div className="w-px h-5 bg-gray-200 shrink-0" />
          <div className="relative flex-1 h-full">
            <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 z-10">
              <Phone size={16} />
            </div>
            <input
              className="bg-transparent h-full w-full pl-9 pr-3 text-sm text-gray-900 border-none focus:ring-0 outline-none placeholder:text-gray-400"
              placeholder="Phone number"
              maxLength={15}
              disabled={busy}
              {...register('phone_number', {
                required: 'Required',
                pattern: { value: /^[0-9]{6,15}$/, message: '6-15 digits' }
              })}
            />
          </div>
        </div>
        {errors.phone_number && (
          <p className="text-xs text-red-500">{errors.phone_number.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Referral Code <span className="text-gray-400">(optional)</span>
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-3 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
            <Tag size={16} />
          </div>
          <input
            className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400 uppercase"
            placeholder="Enter referral code"
            value={referralCode}
            onChange={(e) => setReferralCode(normalizeReferralCode(e.target.value))}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full h-11 mt-1 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 group text-sm"
      >
        {busy ? (
          'Sending OTP...'
        ) : (
          <>
            <span>Continue with WhatsApp</span>
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </>
        )}
      </button>
    </form>
  );
}

export function SignUp() {
  const { isAuthenticated, loading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('email');
  const [stage, setStage] = useState('method');
  const [pendingData, setPendingData] = useState(null);
  const [signupMethod, setSignupMethod] = useState(null);
  const [referralCode, setReferralCode] = useState(() =>
    normalizeReferralCode(searchParams.get('ref'))
  );
  const googleInitialized = useRef(false);

  // ─── Store Billzzy sync token from URL ───────────────────
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      sessionStorage.setItem('billzzy_sync_token', token);
    }
  }, [searchParams]);

  useEffect(() => {
    const ref = normalizeReferralCode(searchParams.get('ref'));
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  const handleGoogle = useCallback(
    async (response) => {
      try {
        const payload = decodeGoogleJWT(response.credential);
        if (!payload) return toast.error('Invalid Google token');

        try {
          await publicApi.post('/api/auth/google', { credential: response.credential });
          toast.success('Account already exists. Please sign in.');
          navigate('/login');
          return;
        } catch (err) {
          if (err.response?.status !== 404) {
            toast.error(err.response?.data?.message || 'Google error');
            return;
          }
        }

        setPendingData({
          method: 'google',
          credential: response.credential,
          email: payload.email,
          name: payload.name,
          referral_code: referralCode
        });
        setSignupMethod('google');
        setStage('phone_verify');
      } catch {
        toast.error('Google sign-up failed');
      }
    },
    [navigate, referralCode]
  );

  const triggerGoogle = useCallback(() => {
    loadGoogleScript().then(() => {
      if (!window.google) return toast.error('Google not ready, please try again');
      if (!googleInitialized.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogle,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true
        });
        googleInitialized.current = true;
      }
      window.google.accounts.id.prompt((n) => {
        if (n.isNotDisplayed() || n.isSkippedMoment()) {
          toast.error('Google One-Tap unavailable. Please try again or use email.');
        }
      });
    });
  }, [handleGoogle]);

  useEffect(() => {
    loadGoogleScript();
  }, []);

  if (loading) return null;
  if (isAuthenticated) {
    navigate('/admin', { replace: true });
    return null;
  }

  const handleEmailDetails = (formData) => {
    setPendingData({ method: 'email', ...formData, referral_code: referralCode });
    setSignupMethod('email');
    setStage('phone_verify');
  };

  const handlePhoneVerified = async ({ phone, otp }) => {
    try {
      let token = null;
      let redirectUrl = null;
      const syncToken = sessionStorage.getItem('billzzy_sync_token');

      if (signupMethod === 'google') {
        const res = await publicApi.post('/api/auth/google/register', {
          credential: pendingData.credential,
          phone_number: phone,
          otp,
          referral_code: pendingData.referral_code,
          integrationToken: syncToken
        });
        token = res.data.access_token || res.data.token;
        redirectUrl = res.data.redirectUrl;

        if (!token) {
          const loginRes = await publicApi.post('/api/auth/google', {
            credential: pendingData.credential
          });
          token = loginRes.data.access_token || loginRes.data.token;
        }
      } else if (signupMethod === 'email') {
        const res = await publicApi.post('/api/auth/register', {
          name: pendingData.name,
          email: pendingData.email,
          password: pendingData.password,
          company_name: pendingData.company_name,
          phone_number: phone,
          otp,
          referral_code: pendingData.referral_code,
          integrationToken: syncToken
        });
        redirectUrl = res.data.redirectUrl;

        const loginRes = await publicApi.post('/api/auth/login', {
          email: pendingData.email,
          password: pendingData.password
        });
        token = loginRes.data.access_token || loginRes.data.token;
      }

      if (token) {
        storeTenant(token);
        if (login(token)) {
          if (redirectUrl) {
            sessionStorage.removeItem('billzzy_sync_token'); // Clean up
            window.location.href = redirectUrl; // Teleport to Billzzy!
            return;
          }
          toast.success('Welcome to GoWhats! 🎉');
          navigate('/admin');
          return;
        }
      }

      toast.success('Account created! Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    }
  };

  const panelContent = (
    <div className="flex flex-col items-center text-center space-y-7">
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/15 rounded-full border border-white/25">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          Smart Automation
        </span>
      </div>

      <div className="space-y-3">
        <h2 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.1] text-white">
          Welcome to
          <br />
          <span className="text-white/75">The Future.</span>
        </h2>
        <p className="text-white/80 text-base font-medium leading-relaxed max-w-[280px] mx-auto">
          Seconds away from transforming your business communications forever.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 w-full max-w-[280px]">
        <div className="flex items-center gap-3 bg-white/15 border border-white/20 p-3.5 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Shield size={15} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-white text-left">Enterprise-Grade Security</p>
        </div>
        <div className="flex items-center gap-3 bg-white/15 border border-white/20 p-3.5 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <ChevronRight size={15} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-white text-left">Infinite Scalability</p>
        </div>
      </div>

      <div className="pt-2 space-y-3">
        <p className="text-white/60 text-xs font-medium">Already have an account?</p>
        <button
          onClick={() => navigate('/login')}
          className="px-8 py-3 bg-white text-[#21b457] font-bold rounded-xl text-sm hover:bg-gray-50 transition-all shadow-md"
        >
          Sign In →
        </button>
      </div>
    </div>
  );

  if (stage === 'phone_verify')
    return (
      <>
        <style>{`
          input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus {
            -webkit-box-shadow: 0 0 0 30px #ffffff inset !important;
            -webkit-text-fill-color: #111827 !important;
          }
        `}</style>

        <AuthLayout panelContent={panelContent} isLogin={false}>
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-0 mb-6"
          >
            <img src={logo} alt="GoWhats" className="w-10 h-10 object-contain" />
            <span
              className="-ml-1.5 text-[#21b457] text-2xl tracking-tight leading-none font-bold"
              style={{ fontFamily: '"Poppins", sans-serif' }}
            >
              oWhats
            </span>
          </motion.div>

          <StepIndicator current={1} total={2} labels={['Details', 'Verify Phone']} />

          {signupMethod === 'google' && pendingData && (
            <div className="flex items-center gap-3 p-3 mb-5 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-[#21b457] flex items-center justify-center text-white font-bold text-sm shrink-0">
                {pendingData.name?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{pendingData.name}</p>
                <p className="text-xs text-gray-500 truncate">{pendingData.email}</p>
              </div>
              <GoogleIcon />
            </div>
          )}

          <PhoneVerifyStep
            title="Secure your account"
            subtitle="We'll send a code to your WhatsApp to verify your identity."
            onVerified={handlePhoneVerified}
            onBack={() => {
              setStage('method');
              setPendingData(null);
            }}
          />
        </AuthLayout>
      </>
    );

  return (
    <>
      <style>{`
        input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 30px #ffffff inset !important;
          -webkit-text-fill-color: #111827 !important;
        }
      `}</style>

      <AuthLayout panelContent={panelContent} isLogin={false}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-0 mb-6"
        >
          <img src={logo} alt="GoWhats" className="w-10 h-10 object-contain" />
          <span
            className="-ml-1.5 text-[#21b457] text-2xl tracking-tight leading-none font-bold"
            style={{ fontFamily: '"Poppins", sans-serif' }}
          >
            oWhats
          </span>
        </motion.div>

        <StepIndicator current={0} total={2} labels={['Details', 'Verify Phone']} />

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">Join GoWhats and grow your business.</p>
        </div>

        <div className="flex bg-gray-100 p-1 border border-gray-200 rounded-xl mb-5">
          <button
            onClick={() => setTab('email')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'email'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Mail size={15} /> Email
          </button>
          <button
            onClick={() => setTab('whatsapp')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'whatsapp'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Phone size={15} /> WhatsApp
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
          >
            {tab === 'email' ? (
              <EmailDetailsForm
                onNext={handleEmailDetails}
                referralCode={referralCode}
                setReferralCode={setReferralCode}
              />
            ) : (
              <WaSignupForm
                navigate={navigate}
                login={login}
                referralCode={referralCode}
                setReferralCode={setReferralCode}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">or register with</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          onClick={triggerGoogle}
          className="w-full h-11 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all flex items-center justify-center gap-3 shadow-sm text-sm"
        >
          <GoogleIcon />
          Sign up with Google
        </button>

        <p className="lg:hidden text-center text-sm text-gray-500 mt-6 pt-5 border-t border-gray-100">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-[#21b457] font-bold">
            Sign In →
          </button>
        </p>
      </AuthLayout>
    </>
  );
}

export default SignUp;
