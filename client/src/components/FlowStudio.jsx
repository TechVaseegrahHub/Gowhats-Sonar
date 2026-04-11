// FlowStudio.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ClipboardCheck, Copy, FileJson, GitBranch,
  KeyRound, Link2, ListChecks, Loader2, Phone, Plus, RefreshCw,
  Rocket, Save, Server, ShieldCheck, Sparkles, Trash2, Settings,
  Layers, ArrowRight, CheckCircle2, Circle, ExternalLink, Zap, X,
  ChevronRight, MoreVertical, Search, Bell, User, TrendingUp,
  BarChart3, Globe, Lock, Unlock, Eye, Code2, Workflow,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../utils/axios';
import KeyGenerator from './KeyGenerator.jsx';
import FlowTriggersPanel from './FlowTriggersPanel.jsx';

/* ─── Constants ─── */
const TABS = [
  { id: 'builder', label: 'Builder', icon: Workflow },
  { id: 'setup',   label: 'Setup',   icon: Settings },
  { id: 'triggers',label: 'Triggers',icon: Zap },
  { id: 'activity',label: 'Activity', icon: Activity },
];

const EMPTY_NEW_FLOW = { name: '', templateKey: 'lead_generation', description: '' };

/* ─── Helpers ─── */
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function statusColor(s) {
  switch (String(s||'').toLowerCase()) {
    case 'published': case 'healthy':   return { dot:'bg-emerald-500', badge:'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
    case 'draft':     case 'pending':   return { dot:'bg-amber-400',   badge:'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
    case 'error':     case 'blocked':   return { dot:'bg-red-500',     badge:'bg-red-50 text-red-700 ring-1 ring-red-200' };
    default:                            return { dot:'bg-slate-400',   badge:'bg-slate-100 text-slate-600 ring-1 ring-slate-200' };
  }
}

function metaSyncLabel(flow) {
  if (flow?.meta?.status) return String(flow.meta.status).toLowerCase();
  if (flow?.meta?.syncStatus) return String(flow.meta.syncStatus).replace(/_/g,' ');
  return 'not synced';
}

/* ─── Tiny UI atoms ─── */
function Dot({ status }) {
  const { dot } = statusColor(status);
  return <span className={`inline-block h-2 w-2 rounded-full ${dot} shrink-0`} />;
}

function Chip({ children, status, xs }) {
  const { badge } = statusColor(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold capitalize ${xs ? 'text-[10px]' : 'text-xs'} ${badge}`}>
      {children}
    </span>
  );
}

function Btn({ variant='ghost', size='md', icon: Icon, children, className='', ...p }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';
  const sz = { xs:'text-xs px-2.5 py-1.5 rounded-lg', sm:'text-sm px-3 py-2 rounded-xl', md:'text-sm px-4 py-2.5 rounded-xl', lg:'text-base px-5 py-3 rounded-xl' }[size];
  const v = {
    primary:  'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/25',
    danger:   'bg-rose-50 text-rose-600 hover:bg-rose-100 ring-1 ring-rose-200',
    outline:  'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
    ghost:    'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
    success:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100',
  }[variant];
  return (
    <button type="button" {...p} className={`${base} ${sz} ${v} ${className}`}>
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Inp({ className='', ...p }) {
  return <input {...p} className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/10 ${className}`} />;
}

function Sel({ children, className='', ...p }) {
  return <select {...p} className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/10 ${className}`}>{children}</select>;
}

function Txa({ className='', ...p }) {
  return <textarea {...p} className={`w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/10 ${className}`} />;
}

function Toggle({ checked, onChange }) {
  return (
    <label className="relative cursor-pointer select-none">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`h-6 w-11 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`} />
      <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </label>
  );
}

/* ─── Modal shell ─── */
function Modal({ open, onClose, title, subtitle, wide, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 flex h-full max-h-screen w-full flex-col rounded-none bg-white shadow-2xl shadow-slate-900/20 sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:border sm:border-slate-200/80 ${wide ? 'sm:max-w-6xl' : 'sm:max-w-lg'}`}>
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 shrink-0 sm:px-8 sm:py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-600 mb-1">Flow Studio</p>
            <h2 className="text-lg font-black text-slate-900 sm:text-xl">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ─── Builder editor inside modal ─── */
function BuilderModal({
  draftFlow, templates, samplePayloadText, saving, publishing,
  onClose, onClone, onArchive, onFlowChange, onBuilderChange,
  onSamplePayloadChange, onMappingChange, onAddMappingRow, onRemoveMappingRow,
  onSave, onPublish,
}) {
  if (!draftFlow) return null;
  const [panel, setPanel] = useState('json'); // json | settings | payload | mapping

  const PANELS = [
    { id:'json',     label:'Flow JSON',  icon:Code2 },
    { id:'settings', label:'Settings',   icon:Settings },
    { id:'payload',  label:'Payload',    icon:Server },
    { id:'mapping',  label:'Mapping',    icon:Link2 },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="scrollbar-hide -mx-1 flex items-center gap-1 overflow-x-auto px-1 sm:mx-0 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-1">
          {PANELS.map(p => (
            <button key={p.id} type="button" onClick={() => setPanel(p.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${panel===p.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800 hover:bg-slate-50 sm:bg-transparent sm:ring-0'}`}>
              <p.icon className="h-3.5 w-3.5" />{p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Chip status={draftFlow.status}>{draftFlow.status}</Chip>
          <span className="text-xs text-slate-400">v{draftFlow.version||0}</span>
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <Btn variant="ghost" size="xs" icon={Copy} onClick={onClone}>Clone</Btn>
          <Btn variant="danger" size="xs" icon={Trash2} onClick={onArchive}>Archive</Btn>
          <Btn variant="outline" size="xs" icon={saving?Loader2:Save} onClick={onSave} disabled={saving}>Save</Btn>
          <Btn variant="primary" size="xs" icon={publishing?Loader2:Rocket} onClick={onPublish} disabled={publishing}>Publish</Btn>
        </div>
      </div>

      {draftFlow.meta?.lastError && (
        <div className="mx-4 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 shrink-0 sm:mx-8">
          <strong>Sync Error:</strong> {draftFlow.meta.lastError}
        </div>
      )}

      {/* panel content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">

        {panel === 'json' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Flow JSON Structure</h3>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg font-mono">application/json</span>
            </div>
            <Txa
              rows={28}
              value={draftFlow.flowJson||''}
              onChange={e => onFlowChange('flowJson', e.target.value)}
              className="font-mono text-xs leading-relaxed"
              style={{ minHeight: 560 }}
            />
            {/* screen map */}
            {(draftFlow.builder?.screens||[]).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Screen Map</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {draftFlow.builder.screens.map(s => (
                    <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.id}</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-800">{s.title}</p>
                      {s.summary && <p className="mt-0.5 text-xs text-slate-500">{s.summary}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {panel === 'settings' && (
          <div className="max-w-2xl space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Flow Name">
                <Inp value={draftFlow.name||''} onChange={e => onFlowChange('name', e.target.value)} />
              </Field>
              <Field label="Meta Flow ID">
                <Inp value={draftFlow.metaFlowId||''} onChange={e => onFlowChange('metaFlowId', e.target.value)} placeholder="Auto on publish" />
              </Field>
              <Field label="Template">
                <Sel value={draftFlow.templateKey||''} onChange={e => onFlowChange('templateKey', e.target.value)}>
                  {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </Sel>
              </Field>
              <Field label="Category">
                <Sel value={draftFlow.category||'custom'} onChange={e => onFlowChange('category', e.target.value)}>
                  {['lead_generation','appointment_booking','customer_support','shopping','survey','registration','custom'].map(c => (
                    <option key={c} value={c}>{c.replace(/_/g,' ')}</option>
                  ))}
                </Sel>
              </Field>
              <Field label="Entry Screen">
                <Inp value={draftFlow.builder?.entryScreen||''} onChange={e => onBuilderChange('entryScreen', e.target.value)} />
              </Field>
            </div>
            <Field label="Description">
              <Txa rows={3} value={draftFlow.description||''} onChange={e => onFlowChange('description', e.target.value)} placeholder="What does this flow do?" />
            </Field>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Requires Endpoint</p>
                <p className="text-xs text-slate-400 mt-0.5">Enable for server-driven data exchange</p>
              </div>
              <Toggle checked={Boolean(draftFlow.requiresEndpoint)} onChange={e => onFlowChange('requiresEndpoint', e.target.checked)} />
            </div>
          </div>
        )}

        {panel === 'payload' && (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Sample Payload</h3>
              <span className="text-xs text-slate-400">Must be valid JSON</span>
            </div>
            <Txa rows={20} value={samplePayloadText} onChange={e => onSamplePayloadChange(e.target.value)} className="font-mono text-xs leading-relaxed" style={{ minHeight:400 }} />
          </div>
        )}

        {panel === 'mapping' && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Response Mapping</h3>
              <Btn variant="success" size="xs" icon={Plus} onClick={onAddMappingRow}>Add Row</Btn>
            </div>
            {(draftFlow.builder?.responseMapping||[]).length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                <Link2 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">No mappings yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="hidden gap-2 px-3 py-1.5 sm:grid sm:grid-cols-[1fr_1fr_60px_40px]">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Source Field</span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Field</span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Req</span>
                  <span />
                </div>
                {(draftFlow.builder.responseMapping).map((m, i) => (
                  <div key={i} className="grid items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_60px_40px] sm:p-2">
                    <div>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 sm:hidden">Source Field</span>
                      <Inp value={m.sourceField||''} onChange={e => onMappingChange(i,'sourceField',e.target.value)} placeholder="source" className="text-xs py-2" />
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 sm:hidden">Target Field</span>
                      <Inp value={m.targetField||''} onChange={e => onMappingChange(i,'targetField',e.target.value)} placeholder="target" className="text-xs py-2" />
                    </div>
                    <div className="flex items-center justify-between sm:block">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 sm:hidden">Required</span>
                      <Toggle checked={Boolean(m.required)} onChange={e => onMappingChange(i,'required',e.target.checked)} />
                    </div>
                    <button type="button" onClick={() => onRemoveMappingRow(i)} className="flex h-8 items-center justify-center gap-1 rounded-lg bg-white px-3 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition-colors hover:text-red-500 hover:bg-red-50 sm:h-8 sm:w-8 sm:bg-transparent sm:px-0 sm:text-base sm:font-normal sm:ring-0">
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sm:hidden">Remove Row</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function FlowStudio({ embedded = false }) {
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [creating,       setCreating]       = useState(false);
  const [publishing,     setPublishing]     = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [activeTab,      setActiveTab]      = useState('builder');
  const [dashboard,      setDashboard]      = useState(null);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [draftFlow,      setDraftFlow]      = useState(null);
  const [samplePayloadText, setSamplePayloadText] = useState('{}');
  const [setupForm,      setSetupForm]      = useState({ appId:'', linkedPhoneNumberId:'' });
  const [newFlowForm,    setNewFlowForm]    = useState(EMPTY_NEW_FLOW);
  const [showCreate,     setShowCreate]     = useState(false);
  const [showBuilder,    setShowBuilder]    = useState(false);

  const templates    = dashboard?.templates || [];
  const flows        = dashboard?.flows     || [];
  const selectedFlow = useMemo(() => flows.find(f => f._id === selectedFlowId) || flows[0] || null, [flows, selectedFlowId]);

  /* effects */
  useEffect(() => { loadDashboard(); }, []);

  useEffect(() => {
    if (!selectedFlow) { setDraftFlow(null); setSamplePayloadText('{}'); return; }
    setSelectedFlowId(selectedFlow._id);
    setDraftFlow({
      ...selectedFlow,
      builder: {
        entryScreen:     selectedFlow.builder?.entryScreen || 'WELCOME',
        previewMode:     selectedFlow.builder?.previewMode || 'mobile',
        screens:         Array.isArray(selectedFlow.builder?.screens) ? selectedFlow.builder.screens : [],
        samplePayload:   selectedFlow.builder?.samplePayload || {},
        responseMapping: Array.isArray(selectedFlow.builder?.responseMapping) ? selectedFlow.builder.responseMapping : [],
      },
    });
    setSamplePayloadText(JSON.stringify(selectedFlow.builder?.samplePayload||{}, null, 2));
  }, [selectedFlow]);

  useEffect(() => {
    if (dashboard?.setup) setSetupForm({ appId: dashboard.setup.appId||'', linkedPhoneNumberId: dashboard.setup.linkedPhoneNumberId||'' });
  }, [dashboard?.setup]);

  useEffect(() => {
    if (!showCreate && !showBuilder) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = e => { if (e.key==='Escape') { if (showCreate) setShowCreate(false); else setShowBuilder(false); } };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [showCreate, showBuilder]);

  /* api handlers — unchanged logic */
  async function loadDashboard(pref='') {
    try {
      setLoading(true);
      const r = await api.get('/api/flow-studio/dashboard');
      setDashboard(r.data);
      const next = pref || selectedFlowId || r.data.flows?.[0]?._id || '';
      setSelectedFlowId(r.data.flows?.some(f=>f._id===next) ? next : r.data.flows?.[0]?._id||'');
    } catch(e) { toast.error(e.response?.data?.message||'Failed to load'); }
    finally { setLoading(false); }
  }

  async function handleCreateFlow() {
    if (!newFlowForm.name.trim()) { toast.error('Enter a flow name'); return; }
    try {
      setCreating(true);
      const r = await api.post('/api/flow-studio/flows', newFlowForm);
      toast.success(r.data?.message||'Flow created');
      setNewFlowForm(EMPTY_NEW_FLOW);
      setActiveTab('builder');
      setShowCreate(false);
      setShowBuilder(true);
      await loadDashboard(r.data?.flow?._id);
    } catch(e) { toast.error(e.response?.data?.message||'Failed to create'); }
    finally { setCreating(false); }
  }

  function buildPayload() {
    if (!draftFlow?._id) throw new Error('Select a flow first');
    let sp = {};
    try { sp = samplePayloadText.trim() ? JSON.parse(samplePayloadText) : {}; } catch { throw new Error('Sample payload must be valid JSON'); }
    return { name:draftFlow.name, description:draftFlow.description, category:draftFlow.category, templateKey:draftFlow.templateKey, metaFlowId:draftFlow.metaFlowId, requiresEndpoint:draftFlow.requiresEndpoint, linkedPhoneNumberId:draftFlow.linkedPhoneNumberId, flowJson:draftFlow.flowJson, builder:{...draftFlow.builder, samplePayload:sp} };
  }

  async function handleSave() {
    try { setSaving(true); const r = await api.put(`/api/flow-studio/flows/${draftFlow._id}`, buildPayload()); toast.success(r.data?.message||'Saved'); await loadDashboard(draftFlow._id); }
    catch(e) { toast.error(e.response?.data?.message||e.message||'Failed'); }
    finally { setSaving(false); }
  }

  async function handlePublish() {
    try {
      setPublishing(true);
      await api.put(`/api/flow-studio/flows/${draftFlow._id}`, buildPayload());
      const r = await api.post(`/api/flow-studio/flows/${draftFlow._id}/publish`, { note:`Published ${new Date().toISOString()}` });
      toast.success(r.data?.message||'Published');
      await loadDashboard(draftFlow._id);
    } catch(e) { toast.error(e.response?.data?.message||e.message||'Failed'); await loadDashboard(draftFlow?._id||selectedFlowId); }
    finally { setPublishing(false); }
  }

  async function handleClone() {
    if (!draftFlow?._id) { toast.error('Select a flow'); return; }
    try { const r = await api.post(`/api/flow-studio/flows/${draftFlow._id}/clone`); toast.success(r.data?.message||'Cloned'); setShowBuilder(true); await loadDashboard(r.data?.flow?._id); }
    catch(e) { toast.error(e.response?.data?.message||'Failed'); }
  }

  async function handleArchive() {
    if (!draftFlow?._id) return;
    if (!window.confirm(`Archive "${draftFlow.name}"?`)) return;
    try { await api.delete(`/api/flow-studio/flows/${draftFlow._id}`); toast.success('Archived'); setShowBuilder(false); await loadDashboard(''); }
    catch(e) { toast.error(e.response?.data?.message||'Failed'); }
  }

  async function handleSaveSetup() {
    try { setSaving(true); const r = await api.post('/api/flow-studio/setup', setupForm); setDashboard(r.data); toast.success(r.data?.message||'Saved'); }
    catch(e) { toast.error(e.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  }

  async function handleHealthCheck() {
    try { setHealthChecking(true); const r = await api.post('/api/flow-studio/health-check'); toast.success(`${r.data?.message||'Healthy'}${r.data?.latencyMs?` (${r.data.latencyMs}ms)`:''}`); await loadDashboard(selectedFlowId); }
    catch(e) { toast.error(e.response?.data?.message||'Failed'); await loadDashboard(selectedFlowId); }
    finally { setHealthChecking(false); }
  }

  async function copyEndpoint() {
    try { await navigator.clipboard.writeText(dashboard?.setup?.endpointUri||''); toast.success('Copied!'); }
    catch { toast.error('Failed to copy'); }
  }

  function chooseFlow(flowId, { openBuilder=false, tab=activeTab } = {}) {
    if (!flowId) return;
    setSelectedFlowId(flowId);
    setActiveTab(tab);
    if (openBuilder) setShowBuilder(true);
  }

  function setFlow(f, v) { setDraftFlow(p => ({...p, [f]:v})); }
  function setBuilder(f, v) { setDraftFlow(p => ({...p, builder:{...p.builder, [f]:v}})); }
  function setMapping(i, f, v) { setDraftFlow(p => ({...p, builder:{...p.builder, responseMapping:p.builder.responseMapping.map((m,j) => j===i?{...m,[f]:v}:m)}})); }
  function addMapping() { setDraftFlow(p => ({...p, builder:{...p.builder, responseMapping:[...(p.builder.responseMapping||[]),{sourceField:'',targetField:'',required:false}]}})); }
  function removeMapping(i) { setDraftFlow(p => ({...p, builder:{...p.builder, responseMapping:p.builder.responseMapping.filter((_,j)=>j!==i)}})); }

  /* loading */
  if (loading && !dashboard) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/30 mb-4">
          <GitBranch className="h-8 w-8 text-white" />
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600 mx-auto" />
        <p className="mt-3 text-sm font-medium text-slate-500">Loading Flow Studio…</p>
      </div>
    </div>
  );

  const summary = dashboard?.summary || {};
  const setup   = dashboard?.setup   || {};

  return (
    <div className={`${embedded ? 'bg-[#f8fafc]' : 'min-h-screen bg-[#f8fafc]'}`}>

      {/* ══════ TOP NAV ══════ */}
      <nav className="sticky top-0 z-50 flex min-h-[3.5rem] items-center gap-3 border-b border-slate-200 bg-white px-3 shadow-sm sm:gap-4 sm:px-6">
        {/* brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 shadow shadow-emerald-600/30">
            <GitBranch className="h-4 w-4 text-white" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-black text-slate-900 tracking-tight">Flow Studio</p>
            <p className="text-[10px] text-slate-400 font-medium">WhatsApp Builder</p>
          </div>
        </div>

        {/* divider */}
        <div className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />

        {/* summary pills */}
        <div className="hidden sm:flex items-center gap-3">
          {[
            { label:`${summary.totalFlows??0} Total`,     color:'text-slate-700' },
            { label:`${summary.publishedFlows??0} Live`,  color:'text-emerald-700' },
            { label:`${summary.draftFlows??0} Draft`,     color:'text-amber-700' },
          ].map(s => (
            <span key={s.label} className={`text-xs font-bold ${s.color}`}>{s.label}</span>
          ))}
        </div>

        <div className="flex-1" />

        {/* actions */}
        <div className="flex items-center gap-2">
          {/* health status dot */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
            <Dot status={setup.healthStatus} />
            {setup.healthStatus || 'pending'}
          </div>
          <Btn variant="ghost" size="sm" icon={RefreshCw} onClick={() => loadDashboard(selectedFlowId)} />
          <Btn variant="outline" size="sm" icon={healthChecking ? Loader2 : ClipboardCheck} onClick={handleHealthCheck} disabled={healthChecking}>
            <span className="hidden sm:inline">Health Check</span>
          </Btn>
        </div>
      </nav>

      {/* ══════ PAGE BODY ══════ */}
      <div className={`${embedded ? 'flex flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row' : 'flex h-[calc(100vh-3.5rem)]'}`}>

        {/* ══ LEFT RAIL ══ */}
        <aside className="hidden lg:flex w-[260px] xl:w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white overflow-hidden">

          {/* create CTA */}
          <div className="px-4 pt-5 pb-4">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3.5 text-left shadow-md shadow-emerald-600/25 hover:from-emerald-700 hover:to-emerald-600 transition-all group"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Plus className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">New Flow</p>
                <p className="text-[11px] text-emerald-100">Start from a template</p>
              </div>
              <ChevronRight className="h-4 w-4 text-emerald-200 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* endpoint pill */}
          <div className="mx-4 mb-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Endpoint</span>
              <Dot status={setup.healthStatus} />
            </div>
            <p className="text-xs font-mono text-slate-600 truncate" title={setup.endpointUri}>
              {setup.endpointUri || 'Not configured'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* flow list header */}
            <div className="flex items-center justify-between mt-4 px-4 py-2 border-t border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-600">Flows</span>
              </div>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{flows.length}</span>
            </div>

            {/* flow list */}
            <div className="py-2 px-2 mt-4">
              {flows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Layers className="h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-xs text-slate-400 font-medium">No flows yet.<br />Create your first one.</p>
                </div>
              ) : flows.map(flow => {
                const active = selectedFlow?._id === flow._id;
                const { badge } = statusColor(flow.status);
                return (
                  <button
                    key={flow._id}
                    type="button"
                    onClick={() => chooseFlow(flow._id, { openBuilder:true, tab:'builder' })}
                    className={`group w-full flex items-start gap-3 rounded-xl px-3 py-3 mb-1 text-left transition-all ${active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-slate-50'}`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 ${active ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <FileJson className={`h-4 w-4 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${active ? 'text-emerald-800' : 'text-slate-800'}`}>{flow.name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge}`}>{flow.status}</span>
                        <span className="text-[10px] text-slate-400 font-medium">v{flow.version||0}</span>
                      </div>
                    </div>
                    {active && <div className="h-2 w-2 rounded-full bg-emerald-500 mt-2 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* checklist */}
            <div className="border-t border-slate-100 bg-slate-50 mt-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Setup Checklist</span>
              </div>
              <div className="px-3 py-2 space-y-0.5">
                {(setup.checklist||[]).map(step => (
                  <div key={step.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg">
                    {step.done
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      : <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />}
                    <div>
                      <p className={`text-xs font-semibold leading-snug ${step.done ? 'text-slate-700' : 'text-slate-400'}`}>{step.title}</p>
                      <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ══ MAIN PANEL ══ */}
        <main className={`flex-1 flex flex-col ${embedded ? 'min-h-0 overflow-visible lg:overflow-hidden' : 'overflow-hidden'}`}>
          <div className="lg:hidden sticky top-14 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="scrollbar-hide flex items-center gap-0 overflow-x-auto px-3">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const on = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold whitespace-nowrap transition-all ${on ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:hidden border-b border-slate-200 bg-white">
            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label:'Total', value:summary.totalFlows??0, tone:'text-slate-700' },
                  { label:'Live', value:summary.publishedFlows??0, tone:'text-emerald-700' },
                  { label:'Draft', value:summary.draftFlows??0, tone:'text-amber-700' },
                ].map(item => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                    <p className={`mt-1 text-lg font-black ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3.5 text-left shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-700 hover:to-emerald-600"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <Plus className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">New Flow</p>
                  <p className="text-[11px] text-emerald-100">Create and open the builder</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-emerald-200" />
              </button>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Active Flow" hint={flows.length ? 'Switch which flow this page is showing.' : 'Create a flow to start building.'}>
                  <Sel value={selectedFlowId || ''} onChange={e => chooseFlow(e.target.value)} disabled={flows.length===0}>
                    {flows.length === 0
                      ? <option value="">No flows yet</option>
                      : flows.map(flow => <option key={flow._id} value={flow._id}>{flow.name}</option>)}
                  </Sel>
                </Field>
                {selectedFlow && (
                  <Btn variant="primary" size="sm" icon={Layers} onClick={() => { setActiveTab('builder'); setShowBuilder(true); }} className="w-full sm:w-auto">
                    Open Builder
                  </Btn>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Endpoint</span>
                    <Dot status={setup.healthStatus} />
                  </div>
                  <p className="text-xs font-mono text-slate-600 break-all">{setup.endpointUri || 'Not configured'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selected Flow</span>
                    {selectedFlow && <Chip status={selectedFlow.status} xs>{selectedFlow.status}</Chip>}
                  </div>
                  <p className="text-sm font-bold text-slate-800">{selectedFlow?.name || 'No flow selected'}</p>
                  <p className="mt-1 text-xs text-slate-400">{selectedFlow ? `Version ${selectedFlow.version||0}` : 'Use the selector above to choose a flow.'}</p>
                </div>
              </div>

              {(setup.checklist||[]).length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                    <ListChecks className="h-4 w-4 text-slate-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Setup Checklist</span>
                  </div>
                  <div className="px-3 py-2">
                    {(setup.checklist||[]).map(step => (
                      <div key={step.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2.5">
                        {step.done
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                        <div>
                          <p className={`text-xs font-semibold leading-snug ${step.done ? 'text-slate-700' : 'text-slate-400'}`}>{step.title}</p>
                          <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{step.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* tab strip */}
          <div className="scrollbar-hide hidden items-center gap-0 overflow-x-auto border-b border-slate-200 bg-white px-3 lg:flex lg:px-6">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const on = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-4 text-sm font-bold whitespace-nowrap transition-all sm:px-5 ${on ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* scrollable content */}
          <div data-flow-studio-scroll className={`${embedded ? 'p-4 space-y-5 sm:p-6 lg:flex-1 lg:overflow-y-auto' : 'flex-1 overflow-y-auto p-4 space-y-5 sm:p-6'}`}>

            {/* ── BUILDER ── */}
            {activeTab === 'builder' && (
              !draftFlow ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center max-w-sm">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 mb-5">
                      <Workflow className="h-10 w-10 text-slate-300" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">No Flow Selected</h3>
                    <p className="text-sm text-slate-500 mb-5">Pick a flow from the selector above or create a brand-new one to get started.</p>
                    <Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Create New Flow</Btn>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* flow hero */}
                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                    {/* accent bar */}
                    <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-emerald-400" />
                    <div className="flex flex-col gap-4 p-4 sm:p-6 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-600/25">
                          <FileJson className="h-7 w-7 text-white" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5 mb-1">
                            <h2 className="text-2xl font-black text-slate-900">{draftFlow.name}</h2>
                            <Chip status={draftFlow.status}>{draftFlow.status}</Chip>
                            <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">Version {draftFlow.version||0}</span>
                          </div>
                          <p className="text-sm text-slate-500">Open the builder popup to edit JSON, payload, mappings, and publish.</p>
                          {draftFlow.description && <p className="mt-1 text-sm text-slate-600 italic">"{draftFlow.description}"</p>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0 sm:flex-row sm:flex-wrap sm:items-center">
                        <Btn variant="outline" size="sm" icon={Copy} onClick={handleClone} className="w-full justify-center sm:w-auto">Clone</Btn>
                        <Btn variant="danger"  size="sm" icon={Trash2} onClick={handleArchive} className="w-full justify-center sm:w-auto">Archive</Btn>
                        <Btn variant="primary" size="md" icon={Layers} onClick={() => setShowBuilder(true)} className="w-full justify-center sm:w-auto">
                          Open Builder
                        </Btn>
                      </div>
                    </div>

                    {draftFlow.meta?.lastError && (
                      <div className="mx-4 mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 sm:mx-6 sm:mb-5">
                        <strong>Sync Error:</strong> {draftFlow.meta.lastError}
                      </div>
                    )}
                  </div>

                  {/* 3-col info cards */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      { label:'Template', value: templates.find(t => t.key===draftFlow.templateKey)?.name || draftFlow.templateKey || 'Custom', icon:Layers, bg:'bg-emerald-50', iconColor:'text-emerald-600' },
                      { label:'Meta Flow ID', value: draftFlow.metaFlowId ? 'Connected' : 'Pending', icon:GitBranch, bg: draftFlow.metaFlowId ? 'bg-blue-50' : 'bg-amber-50', iconColor: draftFlow.metaFlowId ? 'text-blue-600' : 'text-amber-600' },
                      { label:'Entry Screen', value: draftFlow.builder?.entryScreen || 'Not Set', icon:ArrowRight, bg:'bg-slate-50', iconColor:'text-slate-600' },
                    ].map(c => (
                      <div key={c.label} className="rounded-2xl bg-white border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.bg}`}>
                          <c.icon className={`h-5 w-5 ${c.iconColor}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{c.label}</p>
                          <p className="mt-0.5 text-sm font-bold text-slate-800 truncate">{c.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* screen map */}
                  <div className="rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                      <GitBranch className="h-4 w-4 text-slate-400" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Screen Map</h3>
                        <p className="text-xs text-slate-400">Flow screen structure preview</p>
                      </div>
                    </div>
                    <div className="p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {(draftFlow.builder?.screens||[]).map(s => (
                        <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.id}</p>
                          <p className="mt-1 text-sm font-bold text-slate-800">{s.title}</p>
                          {s.summary && <p className="mt-1 text-xs text-slate-500">{s.summary}</p>}
                        </div>
                      ))}
                      {(draftFlow.builder?.screens||[]).length===0 && (
                        <div className="col-span-full rounded-xl border-2 border-dashed border-slate-200 py-10 text-center">
                          <Layers className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="mt-2 text-sm text-slate-400">No screens defined. Open builder to add screens.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* ── SETUP ── */}
            {activeTab === 'setup' && (
              <div className="space-y-5 max-w-4xl">
                {/* endpoint card */}
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-400" />
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                        <Server className="h-4.5 w-4.5 text-blue-600" style={{width:18,height:18}} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Endpoint Configuration</h3>
                        <p className="text-xs text-slate-400">Webhook URI and health monitoring</p>
                      </div>
                    </div>
                    <Btn variant="outline" size="sm" icon={Copy} onClick={copyEndpoint} className="w-full justify-center sm:w-auto">Copy URI</Btn>
                  </div>

                  <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Endpoint URI</p>
                      <code className="block text-xs font-mono text-slate-700 break-all bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                        {setup.endpointUri || 'Not configured'}
                      </code>
                      <p className="mt-2 text-xs text-slate-400">Paste this into Meta Flow endpoint settings.</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Health Status</p>
                      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Dot status={setup.healthStatus} />
                          <Chip status={setup.healthStatus}>{setup.healthStatus||'pending'}</Chip>
                        </div>
                        <span className="text-xs text-slate-400">{fmtDate(setup.lastHealthCheck)}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Run a health check after saving changes.</p>
                    </div>
                  </div>

                  <div className="grid gap-5 px-4 pb-4 sm:px-6 sm:pb-6 md:grid-cols-2">
                    <Field label="Meta App ID" hint="Your Meta application identifier">
                      <Inp value={setupForm.appId} onChange={e => setSetupForm(p => ({...p, appId:e.target.value}))} placeholder="e.g. 1234567890" />
                    </Field>
                    <Field label="Linked Phone Number ID" hint="WABA phone number ID">
                      <Inp value={setupForm.linkedPhoneNumberId} onChange={e => setSetupForm(p => ({...p, linkedPhoneNumberId:e.target.value}))} placeholder="e.g. 9876543210" />
                    </Field>
                  </div>

                  <div className="flex justify-stretch border-t border-slate-100 px-4 pb-4 pt-4 sm:justify-end sm:px-6 sm:pb-6 sm:pt-5">
                    <Btn variant="primary" icon={saving?Loader2:Save} onClick={handleSaveSetup} disabled={saving} className="w-full justify-center sm:w-auto">
                      Save Configuration
                    </Btn>
                  </div>
                </div>

                {/* key generator */}
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-violet-500 to-violet-400" />
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
                      <KeyRound className="h-4 w-4 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Encryption & Signing</h3>
                      <p className="text-xs text-slate-400">Manage secure keys for flow encryption</p>
                    </div>
                  </div>
                  <div className="p-4 sm:p-6"><KeyGenerator /></div>
                </div>
              </div>
            )}

            {/* ── TRIGGERS ── */}
            {activeTab === 'triggers' && (
              <FlowTriggersPanel
                triggers={dashboard?.triggers||[]}
                triggerSummary={dashboard?.triggerSummary||{}}
                availableMetaFlows={dashboard?.availableMetaFlows||[]}
                onRefresh={() => loadDashboard(selectedFlowId)}
              />
            )}

            {/* ── ACTIVITY ── */}
            {activeTab === 'activity' && (
              !selectedFlow ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="text-center">
                    <Activity className="mx-auto h-10 w-10 text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-500">Select a flow to view activity</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 max-w-5xl">
                  {/* stat strip */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label:'Last Updated',    value: fmtDate(selectedFlow.updatedAt),       color:'border-l-slate-400' },
                      { label:'Last Published',  value: fmtDate(selectedFlow.lastPublishedAt), color:'border-l-emerald-400' },
                      { label:'Endpoint Health', value: selectedFlow.endpoint?.healthStatus||'pending', isChip:true, color:'border-l-blue-400' },
                      { label:'Meta Sync',       value: metaSyncLabel(selectedFlow),           color:'border-l-violet-400' },
                    ].map(s => (
                      <div key={s.label} className={`rounded-2xl bg-white border border-slate-200 border-l-4 ${s.color} px-5 py-4 shadow-sm`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{s.label}</p>
                        {s.isChip
                          ? <Chip status={s.value}>{s.value}</Chip>
                          : <p className="text-sm font-bold text-slate-800 capitalize">{s.value}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-5 lg:grid-cols-5">
                    {/* publish history — wider */}
                    <div className="lg:col-span-3 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                        <Rocket className="h-4 w-4 text-slate-400" />
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Publish History</h3>
                          <p className="text-xs text-slate-400">All published versions of this flow</p>
                        </div>
                      </div>
                      <div className="p-5">
                        {(selectedFlow.publishHistory||[]).length === 0 ? (
                          <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
                            <Rocket className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                            <p className="text-sm font-bold text-slate-400">No versions yet</p>
                            <p className="text-xs text-slate-300 mt-1">Publish your flow to see history</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {selectedFlow.publishHistory.slice().reverse().map((e, i) => (
                              <div key={`${e.version}-${e.publishedAt}`} className={`flex items-start gap-4 rounded-xl border px-4 py-3.5 ${i===0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${i===0 ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                  <Zap className={`h-4 w-4 ${i===0 ? 'text-emerald-600' : 'text-slate-400'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-900">v{e.version}</span>
                                    {i===0 && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Latest</span>}
                                    <span className="text-xs text-slate-400">{fmtDate(e.publishedAt)}</span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-slate-500 truncate">{e.note||'Published from Flow Studio'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* side details */}
                    <div className="lg:col-span-2 space-y-4">
                      {[
                        { icon:Phone,     label:'Linked Phone',   value: selectedFlow.linkedPhoneNumberId || setup.linkedPhoneNumberId || 'Not linked', mono:false },
                        { icon:GitBranch, label:'Meta Flow ID',   value: selectedFlow.metaFlowId||'Not created yet', mono:true },
                        { icon:Server,    label:'Shared Endpoint',value: setup.endpointUri||'Not configured', mono:true },
                      ].map(item => (
                        <div key={item.label} className="rounded-2xl bg-white border border-slate-200 px-5 py-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <item.icon className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</span>
                          </div>
                          <p className={`text-sm text-slate-700 break-all ${item.mono ? 'font-mono text-xs' : 'font-semibold'}`}>{item.value}</p>
                        </div>
                      ))}

                      {selectedFlow.meta?.previewUrl && (
                        <a href={selectedFlow.meta.previewUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2.5 rounded-2xl bg-white border border-emerald-200 px-5 py-4 shadow-sm hover:bg-emerald-50 transition-colors group">
                          <ExternalLink className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm font-bold text-emerald-700">Open Meta Preview</span>
                          <ChevronRight className="h-4 w-4 text-emerald-400 ml-auto group-hover:translate-x-0.5 transition-transform" />
                        </a>
                      )}

                      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 px-5 py-5 shadow-md shadow-emerald-600/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-emerald-200" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Next Step</span>
                        </div>
                        <p className="text-sm font-semibold text-white leading-relaxed">
                          {selectedFlow.status==='draft'
                            ? 'Complete your setup, add flow JSON, then publish to Meta.'
                            : 'Send a test message and monitor your endpoint health.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </main>
      </div>

      {/* ══ BUILDER MODAL ══ */}
      <Modal
        open={showBuilder && activeTab==='builder' && Boolean(draftFlow)}
        onClose={() => setShowBuilder(false)}
        title={draftFlow?.name||'Flow Builder'}
        subtitle="Edit JSON, settings, payload and response mapping."
        wide
      >
        <BuilderModal
          draftFlow={draftFlow}
          templates={templates}
          samplePayloadText={samplePayloadText}
          saving={saving}
          publishing={publishing}
          onClose={() => setShowBuilder(false)}
          onClone={handleClone}
          onArchive={handleArchive}
          onFlowChange={setFlow}
          onBuilderChange={setBuilder}
          onSamplePayloadChange={setSamplePayloadText}
          onMappingChange={setMapping}
          onAddMappingRow={addMapping}
          onRemoveMappingRow={removeMapping}
          onSave={handleSave}
          onPublish={handlePublish}
        />
      </Modal>

      {/* ══ CREATE MODAL ══ */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Flow" subtitle="Choose a template and give your flow a name.">
        <div className="space-y-5 p-4 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Flow Name" hint="Unique — also used in Meta publishing.">
              <Inp autoFocus value={newFlowForm.name} onChange={e => setNewFlowForm(p => ({...p, name:e.target.value}))} placeholder="e.g. Event Registration" />
            </Field>
            <Field label="Starter Template" hint="Pick a template to pre-fill the JSON.">
              <Sel value={newFlowForm.templateKey} onChange={e => setNewFlowForm(p => ({...p, templateKey:e.target.value}))}>
                {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
              </Sel>
            </Field>
          </div>

          <Field label="Description" hint="Short note about what this flow does.">
            <Txa rows={3} value={newFlowForm.description} onChange={e => setNewFlowForm(p => ({...p, description:e.target.value}))} placeholder="Describe the purpose…" />
          </Field>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 mt-0.5">
              <Zap className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">What happens next</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">After creation this modal closes and the new flow opens directly in the builder popup for JSON editing, payload config, mapping, and publishing.</p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setShowCreate(false)} disabled={creating} className="w-full justify-center sm:w-auto">Cancel</Btn>
            <Btn variant="primary" icon={creating?Loader2:Plus} onClick={handleCreateFlow} disabled={creating} className="w-full justify-center sm:w-auto">
              Create Flow
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

