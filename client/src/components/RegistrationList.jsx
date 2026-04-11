import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Search, Eye, XCircle, Ticket, Download,
  Users, Calendar, ChevronRight, Trash2, AlertTriangle,
  ChevronLeft, ChevronsLeft, ChevronsRight, CheckCircle2,
  Clock, Send, RefreshCw, Check, X
} from 'lucide-react';
import { publicApi } from '../utils/axios';
import toast from 'react-hot-toast';

// ─── DELETE MODAL ─────────────────────────────────────────────────────────────
const DeleteConfirmModal = ({ reg, onConfirm, onCancel, isDeleting }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
      <div className="bg-red-50 px-6 pt-6 pb-4 flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-3">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">Delete Registration?</h3>
        <p className="text-sm text-gray-500 mt-1">This action cannot be undone.</p>
      </div>
      <div className="px-6 py-4 border-t border-gray-100">
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 font-medium">Ticket ID</span>
            <span className="font-bold text-gray-900">{reg.ticketId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 font-medium">Customer</span>
            <span className="font-semibold text-gray-800">{reg.customerName || 'Guest'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 font-medium">Phone</span>
            <span className="text-gray-700">{reg.customerPhone}</span>
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 flex gap-3">
        <button onClick={onCancel} disabled={isDeleting}
          className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition disabled:opacity-50">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={isDeleting}
          className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition flex items-center justify-center gap-2 disabled:opacity-60">
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
);

// ─── PAID / UNPAID TOGGLE ─────────────────────────────────────────────────────
// Sends: completed = Paid, pending = Unpaid  (matches Order.paymentStatus enum)
const PaymentToggle = ({ reg, onUpdate }) => {
  const [saving, setSaving] = useState(false);

  // ✅ Use effectivePaymentStatus from backend (manual override or order status)
  const isPaid = reg?.effectivePaymentStatus === 'completed' || reg?.effectivePaymentStatus === 'paid';
  const hasOrder = !!reg.orderId;
  const ticketSent = reg?.order?.metadata?.ticketsGenerated;

  const handleToggle = async () => {
    if (saving) return;
    const newStatus = isPaid ? 'unpaid' : 'paid';
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await publicApi.patch(
        `/api/tickets/${reg._id}/payment-status`,
        { paymentStatus: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        toast.success(newStatus === 'paid' ? 'Marked as Paid ✓' : 'Marked as Unpaid');
        onUpdate(reg._id, { effectivePaymentStatus: newStatus });
      } else {
        toast.error(res.data.message || 'Update failed');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleToggle}
        disabled={saving || !hasOrder}
        title={!hasOrder ? 'No order linked' : (isPaid ? 'Click to mark as Unpaid' : 'Click to mark as Paid')}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold
          transition-all select-none
          ${isPaid
            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
            : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
          }
          ${(!hasOrder) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
        `}
      >
        {saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : isPaid
            ? <CheckCircle2 className="w-3.5 h-3.5" />
            : <Clock className="w-3.5 h-3.5" />
        }
        {saving ? 'Saving...' : isPaid ? 'Paid' : 'Unpaid'}
      </button>

      {ticketSent && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-50 text-sky-600 border border-sky-200 w-fit">
          <Send className="w-3 h-3" /> Sent
        </span>
      )}
    </div>
  );
};

// ─── INLINE AMOUNT EDITOR ─────────────────────────────────────────────────────
// Saves to EventTicket.amount via PATCH /api/tickets/:id/amount
const InlineAmountEditor = ({ reg, onUpdate }) => {
  const rawAmount = reg.amount ?? '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rawAmount);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setValue(rawAmount); }, [rawAmount, editing]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleSave = async () => {
    const trimmed = String(value).trim();
    if (trimmed === String(rawAmount ?? '')) { setEditing(false); return; }
    if (trimmed !== '') {
      const parsed = parseFloat(trimmed);
      if (isNaN(parsed) || parsed < 0) { toast.error('Enter a valid amount'); return; }
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await publicApi.patch(
        `/api/tickets/${reg._id}/amount`,
        { amount: trimmed === '' ? null : parseFloat(trimmed) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        toast.success('Amount saved');
        onUpdate(reg._id, { amount: trimmed === '' ? null : parseFloat(trimmed) });
        setEditing(false);
      } else {
        toast.error(res.data.message || 'Failed');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setValue(rawAmount); setEditing(false); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-gray-400">₹</span>
        <input
          ref={inputRef}
          type="number" min="0" step="0.01"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className="w-24 border-2 border-blue-400 rounded-lg px-2 py-1 text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="0.00"
        />
        {saving
          ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          : <>
              <button onMouseDown={handleSave} className="p-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onMouseDown={handleCancel} className="p-1 rounded-md bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 transition">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
        }
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
      title="Click to edit amount"
    >
      {rawAmount !== '' && rawAmount !== null && rawAmount !== undefined
        ? <span className="font-bold text-gray-800 tabular-nums text-sm">
            ₹{parseFloat(rawAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        : <span className="text-gray-400 text-xs italic">Add amount</span>
      }
      <svg className="w-3 h-3 text-gray-300 group-hover:text-blue-400 transition opacity-0 group-hover:opacity-100"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
      </svg>
    </button>
  );
};

// ─── PAGINATION ───────────────────────────────────────────────────────────────
const Pagination = ({ page, totalPages, total, limit, onPageChange, loading }) => {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 px-1">
      <p className="text-sm text-gray-500 text-center sm:text-left">
        Showing <span className="font-semibold text-gray-700">{from}–{to}</span> of{' '}
        <span className="font-semibold text-gray-700">{total}</span> registrations
      </p>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <button onClick={() => onPageChange(1)} disabled={page === 1 || loading}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1 || loading}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce((acc, p, idx, arr) => {
            if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
            acc.push(p);
            return acc;
          }, [])
          .map((item, idx) =>
            item === '...'
              ? <span key={`e-${idx}`} className="px-2 text-gray-400 text-sm">…</span>
              : <button key={item} onClick={() => onPageChange(item)} disabled={loading}
                  className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition border ${
                    item === page ? 'bg-green-600 text-white border-green-600 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  } disabled:cursor-not-allowed`}>
                  {item}
                </button>
          )}
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages || loading}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages || loading}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const RegistrationList = () => {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReg, setSelectedReg] = useState(null);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchDebounce = useRef(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleInlineUpdate = useCallback((regId, changes) => {
  const apply = (reg) => {
    if (reg._id !== regId) return reg;
    const updated = { ...reg };
    if ('amount' in changes) updated.amount = changes.amount;
    if ('effectivePaymentStatus' in changes) {
      updated.effectivePaymentStatus = changes.effectivePaymentStatus;
    }
    return updated;
  };
  setRegistrations(prev => prev.map(apply));
  setSelectedReg(prev => prev ? apply(prev) : prev);
}, []);


  const fetchRegistrations = useCallback(async (pageNum = 1, search = '', filter = 'all') => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;
      const params = new URLSearchParams({
        page: pageNum, limit: LIMIT,
        ...(search && { search }),
        ...(filter !== 'all' && { paymentFilter: filter })
      });
      const response = await publicApi.get(`/api/tickets?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setRegistrations(response.data.tickets);
        setPage(response.data.page);
        setTotalPages(response.data.totalPages);
        setTotal(response.data.total);
      }
    } catch { toast.error('Failed to load registrations'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRegistrations(1, '', 'all'); }, [fetchRegistrations]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearchTerm(value);
      fetchRegistrations(1, value, paymentFilter);
    }, 400);
  };

  const clearSearch = () => { setSearchInput(''); setSearchTerm(''); fetchRegistrations(1, '', paymentFilter); };
  const handleFilterChange = (f) => { setPaymentFilter(f); fetchRegistrations(1, searchTerm, f); };
  const handlePageChange = (p) => {
    if (p < 1 || p > totalPages) return;
    fetchRegistrations(p, searchTerm, paymentFilter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await publicApi.delete(`/api/tickets/${deleteTarget._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        toast.success(`Ticket ${deleteTarget.ticketId} deleted`);
        if (selectedReg?._id === deleteTarget._id) setSelectedReg(null);
        const newTotalPages = Math.ceil((total - 1) / LIMIT);
        fetchRegistrations(page > newTotalPages ? Math.max(1, newTotalPages) : page, searchTerm, paymentFilter);
      } else { toast.error(response.data.message || 'Delete failed'); }
    } catch { toast.error('Failed to delete registration'); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: 1, limit: 99999,
        ...(searchTerm && { search: searchTerm }),
        ...(paymentFilter !== 'all' && { paymentFilter })
      });
      const response = await publicApi.get(`/api/tickets?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.data.success || !response.data.tickets.length) return toast.error('No data to export');
      const allTickets = response.data.tickets;
      const safe = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
      const dynKeys = new Set();
      allTickets.forEach(r => r.flowData && Object.entries(r.flowData).forEach(([k, v]) => {
        if (k !== 'flow_token' && v && String(v).trim()) dynKeys.add(k);
      }));
      const dynamicColumns = Array.from(dynKeys).sort();
      const headers = [
        'Ticket ID', 'Order ID', 'Customer Name', 'Phone', 'Participants',
        'Ticket Status', 'Payment Status', 'Amount',
        'Ticket Sent', 'Created Date', 'Check-in Time',
        ...dynamicColumns.map(k => k.toUpperCase().replace(/_/g, ' '))
      ];
      const rows = allTickets.map(reg => {
        const o = reg.order;
        return [
          safe(reg.ticketId), safe(reg.orderId || 'N/A'), safe(reg.customerName),
          safe(reg.customerPhone), safe(reg.participantCount || 1), safe(reg.status),
          safe(
          reg.effectivePaymentStatus === 'completed' || reg.effectivePaymentStatus === 'paid'
            ? 'Paid'
            : 'Unpaid'
        ),

         safe(reg.amount != null ? `₹${reg.amount}` : '—'),
          safe(o?.metadata?.ticketsGenerated ? 'Yes' : 'No'),
          safe(new Date(reg.createdAt).toLocaleString()),
          safe(reg.checkInTime ? new Date(reg.checkInTime).toLocaleString() : '-'),
          ...dynamicColumns.map(k => safe(reg.flowData?.[k] || ''))
        ].join(',');
      });
      const csvString = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `registrations_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast.success(`Exported ${allTickets.length} registrations`);
    } catch { toast.error('Export failed'); }
    finally { setIsExporting(false); }
  };

  const getStatusColor = (s) => ({
    active: 'bg-green-100 text-green-700',
    used: 'bg-gray-200 text-gray-600',
    pending_payment: 'bg-yellow-100 text-yellow-700',
  }[s] || 'bg-blue-50 text-blue-600');

  const MobileCard = ({ reg }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 bg-blue-100 rounded-lg flex items-center justify-center">
            <Ticket className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">{reg.ticketId}</p>
            <p className="text-xs text-gray-500">{reg.customerPhone}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase ${getStatusColor(reg.status)}`}>
          {reg.status}
        </span>
      </div>
      <p className="font-semibold text-gray-800 mb-3">{reg.customerName || 'Guest'}</p>
     <div className="mb-3 pb-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">
          🎟️ Free Ticket
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-medium text-gray-700">
            {reg.participantCount || 1} Participant{(reg.participantCount || 1) > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          <span>{new Date(reg.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setSelectedReg(reg)}
          className="flex-1 flex items-center justify-center gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 py-2.5 rounded-lg transition font-medium text-sm border border-blue-100">
          <Eye className="w-4 h-4" /> View <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => setDeleteTarget(reg)}
          className="flex items-center justify-center gap-1.5 text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-lg transition font-medium text-sm border border-red-100">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (loading && registrations.length === 0) {
    return <div className="flex justify-center items-center h-96"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>;
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto pb-28 sm:pb-6">
      <div className="flex flex-col gap-3 mb-4 md:mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">Registration Entries</h2>
          <p className="text-gray-500 text-xs md:text-sm mt-1">Total: {total} registrations</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
           <div className="bg-white border border-gray-200 rounded-lg flex items-center px-3 py-2.5 w-full sm:flex-1 shadow-sm min-w-0">
            {loading
              ? <Loader2 className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0 animate-spin" />
              : <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />}
            <input placeholder="Search name, phone, ticket..."
              className="outline-none text-sm w-full bg-transparent"
              value={searchInput} onChange={handleSearchChange} />
            {searchInput && (
              <button onClick={clearSearch} className="ml-2 text-gray-400 hover:text-gray-600">
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
            <button onClick={() => fetchRegistrations(page, searchTerm, paymentFilter)} disabled={loading}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg shadow-sm transition hover:bg-gray-50 text-sm font-medium disabled:opacity-50 flex-shrink-0">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={handleExportCSV} disabled={total === 0 || isExporting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg shadow-sm transition text-sm font-medium disabled:opacity-50 whitespace-nowrap flex-shrink-0">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? 'Exporting...' : `Export (${total})`}
            </button>
          </div>
        </div>
      </div>

      {searchTerm && (
        <div className="mb-4 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          🔍 Found <span className="font-bold text-blue-700">{total}</span> result{total !== 1 ? 's' : ''} for "{searchTerm}"
        </div>
      )}

      {/* Mobile */}
      <div className="block lg:hidden pb-2">
        {loading
          ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>
          : registrations.length === 0
            ? <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Ticket className="w-6 h-6 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No registrations found</p>
              </div>
            : <div className="grid gap-3">{registrations.map(reg => <MobileCard key={reg._id} reg={reg} />)}</div>
        }
        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={handlePageChange} loading={loading} />}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Ticket ID', 'Customer', 'Participants', 'Generated On', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-gray-100 transition-opacity ${loading ? 'opacity-50' : ''}`}>
              {registrations.length === 0
                ? <tr>
                    <td colSpan="8" className="px-6 py-10 text-center text-gray-500">
                      {loading ? <div className="flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div> : 'No registrations found.'}
                    </td>
                  </tr>
                : registrations.map(reg => (

                  <tr key={reg._id} className="hover:bg-gray-50/70 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Ticket className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span className="font-bold text-gray-900">{reg.ticketId}</span>
                        </div>
                        {reg.orderId && <div className="text-[11px] text-gray-400 mt-0.5 ml-5">Order #{reg.orderId}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{reg.customerName || 'Guest'}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{reg.customerPhone}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-semibold text-gray-700">{reg.participantCount || 1}</span>
                        </div>
                      </td>

                     <td className="px-5 py-4 text-gray-500 text-sm whitespace-nowrap">
                        {new Date(reg.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${getStatusColor(reg.status)}`}>
                          {reg.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedReg(reg)}
                            className="text-blue-600 hover:text-blue-800 text-xs border border-blue-100 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1 font-medium">
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                          <button onClick={() => setDeleteTarget(reg)}
                            className="text-red-500 hover:text-red-700 text-xs border border-red-100 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1 font-medium">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-gray-100 px-6 py-4">
            <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={handlePageChange} loading={loading} />
          </div>
        )}
      </div>

      {/* DELETE MODAL */}
      {deleteTarget && (
        <DeleteConfirmModal reg={deleteTarget} onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)} isDeleting={isDeleting} />
      )}

      {/* DETAIL MODAL */}
      {selectedReg && (() => {
        const order = selectedReg.order;
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4">
            <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 md:p-6 relative shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <button onClick={() => setSelectedReg(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10">
                <XCircle className="w-6 h-6" />
              </button>
              <div className="md:hidden w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 flex-shrink-0" />
              <div className="flex items-center gap-3 mb-4 pr-8">
                <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Ticket className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{selectedReg.ticketId}</h3>
                  <p className="text-xs text-gray-500">
                    {selectedReg.orderId ? `Order #${selectedReg.orderId}` : 'Free Entry — No Order'}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mb-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{selectedReg.customerName || 'Guest'}</p>
                    <p className="text-sm text-gray-500">{selectedReg.customerPhone}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(selectedReg.status)}`}>
                    {selectedReg.status}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2 space-y-2.5">
                 <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 font-medium flex-shrink-0">Ticket Type</span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      🎟️ Free Ticket
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 font-medium flex-shrink-0">Amount</span>
                    <InlineAmountEditor reg={selectedReg} onUpdate={handleInlineUpdate} />
                  </div>
                  {order?.confirmedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-medium">Confirmed At</span>
                      <span className="text-xs text-gray-700">{new Date(order.confirmedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {(selectedReg.participantCount || 1) > 1 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-center gap-2 flex-shrink-0">
                  <Users className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-blue-900">{selectedReg.participantCount} Participants</p>
                    <p className="text-xs text-blue-600">Group booking</p>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="space-y-4 pr-1">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-3 tracking-wider">Submitted Details</p>
                    {selectedReg.flowData
                      ? Object.entries(selectedReg.flowData).map(([key, value]) => {
                          if (key === 'flow_token') return null;
                          return (
                            <div key={key} className="flex justify-between py-2 border-b border-gray-100 last:border-0 gap-4">
                              <span className="text-sm text-gray-600 capitalize font-medium flex-shrink-0">{key.replace(/_/g, ' ')}</span>
                              <span className="text-sm text-gray-900 font-bold text-right break-words min-w-0">{String(value)}</span>
                            </div>
                          );
                        })
                      : <p className="text-sm text-gray-500">No details available</p>
                    }
                  </div>
                  {selectedReg.status === 'used' && (
                    <div className="bg-green-50 p-3 rounded-lg border border-green-100 text-center">
                      <p className="text-green-800 text-sm font-medium">Checked In</p>
                      <p className="text-green-600 text-xs">{selectedReg.updatedAt ? new Date(selectedReg.updatedAt).toLocaleString() : '-'}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Generated on {new Date(selectedReg.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
                <button onClick={() => { setSelectedReg(null); setDeleteTarget(selectedReg); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition font-medium text-sm">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button onClick={() => setSelectedReg(null)}
                  className="flex-1 bg-gray-900 text-white py-3 rounded-xl hover:bg-gray-800 transition font-medium">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default RegistrationList;

