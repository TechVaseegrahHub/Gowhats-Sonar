import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  Link2,
  MessageSquare,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Smile,
  Type,
  Video,
  X,
  XCircle
} from 'lucide-react';

const normalize = (value) => String(value || '').toUpperCase();

const toTitleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const findComponent = (components, expectedType) =>
  components.find((component) => normalize(component?.type) === expectedType);

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

const toAbsoluteMediaUrl = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const trimmed = value.trim();

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `${API_BASE}${trimmed}`;
  if (trimmed.startsWith('uploads/')) return `${API_BASE}/${trimmed}`;
  return null;
};

const pickFirstMediaUrl = (candidates) => {
  for (const candidate of candidates) {
    const normalized = toAbsoluteMediaUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
};

const extractCarouselImageUrl = (headerComponent) => {
  if (!headerComponent) return null;

  const imageObject = headerComponent.image || {};
  const example = headerComponent.example || {};

  return pickFirstMediaUrl([
    imageObject.link,
    imageObject.url,
    imageObject.src,
    headerComponent.link,
    headerComponent.url,
    headerComponent.src,
    Array.isArray(example.header_url) ? example.header_url[0] : example.header_url,
    Array.isArray(example.header_media_url) ? example.header_media_url[0] : example.header_media_url,
    Array.isArray(example.media_url) ? example.media_url[0] : example.media_url,
    Array.isArray(example.header_image_url) ? example.header_image_url[0] : example.header_image_url,
    Array.isArray(example.header_handle) ? example.header_handle[0] : example.header_handle
  ]);
};

const getStatusPresentation = (status) => {
  switch (normalize(status)) {
    case 'APPROVED':
      return {
        label: 'APPROVED',
        icon: CheckCircle2,
        className: 'bg-green-100 text-green-700 border-green-200'
      };
    case 'REJECTED':
      return {
        label: 'REJECTED',
        icon: XCircle,
        className: 'bg-red-100 text-red-700 border-red-200'
      };
    case 'PENDING':
      return {
        label: 'PENDING',
        icon: Clock3,
        className: 'bg-yellow-100 text-yellow-700 border-yellow-200'
      };
    default:
      return {
        label: status || 'UNKNOWN',
        icon: AlertCircle,
        className: 'bg-gray-100 text-gray-700 border-gray-200'
      };
  }
};

const getButtonTypeLabel = (type) => {
  switch (normalize(type)) {
    case 'PHONE_NUMBER':
      return 'Phone';
    case 'URL':
      return 'URL';
    case 'QUICK_REPLY':
      return 'Quick Reply';
    default:
      return toTitleCase(type || 'Button');
  }
};

const HeaderPreviewToken = ({ format }) => {
  const normalized = normalize(format);

  if (normalized === 'TEXT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
        <Type className="h-3.5 w-3.5" />
        Text
      </span>
    );
  }

  if (normalized === 'IMAGE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
        <ImageIcon className="h-3.5 w-3.5" />
        Image
      </span>
    );
  }

  if (normalized === 'VIDEO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
        <Video className="h-3.5 w-3.5" />
        Video
      </span>
    );
  }

  if (normalized === 'DOCUMENT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">
        <FileText className="h-3.5 w-3.5" />
        Document
      </span>
    );
  }

  return null;
};

const summaryCardBase =
  'rounded-2xl border border-[#e8edf1] bg-[#f7f9fb] px-4 py-4';

export default function TemplateViewModal({ isOpen, onClose, template, loading = false }) {
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const phoneCarouselRef = useRef(null);
  const phoneCardRefs = useRef([]);
  const previewPanelRef = useRef(null);

  const handleSelectCard = (index) => {
    setSelectedCardIndex(index);

    if (window.innerWidth < 1024 && previewPanelRef.current) {
      previewPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const parsed = useMemo(() => {
    const components = Array.isArray(template?.components) ? template.components : [];
    const header = findComponent(components, 'HEADER');
    const body = findComponent(components, 'BODY');
    const footer = findComponent(components, 'FOOTER');
    const buttons = findComponent(components, 'BUTTONS');
    const carousel = findComponent(components, 'CAROUSEL');

    const carouselCards = Array.isArray(carousel?.cards)
      ? carousel.cards.map((card, index) => {
          const cardComponents = Array.isArray(card?.components) ? card.components : [];
          const cardHeader = findComponent(cardComponents, 'HEADER');
          const cardBody = findComponent(cardComponents, 'BODY');
          const cardButtons = findComponent(cardComponents, 'BUTTONS');

          return {
            index,
            header: cardHeader,
            bodyText: cardBody?.text || '',
            buttons: Array.isArray(cardButtons?.buttons) ? cardButtons.buttons : [],
            imageUrl: extractCarouselImageUrl(cardHeader)
          };
        })
      : [];

    const standardButtons = Array.isArray(buttons?.buttons) ? buttons.buttons : [];

    return {
      header,
      body,
      footer,
      carouselCards,
      standardButtons
    };
  }, [template]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const onEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    setSelectedCardIndex(0);
  }, [template?.id, template?.name]);

  useEffect(() => {
    const selectedPreviewCard = phoneCardRefs.current[selectedCardIndex];
    if (!selectedPreviewCard) return;

    selectedPreviewCard.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
  }, [selectedCardIndex]);

  if (!isOpen) return null;

  const status = getStatusPresentation(template?.status);
  const StatusIcon = status.icon;
  const hasCarousel = parsed.carouselCards.length > 0;
  const selectedCard = parsed.carouselCards[selectedCardIndex] || null;
  const bodyText = parsed.body?.text || selectedCard?.bodyText || '';
  const bodyLength = bodyText.length;
  const templateType = hasCarousel
    ? 'Carousel'
    : parsed.header?.format
      ? toTitleCase(parsed.header.format)
      : 'Standard';

  const buttonSummary = hasCarousel
    ? parsed.carouselCards.some((card) => card.buttons.length > 0)
      ? 'Per Card'
      : 'None'
    : parsed.standardButtons.length > 0
      ? `${parsed.standardButtons.length} Total`
      : 'None';

  const previewCards = hasCarousel ? parsed.carouselCards : [];
  const previewMainText = bodyText || 'No body content available for this template.';

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        className="relative w-full max-w-[1008px] overflow-hidden rounded-t-[28px] bg-[#f7f9fa] shadow-2xl sm:max-h-[83vh] sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {loading && (
          <div className="absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-500 animate-pulse" />
        )}

        <div className="grid h-[88vh] grid-cols-1 lg:grid-cols-[1.62fr_1fr] sm:h-[83vh]">
          <div className="h-full overflow-y-auto bg-[#f9fbfc] p-5 pr-3 sm:p-8 sm:pr-5">
            <div className="mb-6 flex items-start justify-between gap-4 border-b border-[#e7edf1] pb-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="truncate text-[24px] font-bold leading-none text-[#1f2937]">{template?.name || 'template'}</h2>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {status.label}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold tracking-wide text-[#9aa7b4]">
                  ID: <span className="font-bold">{template?.id || '-'}</span>
                </p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e4f5ea]">
                <CheckCircle2 className="h-7 w-7 text-[#22c55e]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={summaryCardBase}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#a5b1bc]">Category</p>
                <p className="mt-2 text-[20px] font-bold leading-none text-[#22b45a]">{toTitleCase(template?.category || 'Unknown')}</p>
              </div>
              <div className={summaryCardBase}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#a5b1bc]">Language</p>
                <p className="mt-2 text-[20px] font-bold leading-none text-[#374151]">{template?.language || 'en'}</p>
              </div>
              <div className={summaryCardBase}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#a5b1bc]">Type</p>
                <p className="mt-2 text-[20px] font-bold leading-none text-[#374151]">{templateType}</p>
              </div>
              <div className={summaryCardBase}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#a5b1bc]">Buttons</p>
                <p className="mt-2 text-[20px] font-bold leading-none text-[#374151]">{buttonSummary}</p>
              </div>
            </div>

            <div className="mt-7">
              <div className="mb-4 flex items-center gap-2 text-[19px] font-bold text-[#3b4756]">
                <LayoutGrid className="h-5 w-5 text-[#9aa7b4]" />
                Template Components
              </div>

              {parsed.header && (
                <div className="mb-3 rounded-2xl border border-[#e6edf1] bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-[#9aa7b4]">Header</div>
                    <HeaderPreviewToken format={parsed.header.format} />
                  </div>
                  {normalize(parsed.header.format) === 'TEXT' && parsed.header.text && (
                    <p className="mt-3 text-[13px] leading-6 text-[#334155]">{parsed.header.text}</p>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-[#e6edf1] bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-lg bg-[#e8f9ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-[#1a9f51]">
                    <MessageSquare className="mr-1 h-3.5 w-3.5" />
                    Body
                  </span>
                  <span className="text-xs font-semibold text-[#98a5b3]">{bodyLength} chars</span>
                </div>
                <div className="max-h-[130px] overflow-auto rounded-xl border border-[#e7edf1] bg-[#fbfdff] px-3 py-3 text-[13px] leading-6 text-[#314156]">
                  {bodyText || 'No body text provided.'}
                </div>
              </div>

              {parsed.footer?.text && (
                <div className="mt-3 rounded-2xl border border-[#e6edf1] bg-white p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#9aa7b4]">Footer</div>
                  <p className="text-[13px] text-[#5b6779]">{parsed.footer.text}</p>
                </div>
              )}

              {parsed.standardButtons.length > 0 && !hasCarousel && (
                <div className="mt-3 rounded-2xl border border-[#e6edf1] bg-white p-4">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#9aa7b4]">Buttons</div>
                  <div className="space-y-2">
                    {parsed.standardButtons.map((button, index) => (
                      <div key={`button-${index}`} className="rounded-lg border border-[#e7edf1] bg-[#f8fafc] px-3 py-2">
                        <div className="text-[13px] font-semibold text-[#1f2937]">{button.text || 'Button'}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#7a8897]">
                          <span className="rounded-md border border-[#dce5ed] bg-white px-2 py-0.5 font-semibold">
                            {getButtonTypeLabel(button.type)}
                          </span>
                          {button.url && (
                            <span className="inline-flex items-center gap-1">
                              <Link2 className="h-3.5 w-3.5" />
                              {button.url}
                            </span>
                          )}
                          {button.phone_number && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {button.phone_number}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasCarousel && (
                <div className="mt-3 rounded-2xl border border-[#e6edf1] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-lg bg-[#efe9ff] px-3 py-1 text-xs font-black uppercase tracking-wide text-[#6d4de3]">
                      <Layers className="mr-1 h-3.5 w-3.5" />
                      Carousel
                    </span>
                    <span className="text-xs font-semibold text-[#98a5b3]">{parsed.carouselCards.length} cards</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {parsed.carouselCards.map((card, index) => (
                      <button
                        key={`carousel-tab-${index}`}
                        type="button"
                        onClick={() => handleSelectCard(index)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          selectedCardIndex === index
                            ? 'border-[#22c55e] bg-[#effcf4] text-[#1e293b]'
                            : 'border-[#dbe4eb] bg-[#f8fafc] text-[#5b6779] hover:border-[#b8c7d5]'
                        }`}
                      >
                        <div className="text-sm font-bold">Card {index + 1}</div>
                        <div className="text-[11px] font-semibold text-[#9aa7b4]">{card.buttons.length} btn</div>
                      </button>
                    ))}
                  </div>

                  {selectedCard && (
                    <div className="mt-3 rounded-xl border border-[#e7edf1] bg-[#fbfdff] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <HeaderPreviewToken format={selectedCard.header?.format} />
                        <span className="text-xs font-semibold text-[#98a5b3]">
                          {selectedCard.bodyText.length} chars
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#314156]">
                        {selectedCard.bodyText || 'No card body text.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            ref={previewPanelRef}
            className="relative h-full overflow-hidden border-t border-[#dceddf] bg-[#ecf9f1] p-5 sm:p-6 lg:border-l lg:border-t-0"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #cdeedb 1.2px, transparent 0)',
              backgroundSize: '20px 20px'
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold text-[#4b5d6d]">Live Preview</p>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#22c55e] px-3 py-1 text-xs font-bold text-white">WhatsApp</span>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded-full bg-[#eef2f4] text-[#8a99a8] transition hover:bg-white hover:text-[#51606d]"
                  aria-label="Close template view"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mx-auto w-[252px] rounded-[32px] bg-[#1f2a3d] p-2 shadow-[0_24px_45px_rgba(17,24,39,0.35)]">
              <div className="overflow-hidden rounded-[26px] bg-[#111827]">
                <div className="mx-auto mt-1 h-1.5 w-24 rounded-full bg-[#3a4a61]" />

                <div className="mt-1 flex items-center gap-2 bg-[#17b450] px-3 py-2 text-white">
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-white/25 text-[11px] font-black">G</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">GoWhats Business</p>
                    <p className="text-[10px] font-semibold text-white/80">online</p>
                  </div>
                  <Phone className="h-4 w-4" />
                  <MoreVertical className="h-4 w-4" />
                </div>

                <div className="h-[410px] overflow-y-auto bg-[#efeae2] px-2 py-2.5">
                  <div className="ml-auto w-[96%] rounded-2xl rounded-tr-sm border border-[#e8e2d7] bg-white px-3 py-3 shadow-sm">
                    <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#15243a]">{previewMainText}</p>
                    <div className="mt-2 text-right text-[10px] font-semibold text-[#9aa3af]">12:00 PM</div>
                  </div>

                  {previewCards.length > 0 && (
                    <div ref={phoneCarouselRef} className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {previewCards.map((card, index) => (
                        <button
                          key={`preview-card-${index}`}
                          type="button"
                          ref={(element) => {
                            phoneCardRefs.current[index] = element;
                          }}
                          onClick={() => setSelectedCardIndex(index)}
                          className={`min-w-[165px] overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${
                            selectedCardIndex === index
                              ? 'border-[#26bf63]'
                              : 'border-[#c5d2df] hover:border-[#26bf63]'
                          }`}
                        >
                          {card.imageUrl ? (
                            <img
                              src={card.imageUrl}
                              alt={`Carousel card ${index + 1}`}
                              className="h-14 w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className={`h-14 ${
                                index % 3 === 0
                                  ? 'bg-gradient-to-r from-[#ffcf99] to-[#f59e0b]'
                                  : index % 3 === 1
                                    ? 'bg-gradient-to-r from-[#9ad1ff] to-[#60a5fa]'
                                    : 'bg-gradient-to-r from-[#b0f2ce] to-[#34d399]'
                              }`}
                            />
                          )}
                          <div className="p-2">
                            <p className="line-clamp-2 text-xs font-semibold leading-4 text-[#1f2937]">
                              {card.bodyText || 'Card preview message'}
                            </p>
                          </div>
                          <div className="border-t border-[#e8edf1] px-2 py-2 text-center text-xs font-bold text-[#13a14a]">
                            {card.buttons[0]?.text || 'More Details'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-1.5">
                  <Smile className="h-4 w-4 text-[#6b7280]" />
                  <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] text-[#9ca3af]">
                    <span className="flex-1">Message</span>
                    <Paperclip className="h-3.5 w-3.5 text-[#6b7280]" />
                    <Camera className="h-3.5 w-3.5 text-[#6b7280]" />
                  </div>
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[#19bf55] text-white">
                    <Mic className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

