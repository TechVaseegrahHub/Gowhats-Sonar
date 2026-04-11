import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Save, Loader2, MessageSquare, Clock, Truck,
  CreditCard, CheckCircle, Hash, Link as LinkIcon, Info,
  Zap, Globe, ChevronRight, ShoppingBag, Package,
  ArrowRight, Shield, Eye, EyeOff, Copy, Check,
  ExternalLink, AlertCircle, Settings, Lock, Wifi
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/* ─── atoms ─── */
const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</label>}
    {children}
    {hint && <p className="text-xs text-slate-400 leading-relaxed mt-1">{hint}</p>}
  </div>
);

const Input = ({ className = '', ...props }) => (
  <input
    className={`w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-800
      placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400
      transition-all duration-150 ${className}`}
    {...props}
  />
);

const Textarea = ({ className = '', ...props }) => (
  <textarea
    className={`w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-800
      placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400
      transition-all duration-150 resize-none ${className}`}
    {...props}
  />
);

const Toggle = ({ checked, onChange }) => (
  <button
    role="switch" aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
      focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2
      ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}>
    <span
      className={`inline-block rounded-full bg-white shadow-sm transition-transform duration-200
        ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      style={{ height: 18, width: 18 }}
    />
  </button>
);

/* ─── Secret key field with show/hide + copy ─── */
const SecretField = ({ label, value, onChange, placeholder, hint }) => {
  const [visible, setVisible] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Field label={label} hint={hint}>
      <div className="relative flex items-center">
        <Lock className="absolute left-3 w-3.5 h-3.5 text-slate-300 pointer-events-none" />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-8 pr-20 py-2.5 text-sm bg-white border border-slate-200 rounded-xl
            text-slate-800 placeholder-slate-300 font-mono
            focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400
            transition-all duration-150"
        />
        <div className="absolute right-2 flex items-center gap-1">
          <button type="button" onClick={copy}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={() => setVisible(v => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </Field>
  );
};

/* ─── Gateway card ─── */
const GatewayCard = ({ id, selected, onChange, icon: Icon, name, tagline, badge, badgeColor }) => (
  <label className={`relative flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200
    ${selected === id
      ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'}`}>
    <input type="radio" name="paymentGateway" value={id}
      checked={selected === id} onChange={() => onChange(id)} className="sr-only" />
    <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center
      ${selected === id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      <Icon style={{ width: 18, height: 18 }} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="font-semibold text-slate-800 text-sm">{name}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{tagline}</p>
    </div>
    {selected === id && (
      <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
          <path d="M3.5 7.5L2 6l-1 1 2.5 2.5 6-6-1-1z" />
        </svg>
      </div>
    )}
  </label>
);

/* ─── Section header with toggle ─── */
const SectionHeader = ({ icon: Icon, title, subtitle, enabled, onToggle }) => (
  <div className={`flex items-center justify-between p-5 rounded-2xl border
    ${enabled ? 'bg-emerald-50/60 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
    <div className="flex items-center gap-3.5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
        ${enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className={`font-semibold text-sm ${enabled ? 'text-slate-800' : 'text-slate-500'}`}>{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
    {onToggle && <Toggle checked={enabled} onChange={onToggle} />}
  </div>
);

/* ─── Info banner ─── */
const InfoBanner = ({ children, color = 'blue', icon: Icon = Info }) => {
  const colors = {
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
    amber:  'bg-amber-50 border-amber-100 text-amber-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    green:  'bg-emerald-50 border-emerald-100 text-emerald-700',
    red:    'bg-red-50 border-red-100 text-red-700',
  };
  return (
    <div className={`flex gap-3 p-4 rounded-xl border ${colors[color]}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed">{children}</p>
    </div>
  );
};

const VarPill = ({ v }) => (
  <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md text-xs font-mono">{v}</span>
);

const WebhookUrlBox = ({ path }) => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${path}`;
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-600 mb-2">Your webhook URL</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-white border border-slate-200 px-3 py-2 rounded-lg font-mono text-slate-700 overflow-x-auto whitespace-nowrap">
          {url}
        </code>
        <button onClick={copy}
          className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors flex-shrink-0">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">Copy this URL and paste it into your payment gateway's webhook settings</p>
    </div>
  );
};

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
const OrderAutomationConfig = () => {
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [testing,      setTesting]      = useState(false);
  const [testResult,   setTestResult]   = useState(null); // null | 'ok' | 'error'
  const [activeTab,    setActiveTab]    = useState('payment');
  const [orderCounter, setOrderCounter] = useState(1000);

  const [config, setConfig] = useState({
    automationConfig: {
      orderFlow: {
        enabled: true, flowId: '',
        template: { header: '', body: '', footer: '', ctaText: '' }
      },
      orderConfirmation: { enabled: true, template: { body: '' } },
      paymentRequest: {
        enabled: true,
        paymentGateway: 'razorpay',

        // ── Razorpay ──────────────────────────────────────
        paymentConfigurationName: '',

        // ── Stripe (stored per-tenant in DB, encrypted) ──
        stripeConfig: {
          secretKey:     '',   // sk_live_… or sk_test_…
          webhookSecret: '',   // whsec_…
          currency:      'inr',
          successUrl:    '',
          cancelUrl:     '',
        },

        // ── Cashfree (stored per-tenant in DB, encrypted) ─
        cashfreeConfig: {
          clientId:                 '',
          clientSecret:             '',
          environment:              'sandbox',
          merchantVpa:              '',
          paymentConfigurationName: '',
          notifyUrl:                '',
          currency:                 'INR',
        },

        template: { header: '', body: '', footer: '' }
      },
      shippingUpdate:    { enabled: true, template: { body: '' } },
      shippingSelection: {
        enabled: true, selectionMode: 'auto',
        courierListTemplate:  { header: '', body: '', footer: '' },
        freeShippingTemplate: { body: '' }
      },
      abandonedCart: {
        enabled: true, delayMinutes: 30, buttonLink: '',
        template: {
          header: '⏳ Forgotten Items?',
          body:   'Hi! You left items in your cart. Complete your order now before they run out.',
          footer: "Don't miss out!", ctaText: 'Shop Now'
        }
      },
      orderIdConfig: { prefix: 'ORD', startSequence: 1000 }
    }
  });

  useEffect(() => { fetchAllSettings(); }, []);

  const fetchAllSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [sRes, cRes] = await Promise.all([
        axios.get('/api/catalog-settings',        { headers: h }),
        axios.get('/api/orders/counter/current',  { headers: h })
      ]);
      if (sRes.data.settings) {
        const db = sRes.data.settings;
        setConfig(prev => ({
          ...prev, ...db,
          automationConfig: {
            ...prev.automationConfig, ...db.automationConfig,
            paymentRequest: {
              ...prev.automationConfig.paymentRequest,
              ...db.automationConfig?.paymentRequest,
              stripeConfig: {
                ...prev.automationConfig.paymentRequest.stripeConfig,
                ...db.automationConfig?.paymentRequest?.stripeConfig
              },
              cashfreeConfig: {
                ...prev.automationConfig.paymentRequest.cashfreeConfig,
                ...db.automationConfig?.paymentRequest?.cashfreeConfig
              },
              template: {
                ...prev.automationConfig.paymentRequest.template,
                ...db.automationConfig?.paymentRequest?.template
              }
            },
            abandonedCart: {
              ...prev.automationConfig.abandonedCart, ...db.automationConfig?.abandonedCart,
              template: { ...prev.automationConfig.abandonedCart.template, ...db.automationConfig?.abandonedCart?.template }
            },
            shippingSelection: {
              ...prev.automationConfig.shippingSelection, ...db.automationConfig?.shippingSelection,
              courierListTemplate:  { ...prev.automationConfig.shippingSelection.courierListTemplate,  ...db.automationConfig?.shippingSelection?.courierListTemplate  },
              freeShippingTemplate: { ...prev.automationConfig.shippingSelection.freeShippingTemplate, ...db.automationConfig?.shippingSelection?.freeShippingTemplate }
            },
            orderFlow:         { ...prev.automationConfig.orderFlow,         ...db.automationConfig?.orderFlow,         template: { ...prev.automationConfig.orderFlow.template,         ...db.automationConfig?.orderFlow?.template         } },
            orderConfirmation: { ...prev.automationConfig.orderConfirmation, ...db.automationConfig?.orderConfirmation, template: { ...prev.automationConfig.orderConfirmation.template, ...db.automationConfig?.orderConfirmation?.template } },
            shippingUpdate:    { ...prev.automationConfig.shippingUpdate,    ...db.automationConfig?.shippingUpdate,    template: { ...prev.automationConfig.shippingUpdate.template,    ...db.automationConfig?.shippingUpdate?.template    } },
            orderIdConfig:     { ...prev.automationConfig.orderIdConfig,     ...db.automationConfig?.orderIdConfig }
          }
        }));
      }
      if (cRes.data.nextOrderId) setOrderCounter(cRes.data.nextOrderId);
    } catch { toast.error('Failed to load settings'); }
    finally  { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem('token');
    const h = { Authorization: `Bearer ${token}` };
    try {
      await axios.post('/api/catalog-settings',
        { ...config, orderCounter, orderIdPrefix: config.automationConfig.orderIdConfig?.prefix },
        { headers: h }
      );
      await axios.put('/api/orders/counter/set', { counterValue: orderCounter }, { headers: h });
      toast.success('✅ Settings saved successfully');
      setTestResult(null);
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const token = localStorage.getItem('token');
    try {
      const res = await axios.post('/api/payment/test-connection',
        { gateway: gw, config: ac.paymentRequest },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTestResult(res.data.success ? 'ok' : 'error');
      if (res.data.success) toast.success('✅ Connection verified!');
      else toast.error(`❌ ${res.data.message || 'Connection failed'}`);
    } catch (e) {
      setTestResult('error');
      toast.error(`❌ ${e.response?.data?.message || 'Connection test failed'}`);
    } finally { setTesting(false); }
  };

  /* helpers */
  const updateConfig   = (section, field, value) =>
    setConfig(prev => ({ ...prev, automationConfig: { ...prev.automationConfig, [section]: { ...prev.automationConfig[section], [field]: value } } }));
  const updateTemplate = (section, field, value) =>
    setConfig(prev => ({ ...prev, automationConfig: { ...prev.automationConfig, [section]: { ...prev.automationConfig[section], template: { ...prev.automationConfig[section].template, [field]: value } } } }));
  const updateNested   = (section, sub, field, value) =>
    setConfig(prev => ({ ...prev, automationConfig: { ...prev.automationConfig, [section]: { ...prev.automationConfig[section], [sub]: { ...prev.automationConfig[section][sub], [field]: value } } } }));

  const updateStripe   = (f, v) => updateNested('paymentRequest', 'stripeConfig',   f, v);
  const updateCashfree = (f, v) => updateNested('paymentRequest', 'cashfreeConfig', f, v);

  const ac = config.automationConfig;
  const gw = ac.paymentRequest.paymentGateway || 'razorpay';

  const tabs = [
    { id: 'flow',         icon: ShoppingBag, label: 'Checkout Flow'   },
    { id: 'shipping',     icon: Truck,       label: 'Shipping'        },
    { id: 'payment',      icon: CreditCard,  label: 'Payment'         },
    { id: 'confirmation', icon: CheckCircle, label: 'Confirmation'    },
    { id: 'abandoned',    icon: Clock,       label: 'Abandoned Cart'  },
    { id: 'order_id',     icon: Hash,        label: 'Order Settings'  },
  ];

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin w-8 h-8 text-emerald-500" />
        <p className="text-sm text-slate-400 font-medium">Loading settings…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/70 font-sans">
      <ToastContainer position="top-right" theme="colored" toastClassName="!rounded-xl !shadow-lg" />

      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Settings className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 leading-tight">Automation Settings</h1>
            <p className="text-xs text-slate-400">Configure your WhatsApp commerce flows</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white
            text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 shadow-sm shadow-emerald-200">
          {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="flex" style={{ minHeight: 'calc(100vh - 57px)' }}>

        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-100 p-3 space-y-0.5">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all
                ${activeTab === tab.id
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-medium'}`}>
              <tab.icon className={`w-4 h-4 flex-shrink-0 ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400'}`} />
              {tab.label}
              {activeTab === tab.id && <ChevronRight className="w-3.5 h-3.5 ml-auto text-emerald-400" />}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

            {/* ══ CHECKOUT FLOW ══ */}
            {activeTab === 'flow' && (
              <>
                <SectionHeader icon={ShoppingBag} title="Checkout Flow" subtitle="Sent when a customer's cart is received"
                  enabled={ac.orderFlow.enabled} onToggle={v => updateConfig('orderFlow','enabled',v)} />
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <Field label="Meta Flow ID" hint="The Flow ID from your Meta Business Manager">
                    <Input value={ac.orderFlow.flowId} onChange={e => updateConfig('orderFlow','flowId',e.target.value)} placeholder="123456789012345" />
                  </Field>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700">Message Template</h4>
                  <Field label="Header"><Input value={ac.orderFlow.template.header} onChange={e => updateTemplate('orderFlow','header',e.target.value)} placeholder="🛍️ Complete
 Your Order" /></Field>
                  <Field label="Body"><Textarea rows={4} value={ac.orderFlow.template.body} onChange={e => updateTemplate('orderFlow','body',e.target.value)} placeholder="Please review your items and confirm your order." /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Footer"><Input value={ac.orderFlow.template.footer} onChange={e => updateTemplate('orderFlow','footer',e.target.value)} placeholder="Powered by GoWhats!" /></Field>
                    <Field label="Button Label"><Input value={ac.orderFlow.template.ctaText} onChange={e => updateTemplate('orderFlow','ctaText',e.target.value)} placeholder="Checkout Now" /></Field>
                  </div>
                </div>
              </>
            )}

            {/* ══ SHIPPING ══ */}
            {activeTab === 'shipping' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Shipping Selection Mode</h3>
                    <p className="text-xs text-slate-400 mt-0.5">How shipping is assigned after the customer places an order</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { val: 'auto',            title: 'Auto-calculate',   desc: 'Best eligible rate assigned automatically',         badge: 'Default' },
                      { val: 'customer_choice', title: 'Customer selects', desc: 'A list of courier options sent to the customer',    badge: 'New'     }
                    ].map(opt => (
                      <label key={opt.val} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                        ${ac.shippingSelection.selectionMode === opt.val ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <input type="radio" name="shippingMode" value={opt.val}
                          checked={ac.shippingSelection.selectionMode === opt.val}
                          onChange={() => updateConfig('shippingSelection','selectionMode',opt.val)}
                          className="mt-0.5 accent-emerald-600" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{opt.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{opt.desc}</p>
                          <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{opt.badge}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-emerald-600" /><h3 className="text-sm font-semibold text-slate-700">Courier Selection Message</h3></div>
                  <Field label="Header"><Input value={ac.shippingSelection.courierListTemplate.header} onChange={e => updateNested('shippingSelection','courierListTemplate','header',e.target.value)} /></Field>
                  <Field label="Body" hint="Variables: {{name}}, {{amount}}"><Textarea rows={3} value={ac.shippingSelection.courierListTemplate.body} onChange={e => updateNested('shippingSelection','courierListTemplate','body',e.target.value)} /></Field>
                  <Field label="Footer"><Input value={ac.shippingSelection.courierListTemplate.footer} onChange={e => updateNested('shippingSelection','courierListTemplate','footer',e.target.value)} /></Field>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" /><h3 className="text-sm font-semibold text-slate-700">Free Shipping Message</h3></div>
                  <Field label="Body" hint="Variable: {{method}}"><Textarea rows={3} value={ac.shippingSelection.freeShippingTemplate.body} onChange={e => updateNested('shippingSelection','freeShippingTemplate','body',e.target.value)} /></Field>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center gap-2"><Package className="w-4 h-4 text-slate-500" /><h3 className="text-sm font-semibold text-slate-700">Tracking Update</h3></div>
                  <Field label="Message Body" hint="Variables: {{order_id}}, {{courier}}, {{tracking_no}}"><Textarea rows={4} value={ac.shippingUpdate.template.body} onChange={e => updateTemplate('shippingUpdate','body',e.target.value)} /></Field>
                </div>
              </>
            )}

            {/* ══ PAYMENT ══ */}
            {activeTab === 'payment' && (
              <>
                <SectionHeader icon={CreditCard} title="Payment Request" subtitle="Sent automatically when an order requires payment"
                  enabled={ac.paymentRequest.enabled} onToggle={v => updateConfig('paymentRequest','enabled',v)} />

                {/* Step 1 — choose gateway */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Step 1 — Choose Payment Gateway</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Select the gateway your customers will pay through, then enter your credentials below</p>
                  </div>
                  <div className="space-y-2.5">
                    <GatewayCard id="razorpay" selected={gw} onChange={v => { updateConfig('paymentRequest','paymentGateway',v); setTestResult(null); }}
                      icon={Zap} name="Razorpay / UPI"
                      tagline="Native WhatsApp Pay — customers pay inline via UPI (GPay, PhonePe, Paytm)"
                      badge="INR only" badgeColor="bg-blue-50 text-blue-600" />
                    <GatewayCard id="stripe" selected={gw} onChange={v => { updateConfig('paymentRequest','paymentGateway',v); setTestResult(null); }}
                      icon={Globe} name="Stripe"
                      tagline="CTA button opens hosted Stripe checkout — cards, wallets, international methods"
                      badge="Multi-currency" badgeColor="bg-purple-50 text-purple-600" />
                    <GatewayCard id="cashfree" selected={gw} onChange={v => { updateConfig('paymentRequest','paymentGateway',v); setTestResult(null); }}
                      icon={Shield} name="Cashfree"
                      tagline="UPI payment via Cashfree — creates order, sends UPI intent via WhatsApp Pay"
                      badge="INR · UPI" badgeColor="bg-amber-50 text-amber-600" />
                  </div>
                </div>

                {/* Step 2 — credentials */}

                {/* ── RAZORPAY ── */}
                {gw === 'razorpay' && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><Zap className="w-3.5 h-3.5 text-blue-600" /></div>
                      <h4 className="text-sm font-semibold text-slate-800">Step 2 — Razorpay Configuration</h4>
                    </div>
                    <InfoBanner color="blue">
                      Razorpay UPI works through <strong>WhatsApp Business Manager</strong> — no API keys needed here.
                      Just enter the configuration name you created in Meta Business Manager.
                    </InfoBanner>
                    <Field label="WhatsApp Payment Configuration Name"
                      hint="The exact name from Meta Business Manager → WhatsApp → Payment Configurations">
                      <Input value={ac.paymentRequest.paymentConfigurationName}
                        onChange={e => updateConfig('paymentRequest','paymentConfigurationName',e.target.value)}
                        placeholder="e.g. my_razorpay_config" />
                    </Field>
                    <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold">
                      Open Meta Business Manager <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* ── STRIPE ── */}
                {gw === 'stripe' && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center"><Globe className="w-3.5 h-3.5 text-purple-600" /></div>
                        <h4 className="text-sm font-semibold text-slate-800">Step 2 — Stripe API Credentials</h4>
                      </div>
                      <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-semibold">
                        Stripe Dashboard <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <InfoBanner color="purple" icon={Lock}>
                      Your Stripe keys are <strong>saved encrypted per account</strong> in the database — used server-side only
                      to create payment links. They are never exposed to customers or the browser.
                    </InfoBanner>

                    <SecretField label="Secret Key"
                      value={ac.paymentRequest.stripeConfig.secretKey}
                      onChange={v => updateStripe('secretKey', v)}
                      placeholder="sk_test_… or sk_live_…"
                      hint="Stripe Dashboard → Developers → API Keys → Secret key" />

                    <SecretField label="Webhook Signing Secret"
                      value={ac.paymentRequest.stripeConfig.webhookSecret}
                      onChange={v => updateStripe('webhookSecret', v)}
                      placeholder="whsec_…"
                      hint="Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret" />

                    <WebhookUrlBox path="/webhook/stripe" />

                    <Field label="Currency">
                      <select className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-800
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                        value={ac.paymentRequest.stripeConfig.currency}
                        onChange={e => updateStripe('currency', e.target.value)}>
                        <option value="inr">INR — Indian Rupee (₹)</option>
                        <option value="sgd">SGD — Singapore Dollar (S$)</option>
                        <option value="usd">USD — US Dollar ($)</option>
                        <option value="gbp">GBP — British Pound (£)</option>
                        <option value="eur">EUR — Euro (€)</option>
                        <option value="aed">AED — UAE Dirham</option>
                        <option value="myr">MYR — Malaysian Ringgit</option>
                      </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Success URL" hint="Where to redirect after payment (optional)">
                        <Input value={ac.paymentRequest.stripeConfig.successUrl}
                          onChange={e => updateStripe('successUrl', e.target.value)}
                          placeholder="https://yoursite.com/thank-you" />
                      </Field>
                      <Field label="Cancel URL" hint="Where to redirect on cancel (optional)">
                        <Input value={ac.paymentRequest.stripeConfig.cancelUrl}
                          onChange={e => updateStripe('cancelUrl', e.target.value)}
                          placeholder="https://yoursite.com/cart" />
                      </Field>
                    </div>

                    <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                      <button onClick={handleTestConnection}
                        disabled={testing || !ac.paymentRequest.stripeConfig.secretKey}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700
                          disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors">
                        {testing ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                        {testing ? 'Testing…' : 'Test Connection'}
                      </button>
                      {testResult === 'ok'    && <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle className="w-3.5 h-3.5" />Connected successfully</span>}
                      {testResult === 'error' && <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500"><AlertCircle className="w-3.5 h-3.5" />Invalid credentials — check and retry</span>}
                    </div>
                  </div>
                )}

                {/* ── CASHFREE ── */}
                {gw === 'cashfree' && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center"><Shield className="w-3.5 h-3.5 text-amber-600" /></div>
                        <h4 className="text-sm font-semibold text-slate-800">Step 2 — Cashfree API Credentials</h4>
                      </div>
                      <a href="https://merchant.cashfree.com/merchants/developers" target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-semibold">
                        Cashfree Dashboard <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <InfoBanner color="amber" icon={Lock}>
                      Your Cashfree credentials are <strong>saved encrypted per account</strong> — used server-side only
                      to create UPI payment sessions. They are never visible to customers.
                    </InfoBanner>

                    {/* Environment */}
                    <Field label="Environment">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { val: 'sandbox',    label: 'Sandbox',    hint: 'For testing',    badge: 'TEST', bc: 'bg-amber-100 text-amber-700'    },
                          { val: 'production', label: 'Production', hint: 'For live payments', badge: 'LIVE', bc: 'bg-emerald-100 text-emerald-700' }
                        ].map(env => (
                          <label key={env.val} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all
                            ${ac.paymentRequest.cashfreeConfig.environment === env.val
                              ? 'border-emerald-500 bg-emerald-50/60'
                              : 'border-slate-200 hover:border-slate-300'}`}>
                            <input type="radio" name="cfEnv" value={env.val}
                              checked={ac.paymentRequest.cashfreeConfig.environment === env.val}
                              onChange={() => updateCashfree('environment', env.val)}
                              className="accent-emerald-600" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-slate-800 text-xs">{env.label}</p>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${env.bc}`}>{env.badge}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">{env.hint}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <SecretField label="Client ID"
                        value={ac.paymentRequest.cashfreeConfig.clientId}
                        onChange={v => updateCashfree('clientId', v)}
                        placeholder="Your Cashfree client ID"
                        hint="Cashfree Dashboard → Developers → API Keys" />
                      <SecretField label="Client Secret"
                        value={ac.paymentRequest.cashfreeConfig.clientSecret}
                        onChange={v => updateCashfree('clientSecret', v)}
                        placeholder="Your Cashfree client secret"
                        hint="Keep private — never share this" />
                    </div>

                    <Field label="Merchant UPI VPA"
                      hint="Your UPI VPA registered with Cashfree — must match the WhatsApp payment config VPA e.g. merchant@yesbank">
                      <Input value={ac.paymentRequest.cashfreeConfig.merchantVpa}
                        onChange={e => updateCashfree('merchantVpa', e.target.value)}
                        placeholder="merchant@yesbank" className="font-mono" />
                    </Field>

                    <Field label="WhatsApp Payment Configuration Name"
                      hint="The configuration name in Meta Business Manager linked to the VPA above">
                      <Input value={ac.paymentRequest.cashfreeConfig.paymentConfigurationName}
                        onChange={e => updateCashfree('paymentConfigurationName', e.target.value)}
                        placeholder="e.g. cashfree_upi_config" />
                    </Field>

                    <WebhookUrlBox path="/webhook/cashfree" />

                    <Field label="Currency">
                      <select className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-800
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                        value={ac.paymentRequest.cashfreeConfig.currency}
                        onChange={e => updateCashfree('currency', e.target.value)}>
                        <option value="INR">INR — Indian Rupee (₹)</option>
                      </select>
                    </Field>

                    {/* How it works */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                      <p className="text-xs font-semibold text-slate-600 mb-1">How Cashfree UPI works</p>
                      {[
                        'Customer places order on WhatsApp',
                        'Server creates Cashfree order → gets payment_session_id',
                        'UPI intent URL extracted (reference_id + VPA)',
                        'Sent to customer via WhatsApp Pay bubble',
                        'Customer pays in GPay / PhonePe / Paytm',
                        'Cashfree webhook confirms → order marked complete',
                      ].map((step, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                          <span className="text-xs text-slate-600">{step}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                      <button onClick={handleTestConnection}
                        disabled={testing || !ac.paymentRequest.cashfreeConfig.clientId || !ac.paymentRequest.cashfreeConfig.clientSecret}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700
                          disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors">
                        {testing ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                        {testing ? 'Testing…' : 'Test Connection'}
                      </button>
                      {testResult === 'ok'    && <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle className="w-3.5 h-3.5" />Connected successfully</span>}
                      {testResult === 'error' && <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500"><AlertCircle className="w-3.5 h-3.5" />Invalid credentials — check and retry</span>}
                    </div>
                  </div>
                )}

                {/* Step 3 — shared message template */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Step 3 — Payment Message Content</h4>
                    <p className="text-xs text-slate-400 mt-0.5">This message is sent to the customer along with the payment request</p>
                  </div>
                  <Field label="Header">
                    <Input maxLength={60} placeholder="💳 Complete Your Payment"
                      value={ac.paymentRequest.template.header} onChange={e => updateTemplate('paymentRequest','header',e.target.value)} />
                  </Field>
                  <Field label="Body">
                    <Textarea rows={3} placeholder="Please complete your payment of {{amount}} for order {{order_id}}."
                      value={ac.paymentRequest.template.body} onChange={e => updateTemplate('paymentRequest','body',e.target.value)} />
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {['{{amount}}','{{order_id}}'].map(v => <VarPill key={v} v={v} />)}
                    </div>
                  </Field>
                  <Field label="Footer">
                    <Input maxLength={60} placeholder="Secure Payment"
                      value={ac.paymentRequest.template.footer} onChange={e => updateTemplate('paymentRequest','footer',e.target.value)} />
                  </Field>
                </div>
              </>
            )}

            {/* ══ CONFIRMATION ══ */}
            {activeTab === 'confirmation' && (
              <>
                <SectionHeader icon={CheckCircle} title="Order Confirmation" subtitle="Sent immediately after a successful payment"
                  enabled={ac.orderConfirmation.enabled} onToggle={v => updateConfig('orderConfirmation','enabled',v)} />
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <Field label="Message Body">
                    <Textarea rows={6} value={ac.orderConfirmation.template.body}
                      onChange={e => updateTemplate('orderConfirmation','body',e.target.value)}
                      placeholder={"✅ Thank you! Your order *{{order_id}}* is confirmed.\nAmount: {{amount}}"} />
                  </Field>
                  <div className="flex gap-2 flex-wrap">
                    {['{{order_id}}','{{amount}}','{{items}}','{{customer}}'].map(v => <VarPill key={v} v={v} />)}
                  </div>
                </div>
              </>
            )}

            {/* ══ ABANDONED CART ══ */}
            {activeTab === 'abandoned' && (
              <>
                <SectionHeader icon={Clock} title="Abandoned Cart Recovery" subtitle="Remind customers to complete their purchase"
                  enabled={ac.abandonedCart.enabled} onToggle={v => updateConfig('abandonedCart','enabled',v)} />
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Delay (Minutes)" hint="Recommended: 30–60 min">
                      <Input type="number" min="5" max="1440" value={ac.abandonedCart.delayMinutes}
                        onChange={e => updateConfig('abandonedCart','delayMinutes',parseInt(e.target.value))} />
                    </Field>
                    <Field label="Button URL" hint="Link opened when customer taps CTA">
                      <Input value={ac.abandonedCart.buttonLink || ''} onChange={e => updateConfig('abandonedCart','buttonLink',e.target.value)} placeholder="https://wa.me/c/91XXXXXXXXXX" />
                    </Field>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-800">Message Content</h4>
                  <Field label="Header"><Input maxLength={60} value={ac.abandonedCart.template.header} onChange={e => updateTemplate('abandonedCart','header',e.target.value)} /></Field>
                  <Field label="Body"><Textarea rows={4} value={ac.abandonedCart.template.body} onChange={e => updateTemplate('abandonedCart','body',e.target.value)} /></Field>
                  <Field label="Footer"><Input maxLength={60} value={ac.abandonedCart.template.footer} onChange={e => updateTemplate('abandonedCart','footer',e.target.value)} /></Field>
                  <Field label="Button Text"><Input maxLength={20} value={ac.abandonedCart.template.ctaText || ''} onChange={e => updateTemplate('abandonedCart','ctaText',e.target.value)} placeholder="Shop Now" /></Field>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Message Preview</h4>
                  <div className="bg-[#ece5dd] rounded-2xl p-4 max-w-xs mx-auto">
                    <div className="bg-white rounded-xl rounded-tl-sm p-3 shadow-sm space-y-1.5">
                      {ac.abandonedCart.template.header && <p className="font-bold text-slate-800 text-sm">{ac.abandonedCart.template.header}</p>}
                      <p className="text-slate-600 text-xs leading-relaxed whitespace-pre-wrap">{ac.abandonedCart.template.body || 'Your message body…'}</p>
                      {ac.abandonedCart.template.footer && <p className="text-[11px] text-slate-400 italic">{ac.abandonedCart.template.footer}</p>}
                      <div className="pt-2 border-t border-slate-100 text-center">
                        <span className="text-emerald-600 font-semibold text-xs">{ac.abandonedCart.template.ctaText || 'Shop Now'} →</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══ ORDER SETTINGS ══ */}
            {activeTab === 'order_id' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Order Numbering</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Define the prefix and starting sequence for your order IDs</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Order Prefix" hint='Short code e.g. "ORD", "EV", "SHOP"'>
                    <Input maxLength={5} className="uppercase font-mono font-bold text-base tracking-widest"
                      value={ac.orderIdConfig?.prefix || 'ORD'}
                      onChange={e => setConfig(prev => ({
                        ...prev,
                        automationConfig: { ...prev.automationConfig, orderIdConfig: { ...prev.automationConfig.orderIdConfig, prefix: e.target.value.toUpperCase() } }
                      }))} placeholder="ORD" />
                  </Field>
                  <Field label="Next Order Number">
                    <Input type="number" min="1" className="font-mono font-bold text-base"
                      value={orderCounter} onChange={e => setOrderCounter(e.target.value)} />
                  </Field>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Next Order ID Preview</p>
                    <p className="text-2xl font-bold text-slate-800 font-mono mt-1 tracking-wide">
                      {ac.orderIdConfig?.prefix || 'ORD'}{orderCounter}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Hash className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
};

export default OrderAutomationConfig;
