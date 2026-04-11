// components/RegistrationFormConfig.jsx
import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Save, RefreshCw, Copy, CheckCircle2, Loader2,
  QrCode, Settings, Link, CreditCard, MessageSquare,
  Smartphone, Info, Eye, EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import { publicApi } from '../utils/axios.js';

const RegistrationFormConfig = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingFlow, setFetchingFlow] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [availableFlowFields, setAvailableFlowFields] = useState([]);
  const [copied, setCopied] = useState(false);
  const [configExists, setConfigExists] = useState(false);
  const [showStripeKeys, setShowStripeKeys] = useState(false);

  const [formData, setFormData] = useState({
    whatsappNumber: '',
    triggerWord: '',          // ✅ always a plain string in the UI
    registrationFlowId: '',
    fieldMapping: { customerName: '', location: '', email: '', participants: '' },
    flowMessage: {
      header: '📝 Event Registration',
      body: 'Please fill out the registration form to complete your registration.',
      footer: 'Powered by GoWhats!',
      ctaButtonText: 'Start Registration'
    },
    paymentRequired: false,
    registrationFee: 0,
    paymentGateway: 'razorpay',
    paymentConfigurationName: '',
    stripeConfig: { enabled: false, publicKey: '', secretKey: '', webhookSecret: '' },
    paymentMessage: {
      header: '💳 Complete Your Payment',
      body: 'Please review your order details and complete the payment.',
      footer: 'Secure Payment'
    },
    ticketConfig: { prefix: 'EV', startNumber: 100 },
    confirmationMessage: '🎉 Booking Confirmed! Here are your tickets.'
  });

  const [qrCodeData, setQrCodeData] = useState('');

  useEffect(() => { loadConfiguration(); }, []);

  const getCurrencySymbol = () => formData.paymentGateway === 'stripe' ? 'S$' : '₹';
  const getRegionName    = () => formData.paymentGateway === 'stripe' ? 'Singapore' : 'India';
  const getCurrencyCode  = () => formData.paymentGateway === 'stripe' ? 'SGD' : 'INR';

  // ── LOAD ─────────────────────────────────────────────────────────────────
  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await publicApi.get('/api/registration-config', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success && response.data.exists) {
        const config = response.data.config;

        // ✅ FIX 1: triggerWord comes back as array from DB → convert to comma string
        const triggerWordString = Array.isArray(config.triggerWord)
          ? config.triggerWord.join(', ')
          : (config.triggerWord || '');

        let loadedGateway = 'razorpay';
        if (config.stripeConfig?.enabled === true || config.paymentGateway === 'stripe') {
          loadedGateway = 'stripe';
        }

        setFormData(prev => ({
          ...prev,
          ...config,
          triggerWord:    triggerWordString,            // ✅ always string in form
          paymentGateway: loadedGateway,
          fieldMapping:   config.fieldMapping   || prev.fieldMapping,
          flowMessage:    config.flowMessage    || prev.flowMessage,
          paymentMessage: config.paymentMessage || prev.paymentMessage,
          ticketConfig:   config.ticketConfig   || prev.ticketConfig,
          stripeConfig:   config.stripeConfig   || prev.stripeConfig,
        }));

        setQrCodeData(config.qrCodeData || '');
        setConfigExists(true);
        if (config.registrationFlowId) fetchFlowFields(config.registrationFlowId);
      }
    } catch (error) {
      console.error('Error loading config:', error);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const fetchFlowFields = async (flowId) => {
    if (!flowId) return;
    try {
      setFetchingFlow(true);
      const token = localStorage.getItem('token');
      const response = await publicApi.post(
        '/api/registration-config/fetch-flow-metadata',
        { flowId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setAvailableFlowFields(response.data.fields);
        toast.success('Flow fields loaded successfully');
      }
    } catch (error) {
      toast.error('Could not fetch flow fields');
    } finally {
      setFetchingFlow(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'paymentGateway') {
      setFormData(prev => ({
        ...prev,
        paymentGateway: value,
        stripeConfig: { ...prev.stripeConfig, enabled: value === 'stripe' }
      }));
      return;
    }
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({ ...prev, [parent]: { ...prev[parent], [child]: value } }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
  };

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      if (!formData.whatsappNumber || !formData.triggerWord || !formData.registrationFlowId) {
        toast.error('Please fill all required fields');
        return;
      }
      if (formData.paymentRequired && formData.registrationFee <= 0) {
        toast.error('Please enter a valid registration fee');
        return;
      }
      if (formData.paymentRequired) {
        if (formData.paymentGateway === 'razorpay' && !formData.paymentConfigurationName) {
          toast.error('Please enter Razorpay configuration name');
          return;
        }
        if (formData.paymentGateway === 'stripe' &&
            (!formData.stripeConfig.secretKey || !formData.stripeConfig.webhookSecret)) {
          toast.error('Please enter Stripe Secret Key and Webhook Secret');
          return;
        }
      }

      setSaving(true);
      const token = localStorage.getItem('token');

      // ✅ FIX 2: Convert triggerWord string → clean array before sending
      const triggerWordArray = typeof formData.triggerWord === 'string'
        ? formData.triggerWord.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
        : (Array.isArray(formData.triggerWord) ? formData.triggerWord : []);

      const payload = { ...formData, triggerWord: triggerWordArray };

      const response = await publicApi.post('/api/registration-config', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        toast.success('✅ Configuration Saved Successfully!');
        setQrCodeData(response.data.config.qrCodeData || '');
        setConfigExists(true);

        // ✅ FIX 3: After save, re-normalise the returned array back to string for display
        const savedTrigger = response.data.config.triggerWord;
        setFormData(prev => ({
          ...prev,
          triggerWord: Array.isArray(savedTrigger)
            ? savedTrigger.join(', ')
            : (savedTrigger || prev.triggerWord),
        }));
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(qrCodeData);
    setCopied(true);
    toast.success('QR Code link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8 text-emerald-600"/>
      </div>
    );
  }

  const tabs = [
    { id: 'general',  label: 'General',         icon: Settings      },
    { id: 'flow',     label: 'Flow & Mapping',   icon: Link          },
    { id: 'payment',  label: 'Payment & Ticket', icon: CreditCard    },
    { id: 'messages', label: 'Custom Messages',  icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8 font-sans text-gray-800">

      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Booking Automation</h1>
          <p className="text-gray-500 text-sm mt-1">Configure your WhatsApp registration bot with automatic currency selection.</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-sm disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4"/>}
          Save Configuration
        </button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT */}
        <div className="lg:col-span-7 space-y-6">

          {/* Tabs */}
          <div className="bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm flex overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}>
                <tab.icon className="w-4 h-4"/>{tab.label}
              </button>
            ))}
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 min-h-[500px]">

            {/* ── GENERAL ── */}
            {activeTab === 'general' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Connection Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500">WhatsApp Number</label>
                    <input name="whatsappNumber" value={formData.whatsappNumber} onChange={handleInputChange}
                      className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      placeholder="e.g. 919876543210"/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500">Trigger Word</label>
                    <input
                      name="triggerWord"
                      value={formData.triggerWord}    // ✅ always a string
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      placeholder="e.g. book ticket, BOOK, REGISTER"
                    />
                    <p className="text-xs text-gray-500 mt-1">Enter comma-separated words: BOOK, REGISTER, TICKET</p>
                  </div>
                </div>

                {configExists && qrCodeData && (
                  <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100 flex gap-4 items-start">
                    <QrCode className="w-6 h-6 text-emerald-600 shrink-0 mt-1"/>
                    <div className="flex-1 overflow-hidden">
                      <h4 className="font-bold text-emerald-900 text-sm">QR Code Generated</h4>
                      <p className="text-emerald-700 text-xs mt-1 mb-3">Scan this code to test your bot instantly.</p>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="bg-white p-2 rounded-lg shadow-sm border border-emerald-100">
                          <QRCodeSVG value={qrCodeData} size={80}/>
                        </div>
                        <div className="flex-1 w-full">
                          <div className="flex gap-2">
                            <input readOnly value={qrCodeData}
                              className="w-full text-xs bg-white border border-emerald-200 px-3 py-2 rounded-lg text-gray-600 truncate"/>
                            <button onClick={handleCopy}
                              className="p-2 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-100 text-emerald-700">
                              {copied ? <CheckCircle2 className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── FLOW & MAPPING ── */}
            {activeTab === 'flow' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500">WhatsApp Flow ID</label>
                  <div className="flex gap-2">
                    <input name="registrationFlowId" value={formData.registrationFlowId} onChange={handleInputChange}
                      className="flex-1 border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Enter Flow ID from Meta Business Manager"/>
                    <button onClick={() => fetchFlowFields(formData.registrationFlowId)}
                      disabled={fetchingFlow || !formData.registrationFlowId}
                      className="bg-gray-900 text-white px-4 rounded-lg hover:bg-gray-800 transition flex items-center gap-2 disabled:opacity-50">
                      {fetchingFlow ? <Loader2 className="animate-spin w-4 h-4"/> : <RefreshCw className="w-4 h-4"/>}
                      <span className="hidden sm:inline text-sm">Load</span>
                    </button>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <Link className="w-4 h-4 text-emerald-600"/> Map Flow Fields
                    </h4>
                    <div className="group relative">
                      <Info className="w-4 h-4 text-gray-400 cursor-help"/>
                      <div className="absolute right-0 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg invisible group-hover:visible z-10">
                        Link your Flow fields to our system fields
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['customerName', 'participants', 'location', 'email'].map(field => (
                      <div key={field} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-2">
                          {field.replace(/([A-Z])/g, ' $1')}
                          {field === 'participants' && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <select name={`fieldMapping.${field}`} value={formData.fieldMapping[field]}
                          onChange={handleInputChange}
                          className="w-full bg-white border border-gray-200 p-2 rounded text-sm outline-none focus:border-emerald-500">
                          <option value="">Select Question...</option>
                          {availableFlowFields.map(f => (
                            <option key={f.id} value={f.id}>{f.label || f.id} ({f.type})</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── PAYMENT & TICKET ── */}
            {activeTab === 'payment' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Region */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-5 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Smartphone className="w-5 h-5 text-blue-600"/>
                    <h4 className="font-bold text-blue-900 text-sm">Select Your Region</h4>
                  </div>
                  <p className="text-xs text-blue-700 mb-4">Currency is automatically set based on your region</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'razorpay', flag: '🇮🇳', label: 'India',     sub: 'Razorpay • INR (₹)', ac: 'border-blue-500',   dot: 'bg-blue-500'   },
                      { value: 'stripe',   flag: '🇸🇬', label: 'Singapore', sub: 'Stripe • SGD (S$)',  ac: 'border-purple-500', dot: 'bg-purple-500' },
                    ].map(opt => (
                      <label key={opt.value} className={`cursor-pointer p-4 rounded-lg border-2 transition-all bg-white ${
                        formData.paymentGateway === opt.value ? `${opt.ac} shadow-md` : 'border-gray-200 hover:border-blue-300'
                      }`}>
                        <input type="radio" name="paymentGateway" value={opt.value}
                          checked={formData.paymentGateway === opt.value} onChange={handleInputChange} className="sr-only"/>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            formData.paymentGateway === opt.value ? opt.ac : 'border-gray-300'
                          }`}>
                            {formData.paymentGateway === opt.value && <div className={`w-3 h-3 rounded-full ${opt.dot}`}/>}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{opt.flag} {opt.label}</p>
                            <p className="text-xs text-gray-500">{opt.sub}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Payment toggle */}
                <div className="bg-amber-50 p-5 rounded-xl border border-amber-100">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
                        <CreditCard className="w-4 h-4"/> Require Payment
                      </h4>
                      <p className="text-xs text-amber-700 mt-1">Current: {getRegionName()} • Currency: {getCurrencyCode()}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="paymentRequired" checked={formData.paymentRequired}
                        onChange={handleInputChange} className="sr-only peer"/>
                      <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>

                  {formData.paymentRequired && (
                    <div className="space-y-4 animate-in slide-in-from-top-2">
                      <div>
                        <label className="block text-xs font-bold text-amber-700 uppercase mb-1">
                          Fee per Ticket ({getCurrencySymbol()})
                        </label>
                        <input type="number" name="registrationFee" value={formData.registrationFee}
                          onChange={handleInputChange} min="0" step="0.01"
                          className="w-full border border-amber-200 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none"
                          placeholder={formData.paymentGateway === 'stripe' ? '50.00' : '500'}/>
                        <p className="text-xs text-amber-600 mt-1">Will be charged in {getCurrencyCode()}</p>
                      </div>

                      {formData.paymentGateway === 'razorpay' && (
                        <div className="p-4 bg-white rounded-lg border border-blue-200">
                          <h5 className="font-bold text-blue-900 text-xs mb-3 flex items-center gap-2">
                            <CreditCard className="w-4 h-4"/> Razorpay Configuration (India)
                          </h5>
                          <label className="block text-xs font-bold text-gray-600 mb-1">Configuration Name</label>
                          <input name="paymentConfigurationName" value={formData.paymentConfigurationName}
                            onChange={handleInputChange} placeholder="e.g. razorpay"
                            className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none"/>
                          <p className="text-xs text-gray-500 mt-1">Enter your Razorpay configuration name from WhatsApp Business settings</p>
                        </div>
                      )}

                      {formData.paymentGateway === 'stripe' && (
                        <div className="p-4 bg-white rounded-lg border border-purple-200">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="font-bold text-purple-900 text-xs flex items-center gap-2">
                              <CreditCard className="w-4 h-4"/> Stripe Configuration (Singapore)
                            </h5>
                            <button type="button" onClick={() => setShowStripeKeys(!showStripeKeys)}
                              className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                              {showStripeKeys ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
                              {showStripeKeys ? 'Hide' : 'Show'}
                            </button>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">Secret Key <span className="text-red-500">*</span></label>
                              <input type={showStripeKeys ? 'text' : 'password'} name="stripeConfig.secretKey"
                                value={formData.stripeConfig.secretKey} onChange={handleInputChange} placeholder="sk_test_..."
                                className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none font-mono"/>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">Webhook Secret <span className="text-red-500">*</span></label>
                              <input type={showStripeKeys ? 'text' : 'password'} name="stripeConfig.webhookSecret"
                                value={formData.stripeConfig.webhookSecret} onChange={handleInputChange} placeholder="whsec_..."
                                className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none font-mono"/>
                            </div>
                            <div className="bg-purple-50 p-3 rounded-lg">
                              <p className="font-semibold text-purple-900 text-xs mb-1">📝 Webhook URL:</p>
                              <code className="text-purple-700 text-xs break-all block">https://bot.gowhats.in/webhook/stripe</code>
                              <p className="text-xs text-purple-600 mt-2">Add this URL in your Stripe Dashboard → Webhooks</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Ticket config */}
                <div className="grid grid-cols-2 gap-5 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase">Ticket ID Prefix</label>
                    <input name="ticketConfig.prefix" value={formData.ticketConfig.prefix} onChange={handleInputChange}
                      className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="EV"/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase">Start Sequence</label>
                    <input type="number" name="ticketConfig.startNumber" value={formData.ticketConfig.startNumber}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"/>
                  </div>
                </div>
              </div>
            )}

            {/* ── MESSAGES ── */}
            {activeTab === 'messages' && (
              <div className="space-y-8 animate-in fade-in duration-300">

                {/* 1. Registration Invitation */}
                <div className="relative pl-4 border-l-2 border-blue-200">
                  <span className="absolute -left-2.5 top-0 bg-blue-100 text-blue-600 rounded-full p-1 shadow-sm">
                    <MessageSquare className="w-3 h-3"/>
                  </span>
                  <h4 className="font-bold text-gray-900 mb-3 text-sm">1. Registration Invitation</h4>
                  <div className="grid gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Header</label>
                      <input name="flowMessage.header" value={formData.flowMessage.header} onChange={handleInputChange}
                        className="w-full border p-2 rounded-lg text-sm font-bold focus:border-blue-400 outline-none"
                        placeholder="Header (max 60 chars)" maxLength={60}/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Body</label>
                      <textarea name="flowMessage.body" value={formData.flowMessage.body} onChange={handleInputChange}
                        className="w-full border p-2 rounded-lg text-sm focus:border-blue-400 outline-none"
                        rows="3" placeholder="Body text" maxLength={1024}/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Button Text</label>
                      <input name="flowMessage.ctaButtonText" value={formData.flowMessage.ctaButtonText} onChange={handleInputChange}
                        className="w-full border p-2 rounded-lg text-sm text-blue-600 font-semibold focus:border-blue-400 outline-none"
                        placeholder="Button text (max 20 chars)" maxLength={20}/>
                    </div>
                  </div>
                </div>

                {/* 2. Payment Message */}
                {formData.paymentRequired && (
                  <div className="relative pl-4 border-l-2 border-amber-200">
                    <span className="absolute -left-2.5 top-0 bg-amber-100 text-amber-600 rounded-full p-1 shadow-sm">
                      <CreditCard className="w-3 h-3"/>
                    </span>
                    <h4 className="font-bold text-gray-900 mb-3 text-sm">2. Payment Request</h4>
                    <div className="grid gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Header</label>
                        <input name="paymentMessage.header" value={formData.paymentMessage.header} onChange={handleInputChange}
                          className="w-full border p-2 rounded-lg text-sm font-bold focus:border-amber-400 outline-none"
                          placeholder="Header" maxLength={60}/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Body</label>
                        <textarea name="paymentMessage.body" value={formData.paymentMessage.body} onChange={handleInputChange}
                          className="w-full border p-2 rounded-lg text-sm focus:border-amber-400 outline-none"
                          rows="2" placeholder="Body" maxLength={1024}/>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Confirmation with Ticket */}
                <div className="relative pl-4 border-l-2 border-green-200">
                  <span className="absolute -left-2.5 top-0 bg-green-100 text-green-600 rounded-full p-1 shadow-sm">
                    <CheckCircle2 className="w-3 h-3"/>
                  </span>
                  <h4 className="font-bold text-gray-900 mb-2 text-sm">3. Confirmation with Ticket</h4>

                  {/* Variable hint */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-xs text-green-800 space-y-0.5">
                    <p className="font-bold mb-1">Available variables (DO NOT include currency symbol manually):</p>
                    <p><code className="bg-green-100 px-1 rounded">{'{count}'}</code> → number of participants</p>
                    <p><code className="bg-green-100 px-1 rounded">{'{fee}'}</code> → fee per person e.g. <strong>S$15.00</strong></p>
                    <p><code className="bg-green-100 px-1 rounded">{'{total}'}</code> → total fee e.g. <strong>S$30.00</strong></p>
                    <p><code className="bg-green-100 px-1 rounded">{'{ticketId}'}</code> → ticket reference</p>
                    <p><code className="bg-green-100 px-1 rounded">{'{name}'}</code> → customer name</p>
                    <p className="mt-1.5 text-green-700 font-semibold">*text* = <strong>bold</strong> &nbsp;|&nbsp; _text_ = <em>italic</em></p>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Message</label>
                    <textarea
                      name="confirmationMessage"
                      value={formData.confirmationMessage}
                      onChange={handleInputChange}
                      className="w-full border p-3 rounded-lg text-sm focus:border-green-400 outline-none font-mono"
                      rows="9"
                      placeholder={`🎉 *Registration Successful!*\n\nThank you for registering.\n\n💰 *Registration Fee:* {fee} per person\n👥 *Admit:* {count} Person(s)\n💵 *Total Paid:* {total}\n\n🎟️ *Ticket Ref:* {ticketId}\n\n_Show this QR code at the entrance._\n\n_Powered by GoWhats!_`}
                    />
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>

        {/* RIGHT - Live Preview */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="sticky top-8">
            <div className="bg-black rounded-[3rem] p-2 shadow-2xl border-[3px] border-black h-[660px] w-[320px] relative overflow-hidden ring-1 ring-gray-900">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-b-xl z-30"></div>
              <div className="bg-[#efeae2] w-full h-full rounded-[2.5rem] overflow-hidden relative flex flex-col">

                <div className="h-8 w-full bg-[#008069] flex items-center justify-between px-5 text-[10px] text-white font-medium pt-2 z-20">
                  <span>9:41</span>
                  <div className="flex gap-1"><span>5G</span><span>100%</span></div>
                </div>

                <div className="bg-[#008069] p-2 px-4 flex items-center gap-3 shadow-sm z-20">
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[#008069] font-bold text-xs">B</div>
                  <div>
                    <p className="text-white text-sm font-semibold leading-tight">Business Account</p>
                    <p className="text-white/80 text-[10px]">Online</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4 relative"
                  style={{backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: '400px', backgroundBlendMode: 'soft-light'}}>

                  <div className="flex justify-end">
                    <div className="bg-[#d9fdd3] text-black p-2 px-3 rounded-lg rounded-tr-none text-sm max-w-[85%] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
                      <p>{formData.triggerWord || 'BOOK'}</p>
                      <span className="text-[9px] text-gray-500 block text-right mt-1">9:41 AM</span>
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <div className="bg-white text-black rounded-lg rounded-tl-none max-w-[85%] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] overflow-hidden">
                      <div className="p-3">
                        <p className="font-bold text-sm mb-1">{formData.flowMessage.header}</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{formData.flowMessage.body}</p>
                        <p className="text-[10px] text-gray-400 mt-2">{formData.flowMessage.footer}</p>
                      </div>
                      <div className="border-t border-gray-100 p-2 text-center bg-gray-50">
                        <span className="text-[#00a884] text-sm font-medium flex items-center justify-center gap-1">
                          <Settings className="w-3 h-3"/> {formData.flowMessage.ctaButtonText}
                        </span>
                      </div>
                    </div>
                  </div>

                  {formData.paymentRequired && (
                    <div className="flex justify-start">
                      <div className="bg-white text-black rounded-lg rounded-tl-none max-w-[85%] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] overflow-hidden">
                        <div className="p-3">
                          <p className="font-bold text-sm mb-1">{formData.paymentMessage.header}</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{formData.paymentMessage.body}</p>
                          <div className="mt-2 bg-gray-50 p-2 rounded text-center border border-gray-100">
                            <p className="text-lg font-bold text-gray-800">{getCurrencySymbol()}{formData.registrationFee || '0.00'}</p>
                            <p className="text-[10px] text-gray-500">{getCurrencyCode()} • {getRegionName()}</p>
                          </div>
                        </div>
                        <div className="border-t border-gray-100 p-2 text-center bg-gray-50">
                          <span className="text-[#00a884] text-sm font-medium">
                            {formData.paymentGateway === 'stripe' ? 'Pay with Stripe' : 'Review and Pay'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-start">
                    <div className="bg-white text-black p-1 rounded-lg rounded-tl-none max-w-[75%] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
                      <div className="bg-gray-50 p-2 rounded mb-1 flex justify-center">
                        <QRCodeSVG value="TEST-TICKET-123" size={100}/>
                      </div>
                      <div className="px-2 pb-1">
                        <p className="text-xs text-gray-800 whitespace-pre-line">{formData.confirmationMessage}</p>
                        <span className="text-[9px] text-gray-400 block mt-1">9:43 AM</span>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="h-14 bg-[#f0f2f5] px-2 flex items-center gap-2 z-20">
                  <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-white">+</div>
                  <div className="flex-1 h-9 bg-white rounded-lg border border-gray-200"></div>
                  <div className="w-9 h-9 rounded-full bg-[#008069] flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-white"/>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-6 uppercase tracking-widest font-semibold">Live Preview</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default RegistrationFormConfig;
