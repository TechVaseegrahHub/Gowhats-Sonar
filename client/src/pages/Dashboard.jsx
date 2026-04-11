import { useState, useEffect, useMemo, useRef } from "react";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import { getDashboardStats } from "../services/dashboardService";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { publicApi } from "../utils/axios.js";
import api from "../utils/axios.js";
import toast from "react-hot-toast";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler,
} from "chart.js";
import {
  RefreshCw,
  Bell, Settings, LogOut, ChevronDown,
  Calendar, LayoutDashboard,
  Crown, Phone, PhoneOff
} from "lucide-react";
import useSubscription from "../hooks/useSubscription";
import UpgradeToProButton from "../components/UpgradeToProButton";
import moneyImg from "../images/money_267432.png";
import orderImg from "../images/package_267451.png";
import messageImg from "../images/message_211562.png";
import templateImg from "../images/paper-plane_240109.png";
import newContactImg from "../images/whatsapp_311291.png";
import totalContactImg from "../images/conference_301132.png";
import labelImg from "../images/paste_364281.png";
import broadcastImg from "../images/boradcast2.png";
import viewOrdersImg from "../images/oreder.png";
import aiImg from "../images/ai_211867.png";
import contactsImg from "../images/web_211588.png";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, ArcElement, Filler
);

const GREEN = "#16a34a";
const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
];

const fmt = (n) => {
  const num = Number(n) || 0;
  if (num >= 1_00_00_000) return `₹${(num / 1_00_00_000).toFixed(1)}Cr`;
  if (num >= 1_00_000)    return `₹${(num / 1_00_000).toFixed(1)}L`;
  if (num >= 1_000)       return `₹${(num / 1_000).toFixed(1)}K`;
  return `₹${num}`;
};
const fmtNum = (n) => {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_00_0000).toFixed(1)}M`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF'
]);

const formatPlanPrice = (amount, currency) => {
  const code = String(currency || 'INR').toUpperCase();
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    return code === 'INR' ? '₹0' : `0 ${code}`;
  }
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(code);
  const hasDecimals = !zeroDecimal && !Number.isInteger(num);
  const digits = zeroDecimal ? 0 : (hasDecimals ? 2 : 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(num);
  } catch (_err) {
    return code === 'INR' ? `₹${num}` : `${num} ${code}`;
  }
};

const toISODateKey = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseOrderAmount = (order) => {
  const raw = order?.totalAmount ?? order?.total ?? order?.orderAmount ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isPaymentCompleted = (order) => {
  const payment = String(order?.paymentStatus || "").toLowerCase();
  return ["completed", "paid", "captured"].includes(payment);
};

const isCompletedOrder = (order) => {
  const status = String(order?.status || "").toLowerCase();
  return (
    isPaymentCompleted(order) ||
    ["delivered", "shipped", "completed"].includes(status)
  );
};

const isPendingOrder = (order) => {
  const status = String(order?.status || "").toLowerCase();
  if (isPaymentCompleted(order)) return false;
  return ["pending", "confirmed", "processing"].includes(status);
};

const isWithinRange = (dateValue, from, to) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return true;
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(23, 59, 59, 999);
  return date >= fromDate && date <= toDate;
};

const buildRevenueTrend = (orders = [], endDate) => {
  const end = new Date(endDate || new Date());
  if (Number.isNaN(end.getTime())) return { labels: [], values: [] };
  end.setHours(23, 59, 59, 999);

  const keys = [];
  const labels = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setDate(end.getDate() - offset);
    const key = toISODateKey(day);
    if (!key) continue;
    keys.push(key);
    labels.push(day.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
  }

  const totalsByDay = keys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
  orders.forEach((order) => {
    if (!isPaymentCompleted(order)) return;
    const key = toISODateKey(order?.createdAt || order?.updatedAt || order?.date);
    if (!key || typeof totalsByDay[key] === "undefined") return;
    totalsByDay[key] += parseOrderAmount(order);
  });

  return {
    labels,
    values: keys.map((key) => Math.round((totalsByDay[key] || 0) * 100) / 100),
  };
};

const getRangeBounds = (range) => {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (range === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  if (range === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  const from = new Date(2000, 0, 1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
};

const filterOrdersByRange = (orders = [], range) => {
  const { from, to } = getRangeBounds(range);
  return orders.filter((order) =>
    isWithinRange(order?.createdAt || order?.updatedAt || order?.date, from, to)
  );
};

const formatStatusLabel = (status) => {
  const raw = String(status || "unknown").trim().toLowerCase();
  if (!raw) return "Unknown";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const buildRevenueSeriesByRange = (orders = [], range) => {
  const completed = orders.filter((order) => isPaymentCompleted(order));
  if (completed.length === 0) return { labels: [], values: [] };

  if (range === "today") {
    const { from } = getRangeBounds("today");
    const labels = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
    const map = labels.reduce((acc, label) => ({ ...acc, [label]: 0 }), {});
    completed.forEach((order) => {
      const dt = new Date(order?.createdAt || order?.updatedAt);
      if (Number.isNaN(dt.getTime()) || !isWithinRange(dt, from, new Date())) return;
      const key = `${String(dt.getHours()).padStart(2, "0")}:00`;
      map[key] = (map[key] || 0) + parseOrderAmount(order);
    });
    return { labels, values: labels.map((label) => Math.round((map[label] || 0) * 100) / 100) };
  }

  if (range === "month") {
    const { from } = getRangeBounds("month");
    const now = new Date();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const labels = Array.from({ length: days }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth(), idx + 1);
      return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    });
    const keys = Array.from({ length: days }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth(), idx + 1);
      return toISODateKey(date);
    });
    const map = keys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    completed.forEach((order) => {
      const dt = new Date(order?.createdAt || order?.updatedAt);
      if (Number.isNaN(dt.getTime()) || !isWithinRange(dt, from, new Date())) return;
      const key = toISODateKey(dt);
      if (!key || typeof map[key] === "undefined") return;
      map[key] += parseOrderAmount(order);
    });
    return { labels, values: keys.map((key) => Math.round((map[key] || 0) * 100) / 100) };
  }

  const monthMap = {};
  completed.forEach((order) => {
    const dt = new Date(order?.createdAt || order?.updatedAt);
    if (Number.isNaN(dt.getTime())) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    monthMap[key] = (monthMap[key] || 0) + parseOrderAmount(order);
  });
  const keys = Object.keys(monthMap).sort((a, b) => new Date(`${a}-01`) - new Date(`${b}-01`));
  const labels = keys.map((key) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  });
  const values = keys.map((key) => Math.round((monthMap[key] || 0) * 100) / 100);
  return { labels, values };
};

const Speedometer = ({ value = 0, totalContacts = 0 }) => {
  const pct  = Math.min(100, Math.max(0, Number(value) || 0));
  const R    = 58, CX = 80, CY = 78;
  const toRad = (d) => (d * Math.PI) / 180;
  const ptAt  = (deg, r) => ({
    x: CX + r * Math.cos(toRad(deg)),
    y: CY + r * Math.sin(toRad(deg)),
  });
  const START = -210, SWEEP = 240;
  const tS  = ptAt(START, R);
  const tE  = ptAt(START + SWEEP, R);
  const aE  = ptAt(START + (pct / 100) * SWEEP, R);
  const nTp = ptAt(START + (pct / 100) * SWEEP, 42);
  const big = (pct / 100) * SWEEP > 180 ? 1 : 0;

  return (
    <svg width="160" height="120" viewBox="0 0 160 120" style={{ display:"block", width:"100%", maxWidth:160 }}>
      <defs>
        <linearGradient id="spG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="100%" stopColor={GREEN} />
        </linearGradient>
      </defs>
      <path d={`M${tS.x},${tS.y} A${R},${R} 0 1 1 ${tE.x},${tE.y}`}
        fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
      {pct > 0 && (
        <path d={`M${tS.x},${tS.y} A${R},${R} 0 ${big} 1 ${aE.x},${aE.y}`}
          fill="none" stroke="url(#spG)" strokeWidth="10" strokeLinecap="round" />
      )}
      {[0,50,100].map(v => {
        const a=START+(v/100)*SWEEP, i=ptAt(a,R-7), o=ptAt(a,R+1), l=ptAt(a,R+13);
        return (
          <g key={v}>
            <line x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="#d1d5db" strokeWidth="1.5"/>
            <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
              fontSize="7" fill="#9ca3af" fontFamily="system-ui,sans-serif">{v}%</text>
          </g>
        );
      })}
      <line x1={CX} y1={CY} x2={nTp.x} y2={nTp.y} stroke={GREEN} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx={CX} cy={CY} r="5" fill={GREEN}/>
      <circle cx={CX} cy={CY} r="2.5" fill="white"/>
      <text x={CX} y={CY+17} textAnchor="middle" fontSize="15" fontWeight="800" fill="#111827" fontFamily="system-ui,sans-serif">{pct}%</text>
      <text x={CX} y={CY+28} textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="system-ui,sans-serif">
        {fmtNum(Math.round(totalContacts * pct / 100))} of {fmtNum(totalContacts)} customers
      </text>
    </svg>
  );
};

const CARDS = [
  { img: moneyImg,        tint: "#ede9fe", label: "Total Revenue" },
  { img: orderImg,        tint: "#d1fae5", label: "Completed Orders" },
  { img: messageImg,      tint: "#dbeafe", label: "Unread Messages" },
  { img: templateImg,     tint: "#fef3c7", label: "Templates Sent" },
  { img: newContactImg,   tint: "#fce7f3", label: "New Contacts" },
  { img: totalContactImg, tint: "#dcfce7", label: "Total Contacts" },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { subscription, loading: subscriptionLoading } = useSubscription({ liveUpdates: true });

  const [dash, setDash]     = useState({
    unreadChats: 0,
    templatesSent: 0,
    newContacts: 0,
    totalContacts: 0,
    deliveredMessages: 0,
    totalMessages: 0,
    messageStatusBreakdown: [],
    contactGrowthTrend: [],
    hourlyMessageTrends: [],
    performanceMetrics: null,
  });
  const [orders, setOrders] = useState({
    totalRevenue: 0,
    completedOrders: 0,
    pendingOrders: 0,
    totalOrders: 0,
    revenueTrend: { labels: [], values: [] },
  });
  const [allOrders, setAllOrders] = useState([]);
  const [revenueRange, setRevenueRange] = useState("month");
  const [orderRange, setOrderRange] = useState("month");
  const [engagementRange, setEngagementRange] = useState("month");
  const [messageRange, setMessageRange] = useState("month");
  const [openRangeMenu, setOpenRangeMenu] = useState(null);
  const [rangeStats, setRangeStats] = useState({});
  const [rangeStatsLoading, setRangeStatsLoading] = useState({});
  const [bot, setBot]       = useState({ status:"offline", knowledgeBase:null });
  const [loading, setLoading]   = useState(true);
  const [ordLoad, setOrdLoad]   = useState(true);
  const [showUser, setShowUser]     = useState(false);
  const [userMenuPos, setUserMenuPos] = useState({ top: 0, left: 0 });
  const userButtonRef = useRef(null);
  const [showDate, setShowDate]     = useState(false);
  const [dateRange, setDateRange]   = useState({ from:"", to:"" });
  const [tmpDate, setTmpDate]       = useState({ from:"", to:"" });
  const [filtered, setFiltered]     = useState(false);

  const [isCallingActive, setIsCallingActive] = useState(false);
  useEffect(() => {
  const fetchCallingStatus = async () => {
    try {
      const res = await api.get('/api/calling/status');
      setIsCallingActive(res.data?.isCallingEnabled || false);
    } catch (err) {
      console.error('Failed to fetch calling status:', err);
    }
  };
  fetchCallingStatus();
}, []);

  const username = user?.name || user?.username || "User";
  const trial = subscription?.trial || {};
  const hasProAccess = subscription?.hasProAccess ?? subscription?.isPro ?? subscription?.plan === "pro";
  const showTrialBanner = !subscriptionLoading && !hasProAccess && subscription?.plan === "free_trial";
  const planPriceLabel = formatPlanPrice(subscription?.pricing?.proPrice, subscription?.pricing?.currency);

  useEffect(() => { fetchDash(); fetchOrders(); fetchBot(); }, [dateRange, filtered]); // eslint-disable-line
  
  useEffect(() => {
    const ranges = Array.from(new Set([engagementRange, messageRange]));
    ranges.forEach((range) => ensureRangeStats(range));
  }, [engagementRange, messageRange]); // eslint-disable-line

  useEffect(() => {
    if (!showUser || !userButtonRef.current) return;
    const updateMenuPos = () => {
      const rect = userButtonRef.current.getBoundingClientRect();
      const menuWidth = 176;
      const padding = 12;
      const top = rect.bottom + 8;
      let left = rect.right - menuWidth;
      if (left < padding) left = padding;
      const maxLeft = window.innerWidth - padding - menuWidth;
      if (left > maxLeft) left = Math.max(padding, maxLeft);
      setUserMenuPos({ top, left });
    };
    updateMenuPos();
    window.addEventListener("resize", updateMenuPos);
    return () => window.removeEventListener("resize", updateMenuPos);
  }, [showUser]);

  const fetchDash = async () => {
    setLoading(true);
    try {
      const params = filtered && dateRange.from
        ? { startDate: dateRange.from, endDate: dateRange.to, filtered: true } : {};
      const s = await getDashboardStats(params);
      if (s) setDash({
        unreadChats:       Number(s.unreadChats)       || 0,
        templatesSent:     Number(s.templatesSent)     || 0,
        newContacts:       Number(s.newContacts)       || 0,
        totalContacts:     Number(s.totalContacts)     || 0,
        deliveredMessages: Number(s.deliveredMessages)  || 0,
        totalMessages:     Number(s.totalMessages)      || 0,
        messageStatusBreakdown: Array.isArray(s.messageStatusBreakdown) ? s.messageStatusBreakdown : [],
        contactGrowthTrend: Array.isArray(s.contactGrowthTrend) ? s.contactGrowthTrend : [],
        hourlyMessageTrends: Array.isArray(s.hourlyMessageTrends) ? s.hourlyMessageTrends : [],
        performanceMetrics: s.performanceMetrics || null,
      });
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchOrders = async () => {
    setOrdLoad(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const allRes = await api
        .get("/api/orders", {
          params: { page: 1, limit: 5000, source: "all", includeRegistrations: false },
          headers,
        })
        .catch(() => ({ data: { orders: [] } }));

      const allOrders = Array.isArray(allRes?.data?.orders) ? allRes.data.orders : [];
      setAllOrders(allOrders);
      const scopedOrders =
        filtered && dateRange.from && dateRange.to
          ? allOrders.filter((order) =>
              isWithinRange(order?.createdAt || order?.updatedAt, dateRange.from, dateRange.to)
            )
          : allOrders;

      const completedOrders = scopedOrders.filter((order) => isCompletedOrder(order));
      const pendingOrders = scopedOrders.filter((order) => isPendingOrder(order));
      const totalRevenue = completedOrders.reduce((sum, order) => sum + parseOrderAmount(order), 0);

      const trendEndDate = filtered && dateRange.to ? new Date(dateRange.to) : new Date();
      const revenueTrend = buildRevenueTrend(scopedOrders, trendEndDate);

      setOrders({
        totalRevenue,
        completedOrders: completedOrders.length,
        pendingOrders: pendingOrders.length,
        totalOrders: scopedOrders.length,
        revenueTrend,
      });
    } catch(e) { console.error(e); } finally { setOrdLoad(false); }
  };

  const fetchBot = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      const [sR, kR] = await Promise.all([
        publicApi.get("/api/bot/status", { headers }).catch(() => ({ data:{ status:"offline" } })),
        publicApi.get("/api/bot/knowledge-base-status", { headers }).catch(() => ({ data:{} })),
      ]);
      setBot({ status: sR.data?.status || "offline", knowledgeBase: kR.data });
    } catch(e) { console.error(e); }
  };

  const ensureRangeStats = async (range, force = false) => {
    if (!force && (rangeStats[range] || rangeStatsLoading[range])) return;
    setRangeStatsLoading((prev) => ({ ...prev, [range]: true }));
    try {
      const { from, to } = getRangeBounds(range);
      const stats = await getDashboardStats({
        startDate: toISODateKey(from),
        endDate: toISODateKey(to),
        filtered: true,
      });

      setRangeStats((prev) => ({
        ...prev,
        [range]: {
          unreadChats: Number(stats?.unreadChats) || 0,
          totalContacts: Number(stats?.totalContacts) || 0,
          totalMessages: Number(stats?.totalMessages) || 0,
          messageStatusBreakdown: Array.isArray(stats?.messageStatusBreakdown)
            ? stats.messageStatusBreakdown
            : [],
        },
      }));
    } catch (_error) {
      setRangeStats((prev) => ({
        ...prev,
        [range]: { unreadChats: 0, totalContacts: 0, totalMessages: 0, messageStatusBreakdown: [] },
      }));
    } finally {
      setRangeStatsLoading((prev) => ({ ...prev, [range]: false }));
    }
  };

  const applyFilter = () => {
    if (!tmpDate.from || !tmpDate.to) return toast.error("Select both dates");
    if (new Date(tmpDate.from) > new Date(tmpDate.to)) return toast.error("From must be before To");
    setDateRange(tmpDate); setFiltered(true); setShowDate(false);
  };
  const resetFilter = () => {
    setDateRange({ from:"", to:"" }); setTmpDate({ from:"", to:"" });
    setFiltered(false); setShowDate(false);
  };

  const toggleCallingFeature = async () => {
    const newState = !isCallingActive;
    const loadingToast = toast.loading(`${newState ? 'Enabling' : 'Disabling'} WhatsApp calling...`);
    try {
      const response = await api.patch('/api/calling/toggle', { enabled: newState });
      if (response.data.success) {
        setIsCallingActive(newState);
        toast.success(`WhatsApp Calling ${newState ? 'Enabled' : 'Disabled'}`, { id: loadingToast });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update calling status", { id: loadingToast });
    }
  };

  const getRangeLabel = (range) =>
    RANGE_OPTIONS.find((option) => option.value === range)?.label || "Today";

  const renderRangeDropdown = (menuKey, value, onChange) => {
    const selected = RANGE_OPTIONS.find((option) => option.value === value) || RANGE_OPTIONS[1];
    const isOpen = openRangeMenu === menuKey;

    return (
      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setOpenRangeMenu((prev) => (prev === menuKey ? null : menuKey))}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-emerald-300 hover:text-emerald-700"
        >
          <span>{selected.label}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <>
            <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpenRangeMenu(null)} />
            <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
              {RANGE_OPTIONS.map((option) => {
                const active = value === option.value;
                return (
                  <button key={option.value} type="button"
                    onClick={() => { onChange(option.value); setOpenRangeMenu(null); }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors ${active ? "bg-emerald-50 font-semibold text-emerald-700" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span>{option.label}</span>
                    {active && <span className="text-[11px]">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const revenueOrders = useMemo(() => filterOrdersByRange(allOrders, revenueRange), [allOrders, revenueRange]);
  const revenueTrendSeries = useMemo(() => buildRevenueSeriesByRange(revenueOrders, revenueRange), [revenueOrders, revenueRange]);
  const orderRangeOrders = useMemo(() => filterOrdersByRange(allOrders, orderRange), [allOrders, orderRange]);
  const orderCompletedCount = useMemo(() => orderRangeOrders.filter((order) => isCompletedOrder(order)).length, [orderRangeOrders]);
  const orderPendingCount = useMemo(() => orderRangeOrders.filter((order) => isPendingOrder(order)).length, [orderRangeOrders]);
  const engagementData = rangeStats[engagementRange] || null;
  const engagementLoading = Boolean(rangeStatsLoading[engagementRange]) && !engagementData;
  const engagementTotal = Number(engagementData?.totalContacts ?? dash.totalContacts ?? 0);
  const engagementUnread = Math.min(Number(engagementData?.unreadChats ?? 0), Math.max(engagementTotal, 0));
  const activePercent = engagementTotal > 0 ? Math.min(100, Math.round(((engagementTotal - engagementUnread) / engagementTotal) * 100)) : 0;
  const activeCustomers = Math.round((engagementTotal * activePercent) / 100);
  const inactiveCustomers = Math.max(engagementTotal - activeCustomers, 0);
  const messageData = rangeStats[messageRange] || null;
  const messageBreakdown = Array.isArray(messageData?.messageStatusBreakdown) ? messageData.messageStatusBreakdown : [];
  const messageStatusSeries = useMemo(() => {
    return messageBreakdown.map((item) => ({ label: formatStatusLabel(item?._id), value: Number(item?.count) || 0 })).filter((item) => item.value >= 0).sort((a, b) => b.value - a.value);
  }, [messageBreakdown]);

  const cardValues  = [fmt(orders.totalRevenue), fmtNum(orders.completedOrders), fmtNum(dash.unreadChats), fmtNum(dash.templatesSent), fmtNum(dash.newContacts), fmtNum(dash.totalContacts)];
  const cardLoading = [ordLoad, ordLoad, loading, loading, loading, loading];

  const ttip = { backgroundColor:"#14532d", titleColor:"#fff", bodyColor:"#bbf7d0", cornerRadius:8, padding:10 };
  const revenueData = {
    labels: revenueTrendSeries.labels,
    datasets: [{
      label:"Revenue", data: revenueTrendSeries.values, borderColor: GREEN,
      backgroundColor: (ctx) => {
        const g = ctx.chart.ctx.createLinearGradient(0,0,0,200);
        g.addColorStop(0,"rgba(22,163,74,0.18)"); g.addColorStop(1,"rgba(22,163,74,0)"); return g;
      },
      tension:0.42, fill:true, pointBackgroundColor:GREEN, pointBorderColor:"#fff", pointBorderWidth:2, pointRadius:4, pointHoverRadius:6,
    }],
  };
  const orderStatusData = {
    labels:["Completed","Pending"],
    datasets:[{ data:[orderCompletedCount || 0, orderPendingCount || 0], backgroundColor:["#10b981","#f59e0b"], borderWidth:0, hoverOffset:6 }],
  };
  const totMsg = messageStatusSeries.reduce((sum, item) => sum + item.value, 0);
  const msgData = {
    labels: (messageStatusSeries.length ? messageStatusSeries : [{ label: "No Data", value: 0 }]).map((item) => item.label),
    datasets:[{ label:"Messages", data: (messageStatusSeries.length ? messageStatusSeries : [{ label: "No Data", value: 0 }]).map((item) => item.value), backgroundColor: GREEN, borderRadius: 6, barPercentage: 0.42, maxBarThickness: 18 }],
  };

  const lineOpts = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:ttip }, scales:{ x:{ grid:{display:false}, border:{display:false}, ticks:{font:{size:10},color:"#9ca3af"} }, y:{ grid:{color:"rgba(0,0,0,0.04)"}, border:{display:false}, beginAtZero:true, ticks:{font:{size:10},color:"#9ca3af",callback:(v)=>`₹${v>=1000?v/1000+"K":v}`} } } };
  const barOpts = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:ttip }, scales:{ x:{ grid:{display:false}, border:{display:false}, ticks:{ font:{size:10}, color:"#9ca3af" } }, y:{ grid:{color:"rgba(0,0,0,0.04)"}, border:{display:false}, beginAtZero:true, ticks:{font:{size:10},color:"#9ca3af"} } } };
  const pieOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: ttip } };

  const actions = [
    { label:"Print Labels", sub:`${orders.completedOrders} ready`, img:labelImg, color:"from-violet-500 to-indigo-600", go:"/admin/fulfillment-flow" },
    { label:"New Broadcast", sub:`${fmtNum(dash.totalContacts)} contacts`, img:broadcastImg, color:"from-blue-500 to-cyan-500", go:"/admin/BroadcastMessage" },
    { label:"View Orders", sub:`${orders.pendingOrders} pending`, img:viewOrdersImg, color:"from-amber-500 to-orange-500", go:"/admin/fulfillment-flow" },
    { label:"AI Setup", sub:bot.knowledgeBase?.hasKnowledgeBase?"Configured":"Setup needed", img:aiImg, color:"from-emerald-500 to-teal-500", go:"/admin/file-upload" },
    { label:"Contacts", sub:`${fmtNum(dash.totalContacts)} total`, img:contactsImg, color:"from-pink-500 to-rose-500", go:"/admin/UserDetails" },
    { label:"Messages", sub:`${dash.unreadChats} unread`, img:messageImg, color:"from-sky-500 to-blue-600", go:"/admin/chats" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans">
      {showTrialBanner && (
        <div className="bg-white px-3 pt-2 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <div className={`relative overflow-hidden rounded-2xl border px-3 py-3 ${trial?.isExpired ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${trial?.isExpired ? 'bg-red-500' : 'bg-gradient-to-br from-emerald-400 to-emerald-600'}`}>
                    <Crown className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${trial?.isExpired ? 'text-red-900' : 'text-gray-900'}`}>{trial?.isActive ? 'Pro Trial Active' : 'Trial Expired'}</h3>
                    <p className="text-xs text-gray-500">{trial?.isActive ? 'Enjoying Pro features? Upgrade to keep them.' : 'Upgrade now to restore access.'}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                   {trial?.isActive && <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">{trial?.daysLeft}d left</span>}
                   <UpgradeToProButton label="Go Pro" className={trial?.isExpired ? "bg-red-600" : "bg-emerald-600"} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-3 py-2 sm:px-6 lg:px-8 max-w-[1600px] mx-auto min-h-[56px]">
          
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-600">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">Dashboard</p>
              <p className="text-[10px] text-gray-400 mt-0.5 hidden sm:block">Welcome back, {username} 👋</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="mr-1 hidden sm:block">
               <button
                  onClick={toggleCallingFeature}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold ${
                    isCallingActive 
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700' 
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
                  }`}
                  title={isCallingActive ? "Voice Calling is ON" : "Voice Calling is OFF"}
                >
                  {isCallingActive ? <Phone size={14} fill="currentColor" /> : <PhoneOff size={14} />}
                  <span className="hidden lg:inline">{isCallingActive ? 'Calling ON' : 'Calling OFF'}</span>
                  <div className={`w-6 h-3 rounded-full relative ${isCallingActive ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${isCallingActive ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                </button>
            </div>

            <div className="relative">
              <button onClick={()=>setShowDate(!showDate)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filtered ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                <Calendar className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{filtered ? `${dateRange.from} – ${dateRange.to}` : "Filter Date"}</span>
              </button>
              
              {showDate && (
                <>
                  <div className="fixed inset-0 z-[110] bg-black/10 backdrop-blur-[1px]" onClick={()=>setShowDate(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 z-[120] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl animate-in fade-in slide-in-from-top-1">
                    <p className="font-bold text-slate-900 mb-3 text-sm">Select Date Range</p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">From Date</label>
                        <input type="date" value={tmpDate.from} onChange={e=>setTmpDate(p=>({...p, from:e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"/>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">To Date</label>
                        <input type="date" value={tmpDate.to} onChange={e=>setTmpDate(p=>({...p, to:e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"/>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button onClick={resetFilter} className="flex-1 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Reset</button>
                      <button onClick={applyFilter} className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm shadow-emerald-200">Apply Filter</button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button onClick={() => { fetchDash(); fetchOrders(); fetchBot(); ensureRangeStats(engagementRange, true); }} className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-600"><RefreshCw className={`w-4 h-4 ${loading?"animate-spin":""}`} /></button>
            
            <div className="relative">
              <button ref={userButtonRef} onClick={()=>setShowUser(!showUser)} className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl border border-slate-200 hover:border-emerald-400">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold bg-emerald-600">{username.charAt(0).toUpperCase()}</div>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showUser?"rotate-180":""}`} />
              </button>
              {showUser && (
                <>
                  <div className="fixed inset-0 z-[110]" onClick={()=>setShowUser(false)} />
                  <div className="fixed bg-white border border-slate-100 rounded-2xl shadow-xl w-44 z-[120] overflow-hidden" style={{ top: userMenuPos.top, left: userMenuPos.left }}>
                    <div className="p-3 border-b border-slate-50"><p className="text-sm font-bold text-slate-900 truncate">{username}</p></div>
                    <div className="p-1.5">
                      <button onClick={()=>{ navigate("/admin/settings"); setShowUser(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-slate-50"><Settings size={16}/> Settings</button>
                      <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-bold text-emerald-600 hover:bg-emerald-50"><LogOut size={16}/> Sign Out</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {CARDS.map((c,i)=>(
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-slate-50 mb-3 flex items-center justify-center"><img src={c.img} className="w-6 h-6 object-contain" /></div>
              <p className="text-xl font-extrabold text-slate-900 leading-none">{cardLoading[i] ? "..." : cardValues[i]}</p>
              <p className="text-[11px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-sm font-bold text-slate-900">Revenue Trend</p><p className="text-xs text-slate-400">Monthly payments growth</p></div>
              {renderRangeDropdown("revenue", revenueRange, setRevenueRange)}
            </div>
            <div className="h-56"><Line data={revenueData} options={lineOpts}/></div>
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Order Status</p>
              {renderRangeDropdown("order", orderRange, setOrderRange)}
            </div>
            <div className="h-44 mb-4"><Doughnut data={orderStatusData} options={{ ...pieOpts, cutout:"75%" }}/></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600"><span>Completed</span><span className="text-emerald-600">{orderCompletedCount}</span></div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-600"><span>Pending</span><span className="text-amber-500">{orderPendingCount}</span></div>
            </div>
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col items-center">
            <div className="w-full mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Engagement</p>
              {renderRangeDropdown("engagement", engagementRange, setEngagementRange)}
            </div>
            <Speedometer value={activePercent} totalContacts={engagementTotal}/>
            <div className="grid grid-cols-2 gap-2 w-full mt-4">
              <div className="bg-emerald-50 p-2 rounded-xl text-center"><p className="text-[10px] font-bold text-emerald-600">Active</p><p className="text-sm font-black text-emerald-700">{activePercent}%</p></div>
              <div className="bg-slate-50 p-2 rounded-xl text-center"><p className="text-[10px] font-bold text-slate-400">Inactive</p><p className="text-sm font-black text-slate-500">{100-activePercent}%</p></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
             <div className="mb-4 flex items-center justify-between">
               <div><p className="text-sm font-bold text-slate-900">Message Volume</p><p className="text-xs text-slate-400">{totMsg} total messages</p></div>
               {renderRangeDropdown("message", messageRange, setMessageRange)}
             </div>
             <div className="h-56"><Bar data={msgData} options={barOpts}/></div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-900">Quick Actions</p>
              <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${bot.status==='online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {bot.status==='online' ? '● Bot Live' : '○ Bot Offline'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {actions.map(a=>(
                <button key={a.label} onClick={()=>navigate(a.go)} className="flex items-center gap-3 p-3 rounded-xl border border-slate-50 bg-slate-50/30 hover:bg-white hover:border-emerald-200 transition-all hover:shadow-sm">
                   <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0"><img src={a.img} className="w-5 h-5 object-contain" /></div>
                   <div className="min-w-0 text-left"><p className="text-xs font-bold text-slate-900 truncate">{a.label}</p><p className="text-[10px] text-slate-400 truncate">{a.sub}</p></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
