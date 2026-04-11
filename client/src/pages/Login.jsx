import React, { useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { publicApi } from '../utils/axios';
import api from '../utils/axios';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ChevronRight, Mail, Lock, X } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../images/golo1.png';
import { getOrCreateDeviceId, getDeviceInfo, getRolePath, startHeartbeat } from '../utils/device';
import DeviceModal from '../components/DeviceModal';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// ─── Load Google GSI script ───────────────────────────────
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

const decodeSafeJWT = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b.padEnd(b.length + ((4 - b.length % 4) % 4), '=')));
  } catch { return null; }
};

const storeTenant = (token) => {
  const p = decodeSafeJWT(token);
  if (!p) return;
  const id = p.tenant_id || p.tenantId;
  if (id) {
    ['tenentid', 'tenantid', 'tenant_id', 'tenantId', 'x-tenant-id']
      .forEach(k => localStorage.setItem(k, id));
  }
};

// ─── Google Icon ──────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/>
  </svg>
);

// ─── Login Page ───────────────────────────────────────────
export function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [showForgot, setShowForgot] = useState(false);
  const [deviceModal, setDeviceModal] = useState(null);
  const pendingTokenRef = React.useRef(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      sessionStorage.setItem('billzzy_sync_token', token);
    }
  }, [searchParams]);

  // ─── Shared post-login device check ──────────────────────
  const handlePostLogin = useCallback(async (token) => {
    pendingTokenRef.current = token;
    storeTenant(token);

    const deviceId = getOrCreateDeviceId();
    const tenantId = localStorage.getItem('tenant_id') || '';

    try {
      const res = await publicApi.get('/api/devices/check', {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Device-ID': deviceId,
          'x-tenant-id': tenantId,
        }
      });

      const { registered, isExistingUser, inheritedRole, role } = res.data;

      // Case 3 — known device OR security disabled in settings, safe to login now and redirect
      if (registered) {
        login(token);
        startHeartbeat(api);
        toast.success('Welcome back!');
        navigate(getRolePath(role));
        return;
      }

      // Case 1 or 2 — show modal, still hold off on login()
      const info = getDeviceInfo();
      setDeviceModal({ isExistingUser: !!isExistingUser, inheritedRole, deviceInfo: info });

    } catch {
      // Fallback — device check failed, log in normally
      login(token);
      toast.success('Logged in!');
      navigate('/admin');
    }
  }, [login, navigate]);

  // ─── Device modal submit ──────────────────────────────────
  const handleDeviceRegister = useCallback(async (data) => {
    const { session_name, role, access_code, isExistingUser } = data;
    const token = pendingTokenRef.current;
    if (!token) return;

    const info = getDeviceInfo();
    const deviceId = getOrCreateDeviceId();
    const tenantId = localStorage.getItem('tenant_id') || '';

    // Fallback role resolution just in case it wasn't passed
    const finalRole = isExistingUser && deviceModal?.inheritedRole
      ? deviceModal.inheritedRole
      : role;

    try {
      // Endpoint handles the access code verification securely based on tenant settings
      await publicApi.post('/api/devices/register', {
        session_name,
        role: finalRole,
        access_code,
        isExistingUser,
        ...info,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Device-ID': deviceId,
          'x-tenant-id': tenantId,
        }
      });

      setDeviceModal(null);
      pendingTokenRef.current = null;

      // NOW call login() — isAuthenticated becomes true but we
      // navigate immediately so the redirect doesn't fire instead
      login(token);
      startHeartbeat(api);
      toast.success('Device registered successfully!');
      navigate(getRolePath(finalRole));

    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed. Check your access code.');
      // Intentionally DO NOT clear token here so they can try again.
    }
  }, [deviceModal, login, navigate]);

  // ─── Google handler ───────────────────────────────────────
  const handleGoogle = useCallback(async (response) => {
    try {
      if (!response.credential) throw new Error('No credential received from Google');

      const syncToken = sessionStorage.getItem('billzzy_sync_token');
      const res = await publicApi.post('/api/auth/google', {
        credential: response.credential,
        integrationToken: syncToken,
      });

      const token = res.data.access_token || res.data.token;
      if (!token) throw new Error('No token received from server');

      storeTenant(token);

      if (res.data.redirectUrl) {
        sessionStorage.removeItem('billzzy_sync_token');
        window.location.href = res.data.redirectUrl;
        return;
      }

      await handlePostLogin(token);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Google sign-in failed');
    }
  }, [handlePostLogin]);

  const triggerGoogle = useCallback(() => {
    loadGoogleScript().then(() => {
      if (!window.google) return toast.error('Google not ready, please try again');

      window.google.accounts.id.cancel();
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogle,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          const reason = notification.getNotDisplayedReason?.() || notification.getSkippedReason?.();
          console.warn('Google One Tap not shown:', reason);
          toast.error('Google sign-in could not be displayed. Please allow popups or try again.');
        }
      });
    });
  }, [handleGoogle]);

  useEffect(() => { loadGoogleScript(); }, []);

  if (loading) return null;

  if (isAuthenticated) {
    const searchParams = new URLSearchParams(location.search);
    const shouldReturnToStoreIntegration =
      searchParams.has('shopify') ||
      searchParams.get('section') === 'store';
    const redirectTarget = shouldReturnToStoreIntegration
      ? `/admin/settings${location.search || '?section=store'}`
      : '/admin';
    return <Navigate to={redirectTarget} replace />;
  }

  const panelContent = (
    <div className="flex flex-col items-center text-center space-y-7">
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/15 rounded-full border border-white/25">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">Powering Businesses</span>
      </div>

      <div className="space-y-3">
        <h2 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.1] text-white">
          WhatsApp<br />
          <span className="text-white/75">Simplified.</span>
        </h2>
        <p className="text-white/80 text-base font-medium leading-relaxed max-w-[280px] mx-auto">
          Scale your business with the world's most powerful WhatsApp automation suite.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-[260px]">
        <div className="bg-white/15 border border-white/20 p-4 rounded-2xl text-left">
          <p className="text-white font-extrabold text-3xl">99.9%</p>
          <p className="text-white/70 text-xs font-semibold mt-1 uppercase tracking-wide">Uptime</p>
        </div>
        <div className="bg-white/15 border border-white/20 p-4 rounded-2xl text-left">
          <p className="text-white font-extrabold text-3xl">24/7</p>
          <p className="text-white/70 text-xs font-semibold mt-1 uppercase tracking-wide">Support</p>
        </div>
      </div>

      <div className="pt-2 space-y-3">
        <p className="text-white/60 text-xs font-medium">Don't have an account?</p>
        <button
          onClick={() => navigate('/signup')}
          className="px-8 py-3 bg-white text-[#21b457] font-bold rounded-xl text-sm hover:bg-gray-50 transition-all shadow-md"
        >
          Get Started Free →
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 30px #ffffff inset !important;
          -webkit-text-fill-color: #111827 !important;
        }
        input:focus:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 30px #ffffff inset !important;
        }
      `}</style>

      <AuthLayout panelContent={panelContent} isLogin={true}>
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-0 mb-8">
          <img src={logo} alt="GoWhats" className="w-10 h-10 object-contain" />
          <span className="-ml-1.5 text-[#21b457] text-2xl tracking-tight leading-none font-bold"
            style={{ fontFamily: '"Poppins", sans-serif' }}>
            oWhats
          </span>
        </motion.div>

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue.</p>
        </div>

        {/* Email/password form */}
        <EmailForm onPostLogin={handlePostLogin} onForgot={() => setShowForgot(true)} />

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">or continue with</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google */}
        <button
          onClick={triggerGoogle}
          className="w-full h-11 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all flex items-center justify-center gap-3 shadow-sm text-sm"
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        {/* Mobile sign up link */}
        <p className="lg:hidden text-center text-sm text-gray-500 mt-6 pt-5 border-t border-gray-100">
          Don't have an account?{' '}
          <button onClick={() => navigate('/signup')} className="text-[#21b457] font-bold">Sign up free →</button>
        </p>
      </AuthLayout>

      <AnimatePresence>
        {showForgot && <ForgotModal onClose={() => setShowForgot(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {deviceModal && (
          <DeviceModal
            isExistingUser={deviceModal.isExistingUser}
            defaultName={deviceModal.deviceInfo.session_name}
            inheritedRole={deviceModal.inheritedRole}
            onSubmit={handleDeviceRegister}
            onClose={() => {
              setDeviceModal(null);
              pendingTokenRef.current = null;
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Email/password login form ────────────────────────────
function EmailForm({ onPostLogin, onForgot }) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (data) => {
    if (busy) return;
    setBusy(true);
    try {
      const syncToken = sessionStorage.getItem('billzzy_sync_token');
      if (syncToken) {
        data.integrationToken = syncToken;
      }
      const res = await publicApi.post('/api/auth/login', data);
      const token = res.data.access_token || res.data.token;
      if (!token) throw new Error('No token received');
      if (res.data.redirectUrl) {
        sessionStorage.removeItem('billzzy_sync_token'); // Clean up
        window.location.href = res.data.redirectUrl; // Redirect to Billzzy
        return; // Stop execution
      }
      await onPostLogin(token);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Email Address</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-3.5 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
            <Mail size={17} />
          </div>
          <input
            className="w-full pl-10 pr-4 h-11 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
            placeholder="name@company.com"
            disabled={busy}
            {...register('email', {
              required: 'Required',
              pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Invalid email' }
            })}
          />
        </div>
        {errors.email && <p className="text-xs text-red-500 font-medium">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <button type="button" onClick={onForgot} className="text-xs font-semibold text-[#21b457] hover:underline">
            Forgot password?
          </button>
        </div>
        <div className="relative group">
          <div className="absolute inset-y-0 left-3.5 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors z-10">
            <Lock size={17} />
          </div>
          <input
            type={showPwd ? 'text' : 'password'}
            className="w-full pl-10 pr-11 h-11 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 outline-none transition-all placeholder:text-gray-400"
            placeholder="••••••••"
            disabled={busy}
            {...register('password', { required: 'Required', minLength: { value: 6, message: 'Min 6 chars' } })}
          />
          <button type="button"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
            onClick={() => setShowPwd(!showPwd)}>
            {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-500 font-medium">{errors.password.message}</p>}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full h-11 mt-1 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 group text-sm"
      >
        {busy ? 'Signing in...' : (
          <>
            <span>Sign In</span>
            <ChevronRight size={17} className="group-hover:translate-x-0.5 transition-transform" />
          </>
        )}
      </button>
    </form>
  );
}

// ─── Forgot password modal ────────────────────────────────
function ForgotModal({ onClose }) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (data) => {
    setBusy(true);
    try {
      await publicApi.post('/api/auth/forgot-password', { email: data.email });
      setSent(true);
      toast.success('If your email is registered, a reset link has been sent.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <X size={16} className="text-gray-500" />
        </button>

        {!sent ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Reset password</h3>
              <p className="text-sm text-gray-500 mt-1">Enter your email and we'll send a reset link.</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-3.5 flex items-center text-gray-400 group-focus-within:text-[#21b457] transition-colors">
                  <Mail size={17} />
                </div>
                <input
                  className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-[#21b457] focus:ring-4 focus:ring-[#21b457]/10 transition-all outline-none text-sm placeholder:text-gray-400"
                  placeholder="name@company.com"
                  {...register('email', {
                    required: 'Required',
                    pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Invalid' }
                  })}
                />
              </div>
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 h-11 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm">
                Cancel
              </button>
              <button type="submit" disabled={busy}
                className="flex-1 h-11 bg-[#21b457] text-white font-semibold rounded-xl hover:bg-[#1a9547] transition-all disabled:opacity-60 text-sm">
                {busy ? 'Sending...' : 'Send Link'}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 bg-[#21b457]/10 rounded-full flex items-center justify-center mx-auto">
              <Mail className="text-[#21b457]" size={26} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Check your inbox</h3>
              <p className="text-sm text-gray-500 mt-1">If your email is registered, a reset link has been sent.</p>
            </div>
            <button onClick={onClose}
              className="w-full h-11 bg-[#21b457] hover:bg-[#1a9547] text-white font-semibold rounded-xl transition-all text-sm">
              Back to Login
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default Login;
