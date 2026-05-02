import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicApi } from '../utils/axios';
import {
  Users,
  Building,
  Shield,
  RefreshCw,
  ChevronRight,
  Mail,
  Phone,
  Calendar,
  Search,
  ExternalLink,
  X,
  Info,
  CheckCircle2,
  AlertCircle,
  Eye,
  BarChart3,
  MessageSquare,
  Layout,
  Contact2,
  Key,
  Lock,
  ArrowRight,
  LogOut,
  Crown,
  ChevronDown,
  Activity,
  Zap,
  Globe,
  Hash,
  Clock,
  TrendingUp,
  Server,
  Database,
  Layers,
  Settings,
  Filter,
  MoreVertical,
  Copy,
  ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import goWhatsLogo from '../images/Go.png';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [updatingPlanTenantId, setUpdatingPlanTenantId] = useState('');
  const [updatingPaymentTenantId, setUpdatingPaymentTenantId] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeTab, setActiveTab] = useState('config');
  const [productImageModuleByTenant, setProductImageModuleByTenant] = useState({});
  const [productImageStatusLoadingTenantId, setProductImageStatusLoadingTenantId] = useState('');
  const [productImageToggleLoadingTenantId, setProductImageToggleLoadingTenantId] = useState('');
  const [cloudinaryUploadModuleByTenant, setCloudinaryUploadModuleByTenant] = useState({});
  const [cloudinaryUploadStatusLoadingTenantId, setCloudinaryUploadStatusLoadingTenantId] = useState('');
  const [cloudinaryUploadToggleLoadingTenantId, setCloudinaryUploadToggleLoadingTenantId] = useState('');

  // Admin Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('admin_token'));
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

    const getAdminHeaders = () => {
    const adminToken = localStorage.getItem('admin_token');
    return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTenants();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && selectedTenant?._id) {
      fetchTenantProductImageModuleStatus(selectedTenant._id, { silent: true });
      fetchTenantCloudinaryUploadModuleStatus(selectedTenant._id, { silent: true });
    }
  }, [isAuthenticated, selectedTenant?._id]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setIsLoggingIn(true);

      const response = await publicApi.post('/api/admin-dashboard/login', loginData);
      if (response.data.success) {
        localStorage.setItem('admin_token', response.data.token);
        setIsAuthenticated(true);
        toast.success('Admin access granted');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.message || 'Invalid admin credentials');
    } finally {
      setIsLoggingIn(false);
    }
  };

   const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
    setTenants([]);
    toast.success('Logged out from admin panel');
  };

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await publicApi.get('/api/admin-dashboard/all-tenants', {
        headers: getAdminHeaders(),
         });
      if (response.data.success) {
        setTenants(response.data.tenants);
        setProductImageModuleByTenant(
          response.data.tenants.reduce((accumulator, tenant) => {
            accumulator[tenant._id] = Boolean(tenant?.featureModules?.productImageFetchEnabled);
            return accumulator;
          }, {})
        );
        setCloudinaryUploadModuleByTenant(
          response.data.tenants.reduce((accumulator, tenant) => {
            accumulator[tenant._id] = tenant?.featureModules?.cloudinaryImageUploadEnabled !== false;
            return accumulator;
          }, {})
        );
      }
    } catch (error) {
      console.error('Error fetching tenants:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Admin session expired. Please login again.');
      } else {
        toast.error('Failed to load tenants');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantProductImageModuleStatus = async (tenantId, { silent = false } = {}) => {
    if (!tenantId) return;

    try {
      setProductImageStatusLoadingTenantId(tenantId);
      const response = await publicApi.get(
        `/api/admin-dashboard/tenant/${tenantId}/product-image-module`,
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        setProductImageModuleByTenant((prev) => ({
          ...prev,
          [tenantId]: Boolean(response.data.enabled)
        }));
      }
    } catch (error) {
      console.error('Error fetching Product Image AI module status:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Admin session expired. Please login again.');
      } else if (!silent) {
        toast.error('Failed to load Product Image AI module status');
      }
    } finally {
      setProductImageStatusLoadingTenantId((prev) => (prev === tenantId ? '' : prev));
    }
  };

   const handleTenantProductImageModuleToggle = async (tenantId) => {
    if (!tenantId) return;

    const currentEnabled =
      typeof productImageModuleByTenant[tenantId] === 'boolean'
        ? productImageModuleByTenant[tenantId]
        : false;

    const nextEnabled = !currentEnabled;

    try {
      setProductImageToggleLoadingTenantId(tenantId);
      const response = await publicApi.patch(
        `/api/admin-dashboard/tenant/${tenantId}/product-image-module`,
        { enabled: nextEnabled },
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        const enabled = Boolean(response.data.enabled);
        setProductImageModuleByTenant((prev) => ({
          ...prev,
          [tenantId]: enabled
        }));
        toast.success(`Product Image Fetching AI ${enabled ? 'enabled' : 'disabled'} for this tenant`);
      } else {
        throw new Error(response.data?.message || 'Failed to update Product Image AI module');
      }
    } catch (error) {
      console.error('Error toggling Product Image AI module:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Admin session expired. Please login again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update Product Image AI module');
      }
    } finally {
    setProductImageToggleLoadingTenantId((prev) => (prev === tenantId ? '' : prev));
    }
  };

  const fetchTenantCloudinaryUploadModuleStatus = async (tenantId, { silent = false } = {}) => {
    if (!tenantId) return;

    try {
      setCloudinaryUploadStatusLoadingTenantId(tenantId);
      const response = await publicApi.get(
        `/api/admin-dashboard/tenant/${tenantId}/cloudinary-image-upload-module`,
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        setCloudinaryUploadModuleByTenant((prev) => ({
          ...prev,
          [tenantId]: Boolean(response.data.enabled)
        }));
      }
    } catch (error) {
      console.error('Error fetching Cloudinary image upload module status:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Admin session expired. Please login again.');
      } else if (!silent) {
        toast.error('Failed to load Cloudinary image upload module status');
      }
    } finally {
      setCloudinaryUploadStatusLoadingTenantId((prev) => (prev === tenantId ? '' : prev));
    }
  };

  const handleTenantCloudinaryUploadModuleToggle = async (tenantId) => {
    if (!tenantId) return;

    const currentEnabled =
      typeof cloudinaryUploadModuleByTenant[tenantId] === 'boolean'
        ? cloudinaryUploadModuleByTenant[tenantId]
        : true;
    const nextEnabled = !currentEnabled;

    try {
      setCloudinaryUploadToggleLoadingTenantId(tenantId);
      const response = await publicApi.patch(
        `/api/admin-dashboard/tenant/${tenantId}/cloudinary-image-upload-module`,
        { enabled: nextEnabled },
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        const enabled = Boolean(response.data.enabled);
        setCloudinaryUploadModuleByTenant((prev) => ({
          ...prev,
          [tenantId]: enabled
        }));
        toast.success(`Cloudinary image upload ${enabled ? 'enabled' : 'disabled'} for this tenant`);
      } else {
        throw new Error(response.data?.message || 'Failed to update Cloudinary image upload module');
      }
    } catch (error) {
      console.error('Error toggling Cloudinary image upload module:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Admin session expired. Please login again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update Cloudinary image upload module');
      }
    } finally {
      setCloudinaryUploadToggleLoadingTenantId((prev) => (prev === tenantId ? '' : prev));
    }
  };

  const getPlanMeta = (tenant) => {
    const plan = tenant?.subscription?.plan === 'pro' ? 'pro' : 'free_trial';
    const isPro = plan === 'pro';

    return {
      plan,
      isPro,
      label: isPro ? 'Pro' : 'Free Trial',
      badgeClass: isPro
        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20'
        : 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-lg shadow-amber-400/20'
    };
  };

  const handleTenantPlanToggle = async (tenant) => {
    const currentPlan = tenant?.subscription?.plan === 'pro' ? 'pro' : 'free_trial';
    const nextPlan = currentPlan === 'pro' ? 'free_trial' : 'pro';

    try {
      setUpdatingPlanTenantId(tenant._id);
      const response = await publicApi.patch(
        `/api/admin-dashboard/tenant/${tenant._id}/subscription`,
        { plan: nextPlan },
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        const updatedSubscription = response.data.subscription;
        setTenants((prev) =>
          prev.map((item) =>
            item._id === tenant._id
              ? { ...item, subscription: updatedSubscription }
              : item
          )
        );

        if (selectedTenant?._id === tenant._id) {
          setSelectedTenant((prev) =>
            prev ? { ...prev, subscription: updatedSubscription } : prev
          );
        }

        toast.success(`${tenant.name || 'Tenant'} switched to ${nextPlan === 'pro' ? 'Pro' : 'Free Trial'}`);
      }
    } catch (error) {
      console.error('Error updating tenant plan:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Admin session expired. Please login again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update tenant plan');
      }
    } finally {
      setUpdatingPlanTenantId('');
    }
  };

  const handleTenantPaymentToggle = async (tenant) => {
    const isCurrentlyPaid = tenant?.subscription?.paymentStatus === 'paid';
    const nextPaymentStatus = isCurrentlyPaid ? 'unpaid' : 'paid';

    try {
      setUpdatingPaymentTenantId(tenant._id);
      const response = await publicApi.patch(
        `/api/admin-dashboard/tenant/${tenant._id}/payment-status`,
        { paymentStatus: nextPaymentStatus },
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        const updatedSubscription = response.data.subscription;
        setTenants((prev) =>
          prev.map((item) =>
            item._id === tenant._id
              ? { ...item, subscription: updatedSubscription }
              : item
          )
        );

        if (selectedTenant?._id === tenant._id) {
          setSelectedTenant((prev) =>
            prev ? { ...prev, subscription: updatedSubscription } : prev
          );
        }

        toast.success(`${tenant.name || 'Tenant'} marked as ${nextPaymentStatus === 'paid' ? 'Paid' : 'Unpaid'}`);
      }
    } catch (error) {
      console.error('Error updating tenant payment status:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Admin session expired. Please login again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update tenant payment status');
      }
    } finally {
      setUpdatingPaymentTenantId('');
    }
  };

  const getAccountStatus = (tenant) => {
    const hasWhatsapp = !!tenant.whatsappConfig?.phoneNumberId;
    const hasFlows = !!tenant.flowConfig?.enableFlowMessages;

    if (hasWhatsapp && hasFlows) return { label: 'Active', color: 'bg-emerald-500', dotColor: 'bg-emerald-400', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    if (hasWhatsapp) return { label: 'Partial', color: 'bg-blue-500', dotColor: 'bg-blue-400', textColor: 'text-blue-700', bgColor: 'bg-blue-50', icon: <Info className="w-3.5 h-3.5" /> };
    return { label: 'Pending', color: 'bg-amber-500', dotColor: 'bg-amber-400', textColor: 'text-amber-700', bgColor: 'bg-amber-50', icon: <AlertCircle className="w-3.5 h-3.5" /> };
  };

  const formatMoney = (amount, currency = 'INR') => {
    const numericAmount = Number(amount || 0);
    const normalizedCurrency = String(currency || 'INR').toUpperCase();

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: normalizedCurrency,
        maximumFractionDigits: Number.isInteger(numericAmount) ? 0 : 2
      }).format(numericAmount);
    } catch (_error) {
      return `${normalizedCurrency} ${numericAmount.toFixed(Number.isInteger(numericAmount) ? 0 : 2)}`;
    }
  };

  const formatDateTime = (value) => {
    if (!value) return 'Never';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Never';
    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getProviderLabel = (provider) => {
    if (provider === 'razorpay') return 'Razorpay';
    if (provider === 'stripe') return 'Stripe';
    return 'Manual';
  };

  const getPaymentStatusMeta = (subscription = {}) => {
    const rawStatus = subscription?.paymentStatus;
    const normalizedStatus =
      rawStatus === 'paid'
        ? 'paid'
        : rawStatus === 'pending'
          ? 'pending'
          : rawStatus === 'failed'
            ? 'failed'
            : 'unpaid';

    if (normalizedStatus === 'paid') {
      return {
        key: 'paid',
        label: 'Paid',
        badgeClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
        valueClass: 'text-emerald-700',
        iconClass: 'text-emerald-500'
      };
    }

    if (normalizedStatus === 'pending') {
      return {
        key: 'pending',
        label: 'Pending',
        badgeClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
        valueClass: 'text-amber-700',
        iconClass: 'text-amber-500'
      };
    }

    if (normalizedStatus === 'failed') {
      return {
        key: 'failed',
        label: 'Failed',
        badgeClass: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
        valueClass: 'text-rose-700',
        iconClass: 'text-rose-500'
      };
    }

    return {
      key: 'unpaid',
      label: 'Unpaid',
      badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
      valueClass: 'text-slate-700',
      iconClass: 'text-slate-400'
    };
  };

  const buildCurrencyTotals = (items, selector) => (
    items.reduce((accumulator, tenant) => {
      const subscription = tenant?.subscription || {};
      const amount = Number(selector(subscription) || 0);
      const currency = String(subscription.currency || subscription.pricing?.currency || 'INR').toUpperCase();

      if (!Number.isFinite(amount) || amount <= 0) {
        return accumulator;
      }

      accumulator[currency] = Number(((accumulator[currency] || 0) + amount).toFixed(2));
      return accumulator;
    }, {})
  );

  const summarizeCurrencyTotals = (totalsByCurrency = {}) => {
    const entries = Object.entries(totalsByCurrency).sort((left, right) => right[1] - left[1]);
    if (entries.length === 0) return formatMoney(0, 'INR');

    const [[primaryCurrency, primaryAmount], ...rest] = entries;
    return rest.length > 0
      ? `${formatMoney(primaryAmount, primaryCurrency)} + ${rest.length} more`
      : formatMoney(primaryAmount, primaryCurrency);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredTenants = tenants.filter((tenant) => {
    const tenantPlan = tenant?.subscription?.plan === 'pro' ? 'pro' : 'free_trial';
    const matchesPlan = planFilter === 'all' || tenantPlan === planFilter;

    if (!matchesPlan) return false;
    if (!normalizedSearch) return true;

    return (
      tenant.name?.toLowerCase().includes(normalizedSearch) ||
      tenant._id?.toLowerCase().includes(normalizedSearch) ||
      tenant.users?.some((user) => user.email?.toLowerCase().includes(normalizedSearch))
    );
  });

  const paidTotalsByCurrency = buildCurrencyTotals(tenants, (subscription) => subscription.amountPaid);
  const unpaidTotalsByCurrency = buildCurrencyTotals(tenants, (subscription) => subscription.amountDue);

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => !!t.whatsappConfig?.phoneNumberId && !!t.flowConfig?.enableFlowMessages).length,
    pro: tenants.filter(t => t?.subscription?.plan === 'pro').length,
    totalUsers: tenants.reduce((acc, t) => acc + (t.users?.length || 0), 0),
    paidTenants: tenants.filter((t) => t?.subscription?.paymentStatus === 'paid').length,
    unpaidTenants: tenants.filter((t) => t?.subscription?.paymentStatus !== 'paid').length,
    paidTotalsByCurrency,
    unpaidTotalsByCurrency,
    paidAmountSummary: summarizeCurrencyTotals(paidTotalsByCurrency),
    unpaidAmountSummary: summarizeCurrencyTotals(unpaidTotalsByCurrency)
  };

  const selectedTenantProductImageEnabled = selectedTenant
    ? (typeof productImageModuleByTenant[selectedTenant._id] === 'boolean'
      ? productImageModuleByTenant[selectedTenant._id]
      : false)
    : false;
  const selectedTenantCloudinaryUploadEnabled = selectedTenant
    ? (typeof cloudinaryUploadModuleByTenant[selectedTenant._id] === 'boolean'
      ? cloudinaryUploadModuleByTenant[selectedTenant._id]
      : true)
    : true;
  const selectedTenantSubscription = selectedTenant?.subscription || {};
  const selectedTenantHistory = Array.isArray(selectedTenantSubscription.history)
    ? selectedTenantSubscription.history
    : [];
  const selectedTenantPaymentMeta = getPaymentStatusMeta(selectedTenantSubscription);
  const isSelectedTenantProductImageLoading =
    !!selectedTenant && productImageStatusLoadingTenantId === selectedTenant._id;
  const isSelectedTenantProductImageUpdating =
    !!selectedTenant && productImageToggleLoadingTenantId === selectedTenant._id;
  const isSelectedTenantCloudinaryUploadLoading =
    !!selectedTenant && cloudinaryUploadStatusLoadingTenantId === selectedTenant._id;
  const isSelectedTenantCloudinaryUploadUpdating =
    !!selectedTenant && cloudinaryUploadToggleLoadingTenantId === selectedTenant._id;
  const isSelectedTenantPaymentUpdating =
    !!selectedTenant && updatingPaymentTenantId === selectedTenant._id;

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200/45 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-200/45 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-100/40 rounded-full blur-3xl"></div>
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.12]" style={{
            backgroundImage: 'linear-gradient(rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.2) 1px, transparent 1px)',
            backgroundSize: '72px 72px'
          }}></div>
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-2xl shadow-slate-200/60">
            <div className="flex flex-col items-center mb-10">
              <div className="relative mb-5">
                <div className="w-46 h-10 rounded-xl flex items-center justify-center overflow-hidden">
                  <img
                    src={goWhatsLogo}
                    alt="GoWhats"
                    className="h-10 w-auto object-contain"
                  />
                </div>
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Admin Console</h1>
              <p className="text-slate-500 font-medium mt-2 text-sm">Secure access to management panel</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors duration-300" />
                  <input
                    type="email"
                    required
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    placeholder="admin@example.com"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:bg-white transition-all duration-300 font-medium text-slate-800 placeholder:text-slate-400 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors duration-300" />
                  <input
                    type="password"
                    required
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    placeholder="••••••••••"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:bg-white transition-all duration-300 font-medium text-slate-800 placeholder:text-slate-400 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-4 rounded-xl font-bold shadow-xl shadow-indigo-200/50 transition-all duration-300 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm mt-8 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                {isLoggingIn ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Access Dashboard</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="flex items-center justify-center gap-2 mt-8">
            <Lock className="w-3 h-3 text-slate-400" />
            <p className="text-slate-500 text-xs font-medium">Authorized Personnel Only</p>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/80">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">Admin Dashboard</h1>
                <p className="text-[11px] text-slate-400 font-medium -mt-0.5">System Management Console</p>
              </div>
              <h1 className="sm:hidden text-lg font-black text-slate-900">Admin</h1>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden md:block relative w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search tenants, users, IDs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100/80 border-0 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all text-sm text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <div className="hidden md:flex items-center gap-2 bg-slate-100/80 rounded-xl px-2 py-1.5 border border-slate-200/70">
                <Filter className="w-4 h-4 text-slate-400 ml-1" />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPlanFilter('all')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      planFilter === 'all'
                        ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/70'
                    }`}
                  >
                    All Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanFilter('pro')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      planFilter === 'pro'
                        ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/70'
                    }`}
                  >
                    Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanFilter('free_trial')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      planFilter === 'free_trial'
                        ? 'bg-white text-amber-600 shadow-sm border border-amber-100'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/70'
                    }`}
                  >
                    Free Trial
                  </button>
                </div>
              </div>

              <button
                onClick={fetchTenants}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-slate-500 hover:text-slate-700 active:scale-95"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => navigate('/admin-dashboard/referrals')}
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-indigo-600 text-white rounded-xl transition-all font-semibold text-sm hover:bg-indigo-700 active:scale-95 shadow-lg shadow-indigo-500/20"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Referral Reports</span>
              </button>

              <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all font-semibold text-sm active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Mobile Search */}
        <div className="md:hidden mb-4">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all text-sm"
              />
            </div>
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500">Plan Filter</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPlanFilter('all')}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                    planFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter('pro')}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                    planFilter === 'pro'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Pro
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter('free_trial')}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                    planFilter === 'free_trial'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Free Trial
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6 mb-6 sm:mb-8">
          {[
            {
              key: 'total',
              icon: Building,
              eyebrow: 'Total',
              value: stats.total,
              label: 'Tenants',
              iconClass: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100'
            },
            {
              key: 'active',
              icon: Activity,
              eyebrow: 'Live',
              value: stats.active,
              label: 'Active',
              iconClass: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'
            },
            {
              key: 'pro',
              icon: Crown,
              eyebrow: 'Premium',
              value: stats.pro,
              label: 'Pro Plans',
              iconClass: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100'
            },
            {
              key: 'users',
              icon: Users,
              eyebrow: 'People',
              value: stats.totalUsers,
              label: 'Users',
              iconClass: 'bg-sky-50 text-sky-600 group-hover:bg-sky-100'
            },
            {
              key: 'paid',
              icon: CheckCircle2,
              eyebrow: 'Collected',
              value: stats.paidAmountSummary,
              label: `${stats.paidTenants} paid tenants`,
              iconClass: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100',
              valueClass: 'text-lg sm:text-2xl'
            },
            {
              key: 'unpaid',
              icon: AlertCircle,
              eyebrow: 'Outstanding',
              value: stats.unpaidAmountSummary,
              label: `${stats.unpaidTenants} unpaid tenants`,
              iconClass: 'bg-amber-50 text-amber-600 group-hover:bg-amber-100',
              valueClass: 'text-lg sm:text-2xl'
            }
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/60 shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className={`p-2 sm:p-2.5 rounded-xl transition-colors ${card.iconClass}`}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">{card.eyebrow}</span>
                </div>
                <p className={`${card.valueClass || 'text-2xl sm:text-3xl'} font-black text-slate-900 tracking-tight leading-tight break-words`}>
                  {card.value}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5">{card.label}</p>
              </div>
            );
          })}
        </div>
        
                {/* Main Content */}
                {loading ? (
          <div className="flex flex-col items-center justify-center py-24 sm:py-32 bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="relative">
              <div className="w-16 h-16 border-[3px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-slate-500 font-semibold mt-6 text-sm">Loading tenant directory...</p>
            <p className="text-slate-400 text-xs mt-1">Please wait a moment</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Organization</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tenant ID</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Plan</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Billing</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Team</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Joined</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredTenants.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                              <Building className="w-8 h-8 text-slate-300" />
                            </div>
                            <div>
                              <p className="text-slate-500 font-semibold">No tenants found</p>
                              <p className="text-slate-400 text-sm mt-1">Try adjusting your search criteria</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredTenants.map((tenant) => {
                        const status = getAccountStatus(tenant);
                        const planMeta = getPlanMeta(tenant);
                        const paymentMeta = getPaymentStatusMeta(tenant.subscription);
                        const isUpdatingPlan = updatingPlanTenantId === tenant._id;
                        const isUpdatingPayment = updatingPaymentTenantId === tenant._id;
                        return (
                          <tr key={tenant._id} className="hover:bg-slate-50/60 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl flex items-center justify-center text-slate-500 font-bold text-sm border border-slate-200/60 group-hover:from-indigo-50 group-hover:to-purple-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-all">
                                  {tenant.name?.[0]?.toUpperCase() || 'T'}
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900 text-sm block">{tenant.name || 'Unnamed Business'}</span>
                                  <span className="text-[11px] text-slate-400">{tenant.users?.length || 0} member{(tenant.users?.length || 0) !== 1 ? 's' : ''}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <code className="text-[11px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg font-mono tracking-tight max-w-[120px] truncate">{tenant._id}</code>
                                <button onClick={() => copyToClipboard(tenant._id)} className="p-1 hover:bg-slate-100 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Copy className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${status.bgColor} ${status.textColor}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${status.color} ${status.label === 'Active' ? 'animate-pulse' : ''}`}></span>
                                {status.label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold ${planMeta.badgeClass}`}>
                                  <Crown className="w-3 h-3" />
                                  {planMeta.label}
                                </span>
                                <button
                                  onClick={() => handleTenantPlanToggle(tenant)}
                                  disabled={isUpdatingPlan}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${planMeta.isPro ? 'bg-emerald-500 shadow-inner shadow-emerald-600/20' : 'bg-slate-300 shadow-inner shadow-slate-400/20'} ${isUpdatingPlan ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}
                                  title={planMeta.isPro ? 'Switch to Free Trial' : 'Switch to Pro'}
                                >
                                  {isUpdatingPlan && (
                                    <RefreshCw className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-white" />
                                  )}
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${planMeta.isPro ? 'translate-x-6' : 'translate-x-1'} ${isUpdatingPlan ? 'opacity-0' : ''}`}
                                  />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1.5">
                                <p className="text-sm font-bold text-slate-900">
                                  {formatMoney(tenant.subscription?.amount, tenant.subscription?.currency)}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${paymentMeta.badgeClass}`}>
                                    {paymentMeta.label}
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    {getProviderLabel(tenant.subscription?.provider)}
                                  </span>
                                  {tenant.subscription?.lastPaidAt && (
                                    <span className="text-[11px] text-slate-400">
                                      {new Date(tenant.subscription.lastPaidAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleTenantPaymentToggle(tenant)}
                                  disabled={isUpdatingPayment}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                                    paymentMeta.key === 'paid'
                                      ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                      : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                >
                                  {isUpdatingPayment ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : paymentMeta.key === 'paid' ? (
                                    <AlertCircle className="w-3 h-3" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  {paymentMeta.key === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex -space-x-1.5">
                                {tenant.users?.slice(0, 3).map((u, i) => (
                                  <div key={i} className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500 shadow-sm" title={u.name}>
                                    {u.name?.[0]?.toUpperCase()}
                                  </div>
                                ))}
                                {tenant.users?.length > 3 && (
                                  <div className="w-7 h-7 rounded-full bg-indigo-50 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-500 shadow-sm">
                                    +{tenant.users.length - 3}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                                <Clock className="w-3.5 h-3.5 text-slate-300" />
                                {new Date(tenant.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => { setSelectedTenant(tenant); setShowAnalytics(false); setActiveTab('config'); }}
                                  className="inline-flex items-center justify-center w-8 h-8 bg-slate-100 text-slate-500 rounded-lg hover:bg-indigo-600 hover:text-white transition-all active:scale-95"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => { setSelectedTenant(tenant); setShowAnalytics(true); setActiveTab('analytics'); }}
                                  className="inline-flex items-center justify-center w-8 h-8 bg-slate-100 text-slate-500 rounded-lg hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                                  title="View Analytics"
                                >
                                  <BarChart3 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {filteredTenants.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/60 p-8 text-center shadow-sm">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Building className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-semibold">No tenants found</p>
                  <p className="text-slate-400 text-sm mt-1">Try adjusting your search</p>
                </div>
              ) : (
                filteredTenants.map((tenant) => {
                  const status = getAccountStatus(tenant);
                  const planMeta = getPlanMeta(tenant);
                  const paymentMeta = getPaymentStatusMeta(tenant.subscription);
                  const isUpdatingPlan = updatingPlanTenantId === tenant._id;
                  const isUpdatingPayment = updatingPaymentTenantId === tenant._id;
                  const isExpanded = expandedRow === tenant._id;

                  return (
                    <div key={tenant._id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                      <div
                        className="p-4 cursor-pointer active:bg-slate-50 transition-colors"
                        onClick={() => setExpandedRow(isExpanded ? null : tenant._id)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl flex items-center justify-center text-slate-500 font-bold text-sm border border-slate-200/60 flex-shrink-0">
                              {tenant.name?.[0]?.toUpperCase() || 'T'}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-slate-900 text-sm truncate">{tenant.name || 'Unnamed Business'}</h3>
                              <p className="text-[11px] text-slate-400 font-mono truncate">{tenant._id}</p>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${status.bgColor} ${status.textColor}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.color}`}></span>
                            {status.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${planMeta.badgeClass}`}>
                            <Crown className="w-2.5 h-2.5" />
                            {planMeta.label}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${paymentMeta.badgeClass}`}>
                            {paymentMeta.label}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600">
                            {formatMoney(tenant.subscription?.amount, tenant.subscription?.currency)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium ml-auto">
                            {tenant.users?.length || 0} users
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>Joined {new Date(tenant.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 font-medium">{planMeta.isPro ? 'Pro' : 'Free'}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleTenantPlanToggle(tenant); }}
                                disabled={isUpdatingPlan}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ${planMeta.isPro ? 'bg-emerald-500' : 'bg-slate-300'} ${isUpdatingPlan ? 'opacity-60' : ''}`}
                              >
                                {isUpdatingPlan ? (
                                  <RefreshCw className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 animate-spin text-white" />
                                ) : (
                                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${planMeta.isPro ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Subscription</p>
                              <p className="mt-1 text-sm font-black text-slate-900">
                                {formatMoney(tenant.subscription?.amount, tenant.subscription?.currency)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-400">{getProviderLabel(tenant.subscription?.provider)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Outstanding</p>
                              <p className={`mt-1 text-sm font-black ${paymentMeta.valueClass}`}>
                                {formatMoney(tenant.subscription?.amountDue, tenant.subscription?.currency)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-400">{paymentMeta.label}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleTenantPaymentToggle(tenant); }}
                            disabled={isUpdatingPayment}
                            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                              paymentMeta.key === 'paid'
                                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {isUpdatingPayment ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : paymentMeta.key === 'paid' ? (
                              <AlertCircle className="w-4 h-4" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            {paymentMeta.key === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                          </button>

                          <div className="flex -space-x-1.5">
                            {tenant.users?.slice(0, 4).map((u, i) => (
                              <div key={i} className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500" title={u.name}>
                                {u.name?.[0]?.toUpperCase()}
                              </div>
                            ))}
                            {tenant.users?.length > 4 && (
                              <div className="w-7 h-7 rounded-full bg-indigo-50 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-500">
                                +{tenant.users.length - 4}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedTenant(tenant); setShowAnalytics(false); setActiveTab('config'); }}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
                            >
                              <Eye className="w-4 h-4" />
                              Details
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedTenant(tenant); setShowAnalytics(true); setActiveTab('analytics'); }}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 rounded-xl text-sm font-semibold text-white hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/20"
                            >
                              <BarChart3 className="w-4 h-4" />
                              Analytics
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Tenant Count Footer */}
            {filteredTenants.length > 0 && (
              <div className="mt-4 flex items-center justify-between px-2">
                <p className="text-xs text-slate-400 font-medium">
                  Showing {filteredTenants.length} of {tenants.length} tenants
                </p>
                {(searchTerm || planFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setPlanFilter('all');
                    }}
                    className="text-xs text-indigo-500 font-semibold hover:text-indigo-700"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setSelectedTenant(null); setShowAnalytics(false); }}
          />

          <div className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] bg-white sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden sm:mx-4 border-t sm:border border-slate-200/60">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex-shrink-0">
              {/* Drag handle for mobile */}
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 flex-shrink-0">
                    <span className="text-lg font-black">{selectedTenant.name?.[0]?.toUpperCase() || 'T'}</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">{selectedTenant.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-[10px] text-slate-400 font-mono truncate max-w-[140px] sm:max-w-none">{selectedTenant._id}</code>
                      <button onClick={() => copyToClipboard(selectedTenant._id)} className="p-0.5 hover:bg-slate-100 rounded flex-shrink-0">
                        <Copy className="w-3 h-3 text-slate-300" />
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedTenant(null); setShowAnalytics(false); }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600 active:scale-95 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 mt-4 bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => { setActiveTab('config'); setShowAnalytics(false); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'config' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Configuration
                </button>
                <button
                  onClick={() => { setActiveTab('billing'); setShowAnalytics(false); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'billing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Billing
                </button>
                <button
                  onClick={() => { setActiveTab('analytics'); setShowAnalytics(true); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'analytics' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Analytics
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {activeTab === 'analytics' ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: MessageSquare, label: 'Broadcasts', value: selectedTenant.analytics?.broadcasts || 0, color: 'blue', desc: 'Campaigns sent' },
                      { icon: Layout, label: 'Templates', value: selectedTenant.analytics?.templatesCreated || 0, color: 'purple', desc: 'Created' },
                      { icon: Zap, label: 'Sent', value: selectedTenant.analytics?.templatesSent || 0, color: 'indigo', desc: 'Deliveries' },
                      { icon: Contact2, label: 'Contacts', value: selectedTenant.analytics?.contacts || 0, color: 'emerald', desc: 'Database' }
                    ].map(({ icon: Icon, label, value, color, desc }) => (
                      <div key={label} className={`bg-${color}-50 border border-${color}-100 p-4 rounded-xl hover:shadow-md transition-shadow`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`p-1.5 bg-${color}-600 rounded-lg text-white`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
                        </div>
                        <p className="text-2xl sm:text-3xl font-black text-slate-900">{value}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-500" />
                      Activity Status
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                        <span className="text-sm text-slate-600 font-medium">Messages Sent</span>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">Indexing...</span>
                      </div>
                      <div className="p-3 bg-indigo-50/50 rounded-xl border border-dashed border-indigo-200">
                        <p className="text-[11px] text-indigo-600/80 text-center font-medium leading-relaxed">
                          Detailed delivery reports are being synchronized for this tenant.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'billing' ? (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Database className="w-3 h-3" />
                      Subscription Overview
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          label: 'Plan',
                          value: getPlanMeta(selectedTenant).label,
                          subtext: selectedTenantPaymentMeta.label,
                          valueClass: 'text-slate-900'
                        },
                        {
                          label: 'Billing Amount',
                          value: formatMoney(selectedTenantSubscription.amount, selectedTenantSubscription.currency),
                          subtext: getProviderLabel(selectedTenantSubscription.provider),
                          valueClass: 'text-slate-900'
                        },
                        {
                          label: 'Paid',
                          value: formatMoney(selectedTenantSubscription.amountPaid, selectedTenantSubscription.currency),
                          subtext: selectedTenantSubscription.lastPaidAt ? formatDateTime(selectedTenantSubscription.lastPaidAt) : 'No completed payment yet',
                          valueClass: 'text-emerald-700'
                        },
                        {
                          label: 'Due',
                          value: formatMoney(selectedTenantSubscription.amountDue, selectedTenantSubscription.currency),
                          subtext: selectedTenantSubscription.referenceId ? `Ref ${selectedTenantSubscription.referenceId}` : 'No invoice reference yet',
                          valueClass: selectedTenantPaymentMeta.valueClass
                        }
                      ].map((item) => (
                        <div key={item.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.label}</p>
                          <p className={`mt-2 text-lg sm:text-xl font-black ${item.valueClass}`}>{item.value}</p>
                          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{item.subtext}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      Payment Status
                    </h3>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-100">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Current collection state</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Track whether the current subscription amount is collected, pending, or still unpaid.
                          </p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${selectedTenantPaymentMeta.badgeClass}`}>
                          {selectedTenantPaymentMeta.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-white rounded-xl border border-slate-100 p-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Charged</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(selectedTenantSubscription.lastChargeAt)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-100 p-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Paid</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(selectedTenantSubscription.lastPaidAt)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTenantPaymentToggle(selectedTenant)}
                        disabled={isSelectedTenantPaymentUpdating}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                          selectedTenantPaymentMeta.key === 'paid'
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {isSelectedTenantPaymentUpdating ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : selectedTenantPaymentMeta.key === 'paid' ? (
                          <AlertCircle className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        {selectedTenantPaymentMeta.key === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                      </button>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      Subscription History
                    </h3>
                    <div className="space-y-2">
                      {selectedTenantHistory.length === 0 ? (
                        <div className="bg-slate-50 rounded-xl p-5 border border-dashed border-slate-200 text-center">
                          <p className="text-sm font-semibold text-slate-600">No subscription events yet</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            Payment attempts, successful collections, and manual plan changes will appear here.
                          </p>
                        </div>
                      ) : (
                        selectedTenantHistory.map((entry, index) => {
                          const entryMeta = getPaymentStatusMeta(entry);
                          const entryDate = entry.paidAt || entry.createdAt;
                          return (
                            <div key={`${entry.referenceId || entry.event}-${index}`} className="bg-white border border-slate-100 rounded-xl p-3.5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold text-slate-800">
                                    {entry.event === 'payment_paid'
                                      ? 'Payment received'
                                      : entry.event === 'payment_pending'
                                        ? 'Payment initiated'
                                        : entry.event === 'payment_unpaid'
                                          ? 'Marked unpaid'
                                        : 'Plan updated'}
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    {getProviderLabel(entry.provider)} • {formatDateTime(entryDate)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-black text-slate-900">
                                    {formatMoney(entry.amount, entry.currency)}
                                  </p>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold mt-1 ${entryMeta.badgeClass}`}>
                                    {entryMeta.label}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 border border-slate-100">
                                  Plan {entry.plan === 'pro' ? 'Pro' : 'Free Trial'}
                                </span>
                                {entry.referenceId && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 border border-slate-100 font-mono">
                                    {entry.referenceId}
                                  </span>
                                )}
                              </div>
                              {entry.notes && (
                                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{entry.notes}</p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Business Profile */}
                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Building className="w-3 h-3" />
                      Business Profile
                    </h3>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Type</p>
                        <p className="text-sm font-bold text-slate-700 capitalize">{selectedTenant.config?.businessType || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Industry</p>
                        <p className="text-sm font-bold text-slate-700">{selectedTenant.config?.businessIndustry || 'N/A'}</p>
                      </div>
                    </div>
                  </section>

                  {/* WhatsApp Config */}
                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Globe className="w-3 h-3" />
                      WhatsApp API Configuration
                    </h3>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
                      {[
                        { icon: Phone, label: 'Phone Number ID', value: selectedTenant.whatsappConfig?.phoneNumberId },
                        { icon: Shield, label: 'Business Account ID', value: selectedTenant.whatsappConfig?.businessAccountId },
                        { icon: Key, label: 'Access Token', value: selectedTenant.whatsappConfig?.accessToken }
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start gap-3">
                          <div className="p-2 bg-white rounded-lg text-indigo-500 border border-slate-100 flex-shrink-0 mt-0.5">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</p>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-mono font-medium text-slate-600 break-all bg-white p-2 rounded-lg border border-slate-100 flex-1 leading-relaxed">
                                {value || 'Not Configured'}
                              </p>
                              {value && (
                                <button onClick={() => copyToClipboard(value)} className="p-1.5 hover:bg-white rounded-lg flex-shrink-0 transition-colors">
                                  <Copy className="w-3 h-3 text-slate-400" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Flow Config */}
                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Zap className="w-3 h-3" />
                      Flow Settings
                    </h3>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                        <span className="text-sm font-semibold text-slate-700">Automation Status</span>
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${selectedTenant.flowConfig?.enableFlowMessages
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-500'
                          }`}>
                          {selectedTenant.flowConfig?.enableFlowMessages ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      {selectedTenant.flowConfig?.orderCompletionFlowId && (
                        <div className="mt-3 pt-3 border-t border-slate-200/60">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Active Flow ID</p>
                          <p className="text-xs font-mono font-medium text-slate-600 bg-white p-2 rounded-lg border border-slate-100">{selectedTenant.flowConfig.orderCompletionFlowId}</p>
                        </div>
                      )}
                    </div>
                  </section>

		     {/* Tenant Feature Controls */}
                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Layers className="w-3 h-3" />
                      Feature Controls
                    </h3>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-100">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Product Image Fetching AI</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Enable or disable AI-based product matching from customer images.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTenantProductImageModuleToggle(selectedTenant._id)}
                          disabled={isSelectedTenantProductImageLoading || isSelectedTenantProductImageUpdating}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${selectedTenantProductImageEnabled ? 'bg-emerald-500' : 'bg-slate-300'} ${(isSelectedTenantProductImageLoading || isSelectedTenantProductImageUpdating) ? 'opacity-60 cursor-not-allowed' : ''}`}
                          title="Toggle Product Image Fetching AI"
                        >
                          {(isSelectedTenantProductImageLoading || isSelectedTenantProductImageUpdating) ? (
                            <RefreshCw className="absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                          ) : (
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${selectedTenantProductImageEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-100">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Upload Image To Cloudinary</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Control whether this tenant can upload inventory images from device to Cloudinary.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTenantCloudinaryUploadModuleToggle(selectedTenant._id)}
                          disabled={isSelectedTenantCloudinaryUploadLoading || isSelectedTenantCloudinaryUploadUpdating}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${selectedTenantCloudinaryUploadEnabled ? 'bg-emerald-500' : 'bg-slate-300'} ${(isSelectedTenantCloudinaryUploadLoading || isSelectedTenantCloudinaryUploadUpdating) ? 'opacity-60 cursor-not-allowed' : ''}`}
                          title="Toggle Cloudinary image upload"
                        >
                          {(isSelectedTenantCloudinaryUploadLoading || isSelectedTenantCloudinaryUploadUpdating) ? (
                            <RefreshCw className="absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                          ) : (
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${selectedTenantCloudinaryUploadEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                          )}
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-500">
                        This control is available only in Super Admin Dashboard.
                      </p>
                    </div>
                  </section>

                  {/* Team Members */}
                  <section>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Users className="w-3 h-3" />
                      Team Members ({selectedTenant.users?.length || 0})
                    </h3>
                    <div className="space-y-2">
                      {selectedTenant.users?.map((user) => (
                        <div key={user._id} className="bg-white border border-slate-100 rounded-xl p-3.5 hover:border-indigo-100 transition-colors">
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200/60">
                                {user.name?.[0]?.toUpperCase()}
                              </div>
                              <span className="text-sm font-bold text-slate-800">{user.name}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {user.role}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-slate-500 bg-slate-50 p-2 rounded-lg">
                              <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="text-[11px] font-medium truncate">{user.email}</span>
                            </div>
                            {user.phone_number && (
                              <div className="flex items-center gap-2 text-slate-500 bg-slate-50 p-2 rounded-lg">
                                <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                <span className="text-[11px] font-medium">{user.phone_number}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Mobile close button */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 sm:hidden flex-shrink-0">
              <button
                onClick={() => { setSelectedTenant(null); setShowAnalytics(false); }}
                className="w-full py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 active:bg-slate-100 transition-colors"
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

export default AdminDashboard;

