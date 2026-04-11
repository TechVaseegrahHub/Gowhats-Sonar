import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Loader2,
  PackageOpen,
  RefreshCw,
  Send,
  Store,
  Users,
  X
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../utils/axios';

function formatRequestedAt(value) {
  if (!value) {
    return 'Unknown time';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildGroupLabel(group) {
  const productTitle = group?.productTitle || 'Requested product';
  const variationTitle = group?.variationTitle || '';

  return variationTitle ? `${productTitle} (${variationTitle})` : productTitle;
}

function formatAutomationStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
      return 'Auto active';
    case 'processing':
      return 'Checking';
    case 'waiting_restock':
      return 'Waiting';
    case 'completed':
      return 'Completed';
    case 'disabled':
      return 'Disabled';
    default:
      return 'Auto';
  }
}

function getAutomationStatusClasses(status) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
      return 'bg-emerald-100 text-emerald-700';
    case 'processing':
      return 'bg-amber-100 text-amber-700';
    case 'waiting_restock':
      return 'bg-slate-100 text-slate-600';
    case 'completed':
      return 'bg-blue-100 text-blue-700';
    case 'disabled':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function formatNextCheckAt(value) {
  if (!value) {
    return 'Waiting for restock';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not scheduled';
  }

  const minutesRemaining = Math.ceil((parsed.getTime() - Date.now()) / 60000);

  if (minutesRemaining > 0) {
    return `${minutesRemaining}m left`;
  }

  return 'Due now';
}

function MiniStat({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function ProductCard({ group, isActive, selectedCount, onClick }) {
  const isInStock = Boolean(group?.isInStock);

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-2xl border transition-all duration-200 ${
        isActive
          ? 'border-emerald-400 bg-emerald-50 shadow-lg shadow-emerald-100'
          : 'border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <div className="p-4">
        <div className="flex gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {group.productImageUrl ? (
              <img
                src={group.productImageUrl}
                alt={group.productTitle}
                className="h-full w-full object-cover"
              />
            ) : (
              <PackageOpen className="h-6 w-6 text-slate-400" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">
                {buildGroupLabel(group)}
              </h3>
              {isActive ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isInStock ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {isInStock ? 'In Stock' : 'Out of Stock'}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAutomationStatusClasses(group.automationStatus)}`}>
                {formatAutomationStatus(group.automationStatus)}
              </span>
            </div>

            <p className="mt-1.5 text-xs text-slate-500">
              ID: {group.productId}{group.variationId ? ` / ${group.variationId}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <MiniStat label="Waiting" value={group.pendingCount || 0} />
          <div className="h-8 w-px bg-slate-200" />
          <MiniStat label="Stock" value={group.stockQuantity ?? 0} />
          <div className="h-8 w-px bg-slate-200" />
          <MiniStat label="Sent" value={group.totalSentCount || 0} />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            <Clock3 className="mr-1 inline h-3 w-3" />
            {formatNextCheckAt(group.nextCheckAt)}
          </span>
          {selectedCount > 0 && (
            <span className="font-medium text-emerald-600">{selectedCount} selected</span>
          )}
        </div>
      </div>
    </div>
  );
}

function WooRestockLanding() {
  const navigate = useNavigate();
  const { integrationId } = useParams();
  const [searchParams] = useSearchParams();
  const focusProductId = searchParams.get('productId') || '';
  const focusVariationId = searchParams.get('variationId') || '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeProductKey, setActiveProductKey] = useState('');

  const filteredGroups = useMemo(() => {
    if (!focusProductId) {
      return groups;
    }

    return groups.filter((group) => (
      String(group.productId || '') === focusProductId &&
      (!focusVariationId || String(group.variationId || '') === String(focusVariationId))
    ));
  }, [focusProductId, focusVariationId, groups]);

  const activeGroup = useMemo(() => (
    filteredGroups.find((group) => group.productKey === activeProductKey) || null
  ), [activeProductKey, filteredGroups]);

  const summary = useMemo(() => {
    return filteredGroups.reduce((result, group) => ({
      totalProducts: result.totalProducts + 1,
      totalPending: result.totalPending + (group.pendingCount || 0),
      totalProcessing: result.totalProcessing + (group.processingCount || 0),
      totalRequests: result.totalRequests + (group.totalCount || 0),
      totalAutoSent: result.totalAutoSent + (group.totalSentCount || 0)
    }), {
      totalProducts: 0,
      totalPending: 0,
      totalProcessing: 0,
      totalRequests: 0,
      totalAutoSent: 0
    });
  }, [filteredGroups]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await api.get(`/api/integrations/${integrationId}/woocommerce-restock/requests`);
        setDashboard(response.data?.integration || null);
        setGroups(Array.isArray(response.data?.groups) ? response.data.groups : []);
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load restock requests');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }

    setLoading(true);
    loadDashboard();
  }, [integrationId]);

  useEffect(() => {
    if (!filteredGroups.length) {
      setActiveProductKey('');
      return;
    }

    const activeExists = filteredGroups.some((group) => group.productKey === activeProductKey);

    if (focusProductId) {
      if (!activeExists) {
        setActiveProductKey(filteredGroups[0].productKey);
      }
      return;
    }

    if (!activeExists && activeProductKey) {
      setActiveProductKey('');
    }
  }, [activeProductKey, filteredGroups, focusProductId]);

  useEffect(() => {
    const validIds = new Set(
      groups.flatMap((group) => (
        Array.isArray(group.requests)
          ? group.requests
            .filter((request) => request.status === 'pending')
            .map((request) => request.id)
          : []
      ))
    );

    setSelectedIds((previous) => previous.filter((id) => validIds.has(id)));
  }, [groups]);

  async function refreshDashboard() {
    setRefreshing(true);

    try {
      const response = await api.get(`/api/integrations/${integrationId}/woocommerce-restock/requests`);
      setDashboard(response.data?.integration || null);
      setGroups(Array.isArray(response.data?.groups) ? response.data.groups : []);
      toast.success('Refreshed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }

  function toggleRequestSelection(requestId) {
    setSelectedIds((previous) => (
      previous.includes(requestId)
        ? previous.filter((item) => item !== requestId)
        : [...previous, requestId]
    ));
  }

  function toggleGroupSelection(group) {
    const pendingIds = (group?.requests || [])
      .filter((request) => request.status === 'pending')
      .map((request) => request.id);

    if (!pendingIds.length) {
      return;
    }

    setSelectedIds((previous) => {
      const allSelected = pendingIds.every((requestId) => previous.includes(requestId));

      if (allSelected) {
        return previous.filter((requestId) => !pendingIds.includes(requestId));
      }

      return [...new Set([...previous, ...pendingIds])];
    });
  }

  async function sendSelectedRequests() {
    if (!selectedIds.length) {
      toast.error('Select at least one customer');
      return;
    }

    setSending(true);

    try {
      const response = await api.post(
        `/api/integrations/${integrationId}/woocommerce-restock/send`,
        { requestIds: selectedIds }
      );

      toast.success(response.data?.message || 'Sent successfully');
      setSelectedIds([]);

      const refreshed = await api.get(`/api/integrations/${integrationId}/woocommerce-restock/requests`);
      setDashboard(refreshed.data?.integration || null);
      setGroups(Array.isArray(refreshed.data?.groups) ? refreshed.data.groups : []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  const selectedCountInActiveGroup = activeGroup
    ? (activeGroup.requests || []).filter((request) => selectedIds.includes(request.id)).length
    : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Compact Top Bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/settings')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Restock Queue</h1>
              <p className="text-xs text-slate-500">{dashboard?.storeUrl || 'Loading...'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={sendSelectedRequests}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send ({selectedIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={refreshing || loading}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4">
        {/* Quick Stats Bar */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Store className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-700">{summary.totalProducts}</span>
            <span className="text-slate-500">products</span>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-slate-700">{summary.totalPending}</span>
            <span className="text-slate-500">waiting</span>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="font-medium text-slate-700">{summary.totalAutoSent}</span>
            <span className="text-slate-500">sent</span>
          </div>
          {dashboard?.restockTemplateName && (
            <>
              <div className="h-4 w-px bg-slate-200" />
              <div className="text-xs text-slate-500">
                Template: <span className="font-medium text-slate-700">{dashboard.restockTemplateName}</span>
              </div>
            </>
          )}
        </div>

        {/* Alerts */}
        {focusProductId && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
            <span className="text-sm text-blue-800">Filtered by product</span>
            <button
              type="button"
              onClick={() => navigate(`/admin/restock/woocommerce/${integrationId}`)}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              Show all
            </button>
          </div>
        )}

        {dashboard && !dashboard.isRestockEnabled && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-800">Auto alerts disabled — manual send only</span>
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <span className="text-sm font-medium text-emerald-800">
              {selectedIds.length} customer{selectedIds.length === 1 ? '' : 's'} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              Clear
            </button>
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-slate-400" />
            <span className="text-slate-600">Loading...</span>
          </div>
        ) : !filteredGroups.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Users className="h-6 w-6 text-slate-400" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">No restock requests</h2>
            <p className="mt-2 text-sm text-slate-500">
              {focusProductId ? 'No waiting customers for this product' : 'Requests will appear here when customers register'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Product Cards Grid */}
            <div className={`space-y-3 ${activeGroup ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
              <div className={`grid gap-3 ${activeGroup ? '' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
                {filteredGroups.map((group) => {
                  const groupPendingIds = (group.requests || [])
                    .filter((request) => request.status === 'pending')
                    .map((request) => request.id);

                  return (
                    <ProductCard
                      key={group.productKey}
                      group={group}
                      isActive={activeGroup?.productKey === group.productKey}
                      selectedCount={groupPendingIds.filter((id) => selectedIds.includes(id)).length}
                      onClick={() => setActiveProductKey(
                        activeProductKey === group.productKey ? '' : group.productKey
                      )}
                    />
                  );
                })}
              </div>
            </div>

            {/* Product Details Panel */}
            {activeGroup && (
              <div className="lg:col-span-2">
                <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {/* Detail Header */}
                  <div className="flex items-start justify-between border-b border-slate-100 p-4">
                    <div className="flex gap-3">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                        {activeGroup.productImageUrl ? (
                          <img
                            src={activeGroup.productImageUrl}
                            alt={activeGroup.productTitle}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <PackageOpen className="h-7 w-7 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          {buildGroupLabel(activeGroup)}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            activeGroup.isInStock ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {activeGroup.isInStock ? 'In Stock' : 'Out of Stock'}
                          </span>
                          <span className="text-xs text-slate-500">
                            Stock: {activeGroup.stockQuantity ?? 0}
                          </span>
                        </div>
                        {activeGroup.productUrl && (
                          <a
                            href={activeGroup.productUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                          >
                            View product <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveProductKey('')}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-4 gap-2 border-b border-slate-100 p-3">
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold text-slate-900">{activeGroup.pendingCount}</p>
                      <p className="text-[10px] uppercase text-slate-500">Pending</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold text-amber-700">{activeGroup.processingCount}</p>
                      <p className="text-[10px] uppercase text-slate-500">Processing</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold text-blue-700">{selectedCountInActiveGroup}</p>
                      <p className="text-[10px] uppercase text-slate-500">Selected</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold text-emerald-700">{activeGroup.totalSentCount || 0}</p>
                      <p className="text-[10px] uppercase text-slate-500">Sent</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 border-b border-slate-100 p-3">
                    <button
                      type="button"
                      onClick={() => toggleGroupSelection(activeGroup)}
                      disabled={!activeGroup.pendingCount}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Select all pending
                    </button>
                    <button
                      type="button"
                      onClick={sendSelectedRequests}
                      disabled={sending || !selectedIds.length}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send ({selectedIds.length})
                    </button>
                  </div>

                  {/* Customer List */}
                  <div className="max-h-[400px] overflow-y-auto">
                    <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Customers ({activeGroup.totalCount})
                    </div>
                    <div className="divide-y divide-slate-100">
                      {(activeGroup.requests || []).map((request) => {
                        const isSelectable = request.status === 'pending';
                        const isSelected = selectedIds.includes(request.id);

                        return (
                          <div
                            key={request.id}
                            className={`flex items-center gap-3 px-3 py-3 transition ${
                              isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isSelectable}
                              onChange={() => toggleRequestSelection(request.id)}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900">
                                  {request.customerName || 'Customer'}
                                </span>
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                  request.status === 'pending'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {request.status}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600">
                                {request.rawPhoneNumber || request.normalizedPhoneNumber}
                              </p>
                            </div>

                            <div className="text-right text-xs text-slate-500">
                              <p>{formatRequestedAt(request.requestedAt)}</p>
                              {request.attemptCount > 0 && (
                                <p>Attempts: {request.attemptCount}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Automation Info */}
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        Next check: <span className="font-medium text-slate-700">{formatNextCheckAt(activeGroup.nextCheckAt)}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${getAutomationStatusClasses(activeGroup.automationStatus)}`}>
                        {formatAutomationStatus(activeGroup.automationStatus)}
                      </span>
                    </div>
                    {activeGroup.automationError && (
                      <p className="mt-2 text-xs text-rose-600">Error: {activeGroup.automationError}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default WooRestockLanding;
