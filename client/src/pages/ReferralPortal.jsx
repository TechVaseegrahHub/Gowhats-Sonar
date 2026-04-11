import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BadgePercent,
  Building2,
  CalendarDays,
  Copy,
  Link2,
  Lock,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  Users,
  Wallet
} from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../components/AuthLayout';
import { publicApi } from '../utils/axios';

const TOKEN_KEY = 'referral_partner_token';

const formatMoney = (amount = 0, currency = 'INR') => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number(amount || 0) % 1 === 0 ? 0 : 2
    }).format(Number(amount || 0));
  } catch (_error) {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
};

const formatDate = (value) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (_error) {
    return value;
  }
};

export default function ReferralPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageMode = location.pathname.includes('/signup') ? 'signup' : 'login';

  const [mode, setMode] = useState(pageMode);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [authForm, setAuthForm] = useState({
    businessName: '',
    email: '',
    phoneNumber: '',
    password: ''
  });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dashboard, setDashboard] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    setMode(pageMode);
  }, [pageMode]);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const referralLink = useMemo(() => {
    const referralCode = dashboard?.partner?.referralCode;
    if (!referralCode) return '';
    return `${window.location.origin}/signup?ref=${referralCode}`;
  }, [dashboard?.partner?.referralCode]);

  const syncToken = (nextToken) => {
    if (nextToken) {
      localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
      navigate('/referral/dashboard', { replace: true });
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setDashboard(null);
    navigate('/referral/login', { replace: true });
  };

  const loadDashboard = async () => {
    if (!token) return;
    try {
      setDashboardLoading(true);
      const response = await publicApi.get('/api/referral/dashboard', {
        params: { month },
        headers: authHeaders
      });
      if (response.data?.success) {
        setDashboard(response.data);
      }
    } catch (error) {
      console.error('Referral dashboard error:', error);
      if (error.response?.status === 401) {
        syncToken('');
        toast.error('Referral session expired. Please login again.');
      } else {
        toast.error(error.response?.data?.message || 'Failed to load referral dashboard');
      }
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadDashboard();
  }, [token, month]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    try {
      setAuthLoading(true);
      const endpoint = mode === 'signup' ? '/api/referral/auth/register' : '/api/referral/auth/login';
      const payload =
        mode === 'signup'
          ? authForm
          : { email: authForm.email, password: authForm.password };
      const response = await publicApi.post(endpoint, payload);
      if (response.data?.success && response.data?.token) {
        toast.success(mode === 'signup' ? 'Referral company account created' : 'Welcome back');
        syncToken(response.data.token);
      }
    } catch (error) {
      console.error('Referral auth error:', error);
      toast.error(error.response?.data?.message || 'Unable to continue');
    } finally {
      setAuthLoading(false);
    }
  };

  const panelContent = (
    <div className="space-y-6 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100">
        <BadgePercent className="h-3.5 w-3.5" />
        Referral Partner Program
      </div>
      <div>
        <h2 className="text-4xl font-black leading-tight text-white">
          Grow With
          <span className="block text-emerald-300">GoWhats Referrals</span>
        </h2>
        <p className="mt-3 text-sm font-medium leading-6 text-emerald-100/75">
          Create your partner account, share your referral code, and track onboarded clients and
          earned commission in one place.
        </p>
      </div>
    </div>
  );

  /* ─── AUTH ─── */
  if (!token) {
    return (
      <AuthLayout panelContent={panelContent} isLogin={mode === 'login'}>
        <div className="w-full max-w-md mx-auto space-y-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">
              Referral Portal
            </p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {mode === 'signup' ? 'Create Partner Account' : 'Partner Login'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'signup'
                ? 'Register your company and get a unique referral code.'
                : 'Access your dashboard and commission details.'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            {mode === 'signup' && (
              <>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={authForm.businessName}
                    onChange={(e) => setAuthForm((p) => ({ ...p, businessName: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="Business name"
                    required
                  />
                </div>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={authForm.phoneNumber}
                    onChange={(e) => setAuthForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="+91XXXXXXXXXX"
                    required
                  />
                </div>
              </>
            )}

            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                placeholder="partner@agency.com"
                required
              />
            </div>

            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                placeholder="Minimum 6 characters"
                required
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-70"
            >
              {authLoading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Login'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500">
            {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}
            <button
              type="button"
              onClick={() => navigate(mode === 'signup' ? '/referral/login' : '/referral/signup')}
              className="ml-1.5 font-bold text-emerald-600 hover:underline"
            >
              {mode === 'signup' ? 'Login' : 'Sign up'}
            </button>
          </p>
        </div>
      </AuthLayout>
    );
  }

  /* ─── DASHBOARD ─── */
  const clients = dashboard?.clients || [];
  const currencyTotals = dashboard?.summary?.currencyTotals || [];
  const monthlySummary = dashboard?.monthlySummary || [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">
              Referral Dashboard
            </p>
            <h1 className="truncate text-lg font-extrabold text-slate-900 sm:text-xl">
              {dashboard?.partner?.businessName || 'Partner'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="hidden h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm outline-none focus:border-emerald-400 sm:block"
            />
            <button
              onClick={loadDashboard}
              disabled={dashboardLoading}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600"
            >
              <RefreshCw className={`h-4 w-4 ${dashboardLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => syncToken('')}
              className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Mobile month picker */}
        <div className="border-t border-slate-100 px-4 py-2 sm:hidden">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none"
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
        {dashboardLoading && !dashboard ? (
          <div className="py-20 text-center">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-emerald-600" />
            <p className="mt-3 text-sm text-slate-500">Loading dashboard…</p>
          </div>
        ) : (
          <>
            {/* Referral Code + Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Code */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 lg:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Your Referral Code
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-extrabold tracking-widest text-emerald-700">
                    {dashboard?.partner?.referralCode}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(dashboard?.partner?.referralCode || '');
                      toast.success('Code copied');
                    }}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-emerald-600"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    {referralLink}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(referralLink);
                      toast.success('Link copied');
                    }}
                    className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Stat boxes */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <Users className="h-4 w-4 text-sky-500" />
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {dashboard?.summary?.totalClients || 0}
                </p>
                <p className="text-xs text-slate-500">Total Clients</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <Wallet className="h-4 w-4 text-emerald-500" />
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {dashboard?.summary?.paidClients || 0}
                </p>
                <p className="text-xs text-slate-500">Paid Clients</p>
              </div>
            </div>

            {/* Currency Summary */}
            {currencyTotals.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {currencyTotals.map((row) => (
                  <div
                    key={`${row.currency}-summary`}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      {row.currency}
                    </span>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Earned</span>
                        <span className="font-semibold text-slate-900">
                          {formatMoney(row.earned, row.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Unpaid</span>
                        <span className="font-semibold text-amber-600">
                          {formatMoney(row.pending, row.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Paid</span>
                        <span className="font-semibold text-emerald-600">
                          {formatMoney(row.paid, row.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Clients + Timeline */}
            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              {/* Clients */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold text-slate-900">
                  Clients <span className="font-normal text-slate-400">— {month}</span>
                </p>

                {/* Desktop */}
                <div className="mt-3 hidden overflow-x-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                        <th className="pb-2 pr-3 font-bold">Business</th>
                        <th className="pb-2 pr-3 font-bold">Status</th>
                        <th className="pb-2 pr-3 font-bold">Plan</th>
                        <th className="pb-2 pr-3 font-bold">Share</th>
                        <th className="pb-2 font-bold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {clients.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-8 text-center text-sm text-slate-400">
                            No clients this month.
                          </td>
                        </tr>
                      ) : (
                        clients.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 pr-3">
                              <p className="font-medium text-slate-900">
                                {c.clientBusinessName || c.clientName || c.clientEmail}
                              </p>
                              <p className="text-xs text-slate-400">
                                {c.clientEmail || c.clientPhone || c.tenantId}
                              </p>
                            </td>
                            <td className="py-2.5 pr-3">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                  c.paymentStatus === 'paid'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {c.paymentStatus === 'paid' ? 'Paid' : (c.status || '').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 font-medium text-slate-700">
                              {formatMoney(c.subscriptionAmount, c.currency)}
                            </td>
                            <td className="py-2.5 pr-3 font-bold text-emerald-700">
                              {formatMoney(c.partnerShareAmount, c.currency)}
                            </td>
                            <td className="py-2.5 text-slate-400">{formatDate(c.signedUpAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <div className="mt-3 space-y-2 sm:hidden">
                  {clients.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">No clients this month.</p>
                  ) : (
                    clients.map((c) => (
                      <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {c.clientBusinessName || c.clientName || c.clientEmail}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              c.paymentStatus === 'paid'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {c.paymentStatus === 'paid' ? 'Paid' : (c.status || '').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs">
                          <span className="text-slate-400">
                            Plan: <span className="font-medium text-slate-600">{formatMoney(c.subscriptionAmount, c.currency)}</span>
                          </span>
                          <span className="text-slate-400">
                            Share: <span className="font-bold text-emerald-600">{formatMoney(c.partnerShareAmount, c.currency)}</span>
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(c.signedUpAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold text-slate-900">Commission Timeline</p>

                <div className="mt-3 space-y-2">
                  {monthlySummary.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">
                      No data yet.
                    </p>
                  ) : (
                    monthlySummary.map((row) => (
                      <div
                        key={row.month}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{row.month}</p>
                          <p className="text-xs text-slate-400">
                            {row.onboardedClients} clients · {row.paidClients} paid
                          </p>
                        </div>
                        <p className="text-sm font-bold text-emerald-700">
                          {formatMoney(row.earnedAmount, dashboard?.partner?.currency || 'INR')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
