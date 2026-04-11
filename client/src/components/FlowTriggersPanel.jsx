// FlowTriggersPanel.jsx
import React, { useMemo, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Circle, Hash, Loader2,
  MessageSquare, Plus, RefreshCw, Save, Trash2, Zap,
  Edit2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../utils/axios';

const EMPTY = {
  triggerWord: '', flowId: '',
  messageText: 'Please fill out the form below.',
  buttonLabel: 'Open Flow', isActive: true,
};

function fmtDate(v) {
  if (!v) return 'Never';
  const d = new Date(v);
  if (isNaN(d)) return 'Never';
  return d.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function Toggle({ checked, onChange }) {
  return (
    <label className="relative cursor-pointer select-none">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`} />
      <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </label>
  );
}

function Inp({ className='', ...p }) {
  return <input {...p} className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 ${className}`} />;
}

function Txa({ className='', ...p }) {
  return <textarea {...p} className={`w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 ${className}`} />;
}

export default function FlowTriggersPanel({ triggers=[], triggerSummary={}, availableMetaFlows=[], onRefresh }) {
  const [form,       setForm]       = useState(EMPTY);
  const [editingId,  setEditingId]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [expandedId, setExpandedId] = useState('');

  const linked = useMemo(() => availableMetaFlows.find(f => f.flowId===form.flowId)||null, [availableMetaFlows, form.flowId]);

  function reset() { setForm(EMPTY); setEditingId(''); }

  function startEdit(t) {
    setEditingId(t._id);
    setForm({ triggerWord:t.triggerWord||'', flowId:t.flowId||'', messageText:t.messageText||EMPTY.messageText, buttonLabel:t.buttonLabel||'Open Flow', isActive:t.isActive!==false });
    const scroller = document.querySelector('[data-flow-studio-scroll]');
    if (scroller && typeof scroller.scrollTo === 'function' && scroller.scrollHeight > scroller.clientHeight) {
      scroller.scrollTo({ top:0, behavior:'smooth' });
    } else {
      window.scrollTo({ top:0, behavior:'smooth' });
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.triggerWord.trim()) { toast.error('Enter a trigger word'); return; }
    if (!form.flowId.trim()) { toast.error('Enter a Flow ID'); return; }
    try {
      setSaving(true);
      const body = { ...form, flowName: linked?.name||'' };
      const r = editingId
        ? await api.put(`/api/flow-studio/triggers/${editingId}`, body)
        : await api.post('/api/flow-studio/triggers', body);
      toast.success(r.data?.message||(editingId ? 'Updated' : 'Created'));
      reset(); await onRefresh?.();
    } catch(err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  }

  async function toggle(t) {
    try {
      setTogglingId(t._id);
      const r = await api.patch(`/api/flow-studio/triggers/${t._id}/status`, { isActive:!t.isActive });
      toast.success(r.data?.message||'Updated'); await onRefresh?.();
    } catch(err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setTogglingId(''); }
  }

  async function del(t) {
    if (!window.confirm(`Delete trigger "${t.triggerWord}"?`)) return;
    try {
      setDeletingId(t._id);
      await api.delete(`/api/flow-studio/triggers/${t._id}`);
      toast.success('Deleted');
      if (editingId===t._id) reset();
      await onRefresh?.();
    } catch(err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setDeletingId(''); }
  }

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { label:'Total',    value:triggerSummary.totalTriggers??0,    accent:'border-l-slate-400',   bg:'bg-white' },
          { label:'Active',   value:triggerSummary.activeTriggers??0,   accent:'border-l-emerald-400', bg:'bg-white' },
          { label:'Inactive', value:triggerSummary.inactiveTriggers??0, accent:'border-l-amber-400',   bg:'bg-white' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl ${s.bg} border border-slate-200 border-l-4 ${s.accent} px-4 py-3.5 shadow-sm sm:px-5 sm:py-4`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className="mt-1.5 text-2xl font-black text-slate-900 sm:text-3xl">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Create / Edit form ── */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        {/* colored top accent */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />

        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 shadow shadow-emerald-600/25">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{editingId ? 'Edit Trigger' : 'Create New Trigger'}</h3>
              <p className="text-xs text-slate-500">Customer sends a keyword → GoWhats sends the WhatsApp Flow</p>
            </div>
          </div>
          <button type="button" onClick={() => { reset(); onRefresh?.(); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:w-auto">
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-4 sm:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Trigger Word</label>
              <Inp value={form.triggerWord} onChange={e => setForm(p=>({...p,triggerWord:e.target.value}))} placeholder="e.g. register, visit, book" />
              <p className="mt-1.5 text-xs text-slate-400">Comma-separated for multiple keywords</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Flow ID</label>
              <Inp value={form.flowId} onChange={e => setForm(p=>({...p,flowId:e.target.value}))} placeholder="From WhatsApp Manager Flows" />
              <p className="mt-1.5 text-xs text-slate-400">WhatsApp Manager → Account Tools → Flows</p>
            </div>
          </div>

          {/* quick fill */}
          {availableMetaFlows.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quick Fill — Published Flows</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableMetaFlows.map(flow => (
                  <button key={`${flow.id}-${flow.flowId}`} type="button"
                    onClick={() => setForm(p=>({...p, flowId:flow.flowId}))}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${form.flowId===flow.flowId ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                    {flow.name}
                    <span className="font-mono opacity-60">·{flow.flowId}</span>
                  </button>
                ))}
              </div>
              {linked && (
                <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span><strong>{linked.name}</strong> (v{linked.version||0}) linked</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Message Text</label>
            <Txa rows={3} value={form.messageText} onChange={e => setForm(p=>({...p,messageText:e.target.value}))} placeholder="Message sent with the flow CTA button…" />
          </div>

          <div className="grid gap-5 md:grid-cols-[1fr_auto]">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Button Label (CTA)</label>
              <Inp value={form.buttonLabel} onChange={e => setForm(p=>({...p,buttonLabel:e.target.value}))} placeholder="Open Flow" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Active</label>
              <div className="flex items-center h-[46px]">
                <Toggle checked={form.isActive} onChange={e => setForm(p=>({...p,isActive:e.target.checked}))} />
                <span className="ml-2 text-sm font-semibold text-slate-600">{form.isActive ? 'On' : 'Off'}</span>
              </div>
            </div>
          </div>

          {/* preview */}
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-black uppercase tracking-wider text-emerald-700">Preview</span>
            </div>
            <div className="rounded-xl bg-white border border-emerald-100 shadow-sm p-4 max-w-sm">
              <p className="text-sm text-slate-800">{form.messageText||'Please fill out the form below.'}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow">
                {form.buttonLabel||'Open Flow'} <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            {editingId && (
              <button type="button" onClick={reset}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? 'Update Trigger' : 'Create Trigger'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Trigger list ── */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">All Triggers</h3>
            <p className="text-xs text-slate-500 mt-0.5">Keywords that auto-launch a WhatsApp Flow</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
            {triggers.length} {triggers.length===1?'trigger':'triggers'}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {triggers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 border border-slate-200 mb-4">
                <Zap className="h-7 w-7 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">No triggers yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">Create your first trigger above and customers can launch a flow by sending a keyword.</p>
            </div>
          ) : triggers.map(t => {
            const active = t.isActive !== false;
            const editing = editingId === t._id;
            const expanded = expandedId === t._id;

            return (
              <div key={t._id} className={`transition-colors ${editing ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50/70'}`}>
                {/* main row */}
                <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {/* status dot */}
                    <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />

                    {/* keyword */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{t.triggerWord}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
                          {active ? 'Active' : 'Inactive'}
                        </span>
                        {t.flowName && <span className="max-w-full truncate text-xs text-slate-500 sm:max-w-[160px]">{t.flowName}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="max-w-full truncate text-xs font-mono text-slate-400 sm:max-w-[180px]">{t.flowId}</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-xs text-slate-400">{t.usageCount||0} uses</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-xs text-slate-400">{fmtDate(t.lastTriggeredAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* actions */}
                  <div className="flex flex-wrap items-center gap-1.5 pl-5 sm:pl-0 shrink-0">
                    <button type="button" onClick={() => setExpandedId(expanded ? '' : t._id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button type="button" onClick={() => startEdit(t)}
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />Edit
                    </button>
                    <button type="button" onClick={() => toggle(t)} disabled={togglingId===t._id}
                      className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-50 ${active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                      {togglingId===t._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      {active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => del(t)} disabled={deletingId===t._id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                      {deletingId===t._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* expanded details */}
                {expanded && (
                  <div className="grid gap-4 border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-4 sm:grid-cols-2 sm:px-6 sm:pb-5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Message Text</p>
                      <div className="rounded-xl bg-white border border-slate-200 p-3.5">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.messageText}</p>
                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                          {t.buttonLabel||'Open Flow'} <ArrowRight className="h-3 w-3" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label:'Flow ID',    value:t.flowId,                  mono:true },
                        { label:'Button CTA', value:t.buttonLabel||'Open Flow', mono:false },
                        { label:'Last Used',  value:fmtDate(t.lastTriggeredAt), mono:false },
                        { label:'Total Uses', value:`${t.usageCount||0} times`,  mono:false },
                      ].map(row => (
                        <div key={row.label}>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{row.label}</p>
                          <p className={`mt-0.5 text-sm text-slate-700 break-all ${row.mono ? 'font-mono text-xs' : 'font-semibold'}`}>{row.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

