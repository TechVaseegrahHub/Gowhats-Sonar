import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Upload, Type, Plus, Trash2, Info, Loader2, CheckCircle, AlertCircle,
  Image, Video, FileText, Globe, Eye, EyeOff, Layers, Phone, MoreVertical,
  Search, Paperclip, Mic, Smile, Camera, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TemplateModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false); // Mobile preview toggle
  const [bodyExamples, setBodyExamples] = useState({});
  const [headerExamples, setHeaderExamples] = useState({});

  // Form State
  const [form, setForm] = useState({
    name: '',
    category: 'MARKETING',
    language: 'en',
    headerType: 'NONE',
    headerText: '',
    headerMedia: null,
    bodyText: '',
    footerText: '',
    buttons: [],
    cards: [
      { headerMedia: null, bodyText: '', buttons: [] },
      { headerMedia: null, bodyText: '', buttons: [] }
    ]
  });

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'en_US', label: 'English (US)' },
    { code: 'ta', label: 'Tamil' }
  ];

  const getVariableIndexes = (text = '') => {
    const regex = /\{\{(\d+)\}\}/g;
    const indexes = new Set();
    let match;
    while ((match = regex.exec(String(text || '')))) {
      indexes.add(Number(match[1]));
    }
    return Array.from(indexes)
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
  };

  const hasSequentialGap = (indexes = []) =>
    indexes.some((value, i) => value !== i + 1);

  const replaceTemplateVariables = (text = '', examples = {}) =>
    String(text).replace(/\{\{(\d+)\}\}/g, (_, index) => {
      const value = String(examples?.[index] || '').trim();
      return value || `{{${index}}}`;
    });

  const appendNextVariable = (field) => {
    const current = String(form[field] || '');
    const indexes = getVariableIndexes(current);
    const nextIndex = (indexes[indexes.length - 1] || 0) + 1;
    const token = `{{${nextIndex}}}`;
    const separator = current && !current.endsWith(' ') ? ' ' : '';
    setForm((prev) => ({ ...prev, [field]: `${current}${separator}${token}` }));
  };

  const bodyVariableIndexes = useMemo(() => getVariableIndexes(form.bodyText), [form.bodyText]);
  const headerVariableIndexes = useMemo(
    () => (form.headerType === 'TEXT' ? getVariableIndexes(form.headerText) : []),
    [form.headerType, form.headerText]
  );

  useEffect(() => {
    setBodyExamples((prev) => {
      const next = {};
      bodyVariableIndexes.forEach((index) => {
        next[index] = prev[index] || '';
      });
      return next;
    });
  }, [bodyVariableIndexes]);

  useEffect(() => {
    if (form.headerType !== 'TEXT') {
      setHeaderExamples({});
      return;
    }

    setHeaderExamples((prev) => {
      const next = {};
      headerVariableIndexes.forEach((index) => {
        next[index] = prev[index] || '';
      });
      return next;
    });
  }, [form.headerType, headerVariableIndexes]);

  // --- CAROUSEL HANDLERS ---
  const addCard = () => {
    if (form.cards.length >= 10) return toast.error("Max 10 cards allowed");
    setForm(prev => ({
      ...prev,
      cards: [...prev.cards, { headerMedia: null, bodyText: '', buttons: [] }]
    }));
  };

  const removeCard = (index) => {
    if (form.cards.length <= 2) return toast.error("Min 2 cards required");
    setForm(prev => ({
      ...prev,
      cards: prev.cards.filter((_, i) => i !== index)
    }));
  };

  const updateCard = (index, field, value) => {
    const newCards = [...form.cards];
    newCards[index][field] = value;
    setForm(prev => ({ ...prev, cards: newCards }));
  };

  const handleCardFileChange = (index, e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) return toast.error("File size must be under 5MB");
      updateCard(index, 'headerMedia', file);
    }
  };

  const addCardButton = (cardIndex, type) => {
    const currentButtons = form.cards[cardIndex].buttons;
    if (currentButtons.length >= 2) return toast.error("Max 2 buttons per card");

    const newBtn = type === 'QUICK_REPLY'
      ? { type: 'QUICK_REPLY', text: '' }
      : type === 'URL'
      ? { type: 'URL', text: '', url: '' }
      : { type: 'PHONE_NUMBER', text: '', phone_number: '' };

    const newCards = [...form.cards];
    newCards[cardIndex].buttons.push(newBtn);
    setForm(prev => ({ ...prev, cards: newCards }));
  };

  const updateCardButton = (cardIndex, btnIndex, field, value) => {
    const newCards = [...form.cards];
    newCards[cardIndex].buttons[btnIndex][field] = value;
    setForm(prev => ({ ...prev, cards: newCards }));
  };

  const removeCardButton = (cardIndex, btnIndex) => {
    const newCards = [...form.cards];
    newCards[cardIndex].buttons = newCards[cardIndex].buttons.filter((_, i) => i !== btnIndex);
    setForm(prev => ({ ...prev, cards: newCards }));
  };

  // --- STANDARD HANDLERS ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setForm(prev => ({ ...prev, headerMedia: file }));
    }
  };

  const addButton = (type) => {
    if (form.buttons.length >= 3) return toast.error("Max 3 buttons allowed");
    const newBtn = type === 'QUICK_REPLY' ? { type: 'QUICK_REPLY', text: '' } :
                   type === 'URL' ? { type: 'URL', text: '', url: '' } :
                   { type: 'PHONE_NUMBER', text: '', phone_number: '' };
    setForm(prev => ({ ...prev, buttons: [...prev.buttons, newBtn] }));
  };

  const updateButton = (index, field, value) => {
    const newButtons = [...form.buttons];
    newButtons[index][field] = value;
    setForm(prev => ({ ...prev, buttons: newButtons }));
  };

  const removeButton = (index) => {
    setForm(prev => ({ ...prev, buttons: prev.buttons.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async () => {
    if (!form.name) return toast.error("Template name is required");

    if (form.headerType === 'CAROUSEL') {
       for(let i=0; i<form.cards.length; i++) {
          if(!form.cards[i].headerMedia) return toast.error(`Card ${i+1} is missing an image`);
          if(!form.cards[i].bodyText) return toast.error(`Card ${i+1} is missing body text`);
       }
    } else {
       if (!form.bodyText) return toast.error("Message body is required");
    }

    if (hasSequentialGap(bodyVariableIndexes)) {
      return toast.error('Body variables must be sequential like {{1}}, {{2}}, {{3}}');
    }
    if (hasSequentialGap(headerVariableIndexes)) {
      return toast.error('Header variables must be sequential like {{1}}, {{2}}, {{3}}');
    }

    const missingBodyExamples = bodyVariableIndexes.filter(
      (index) => !String(bodyExamples[index] || '').trim()
    );
    if (missingBodyExamples.length > 0) {
      return toast.error(`Missing example values for body variable(s): ${missingBodyExamples.map((n) => `{{${n}}}`).join(', ')}`);
    }

    const missingHeaderExamples = headerVariableIndexes.filter(
      (index) => !String(headerExamples[index] || '').trim()
    );
    if (missingHeaderExamples.length > 0) {
      return toast.error(`Missing example values for header variable(s): ${missingHeaderExamples.map((n) => `{{${n}}}`).join(', ')}`);
    }

    setLoading(true);
    const toastId = toast.loading("Submitting template to Meta...");

    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('category', form.category);
      formData.append('language', form.language);
      formData.append('headerType', form.headerType);

      if (form.headerType === 'CAROUSEL') {
        formData.append('bodyText', form.bodyText || ' ');
        const cardsData = form.cards.map(c => ({
          bodyText: c.bodyText,
          buttons: c.buttons
        }));

        formData.append('cards', JSON.stringify(cardsData));

        form.cards.forEach((card, index) => {
          if (card.headerMedia) {
            formData.append(`cardMedia_${index}`, card.headerMedia);
          }
        });

        if (bodyVariableIndexes.length > 0) {
          const orderedBodyExamples = bodyVariableIndexes.map((index) =>
            String(bodyExamples[index] || '').trim()
          );
          formData.append('bodyExamples', JSON.stringify(orderedBodyExamples));
        }
      } else {
        formData.append('bodyText', form.bodyText);
        if (form.footerText) formData.append('footerText', form.footerText);
        if (form.headerType === 'TEXT' && form.headerText) formData.append('headerText', form.headerText);
        else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && form.headerMedia) formData.append('mediaFile', form.headerMedia);
        if (form.buttons.length > 0) formData.append('buttons', JSON.stringify(form.buttons));

        if (bodyVariableIndexes.length > 0) {
          const orderedBodyExamples = bodyVariableIndexes.map((index) =>
            String(bodyExamples[index] || '').trim()
          );
          formData.append('bodyExamples', JSON.stringify(orderedBodyExamples));
        }

        if (headerVariableIndexes.length > 0) {
          const orderedHeaderExamples = headerVariableIndexes.map((index) =>
            String(headerExamples[index] || '').trim()
          );
          formData.append('headerExamples', JSON.stringify(orderedHeaderExamples));
        }
      }

      const token = localStorage.getItem('token');

      const response = await fetch('https://bot.gowhats.in/api/templates/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Template submitted successfully!", { id: toastId });
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      } else {
        throw new Error(data.error || "Submission failed");
      }

    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to create template", { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  // Preview Component (reusable for both mobile and desktop)
  const PreviewContent = () => (
    <div className="w-full max-w-[280px] sm:max-w-[300px] h-[500px] sm:h-[600px] bg-white rounded-[30px] sm:rounded-[35px] border-[6px] sm:border-[8px] border-gray-900 overflow-hidden relative shadow-2xl flex flex-col shrink-0 mx-auto">
      {/* WhatsApp Header */}
      <div className="bg-[#008069] h-12 sm:h-14 w-full shrink-0 flex items-center px-3 gap-2">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold text-xs">
          G
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-xs sm:text-sm truncate">GoWhats</div>
          <div className="text-white/80 text-[9px] sm:text-[10px]">online</div>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"/>
          <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"/>
          <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"/>
        </div>
      </div>

      {/* Chat Area */}
      <div
        className="flex-1 p-2 sm:p-3 overflow-y-auto bg-[#efeae2] scrollbar-thin scrollbar-thumb-gray-300"
        style={{
          backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"40\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h40v40H0z\" fill=\"%23efeae2\"/%3E%3Cpath d=\"M20 0c5.523 0 10 4.477 10 10s-4.477 10-10 10S10 15.523 10 10 14.477 0 20 0z\" fill=\"%23d9d4cd\" opacity=\".05\"/%3E%3C/svg%3E')"
        }}
      >
        <div className="flex justify-end mb-2">
          <div className="bg-[#d9fdd3] rounded-lg rounded-br-none shadow-sm max-w-[95%] sm:max-w-[90%] p-1">

            {/* CAROUSEL PREVIEW */}
            {form.headerType === 'CAROUSEL' ? (
              <div className="space-y-1">
                {form.bodyText && (
                  <div className="px-2 pt-2 pb-1 text-[11px] sm:text-xs text-gray-900">
                    {replaceTemplateVariables(form.bodyText, bodyExamples)}
                  </div>
                )}

                <div className="flex overflow-x-auto gap-1.5 sm:gap-2 pb-2 snap-x snap-mandatory scrollbar-none">
                  {form.cards.map((card, i) => (
                    <div
                      key={i}
                      className="min-w-[150px] sm:min-w-[180px] bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden snap-center flex-shrink-0"
                    >
                      <div className="h-20 sm:h-24 bg-gray-200 flex items-center justify-center">
                        {card.headerMedia ? (
                          <img
                            src={URL.createObjectURL(card.headerMedia)}
                            className="h-full w-full object-cover"
                            alt={`Card ${i + 1}`}
                          />
                        ) : (
                          <Image className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400"/>
                        )}
                      </div>
                      <div className="p-1.5 sm:p-2">
                        <p className="text-[10px] sm:text-xs text-gray-900 font-medium truncate">
                          {card.bodyText || `Card ${i + 1}`}
                        </p>
                      </div>
                      {card.buttons.map((btn, bi) => (
                        <div
                          key={bi}
                          className="border-t border-gray-200 py-1 sm:py-1.5 text-center text-[#00a884] text-[9px] sm:text-[10px] font-bold cursor-pointer hover:bg-gray-50"
                        >
                          {btn.text || "Button"}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="px-1 text-[8px] sm:text-[9px] text-gray-500 text-right">
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ) : (
              /* STANDARD PREVIEW */
              <div>
                {/* Header Preview */}
                {form.headerType === 'TEXT' && form.headerText && (
                  <div className="font-bold text-[11px] sm:text-xs px-2 pt-2 pb-1 text-gray-900">
                    {replaceTemplateVariables(form.headerText, headerExamples)}
                  </div>
                )}

                {form.headerType === 'IMAGE' && form.headerMedia && (
                  <div className="mb-1">
                    <img
                      src={URL.createObjectURL(form.headerMedia)}
                      className="w-full rounded-md max-h-28 sm:max-h-32 object-cover"
                      alt="Header"
                    />
                  </div>
                )}

                {form.headerType === 'VIDEO' && form.headerMedia && (
                  <div className="mb-1 relative">
                    <video
                      src={URL.createObjectURL(form.headerMedia)}
                      className="w-full rounded-md max-h-28 sm:max-h-32 object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-md">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/90 rounded-full flex items-center justify-center pl-0.5 sm:pl-1">
                        <div className="w-0 h-0 border-t-[5px] sm:border-t-[6px] border-t-transparent border-l-[8px] sm:border-l-[10px] border-l-gray-800 border-b-[5px] sm:border-b-[6px] border-b-transparent"/>
                      </div>
                    </div>
                  </div>
                )}

                {form.headerType === 'DOCUMENT' && form.headerMedia && (
                  <div className="mb-1 p-2 bg-white rounded-md flex items-center gap-2 border border-gray-100">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-red-500"/>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] sm:text-[10px] font-medium text-gray-900 truncate">
                        {form.headerMedia.name}
                      </div>
                      <div className="text-[8px] sm:text-[9px] text-gray-500">
                        {(form.headerMedia.size / 1024).toFixed(0)} KB • PDF
                      </div>
                    </div>
                  </div>
                )}

                {/* Body */}
                {form.bodyText && (
                  <div className="px-2 py-1 text-[11px] sm:text-xs text-gray-900 whitespace-pre-wrap leading-relaxed">
                    {replaceTemplateVariables(form.bodyText, bodyExamples)}
                  </div>
                )}

                {/* Footer */}
                {form.footerText && (
                  <div className="px-2 py-1 text-[9px] sm:text-[10px] text-gray-500">
                    {form.footerText}
                  </div>
                )}

                {/* Buttons */}
                {form.buttons.length > 0 && (
                  <div className="border-t border-gray-300/50 mt-1">
                    {form.buttons.map((btn, idx) => (
                      <div
                        key={idx}
                        className="py-1.5 sm:py-2 text-center text-[#00a884] text-[10px] sm:text-xs font-semibold border-b border-gray-200/50 last:border-b-0 cursor-pointer hover:bg-gray-50 flex items-center justify-center gap-1"
                      >
                        {btn.type === 'PHONE_NUMBER' && <Phone className="w-2.5 h-2.5 sm:w-3 sm:h-3"/>}
                        {btn.type === 'URL' && <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3"/>}
                        {btn.text || 'Button'}
                      </div>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <div className="px-1 pb-0.5 text-[8px] sm:text-[9px] text-gray-500 text-right">
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Input */}
      <div className="bg-[#f0f2f5] px-2 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Smile className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500"/>
        <div className="flex-1 bg-white rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2 border border-gray-100">
          <input
            type="text"
            placeholder="Type a message"
            className="flex-1 text-[10px] sm:text-xs outline-none bg-transparent"
            disabled
          />
          <Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500"/>
          <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500"/>
        </div>
        <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#008069] rounded-full flex items-center justify-center shadow-sm">
          <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"/>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-7xl h-[95vh] sm:h-[90vh] flex flex-col sm:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Mobile Header with Preview Toggle */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Create Template</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`p-2 rounded-lg transition-colors ${showPreview ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}
            >
              <Eye className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500"/>
            </button>
          </div>
        </div>

        {/* Mobile Preview Overlay */}
        {showPreview && (
          <div className="lg:hidden fixed inset-0 bg-gray-100 z-50 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
              <button
                onClick={() => setShowPreview(false)}
                className="flex items-center gap-2 text-gray-600 font-medium"
              >
                <ChevronLeft className="w-5 h-5" />
                Back to Editor
              </button>
              <span className="text-sm font-bold text-gray-900">Preview</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
              <PreviewContent />
            </div>
          </div>
        )}

        {/* LEFT: FORM EDITOR */}
        <div className={`w-full lg:w-1/2 flex flex-col border-r border-gray-200 bg-white h-full overflow-y-auto ${showPreview ? 'hidden lg:flex' : 'flex'}`}>
          {/* Desktop Header */}
          <div className="hidden lg:flex justify-between items-center p-6 sm:p-8 pb-4 sm:pb-6 shrink-0">
            <h2 className="text-xl font-bold">Create Template</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500 hover:text-red-500"/>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 sm:pb-8">
            <div className="space-y-4 sm:space-y-6">
              {/* Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Name</label>
                <input
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})}
                  placeholder="seasonal_promo_carousel"
                />
                <p className="text-[10px] text-gray-400 mt-1">Lowercase letters, numbers, and underscores only.</p>
              </div>

              {/* Category & Language */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Category</label>
                  <select className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Language</label>
                  <select className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none" value={form.language} onChange={e => setForm({...form, language: e.target.value})}>
                    {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Content Type Selector */}
              <div>
                <label className="text-sm font-bold text-gray-800 block mb-2">Content Type</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    {id:'NONE',icon:X,label:'None'},
                    {id:'TEXT',icon:Type,label:'Text'},
                    {id:'IMAGE',icon:Image,label:'Image'},
                    {id:'VIDEO',icon:Video,label:'Video'},
                    {id:'DOCUMENT',icon:FileText,label:'Doc'},
                    {id:'CAROUSEL',icon:Layers,label:'Carousel'}
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setForm({...form, headerType: t.id})}
                      className={`flex flex-col items-center py-2.5 sm:py-3 rounded-lg border transition-all ${
                        form.headerType===t.id
                          ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <t.icon className="w-4 h-4 mb-1"/>
                      <span className="text-[9px] sm:text-[10px] font-bold">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* CAROUSEL FORM */}
              {form.headerType === 'CAROUSEL' ? (
                <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="text-sm font-bold text-gray-800 block mb-2">Main Message Body (Optional)</label>
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <textarea
                          className="w-full border p-3 rounded-xl text-sm h-20 sm:h-24 focus:ring-2 focus:ring-green-500 outline-none"
                          placeholder="Check out our new collection!"
                          value={form.bodyText}
                          onChange={e => setForm({...form, bodyText: e.target.value})}
                        />
                        <button
                          type="button"
                          onClick={() => appendNextVariable('bodyText')}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold bg-white hover:bg-gray-50 h-fit"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Variable
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Use placeholders like <span className="font-semibold">{'{{1}}'}</span> and add examples below.
                      </p>
                    </div>

                    {bodyVariableIndexes.length > 0 && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-800">
                          Body variable examples (required)
                        </p>
                        {bodyVariableIndexes.map((index) => (
                          <div key={`carousel-body-var-${index}`} className="space-y-1">
                            <label className="text-[11px] font-medium text-gray-600">
                              Example for {`{{${index}}}`}
                            </label>
                            <input
                              className="w-full border p-2 rounded-lg text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                              placeholder={`Value for {{${index}}}`}
                              value={bodyExamples[index] || ''}
                              onChange={(e) =>
                                setBodyExamples((prev) => ({
                                  ...prev,
                                  [index]: e.target.value
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <label className="text-sm font-bold text-gray-800">Carousel Cards (2-10)</label>
                      <button onClick={addCard} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg font-bold hover:bg-gray-800">
                        + Add Card
                      </button>
                    </div>

                    {form.cards.map((card, idx) => (
                      <div key={idx} className="border border-gray-300 rounded-xl p-3 sm:p-4 bg-gray-50 relative">
                        <div className="flex justify-between mb-3">
                          <span className="text-xs font-bold text-gray-500">CARD {idx + 1}</span>
                          {form.cards.length > 2 && (
                            <button onClick={() => removeCard(idx)}>
                              <Trash2 className="w-4 h-4 text-red-500"/>
                            </button>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="block text-xs font-semibold mb-1">Card Image *</label>
                          <input
                            type="file"
                            className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-green-50 file:text-green-700"
                            accept="image/*"
                            onChange={(e) => handleCardFileChange(idx, e)}
                          />
                          {card.headerMedia && (
                            <p className="text-xs text-green-600 mt-1 flex items-center gap-1 truncate">
                              <CheckCircle className="w-3 h-3 shrink-0"/> <span className="truncate">{card.headerMedia.name}</span>
                            </p>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="block text-xs font-semibold mb-1">Card Body *</label>
                          <input
                            className="w-full border p-2 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none"
                            placeholder="Item description"
                            value={card.bodyText}
                            onChange={e => updateCard(idx, 'bodyText', e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold">Buttons (Max 2)</label>
                          {card.buttons.map((btn, bIdx) => (
                            <div key={bIdx} className="flex flex-col sm:flex-row gap-2">
                              <select className="border p-1.5 rounded text-xs w-full sm:w-24 bg-white" value={btn.type} disabled>
                                <option>{btn.type}</option>
                              </select>
                              <input
                                className="border p-1.5 rounded text-xs flex-1 focus:ring-1 focus:ring-green-500 outline-none"
                                placeholder="Button Text"
                                value={btn.text}
                                onChange={e => updateCardButton(idx, bIdx, 'text', e.target.value)}
                              />
                              {btn.type === 'URL' && (
                                <input
                                  className="border p-1.5 rounded text-xs flex-1 focus:ring-1 focus:ring-green-500 outline-none"
                                  placeholder="https://..."
                                  value={btn.url}
                                  onChange={e => updateCardButton(idx, bIdx, 'url', e.target.value)}
                                />
                              )}
                              <button onClick={() => removeCardButton(idx, bIdx)} className="self-center">
                                <X className="w-4 h-4 text-red-500"/>
                              </button>
                            </div>
                          ))}
                          {card.buttons.length < 2 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              <button
                                onClick={() => addCardButton(idx, 'QUICK_REPLY')}
                                className="text-[10px] border px-2 py-1 rounded bg-white hover:bg-gray-100"
                              >
                                + Quick Reply
                              </button>
                              <button
                                onClick={() => addCardButton(idx, 'URL')}
                                className="text-[10px] border px-2 py-1 rounded bg-white hover:bg-gray-100"
                              >
                                + URL Button
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* STANDARD FORM */
                <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right-4 duration-300">
                  {['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold">Header Content</label>
                      {form.headerType === 'TEXT' ? (
                        <div className="space-y-2">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                              placeholder="Header Text"
                              value={form.headerText}
                              onChange={e => setForm({...form, headerText: e.target.value})}
                            />
                            <button
                              type="button"
                              onClick={() => appendNextVariable('headerText')}
                              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold bg-white hover:bg-gray-50"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Variable
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            Use variable placeholders like <span className="font-semibold">{'{{1}}'}</span>,{' '}
                            <span className="font-semibold">{'{{2}}'}</span>.
                          </p>

                          {headerVariableIndexes.length > 0 && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                              <p className="text-xs font-semibold text-blue-800">
                                Header variable examples
                              </p>
                              {headerVariableIndexes.map((index) => (
                                <div key={`header-var-${index}`} className="space-y-1">
                                  <label className="text-[11px] font-medium text-gray-600">
                                    Example for {`{{${index}}}`}
                                  </label>
                                  <input
                                    className="w-full border p-2 rounded-lg text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                    placeholder={`Value for {{${index}}}`}
                                    value={headerExamples[index] || ''}
                                    onChange={(e) =>
                                      setHeaderExamples((prev) => ({
                                        ...prev,
                                        [index]: e.target.value
                                      }))
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="file"
                            className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-green-50 file:text-green-700"
                            accept={form.headerType === 'IMAGE' ? 'image/*' : form.headerType === 'VIDEO' ? 'video/*' : '*'}
                            onChange={handleFileChange}
                          />
                          {form.headerMedia && (
                            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 shrink-0"/> <span className="truncate">{form.headerMedia.name}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-bold block mb-2">Message Body *</label>
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <textarea
                          className="w-full border p-3 rounded-xl text-sm h-28 sm:h-32 focus:ring-2 focus:ring-green-500 outline-none"
                          placeholder="Hello {{1}}..."
                          value={form.bodyText}
                          onChange={e => setForm({...form, bodyText: e.target.value})}
                        />
                        <button
                          type="button"
                          onClick={() => appendNextVariable('bodyText')}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold bg-white hover:bg-gray-50 h-fit"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Variable
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Use placeholders like <span className="font-semibold">{'{{1}}'}</span>,{' '}
                        <span className="font-semibold">{'{{2}}'}</span> and provide sample values below.
                      </p>
                    </div>

                    {bodyVariableIndexes.length > 0 && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-800">
                          Body variable examples (required)
                        </p>
                        {bodyVariableIndexes.map((index) => (
                          <div key={`body-var-${index}`} className="space-y-1">
                            <label className="text-[11px] font-medium text-gray-600">
                              Example for {`{{${index}}}`}
                            </label>
                            <input
                              className="w-full border p-2 rounded-lg text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-none"
                              placeholder={`Value for {{${index}}}`}
                              value={bodyExamples[index] || ''}
                              onChange={(e) =>
                                setBodyExamples((prev) => ({
                                  ...prev,
                                  [index]: e.target.value
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-bold block mb-2">Footer</label>
                    <input
                      className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="Powered by GoWhats"
                      value={form.footerText}
                      onChange={e => setForm({...form, footerText: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-bold block mb-2">Buttons (Max 3)</label>
                    <div className="space-y-2">
                      {form.buttons.map((btn, idx) => (
                        <div key={idx} className="flex flex-col gap-2 p-3 border rounded-lg bg-gray-50">
                          <div className="flex gap-2">
                            <select
                              className="border p-2 rounded text-sm bg-white flex-shrink-0"
                              value={btn.type}
                              onChange={e => {
                                const newType = e.target.value;
                                const newButtons = [...form.buttons];
                                if (newType === 'QUICK_REPLY') {
                                  newButtons[idx] = { type: 'QUICK_REPLY', text: btn.text || '' };
                                } else if (newType === 'URL') {
                                  newButtons[idx] = { type: 'URL', text: btn.text || '', url: '' };
                                } else {
                                  newButtons[idx] = { type: 'PHONE_NUMBER', text: btn.text || '', phone_number: '' };
                                }
                                setForm({...form, buttons: newButtons});
                              }}
                            >
                              <option value="QUICK_REPLY">Quick Reply</option>
                              <option value="URL">URL</option>
                              <option value="PHONE_NUMBER">Phone</option>
                            </select>
                            <button onClick={() => removeButton(idx)} className="ml-auto">
                              <Trash2 className="w-4 h-4 text-red-500"/>
                            </button>
                          </div>

                          <input
                            className="w-full border p-2 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none"
                            placeholder="Button Text"
                            value={btn.text}
                            onChange={e => updateButton(idx, 'text', e.target.value)}
                          />
                          {btn.type === 'URL' && (
                            <input
                              className="w-full border p-2 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none"
                              placeholder="https://example.com"
                              value={btn.url}
                              onChange={e => updateButton(idx, 'url', e.target.value)}
                            />
                          )}
                          {btn.type === 'PHONE_NUMBER' && (
                            <input
                              className="w-full border p-2 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none"
                              placeholder="+1234567890"
                              value={btn.phone_number}
                              onChange={e => updateButton(idx, 'phone_number', e.target.value)}
                            />
                          )}
                        </div>
                      ))}

                      {form.buttons.length < 3 && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => addButton('QUICK_REPLY')}
                            className="text-xs border px-3 py-2 rounded bg-white hover:bg-gray-100"
                          >
                            + Quick Reply
                          </button>
                          <button
                            onClick={() => addButton('URL')}
                            className="text-xs border px-3 py-2 rounded bg-white hover:bg-gray-100"
                          >
                            + URL
                          </button>
                          <button
                            onClick={() => addButton('PHONE_NUMBER')}
                            className="text-xs border px-3 py-2 rounded bg-white hover:bg-gray-100"
                          >
                            + Phone
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="p-4 sm:px-8 sm:pb-8 shrink-0 border-t border-gray-100 bg-white">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-green-600 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg shadow-green-200"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5"/> : 'Submit Template'}
            </button>
          </div>
        </div>

        {/* RIGHT: WHATSAPP PREVIEW (Desktop Only) */}
        <div className="hidden lg:flex w-1/2 bg-gray-100 items-center justify-center p-4">
          <PreviewContent />
        </div>

      </div>
    </div>
  );
}

