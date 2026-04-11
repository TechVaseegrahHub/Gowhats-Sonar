import { useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Building2,
  CalendarDays,
  ChevronRight,
  Copy,
  Mail,
  Phone,
  RefreshCw,
  Users,
  Wallet,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { publicApi } from '../utils/axios';

const CARD_ACCENTS = [
  'from-emerald-500 to-teal-500',
  'from-sky-500 to-cyan-500',
  'from-violet-500 to-indigo-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500'
];

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

const getAdminHeaders = () => {
  const adminToken = localStorage.getItem('admin_token');
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
};

const getPartnerInitials = (businessName = '') => {
  const words = String(businessName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'RP';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
};

function StatCard({ icon: Icon, iconClassName, value, label }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
      <div className={`mb-3 inline-flex rounded-xl p-2 ${iconClassName}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-black text-slate-900 sm:text-2xl">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function PartnerCard({ item, index, onOpen }) {
  const { partner, summary } = item;
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];

  return (
    <button
      type="button"
      onClick={() => onOpen(partner.id)}
      className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-100/60"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-slate-50 via-white to-emerald-50 opacity-90" />

      <div className="relative flex items-start justify-between gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-base font-black text-white shadow-lg`}
        >
          {getPartnerInitials(partner.businessName)}
        </div>
        <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
      </div>

      <div className="relative mt-4 min-w-0">
        <p className="truncate text-lg font-black tracking-tight text-slate-900">
          {partner.businessName}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-emerald-700">
            {partner.referralCode}
          </p>
          <p className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-slate-600">
            {Number(partner.sharePercent ?? 50)}% Share
          </p>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Clients</p>
          <p className="mt-1 text-base font-black text-slate-900">{summary.totalClients || 0}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Paid</p>
          <p className="mt-1 text-base font-black text-slate-900">{summary.paidClients || 0}</p>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-500">{partner.email || 'No email added'}</p>
          <p className="truncate text-xs text-slate-400">{partner.phoneNumber || 'No phone added'}</p>
        </div>
        <span className="ml-3 shrink-0 text-xs font-semibold text-emerald-600">Open</span>
      </div>
    </button>
  );
}

export default function AdminReferralSection() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [payload, setPayload] = useState({
    totals: {
      totalPartners: 0,
      totalClients: 0,
      totalPaidClients: 0
    },
    partners: []
  });
  const [loading, setLoading] = useState(true);
  const [settlingKey, setSettlingKey] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [sharePercentDraft, setSharePercentDraft] = useState('50');
  const [savingSharePercent, setSavingSharePercent] = useState(false);

  const loadOverview = async () => {
    try {
      setLoading(true);
      const response = await publicApi.get('/api/admin-dashboard/referrals/overview', {
        params: { month },
        headers: getAdminHeaders()
      });

      if (response.data?.success) {
        setPayload({
          totals: response.data.totals || {
            totalPartners: 0,
            totalClients: 0,
            totalPaidClients: 0
          },
          partners: response.data.partners || []
        });
      }
    } catch (error) {
      console.error('Referral overview error:', error);
      toast.error(error.response?.data?.message || 'Failed to load referral companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [month]);

  const activePartners = useMemo(
    () => payload.partners.filter((item) => Number(item.summary?.paidClients || 0) > 0).length,
    [payload.partners]
  );

  const selectedPartnerRecord = useMemo(
    () => payload.partners.find((item) => item.partner?.id === selectedPartnerId) || null,
    [payload.partners, selectedPartnerId]
  );

  useEffect(() => {
    if (!selectedPartnerId) return;
    const exists = payload.partners.some((item) => item.partner?.id === selectedPartnerId);
    if (!exists) {
      setSelectedPartnerId('');
    }
  }, [payload.partners, selectedPartnerId]);

  useEffect(() => {
    if (!selectedPartnerRecord?.partner) {
      setSharePercentDraft('50');
      return;
    }

    setSharePercentDraft(String(Number(selectedPartnerRecord.partner.sharePercent ?? 50)));
  }, [selectedPartnerRecord]);

  const markCompanySharePaid = async (partnerId, currency) => {
    try {
      const key = `${partnerId}:${currency}`;
      setSettlingKey(key);
      const response = await publicApi.post(
        `/api/admin-dashboard/referrals/partner/${partnerId}/mark-paid`,
        { month, currency },
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        toast.success(response.data.message || 'Referral payment updated');
        await loadOverview();
      }
    } catch (error) {
      console.error('Referral settlement error:', error);
      toast.error(error.response?.data?.message || 'Failed to update payment status');
    } finally {
      setSettlingKey('');
    }
  };

  const savePartnerSharePercent = async () => {
    if (!modalPartner?.id) return;

    const nextSharePercent = Number(sharePercentDraft);
    if (!Number.isFinite(nextSharePercent) || nextSharePercent < 0 || nextSharePercent > 100) {
      toast.error('Enter a valid share percent between 0 and 100');
      return;
    }

    try {
      setSavingSharePercent(true);
      const response = await publicApi.patch(
        `/api/admin-dashboard/referrals/partner/${modalPartner.id}/share-percent`,
        { sharePercent: nextSharePercent },
        { headers: getAdminHeaders() }
      );

      if (response.data?.success) {
        toast.success(response.data.message || 'Partner share percent updated');
        await loadOverview();
      }
    } catch (error) {
      console.error('Partner share percent update error:', error);
      toast.error(error.response?.data?.message || 'Failed to update partner share percent');
    } finally {
      setSavingSharePercent(false);
    }
  };

  const modalPartner = selectedPartnerRecord?.partner || null;
  const modalSummary = selectedPartnerRecord?.summary || {};
  const modalClients = selectedPartnerRecord?.clients || [];
  const modalMonthlySummary = selectedPartnerRecord?.monthlySummary || [];
  const currentSharePercent = Number(modalPartner?.sharePercent ?? 50);
  const draftSharePercent = Number(sharePercentDraft);
  const remainingSharePercent =
    Number.isFinite(draftSharePercent) && draftSharePercent >= 0 && draftSharePercent <= 100
      ? Number((100 - draftSharePercent).toFixed(2))
      : null;
  const sharePercentChanged =
    Number.isFinite(draftSharePercent) &&
    Number(draftSharePercent.toFixed(2)) !== Number(currentSharePercent.toFixed(2));

  return (
    <>
      <section className="mb-6 overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] sm:mb-8">
        <div className="border-b border-slate-200/70 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">
                Referral Companies
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">
                Digital Marketing Partner Reports
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Card view for partner companies. Click any card to open full onboarding and payout details.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="bg-transparent outline-none"
                />
              </label>

              <button
                type="button"
                onClick={loadOverview}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/70 p-4 sm:grid-cols-3 sm:p-5">
          <StatCard
            icon={Building2}
            iconClassName="bg-emerald-100 text-emerald-700"
            value={payload.totals.totalPartners}
            label="Referral companies"
          />
          <StatCard
            icon={Users}
            iconClassName="bg-sky-100 text-sky-700"
            value={payload.totals.totalClients}
            label="Referred clients"
          />
          <StatCard
            icon={Wallet}
            iconClassName="bg-amber-100 text-amber-700"
            value={activePartners}
            label="Companies with paid clients"
          />
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
              <p className="mt-3 text-sm font-semibold text-slate-600">Loading referral companies...</p>
            </div>
          ) : payload.partners.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <BadgePercent className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">No referral companies yet</p>
              <p className="mt-1 text-sm text-slate-500">
                New partner signups will appear here automatically.
              </p>
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))' }}
            >
              {payload.partners.map((item, index) => (
                <PartnerCard
                  key={item.partner.id}
                  item={item}
                  index={index}
                  onOpen={setSelectedPartnerId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedPartnerRecord && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 px-4 py-6 backdrop-blur-sm sm:px-6"
          onClick={() => setSelectedPartnerId('')}
        >
          <div
            className="mx-auto max-w-5xl overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-2xl shadow-slate-950/20"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-900 px-5 py-5 text-white sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10 text-lg font-black text-white ring-1 ring-white/15 backdrop-blur">
                    {getPartnerInitials(modalPartner?.businessName)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200">
                      Partner Details
                    </p>
                    <h3 className="mt-1 truncate text-2xl font-black tracking-tight text-white">
                      {modalPartner?.businessName}
                    </h3>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold tracking-[0.16em] text-white ring-1 ring-white/10">
                        {modalPartner?.referralCode}
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85 ring-1 ring-white/10">
                        {month}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(modalPartner?.referralCode || '');
                          toast.success('Referral code copied');
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/10 transition hover:bg-white/15"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-white/80 sm:grid-cols-2">
                      <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                        <Mail className="h-4 w-4 text-white/55" />
                        <span className="truncate">{modalPartner?.email || 'No email added'}</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                        <Phone className="h-4 w-4 text-white/55" />
                        <span className="truncate">{modalPartner?.phoneNumber || 'No phone added'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="grid grid-cols-3 gap-2 rounded-3xl bg-white/10 p-2 ring-1 ring-white/10">
                    <div className="min-w-[84px] rounded-2xl bg-white/10 px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Clients</p>
                      <p className="mt-1 text-lg font-black text-white">{modalSummary.totalClients || 0}</p>
                    </div>
                    <div className="min-w-[84px] rounded-2xl bg-white/10 px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Paid</p>
                      <p className="mt-1 text-lg font-black text-white">{modalSummary.paidClients || 0}</p>
                    </div>
                    <div className="min-w-[84px] rounded-2xl bg-white/10 px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Pending</p>
                      <p className="mt-1 text-lg font-black text-white">{modalSummary.pendingPayouts || 0}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPartnerId('')}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white/80 ring-1 ring-white/10 transition hover:bg-white/15 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[72vh] space-y-4 overflow-y-auto bg-slate-50 px-5 py-5 sm:px-6">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.85fr]">
                <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    Currency Summary
                  </p>
                  <div className="mt-4 space-y-3">
                    {(modalSummary.currencyTotals || []).length === 0 ? (
                      <p className="text-sm text-slate-500">No referral earnings yet for this company.</p>
                    ) : (
                      modalSummary.currencyTotals.map((currencyRow) => (
                        <div
                          key={`${modalPartner?.id}-${currencyRow.currency}`}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{currencyRow.currency}</p>
                              <div className="mt-2 grid gap-2 text-sm text-slate-500 sm:grid-cols-3">
                                <div className="rounded-xl bg-white px-3 py-2">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Earned</p>
                                  <p className="mt-1 font-semibold text-slate-900">
                                    {formatMoney(currencyRow.earned, currencyRow.currency)}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-white px-3 py-2">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Unpaid</p>
                                  <p className="mt-1 font-semibold text-amber-600">
                                    {formatMoney(currencyRow.pending, currencyRow.currency)}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-white px-3 py-2">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Paid</p>
                                  <p className="mt-1 font-semibold text-emerald-700">
                                    {formatMoney(currencyRow.paid, currencyRow.currency)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {Number(currencyRow.pending || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => markCompanySharePaid(modalPartner?.id, currencyRow.currency)}
                                disabled={settlingKey === `${modalPartner?.id}:${currencyRow.currency}`}
                                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                              >
                                {settlingKey === `${modalPartner?.id}:${currencyRow.currency}`
                                  ? 'Updating...'
                                  : 'Mark paid'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      Partner Share Settings
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Admin controls this partner&apos;s referral share percent. The remaining percent stays with GoWhats.
                    </p>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="flex-1">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Partner Share Percent
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={sharePercentDraft}
                            onChange={(event) => setSharePercentDraft(event.target.value)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-10 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white"
                          />
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                            %
                          </span>
                        </div>
                      </label>

                      <button
                        type="button"
                        onClick={savePartnerSharePercent}
                        disabled={!sharePercentChanged || savingSharePercent}
                        className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingSharePercent ? 'Saving...' : 'Save Share'}
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Partner
                        </p>
                        <p className="mt-1 text-lg font-black text-slate-900">
                          {Number.isFinite(draftSharePercent) ? `${draftSharePercent}%` : '-'}
                        </p>
                      </div>
                      {/* <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          GoWhats
                        </p>
                        <p className="mt-1 text-lg font-black text-slate-900">
                          {remainingSharePercent !== null ? `${remainingSharePercent}%` : '-'}
                        </p>
                      </div> */}
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      Month-wise Report
                    </p>
                    <div className="mt-4 space-y-3">
                      {modalMonthlySummary.length === 0 ? (
                        <p className="text-sm text-slate-500">No monthly referral activity yet.</p>
                      ) : (
                        modalMonthlySummary.map((monthRow) => (
                          <div
                            key={`${modalPartner?.id}-${monthRow.month}`}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-slate-900">{monthRow.month}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Onboarded {monthRow.onboardedClients} · Paid {monthRow.paidClients}
                                </p>
                              </div>
                              <p className="text-sm font-bold text-emerald-700">
                                {formatMoney(monthRow.earnedAmount, modalPartner?.currency || 'INR')}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      Referred Clients In {month}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Client onboarding and payment status for the selected partner.
                    </p>
                  </div>
                </div>

                <div className="mt-4 hidden overflow-x-auto lg:block">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        <th className="pb-3 pr-4 font-bold">Client</th>
                        <th className="pb-3 pr-4 font-bold">Status</th>
                        <th className="pb-3 pr-4 font-bold">Subscription</th>
                        <th className="pb-3 pr-4 font-bold">Partner Share</th>
                        <th className="pb-3 font-bold">Onboarded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modalClients.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-5 text-sm text-slate-500">
                            No client onboardings recorded for this month.
                          </td>
                        </tr>
                      ) : (
                        modalClients.map((client) => (
                          <tr key={client.id}>
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-slate-900">
                                {client.clientBusinessName || client.clientName || client.clientEmail}
                              </p>
                              <p className="text-xs text-slate-500">
                                {client.clientEmail || client.clientPhone || client.tenantId}
                              </p>
                            </td>
                            <td className="py-3 pr-4">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-700">
                                {client.paymentStatus === 'paid'
                                  ? 'Pro Paid'
                                  : String(client.status || '').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-3 pr-4 font-semibold text-slate-700">
                              {formatMoney(client.subscriptionAmount, client.currency)}
                            </td>
                            <td className="py-3 pr-4 font-semibold text-emerald-700">
                              {formatMoney(client.partnerShareAmount, client.currency)}
                            </td>
                            <td className="py-3 text-slate-500">{formatDate(client.signedUpAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-3 lg:hidden">
                  {modalClients.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                      No client onboardings recorded for this month.
                    </div>
                  ) : (
                    modalClients.map((client) => (
                      <div key={client.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {client.clientBusinessName || client.clientName || client.clientEmail}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {client.clientEmail || client.clientPhone || client.tenantId}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-700">
                            {client.paymentStatus === 'paid'
                              ? 'Pro Paid'
                              : String(client.status || '').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-500">
                          <p>
                            Subscription{' '}
                            <span className="font-semibold text-slate-900">
                              {formatMoney(client.subscriptionAmount, client.currency)}
                            </span>
                          </p>
                          <p>
                            Partner share{' '}
                            <span className="font-semibold text-emerald-700">
                              {formatMoney(client.partnerShareAmount, client.currency)}
                            </span>
                          </p>
                          <p>Onboarded {formatDate(client.signedUpAt)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

