import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io } from 'socket.io-client';
import api from '../utils/axios';
import dayjs from "dayjs";
import VirtualContactList from './VirtualContactList';
import { toast } from "react-hot-toast";
import { AiOutlinePlus } from "react-icons/ai";
import {
  BanIcon, ChevronDownIcon, EditIcon, SearchIcon, Mic, Send, SmileIcon,
  Search, X, Trash2, Pencil, Check, Paperclip, Image, Camera, FileText,
  User, BotIcon, UserIcon, Wallet, Landmark, ListFilter, LayoutPanelTop,
  Play, MessageSquare, Download, MapPin, Navigation, AlertCircle,
  Phone, ExternalLink, Tag, Mail, ChevronLeft, MoreVertical, Menu,
  Edit2, CheckSquare, Square, Plus, Minus, Monitor, UserPlus, Reply, Copy, PhoneOff
} from "lucide-react";
import { ShoppingBag } from 'lucide-react';
import Picker from "@emoji-mart/react";
import socketService from '../services/socketService';
import data from "@emoji-mart/data";
import { useAuth } from "../context/AuthContext";
import QuickResponseChat from '../components/QuickResponseChat';
import MediaComponents from './MediaMessages';
import AbandonedCartMessage from './AbandonedCartMessage';
import OrderMessage from './OrderMessage';
import DispatchMessage from './DispatchMessage';
import QuickResponse from "../components/QuickResponse.jsx";
import CallingPanel from './CallingPanel';
import {
  FlowSendingMessage,
  FlowCompletionMessage,
  CatalogMessageComponent,
  ShippingOptionsMessage,
  ShippingSelectionMessage,
  PaymentMessageComponent,
  TicketMessage
} from './FlowMessageComponents';
import {
  Container, Sidebar, SearchBar, ContactList, ContactItem, ChatArea,
  ChatHeader, Messages, MessageBubble, MessageInput, ChatProfile,
  ProfileContainer, ProfileHeader, NotificationBubble, Tabs, Tab,
  OrderSummary, OrderSummaryCard, OrderSummaryTitle, OrderSummaryValue,
  LastOrder, LastOrderHeader, LastOrderId, SearchButton, LastOrderStatus,
  StatusTag, OrderDate, LastOrderFooter, OrderTotal, DetailsButton,
  WooCommerceNotes, NotesTabs, NotesTab, NotesContent, Note, NoteLabel,
  NoteInfo, NoteValue, EditNote, TemplateContainer, AudioMessageContainer,
  ExpiryBanner, OrderContainer, ListMessage, ButtonMessage, WelcomeMessage,
  CatalogMessage,
  InteractiveMessageContainer,
  FlowMessage,
  ShippingMessage,
  OrderConfirmationMessage,
  SearchContainer,
  SearchClearButton, TeamAssistTab,
  TeamBadge,
  ResolveButton,
  HumanAgentMessage,
  TabCounter,
  ContactItemWithTeam,
  ScrollingFooter
} from './ChatStyles';

const { ImageMessage, VideoMessage, AudioMessage, DocumentMessage, MessageFooter, formatDuration } = MediaComponents;

// =========================================================================================
// 1. HELPER COMPONENTS (Defined OUTSIDE ChatApp to prevent errors)
// =========================================================================================

const FilePreviewModal = ({ isOpen, onClose, files, onSend, onRemove }) => {
  const [caption, setCaption] = useState("");

  if (!isOpen) return null;

  const renderPreview = (file) => {
    const url = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
      return <img src={url} alt="preview" className="w-full h-32 object-cover rounded-lg" />;
    } else if (file.type.startsWith('video/')) {
      return (
        <video src={url} className="w-full h-32 object-cover rounded-lg bg-black">
          <div className="absolute inset-0 flex items-center justify-center text-white">▶</div>
        </video>
      );
    } else {
      return (
        <div className="w-full h-32 bg-gray-100 flex flex-col items-center justify-center rounded-lg border border-gray-200">
          <FileText size={32} className="text-gray-500 mb-2" />
          <span className="text-xs text-center px-2 truncate w-full">{file.name}</span>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">
            Send {files.length} {files.length === 1 ? 'File' : 'Files'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable Grid */}
        <div className="p-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {files.map((file, index) => (
              <div key={index} className="relative group">
                {renderPreview(file)}

                {/* Remove Button */}
                <button
                  onClick={() => onRemove(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove file"
                >
                  <X size={14} />
                </button>

                {/* Size Label */}
                <div className="absolute bottom-1 right-1 bg-black bg-opacity-60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer - Caption & Send */}
        <div className="p-4 bg-gray-50 rounded-b-xl border-t border-gray-100">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Add a caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
            <button
              onClick={() => onSend(caption)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Send size={18} />
              Send
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

const ListMessageComponent = React.memo(({ message, selectedContact, onListItemSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleListSelect = useCallback((item) => {
    if (onListItemSelect) {
      onListItemSelect(item);
    }
    setIsExpanded(false);
  }, [onListItemSelect]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const sections = useMemo(() =>
    message.interactive?.action?.sections || [],
    [message.interactive?.action?.sections]
  );

  return (
    <ListMessage $sent={message.from !== selectedContact.phone_number}>
      <div className="list-header">
        <div className="list-title">
          {message.interactive?.header?.text || 'Select an option'}
        </div>
        <div className="list-description">
          {message.interactive?.body?.text || message.text}
        </div>
      </div>

      <button
        className="list-button"
        onClick={toggleExpanded}
      >
        <span>{message.interactive?.action?.button || 'View options'}</span>
        <ChevronDownIcon
          size={16}
          className={`chevron-down transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && sections.length > 0 && (
        <div className="list-options">
          {sections.map((section, sectionIndex) => (
            <div key={`section-${sectionIndex}`}>
              {section.title && (
                <div className="section-title">
                  {section.title}
                </div>
              )}
              {section.rows?.map((row, rowIndex) => (
                <div
                  key={`row-${sectionIndex}-${rowIndex}`}
                  className="list-option"
                  onClick={() => handleListSelect(row)}
                >
                  <div className="option-title">{row.title}</div>
                  {row.description && (
                    <div className="option-description">{row.description}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={message.from !== selectedContact.phone_number}
      />
    </ListMessage>
  );
});

const ButtonMessageComponent = React.memo(({ message, selectedContact, onButtonClick }) => {
  const handleButtonClick = useCallback((button) => {
    if (onButtonClick) {
      onButtonClick(button);
    }
  }, [onButtonClick]);

  const buttons = useMemo(() =>
    message.interactive?.action?.buttons || [],
    [message.interactive?.action?.buttons]
  );

  const getButtonClass = useCallback((button) => {
    switch (button.type) {
      case 'PHONE_NUMBER': return 'action-button call-button';
      case 'URL': return 'action-button url-button';
      default: return 'action-button reply-button';
    }
  }, []);

  const getButtonIcon = useCallback((button) => {
    switch (button.type) {
      case 'PHONE_NUMBER': return <Phone size={14} style={{ marginRight: '6px' }} />;
      case 'URL': return <ExternalLink size={14} style={{ marginRight: '6px' }} />;
      default: return <MessageSquare size={14} style={{ marginRight: '6px' }} />;
    }
  }, []);

  return (
    <ButtonMessage $sent={message.from !== selectedContact.phone_number}>
      <div className="button-header">
        {message.interactive?.header?.text && (
          <div className="button-title">{message.interactive.header.text}</div>
        )}
        <div className="button-body">
          {message.interactive?.body?.text || message.text}
        </div>
      </div>

      {buttons.length > 0 && (
        <div className="button-actions">
          {buttons.map((button, index) => (
            <button
              key={`button-${index}`}
              className={getButtonClass(button)}
              onClick={() => handleButtonClick(button)}
            >
              {getButtonIcon(button)}
              {button.reply?.title || button.text}
            </button>
          ))}
        </div>
      )}

      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={message.from !== selectedContact.phone_number}
      />
    </ButtonMessage>
  );
});

const WelcomeMessageComponent = React.memo(({ message, onWelcomeAction, welcomeConfig, customerPhone }) => {
  const handleAction = useCallback((action) => {
    if (onWelcomeAction) {
      onWelcomeAction({ ...action, customerPhone });
    }
  }, [onWelcomeAction, customerPhone]);

  const getWelcomeButtons = () => {
    if (welcomeConfig?.workflows && Array.isArray(welcomeConfig.workflows)) {
      return welcomeConfig.workflows
        .filter(workflow => workflow.isActive !== false)
        .map(workflow => ({
          type: workflow.workflow.toLowerCase().replace(/\s+/g, '_'),
          title: workflow.buttonText || workflow.workflow,
          workflow: workflow.workflow
        }));
    }

    if (message.interactive?.action?.buttons) {
      return message.interactive.action.buttons.map(btn => ({
        type: btn.reply?.id || 'reply',
        title: btn.reply?.title || btn.text,
        workflow: btn.reply?.title || btn.text
      }));
    }

    return [
      { type: 'catalog', title: 'Shop Our Collection', workflow: 'Shop Our Collection' },
      { type: 'suggestions', title: 'Product Suggestions', workflow: 'Product Suggestions' }
    ];
  };

  const buttons = getWelcomeButtons();
  const welcomeText = welcomeConfig?.messageBody ||
                     message.interactive?.body?.text ||
                     message.text ||
                     'Ready to embrace the freshness of nature? Share us your Hair/Skin concerns. Our team will guide you to the perfect herbal solution tailored for you!';

  return (
    <WelcomeMessage $sent={true}>
      <div className="welcome-content">
        <div className="welcome-title">Welcome!</div>
        <div className="welcome-text">
          {welcomeText}
        </div>

        <div className="welcome-actions">
          {buttons.map((button, index) => (
            <button
              key={index}
              className="welcome-button"
              onClick={() => handleAction(button)}
            >
              {button.title}
            </button>
          ))}
        </div>
      </div>

      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={true}
      />
    </WelcomeMessage>
  );
});

const StickerMessage = React.memo(({ msg, selectedContact }) => {
  const isSent = msg.from !== selectedContact.phone_number;

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2 mx-2`}>
      <div className={`max-w-xs ${isSent ? 'bg-green-100' : 'bg-white border border-gray-200'} rounded-lg p-2`}>
        {msg.mediaUrl ? (
          <img
            src={msg.mediaUrl}
            alt="Sticker"
            className="max-w-[200px] max-h-[200px] object-contain"
          />
        ) : (
          <div className="flex items-center justify-center p-8 bg-gray-100 rounded">
            <span className="text-4xl">🎨</span>
          </div>
        )}
        <MessageFooter
          timestamp={msg.timestamp}
          status={msg.status}
          isSent={isSent}
        />
      </div>
    </div>
  );
});

// ===== NEW: LOCATION MESSAGE COMPONENT =====
const LocationMessage = React.memo(({ msg, selectedContact }) => {
  const isSent = msg.from !== selectedContact.phone_number;
  const location = msg.location || {};

  const openInMaps = () => {
    if (location.latitude && location.longitude) {
      const url = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2 mx-2`}>
      <div className={`max-w-sm ${isSent ? 'bg-green-100' : 'bg-white border border-gray-200'} rounded-lg overflow-hidden`}>
        {/* Map Preview */}
        {location.latitude && location.longitude && (
          <div className="relative h-48 bg-gray-200">
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-green-100">
              <div className="text-center">
                <MapPin size={48} className="mx-auto mb-2 text-red-500" />
                <p className="text-sm text-gray-600">Location Shared</p>
              </div>
            </div>
            <button
              onClick={openInMaps}
              className="absolute top-2 right-2 bg-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium text-blue-600 hover:bg-blue-50 flex items-center gap-1"
            >
              <Navigation size={14} />
              Open
            </button>
          </div>
        )}

        {/* Location Details */}
        <div className="p-3">
          {location.name && (
            <div className="font-medium text-gray-900 mb-1">{location.name}</div>
          )}
          {location.address && (
            <div className="text-sm text-gray-600 mb-2">{location.address}</div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <MapPin size={12} />
            <span>
              {location.latitude?.toFixed(6)}, {location.longitude?.toFixed(6)}
            </span>
          </div>
        </div>

        <MessageFooter
          timestamp={msg.timestamp}
          status={msg.status}
          isSent={isSent}
        />
      </div>
    </div>
  );
});

// ===== NEW: REACTION MESSAGE COMPONENT =====
const ReactionMessage = React.memo(({ msg, selectedContact }) => {
  const isSent = msg.from !== selectedContact.phone_number;

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-1 mx-2`}>
      <div className="text-2xl">
        {msg.reaction?.emoji || '❤️'}
      </div>
    </div>
  );
});

// Add displayName for the new components
StickerMessage.displayName = 'StickerMessage';
LocationMessage.displayName = 'LocationMessage';
ReactionMessage.displayName = 'ReactionMessage';

const CallLogComponent = ({ msg, isSentByMe }) => {
  const isPermission =
    msg.interactive?.type === 'call_permission_request' ||
    msg.text === 'Interactive message';

  const isMissed =
    msg.status === 'failed' ||
    msg.status === 'missed' ||
    msg.text?.toLowerCase().includes('no answer');

  // Determine label and subtitle
  let label, subtitle;
  if (isPermission) {
    label = isSentByMe ? 'Call Permission Requested' : 'Call Permission Received';
    subtitle = isSentByMe
      ? 'Waiting for customer to allow calls'
      : 'Customer sent a call permission';
  } else if (isMissed) {
    label = 'Missed Voice Call';
    subtitle = 'No answer';
  } else {
    label = 'Voice Call';
    subtitle = msg.duration ? `Duration: ${msg.duration}s` : 'Call ended';
  }

  return (
    <div className={`flex flex-col py-1 ${isSentByMe ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-3 p-3 rounded-xl border shadow-sm ${
        isSentByMe ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
      } min-w-[240px]`}>
        <div className={`p-2.5 rounded-full ${
          isPermission
            ? 'bg-blue-100 text-blue-600'
            : isMissed
              ? 'bg-red-100 text-red-600'
              : 'bg-green-100 text-green-600'
        }`}>
          <Phone
            size={18}
            className={isMissed ? 'rotate-[135deg]' : ''}
          />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <MessageFooter
        timestamp={msg.timestamp}
        status={msg.status}
        isSent={isSentByMe}
      />
    </div>
  );
};

const GlobalIncomingCallPopup = ({ activeCall, isMobileView, onAnswer, onDecline }) => {
  const [dismissed, setDismissed] = React.useState(false);
  const [dragX, setDragX] = React.useState(0);
  const dragStartX = React.useRef(null);

  React.useEffect(() => {
    setDismissed(false);
    setDragX(0);
  }, [activeCall?.callId]);

  if (!activeCall || activeCall.state !== 'incoming' || dismissed) return null;

  const digits = String(activeCall.customerPhone || '').replace(/\D/g, '');
  let formatted = `+${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) {
    formatted = `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  } else if (digits.length === 10) {
    formatted = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  const displayName = activeCall.callerName &&
    activeCall.callerName !== activeCall.customerPhone
      ? activeCall.callerName
      : null;

  const handleDragStart = (clientX) => { dragStartX.current = clientX; };
  const handleDragMove = (clientX) => {
    if (dragStartX.current === null) return;
    setDragX(clientX - dragStartX.current);
  };
  const handleDragEnd = () => {
    if (Math.abs(dragX) > 80) {
      setDismissed(true);
      onDecline();
    } else {
      setDragX(0);
    }
    dragStartX.current = null;
  };

  // ── MOBILE: WhatsApp-style notification banner at top ──────
  if (isMobileView) {
    return (
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 99999,
          padding: '8px 12px',
          background: 'transparent',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
            transform: `translateX(${dragX}px)`,
            transition: dragStartX.current ? 'none' : 'transform 0.2s ease',
            opacity: Math.max(0, 1 - Math.abs(dragX) / 200),
            pointerEvents: 'all',
            cursor: 'grab',
          }}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
          onTouchEnd={handleDragEnd}
          onMouseDown={(e) => handleDragStart(e.clientX)}
          onMouseMove={(e) => dragStartX.current !== null && handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
        >
          {/* Avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: '#e8f5e9', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={24} color="#2e7d32" />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 13, color: '#888', margin: '0 0 2px',
              fontWeight: 500,
            }}>
              WhatsApp Voice Call
            </p>
            <p style={{
              fontSize: 16, fontWeight: 600, color: '#111',
              margin: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displayName || formatted}
            </p>
            {displayName && (
              <p style={{ fontSize: 12, color: '#666', margin: '1px 0 0' }}>
                {formatted}
              </p>
            )}
          </div>

          {/* Decline button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDismissed(true);
              onDecline();
            }}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#fee2e2', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            <PhoneOff size={20} color="#dc2626" />
          </button>

          {/* Answer button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAnswer();
            }}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#dcfce7', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            <Phone size={20} color="#16a34a" fill="#16a34a" />
          </button>
        </div>

        {/* Swipe hint */}
        <p style={{
          textAlign: 'center', fontSize: 11,
          color: 'rgba(0,0,0,0.4)', margin: '6px 0 0',
        }}>
          Swipe to dismiss
        </p>
      </div>
    );
  }

  // ── DESKTOP: bottom-right card ──────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
      background: 'white', borderRadius: 16,
      padding: '20px 20px 16px', width: 310,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#e8f5e9',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <User size={24} color="#2e7d32" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            fontSize: 10, fontWeight: 600, color: '#888',
            margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em'
          }}>
            Incoming WhatsApp Call
          </p>
          {displayName && (
            <p style={{
              fontSize: 16, fontWeight: 500, color: '#111',
              margin: '0 0 2px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {displayName}
            </p>
          )}
          <p style={{
            fontSize: displayName ? 13 : 15,
            color: displayName ? '#666' : '#111',
            margin: '0 0 3px', fontWeight: displayName ? 400 : 500,
          }}>
            {formatted}
          </p>
          <p style={{ fontSize: 12, color: '#16a34a', margin: 0, fontWeight: 500 }}>
            Ringing...
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDecline(); }}
          style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            padding: '11px 0', borderRadius: 10,
            background: '#fee2e2', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 500, color: '#b91c1c',
          }}
        >
          <PhoneOff size={16} color="#b91c1c" /> Decline
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAnswer(); }}
          style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            padding: '11px 0', borderRadius: 10,
            background: '#dcfce7', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 500, color: '#15803d',
          }}
        >
          <Phone size={16} color="#15803d" /> Answer
        </button>
      </div>
    </div>
  );
};


const OrderConfirmationMessageComponent = React.memo(({ message }) => {
  const orderData = message.orderData || {};
  const isWebsiteOrder = orderData.platform === 'woocommerce' || orderData.platform === 'shopify';

  if (isWebsiteOrder) {
    return (
      <div className="flex justify-end mb-2 mx-2">
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 max-w-md shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">🎉</span>
              <span className="font-semibold text-green-800">Order Confirmed</span>
            </div>
            <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded capitalize">
              {orderData.platform}
            </span>
          </div>

          <div className="mb-3">
            <div className="font-medium text-gray-800 text-base">
              {orderData.customerName || 'Customer'}
            </div>
            <div className="text-sm text-gray-600">
              Hi {orderData.customerName || 'there'}.
            </div>
            <div className="text-sm text-gray-700 mt-1">
              Thanks for placing your order on our website. Here are your order details:
            </div>
          </div>

          <div className="space-y-2 bg-white bg-opacity-60 p-3 rounded">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Order ID:</span>
              <span className="text-sm font-mono text-gray-800">{orderData.orderNumber}</span>
            </div>

            <div className="pt-1">
              <span className="text-sm font-medium text-gray-700">Products:</span>
              <div className="text-sm text-gray-800 mt-1">
                {orderData.items?.map((item, idx) =>
                  `${item.name} × ${item.quantity}`
                ).join(', ') || 'Your products'}
              </div>
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="text-sm font-medium text-gray-700">Amount:</span>
              <span className="text-sm font-semibold text-green-700">
                {orderData.currency} {orderData.total}
              </span>
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            You'll get updates on your order soon. 🤞
          </div>

          <div className="mt-2 text-xs text-gray-500">Powered by GoWhats!</div>

          <div className="mt-3 pt-2 border-t border-green-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {dayjs(message.timestamp).format('hh:mm A')}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${
              message.status === 'sent' ? 'bg-green-100 text-green-700' :
              message.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
              message.status === 'read' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {message.status}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Default order confirmation (non-website orders)
  return (
    <OrderConfirmationMessage $sent={true}>
      <div className="order-header">
        <span className="order-icon">✅</span>
        <span className="order-title">Order Confirmed!</span>
      </div>
      <div className="order-details">
        <div className="order-row">
          <span className="order-label">Order ID:</span>
          <span className="order-value">{orderData.orderId || orderData.orderNumber || 'N/A'}</span>
        </div>
        <div className="order-row">
          <span className="order-label">Amount:</span>
          <span className="order-value">
            {orderData.currency || 'INR'} {orderData.total || '0.00'}
          </span>
        </div>
        <div className="order-row">
          <span className="order-label">Status:</span>
          <span className="order-value">Confirmed</span>
        </div>
      </div>
      <div className="order-footer">
        Thank you for your order!
      </div>
      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={true}
      />
    </OrderConfirmationMessage>
  );
});

OrderConfirmationMessageComponent.displayName = 'OrderConfirmationMessageComponent';
ListMessageComponent.displayName = 'ListMessageComponent';
ButtonMessageComponent.displayName = 'ButtonMessageComponent';
WelcomeMessageComponent.displayName = 'WelcomeMessageComponent';

const isChecklistFormat = (text) => {
  if (!text) return false;
  const lines = text.split('\n').filter(l => l.trim());
  return lines.length > 0 && lines[0].trim().match(/^- \[[ x]\] /);
};

const parseChecklist = (text) => {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).map(line => {
    const match = line.match(/^- \[([ x])\] (.*)$/);
    if (match) return { checked: match[1] === 'x', text: match[2] };
    return { checked: false, text: line.replace(/^- /, '') };
  });
};

const normalizeContactPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const getContactKey = (contact) => {
  if (!contact || typeof contact !== 'object') return '';
  const phone = normalizeContactPhone(
    contact.phone_number || contact.phoneNumber || contact.phone
  );
  if (phone) return `p:${phone}`;
  const id = contact._id || contact.id;
  if (id) return `id:${id}`;
  return '';
};

const mergeContactRecords = (existing, incoming) => {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
  const incomingTime = incoming.timestamp ? new Date(incoming.timestamp).getTime() : 0;
  const newer = incomingTime >= existingTime ? incoming : existing;
  const older = incomingTime >= existingTime ? existing : incoming;

  const merged = { ...older };
  Object.keys(newer).forEach((key) => {
    const value = newer[key];
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  });

  if (newer.timestamp) {
    merged.timestamp = newer.timestamp;
  }

  return merged;
};

const dedupeContacts = (contacts = []) => {
  if (!Array.isArray(contacts)) return [];
  const map = new Map();
  const order = [];

  contacts.forEach((contact) => {
    const key = getContactKey(contact);
    if (!key) return;

    if (map.has(key)) {
      map.set(key, mergeContactRecords(map.get(key), contact));
      return;
    }

    map.set(key, contact);
    order.push(key);
  });

  return order.map((key) => map.get(key));
};

const mergeContactLists = (prev = [], next = []) => {
  const safePrev = Array.isArray(prev) ? prev : [];
  const safeNext = Array.isArray(next) ? next : [];
  return dedupeContacts([...safePrev, ...safeNext]);
};

const formatPhoneDisplay = (raw) => {
  if (!raw) return 'Unknown';
  const digits = String(raw).replace(/\D/g, '');
  // Indian number: 91XXXXXXXXXX → +91 XXXXX XXXXX
  if (digits.length === 12 && digits.startsWith('91')) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  // Generic: just prefix +
  return `+${digits}`;
};

// =========================================================================================
// 2. MAIN CHAT APP COMPONENT
// =========================================================================================

const ChatApp = () => {
  // State variables
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [newContactName, setNewContactName] = useState("");
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedContactTags, setSelectedContactTags] = useState([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [welcomeConfig, setWelcomeConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [selectedFilterTags, setSelectedFilterTags] = useState([]);
  const [draggedFile, setDraggedFile] = useState(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsHasMore, setContactsHasMore] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [allContacts, setAllContacts] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  // ✅ ADDED: State for Preview Modal
  const [previewFiles, setPreviewFiles] = useState([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // ✅ NEW: State for mobile view management
  const [isMobileView, setIsMobileView] = useState(false);
  const [showChatArea, setShowChatArea] = useState(false);

  // FIXED: Proper 24-hour window management
  const [lastCustomerMessageTime, setLastCustomerMessageTime] = useState(null);
  const [windowExpiryTime, setWindowExpiryTime] = useState(null);
  const [timeUntilExpiry, setTimeUntilExpiry] = useState(null);
  const [awaitingCustomerResponse, setAwaitingCustomerResponse] = useState(false);
  const [isChatLocked, setIsChatLocked] = useState(false);

  // Other states
  const [isAutocorrecting, setIsAutocorrecting] = useState(false);
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [showListModal, setShowListModal] = useState(false);
  const [showButtonModal, setShowButtonModal] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const attachButtonRef = useRef(null);
  const attachMenuRef = useRef(null);
  const processedMessageIds = useRef(new Set());
  const seenEmissionIds = useRef(new Set());
  const socketRef = useRef(null);
  const isMountedRef = useRef(true);
  const textareaRef = useRef(null);
  const typingIndicatorTimeoutRef = useRef(null);
  const typingIndicatorLastSentRef = useRef({});
  const windowTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}, []);

// Profile panel states
const [isEditingAlias, setIsEditingAlias] = useState(false);
const [tempAlias, setTempAlias] = useState('');
const [isEditingNotes, setIsEditingNotes] = useState(false);
const [tempNotes, setTempNotes] = useState('');
const [noteMode, setNoteMode] = useState('text');
const [activeProfileTab, setActiveProfileTab] = useState('business');
const [customerOrders, setCustomerOrders] = useState([]);
const [ordersLoading, setOrdersLoading] = useState(false);
const [orderDateFilter, setOrderDateFilter] = useState('');
const [orderPaymentStatusFilter, setOrderPaymentStatusFilter] = useState('');
const [isViewAllOrders, setIsViewAllOrders] = useState(false);
const [showProfilePanel, setShowProfilePanel] = useState(false);
const [callPermissionStatus, setCallPermissionStatus] = useState(null);
const [activeCall, setActiveCall] = useState(null);

// Send document flow
const [showContactPicker, setShowContactPicker] = useState(false);
const [pendingDocument, setPendingDocument] = useState(null);
const fileInputRef = useRef(null);

const getDisplayName = (contact) => {
  if (!contact) return 'Unknown';
  if (contact.alias) {
    return contact.alias.startsWith('#') ? contact.alias : `#${contact.alias}`;
  }
  return contact.profile_name || contact.name || contact.phone_number || 'Unknown';
};

const contactTemplateStats = useMemo(() => {
  if (!selectedContact?.phone_number || !Array.isArray(messages)) {
    return { sent: 0, failed: 0, totalTemplates: 0 };
  }

  const outgoingTemplateMessages = messages.filter((msg) => {
    if (!msg || msg.type !== 'template') return false;
    return msg.from !== selectedContact.phone_number;
  });

  const failed = outgoingTemplateMessages.filter(
    (msg) => String(msg.status || '').toLowerCase() === 'failed'
  ).length;
  const totalTemplates = outgoingTemplateMessages.length;
  const sent = Math.max(totalTemplates - failed, 0);

  return { sent, failed, totalTemplates };
}, [messages, selectedContact?.phone_number]);

const completedOrderAmount = useMemo(() => {
  if (!Array.isArray(customerOrders)) return 0;
  return customerOrders
    .filter((order) => (order.paymentStatus || '').toLowerCase() === 'completed')
    .reduce((sum, order) => sum + (order.totalAmount || 0), 0);
}, [customerOrders]);

// ✅ Cache ref to avoid re-fetching same contact orders
const ordersCache = useRef({});

const fetchCustomerOrders = useCallback(async () => {
  if (!selectedContact?.phone_number) return;

  const cacheKey = selectedContact.phone_number;

  // ✅ Use cached data if less than 2 minutes old
  const cached = ordersCache.current[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < 2 * 60 * 1000) {
    console.log('✅ Using cached orders for:', cacheKey);
    setCustomerOrders(cached.orders);
    return;
  }

  try {
    setOrdersLoading(true);
    const cleanPhone = String(selectedContact.phone_number).replace(/\D/g, '').slice(-10);

    // ✅ Filter in DB, not in JS - much cheaper
    const response = await api.get(`/api/orders?customerPhone=${cleanPhone}&limit=50&includeRegistrations=false`);

    const orders = response.data?.orders || [];
    const sorted = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    setCustomerOrders(sorted);

    // ✅ Store in cache
    ordersCache.current[cacheKey] = {
      orders: sorted,
      fetchedAt: Date.now()
    };

  } catch (error) {
    console.error("Error fetching customer orders:", error);
  } finally {
    setOrdersLoading(false);
  }
}, [selectedContact?.phone_number]);


useEffect(() => {
  if (activeProfileTab === 'business' && selectedContact?.phone_number) {
    const cacheKey = selectedContact.phone_number;
    const cached = ordersCache.current[cacheKey];

    // ✅ Only fetch if cache is empty or older than 2 minutes
    if (!cached || Date.now() - cached.fetchedAt > 2 * 60 * 1000) {
      fetchCustomerOrders();
    } else {
      // Use cached data immediately
      setCustomerOrders(cached.orders);
    }
  }
}, [activeProfileTab, selectedContact?.phone_number]);

const handleDocumentSelect = (e) => {
  const file = e.target.files[0];
  if (file) {
    setPendingDocument(file);
    setShowContactPicker(true);
    e.target.value = null;
  }
};

const declineGlobalCall = useCallback(async () => {
  try {
    if (activeCall?.callId) {
      await api.post('/api/calling/terminate', { callId: activeCall.callId });
    }
  } catch (err) {
    console.warn('Decline error:', err.message);
  }
  try {
    if (window.__globalCallPC) { window.__globalCallPC.close(); window.__globalCallPC = null; }
    if (window.__globalCallStream) {
      window.__globalCallStream.getTracks().forEach(t => t.stop());
      window.__globalCallStream = null;
    }
    const audio = document.getElementById('__global_call_audio');
    if (audio) audio.remove();
  } catch (e) { console.warn('Cleanup error:', e); }
  setActiveCall(null);
}, [activeCall]);

const handleSendDocumentToContact = async (contact) => {
  if (!pendingDocument) return;
  try {
    await handleContactSelect(contact);
    setPreviewFiles([pendingDocument]);
    setShowPreviewModal(true);
    setShowContactPicker(false);
    setPendingDocument(null);
    toast.success(`Selected ${getDisplayName(contact)}`);
  } catch (error) {
    toast.error("Failed to prepare document");
  }
};

const tabCounts = useMemo(() => ({
  total: allContacts.length,
  unread: allContacts.filter(c => (c.unreadCount || 0) > 0).length,
  team: allContacts.filter(c => c.humanAgentRequested === true).length,
}), [allContacts]);

  // ✅ NEW: Check for mobile view on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);

      // On mobile, if we have a selected contact, show chat area
      if (mobile && selectedContact) {
        setShowChatArea(true);
      } else if (!mobile) {
        // On desktop, always show both
        setShowChatArea(true);
      }
    };

    // Initial check
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);

    // Cleanup
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [selectedContact]);

  // ✅ NEW: Handle contact selection for mobile
  const handleContactSelectMobile = useCallback(async (contact) => {
    if (!contact) return;

    // Set the contact
    await handleContactSelect(contact);

    // On mobile, show chat area after selecting contact
    if (isMobileView) {
      setShowChatArea(true);
    }
  }, [isMobileView]);

  const handleBackToContacts = useCallback(() => {
  if (isMobileView) {
    setShowChatArea(false);
    setSelectedContact(null);
    setMessages([]);
    sessionStorage.removeItem('lastSelectedPhone');
  }
}, [isMobileView]);

useEffect(() => {
  setIsEditingAlias(false);
  setTempAlias('');
  setIsEditingNotes(false);
  setTempNotes('');
  setReplyingTo(null);
  seenEmissionIds.current.clear();
  setCallPermissionStatus(null);
  setActiveCall(null);
}, [selectedContact?._id]);

// Persist selected contact across refresh
useEffect(() => {
  if (selectedContact?.phone_number) {
    sessionStorage.setItem('lastSelectedPhone', selectedContact.phone_number);
  }
}, [selectedContact?.phone_number]);

useEffect(() => {
  const handleClickOutside = (event) => {
    // Close emoji picker if clicked outside
    if (showEmojiPicker &&
        emojiButtonRef.current &&
        emojiPickerRef.current &&
        !emojiButtonRef.current.contains(event.target) &&
        !emojiPickerRef.current.contains(event.target)) {
      setShowEmojiPicker(false);
    }

    // Close attach menu if clicked outside
    if (showMenu &&
        attachButtonRef.current &&
        attachMenuRef.current &&
        !attachButtonRef.current.contains(event.target) &&
        !attachMenuRef.current.contains(event.target)) {
      setShowMenu(false);
    }
  };

  // Add event listener
  document.addEventListener('mousedown', handleClickOutside);

  // Cleanup
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, [showEmojiPicker, showMenu]);


useEffect(() => {
  if (!user) return;

  // ✅ Cache tags in sessionStorage
  const cachedTags = sessionStorage.getItem('tags');
  const cachedAt = sessionStorage.getItem('tags_fetched_at');
  const FIVE_MINUTES = 5 * 60 * 1000;

  if (cachedTags && cachedAt && Date.now() - parseInt(cachedAt) < FIVE_MINUTES) {
    try {
      setTags(JSON.parse(cachedTags));
      return;
    } catch (e) {
      sessionStorage.removeItem('tags');
    }
  }

  const fetchTags = async () => {
    try {
      const response = await api.get('/api/tags');
      if (response.data?.success) {
        const tagData = response.data.data || [];
        setTags(tagData);
        // ✅ Cache for 5 minutes
        sessionStorage.setItem('tags', JSON.stringify(tagData));
        sessionStorage.setItem('tags_fetched_at', Date.now().toString());
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  fetchTags();
}, [user]);

// Load contact tags when contact is selected
useEffect(() => {
  if (selectedContact?._id) {
    setSelectedContactTags(selectedContact.tags || []);
  } else {
    setSelectedContactTags([]);
  }
}, [selectedContact]);

useEffect(() => {
  if (!user) return;

  // ✅ Check sessionStorage cache first (persists across re-renders, clears on tab close)
  const cachedConfig = sessionStorage.getItem('welcomeConfig');
  if (cachedConfig) {
    try {
      setWelcomeConfig(JSON.parse(cachedConfig));
      return; // Skip API call
    } catch (e) {
      sessionStorage.removeItem('welcomeConfig');
    }
  }

  const fetchWelcomeConfig = async () => {
    try {
      const response = await api.get('/api/welcome-message');
      if (response.data) {
        setWelcomeConfig(response.data);
        // ✅ Cache in sessionStorage
        sessionStorage.setItem('welcomeConfig', JSON.stringify(response.data));
      }
    } catch (error) {
      console.error('Failed to load welcome config:', error);
      const fallback = {
        workflows: [
          { workflow: 'Shop Our Collection', buttonText: 'Shop Our Collection', isActive: true },
          { workflow: 'Product Suggestions', buttonText: 'Product Suggestions', isActive: true }
        ],
        messageBody: 'Ready to embrace the freshness of nature? Share us your Hair/Skin concerns.',
        isActive: true
      };
      setWelcomeConfig(fallback);
    }
  };

  fetchWelcomeConfig();
}, [user]);


  // FIXED: Contact update without duplicates
  const updateContactsList = useCallback((message, preventDuplicates = true) => {
    if (!message) return;

    setContacts(prevContacts => {
      const phoneNumber = message.from === 'me' || message.from.length > 15
        ? message.to
        : message.from;

      const getMessageDisplay = (type) => {
        if (type === 'image') return 'Photo';
        if (type === 'video') return 'Video';
        if (type === 'audio') return 'Voice message';
        if (type === 'template') return 'Template message';
        if (type === 'interactive') return 'Interactive message';
        if (type === 'order') return 'Order';
        return 'Message';
      };

      const existingIndex = prevContacts.findIndex(c => c.phone_number === phoneNumber);
      const messageText = message.text || getMessageDisplay(message.type);

      if (existingIndex > -1) {
        const updatedContacts = [...prevContacts];
        updatedContacts[existingIndex] = {
          ...updatedContacts[existingIndex],
          lastMessage: messageText,
          timestamp: new Date(message.timestamp),
          unreadCount: message.from !== 'me' ? (updatedContacts[existingIndex].unreadCount || 0) + 1 : updatedContacts[existingIndex].unreadCount
        };

        if (existingIndex > 0) {
          const contact = updatedContacts.splice(existingIndex, 1)[0];
          updatedContacts.unshift(contact);
        }

        return updatedContacts;
      }

      return prevContacts;
    });
  }, []);

/**
 * Mark messages as read when contact is selected
 */
const markMessagesAsRead = useCallback(async (phoneNumber) => {
  if (!phoneNumber) return;

  try {
    console.log('📖 Marking messages as read for:', phoneNumber);

    const response = await api.post('/api/messages/mark-contact-read', {
      phoneNumber: phoneNumber
    });

    if (response.data.success) {
      console.log(`✅ Marked ${response.data.markedAsRead} messages as read`);

      // ✅ FIX: Update BOTH contacts AND allContacts
      const updateFn = prev => prev.map(contact => {
        if (contact.phone_number === phoneNumber) {
          return { ...contact, unreadCount: 0 };
        }
        return contact;
      });

      setContacts(updateFn);
      setAllContacts(updateFn);  // ← THIS LINE WAS MISSING
    }

  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
  }
}, []);

const triggerTypingIndicator = useCallback((textValue) => {
  const phoneNumber = selectedContact?.phone_number;

  if (!phoneNumber) return;
  if (!textValue || !textValue.trim()) return;
  if (isChatLocked && !awaitingCustomerResponse) return;

  if (typingIndicatorTimeoutRef.current) {
    clearTimeout(typingIndicatorTimeoutRef.current);
  }

  typingIndicatorTimeoutRef.current = setTimeout(async () => {
    const now = Date.now();
    const lastSentAt = typingIndicatorLastSentRef.current[phoneNumber] || 0;

    // WhatsApp dismisses typing after ~25s. Send at most once every 20s per contact.
    if (now - lastSentAt < 20000) {
      return;
    }

    typingIndicatorLastSentRef.current[phoneNumber] = now;

    try {
      await api.post('/api/messages/typing-indicator', {
        phoneNumber,
        type: 'text'
      });
    } catch (error) {
      delete typingIndicatorLastSentRef.current[phoneNumber];
      console.error('Failed to send typing indicator:', error);
    }
  }, 400);
}, [selectedContact?.phone_number, isChatLocked, awaitingCustomerResponse]);

useEffect(() => {
  return () => {
    if (typingIndicatorTimeoutRef.current) {
      clearTimeout(typingIndicatorTimeoutRef.current);
      typingIndicatorTimeoutRef.current = null;
    }
  };
}, []);

useEffect(() => {
  if (typingIndicatorTimeoutRef.current) {
    clearTimeout(typingIndicatorTimeoutRef.current);
    typingIndicatorTimeoutRef.current = null;
  }
}, [selectedContact?.phone_number]);


const handleReaction = useCallback(async (messageId, emoji) => {
  if (!messageId || !selectedContact) return;

  try {
    await api.post('/api/messages/send-reaction', {
      to: selectedContact.phone_number,
      messageId: messageId,
      emoji: emoji
    });
    toast.success('Reaction sent');
  } catch (error) {
    console.error('Failed to send reaction:', error);
    toast.error('Failed to send reaction');
  }
}, [selectedContact]);


  const handleWelcomeAction = useCallback(async (action) => {
    const customerPhone = selectedContact?.phone_number;

    if (!customerPhone) {
      console.error('No customer phone available');
      return;
    }

    console.log('Welcome action clicked:', action);

    const buttonClickMessage = {
      _id: `button-click-${Date.now()}`,
      from: customerPhone,
      to: 'me',
      text: action.title,
      type: 'text',
      timestamp: new Date(),
      status: 'received'
    };

    setMessages(prev => {
      const isDuplicate = prev.some(msg =>
        msg.text === buttonClickMessage.text &&
        Math.abs(new Date(msg.timestamp) - new Date(buttonClickMessage.timestamp)) < 2000
      );

      if (isDuplicate) return prev;

      const newMessages = [...prev, buttonClickMessage];
      return newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });

    updateContactsList(buttonClickMessage, true);
  }, [selectedContact, updateContactsList]);

  const calculate24HourWindow = useCallback((messageList, contact) => {
  const activeContact = contact || selectedContact;

  if (!messageList || messageList.length === 0 || !activeContact) {
    setIsChatLocked(false);
    setLastCustomerMessageTime(null);
    setWindowExpiryTime(null);
    setTimeUntilExpiry(null);
    setAwaitingCustomerResponse(false);
    return;
  }

  // Normalize to last 10 digits for comparison
  const normalizePhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const contactPhone = normalizePhone(activeContact.phone_number);

  const realCustomerMessages = messageList
    .filter(msg => {
      if (!msg) return false;

      const msgFrom = normalizePhone(msg.from);

      // Must be FROM the customer
      if (!msgFrom || !contactPhone || msgFrom !== contactPhone) return false;

      // Skip all automated/system messages
      if (
        msg.isWelcomeMessage ||
        msg.isBotMessage ||
        msg.isOrderConfirmation ||
        msg.isPaymentMessage ||
        msg.isHumanAgentRequest ||
        msg.isFlowAcknowledgment ||
        msg.isAutomatedMessage ||
        msg.isTemplateMessage ||
        msg.isBroadcastMessage ||
        msg.type === 'template' ||
        msg.from === 'system' ||
        msg.from === 'bot'
      ) return false;

      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  console.log('24HR CHECK:', {
    total: messageList.length,
    customerMsgs: realCustomerMessages.length,
    contactPhone,
    lastMsg: realCustomerMessages[0]?.timestamp,
    lastMsgText: realCustomerMessages[0]?.text?.substring(0, 30)
  });

  if (realCustomerMessages.length === 0) {
    // No real customer messages found - lock the chat
    setIsChatLocked(true);
    setLastCustomerMessageTime(null);
    setWindowExpiryTime(null);
    setTimeUntilExpiry(null);
    setAwaitingCustomerResponse(false);
    return;
  }

  const lastMsg = realCustomerMessages[0];
  const msgTime = new Date(lastMsg.timestamp);
  const expiryTime = new Date(msgTime.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const remaining = expiryTime - now;

  console.log('24HR RESULT:', {
    lastMsgTime: msgTime.toISOString(),
    expiryTime: expiryTime.toISOString(),
    remainingHours: Math.floor(remaining / 1000 / 60 / 60),
    remainingMinutes: Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60)),
    isExpired: remaining <= 0
  });

  setLastCustomerMessageTime(msgTime);
  setWindowExpiryTime(expiryTime);
  setTimeUntilExpiry(Math.max(0, remaining));
  setAwaitingCustomerResponse(false);

  if (remaining <= 0) {
    setIsChatLocked(true);
  } else {
    setIsChatLocked(false);
  }

}, [selectedContact]);


// Helper functions
const getMessageTypeDisplay = useCallback((msgOrType) => {
    // 1. Handle Object Input (Real-time messages)
    if (typeof msgOrType === 'object' && msgOrType !== null) {
      const isCall = msgOrType.type === 'call' ||
                     msgOrType.subType === 'call' ||
                     msgOrType.interactive?.type === 'call_permission_request' ||
                     (msgOrType.text && (msgOrType.text.includes('call') || msgOrType.text === 'Interactive message'));

      if (isCall) return "📞 Voice Call";

      const typeMap = {
        'image': 'Photo', 'video': 'Video', 'audio': 'Voice message',
        'document': 'Document', 'location': 'Location', 'template': 'Template',
        'order': 'Order', 'welcome': 'Welcome'
      };
      return typeMap[msgOrType.type] || 'Message';
    }

    // 2. Handle String Input (History labels)
    if (typeof msgOrType === 'string') {
      const lower = msgOrType.toLowerCase();
      if (lower.includes('interactive message') || lower.includes('call_permission')) {
        return "📞 Call Permission";
      }
      return msgOrType;
    }

    return 'Message';
  }, []);

  const formatMessageDate = useCallback((timestamp) => {
    const messageDate = dayjs(timestamp);
    const today = dayjs().startOf('day');
    const yesterday = today.subtract(1, 'day');

    if (messageDate.isSame(today, 'day')) {
      return 'TODAY';
    } else if (messageDate.isSame(yesterday, 'day')) {
      return 'YESTERDAY';
    } else if (messageDate.isAfter(today.subtract(7, 'day'))) {
      return messageDate.format('dddd').toUpperCase();
    } else {
      return messageDate.format('DD/MM/YYYY');
    }
  }, []);

  const autoResizeTextarea = useCallback((textarea) => {
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 120;
    const minHeight = 40;

    if (scrollHeight <= maxHeight) {
      textarea.style.height = Math.max(scrollHeight, minHeight) + 'px';
      textarea.style.overflowY = 'hidden';
    } else {
      textarea.style.height = maxHeight + 'px';
      textarea.style.overflowY = 'auto';
    }
  }, []);

  // UPDATED: Filtered contacts with tab functionality
  const filteredContacts = useMemo(() => {
  if (!Array.isArray(allContacts)) return [];

  // 1. Filter by Tab
  let tabFilteredContacts = allContacts;

  if (activeTab === 'team') {
    // Show only contacts requesting human agent
    tabFilteredContacts = allContacts.filter(contact => contact.humanAgentRequested === true);
  } else if (activeTab === 'unread') {
    // Show only contacts with unread messages
    tabFilteredContacts = allContacts.filter(contact => (contact.unreadCount || 0) > 0);
  }

  // 2. Filter by Tags
  let tagFilteredContacts = tabFilteredContacts;
  if (selectedFilterTags.length > 0) {
    tagFilteredContacts = tabFilteredContacts.filter(contact => {
      if (!contact.tags || contact.tags.length === 0) return false;
      return contact.tags.some(tagId => selectedFilterTags.includes(tagId));
    });
  }

  // 3. Filter by Search Term
  if (!searchTerm?.trim()) {
    return tagFilteredContacts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  const searchLower = searchTerm.toLowerCase().trim();
  return tagFilteredContacts.filter(contact => {
    if (!contact || typeof contact !== 'object') return false;

    try {
      const profileNameMatch = contact.profile_name?.toLowerCase().includes(searchLower);
      const nameMatch = contact.name?.toLowerCase().includes(searchLower);
      const phoneMatch = contact.phone_number?.includes(searchTerm);
      const lastMessageMatch = contact.lastMessage?.toLowerCase().includes(searchLower);

      return profileNameMatch || nameMatch || phoneMatch || lastMessageMatch;
    } catch (error) {
      console.error('Error filtering contact:', contact, error);
      return false;
    }
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}, [allContacts, searchTerm, activeTab, selectedFilterTags]); // ✅ Changed from 'contacts' to 'allContacts'


// Add these helper functions before the return statement
const toggleFilterTag = useCallback((tagId) => {
  setSelectedFilterTags(prev =>
    prev.includes(tagId)
      ? prev.filter(id => id !== tagId)
      : [...prev, tagId]
  );
}, []);

const clearAllFilterTags = useCallback(() => {
  setSelectedFilterTags([]);
  setShowTagFilter(false);
}, []);


  const filteredTemplates = useMemo(() => {
    if (!Array.isArray(templates)) return [];

    return templates.filter(template => {
      if (!template?.name) return false;

      if (templateFilter) {
        const searchTerm = templateFilter.toLowerCase();
        return (
          template.name.toLowerCase().includes(searchTerm) ||
          (template.category && template.category.toLowerCase().includes(searchTerm)) ||
          (template.status && template.status.toLowerCase().includes(searchTerm))
        );
      }

      return template.status === 'APPROVED';
    });
  }, [templates, templateFilter]);

// Socket initialization useEffect - COMPLETE AND CORRECTED
useEffect(() => {
  if (!user || socketRef.current?.connected) {
    return;
  }

  console.log('Initializing socket connection...');

  const token = localStorage.getItem('token');
  if (!token) {
    console.error('No token available for socket connection');
    return;
  }

  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;

  const initializeSocket = () => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    socketRef.current = io(window.location.origin, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      forceNew: true,
      transports: ['websocket', 'polling']
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      reconnectAttempts = 0;

      if (selectedContact) {
        socket.emit('join_chat', selectedContact.phone_number);
        console.log('Joined chat room for:', selectedContact.phone_number);
      }

      socket.emit('rejoin_rooms');
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io client disconnect') return;

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Attempting reconnection ${reconnectAttempts}/${maxReconnectAttempts}`);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      if (error.message.includes('Authentication') || error.message.includes('token')) {
        console.error('Authentication error - token may be expired');
        socket.disconnect();
      }
    });

socket.on('new_contact', (data) => {
  if (!isMountedRef.current || !data?.contact) return;
  console.log('NEW CONTACT received:', data.contact.phone_number);

  const updateContactList = (prevContacts) => {
    const existingIndex = prevContacts.findIndex(c =>
      c.phone_number === data.contact.phone_number
    );

    if (existingIndex === -1) {
      const newContact = {
        ...data.contact,
        timestamp: new Date(data.contact.timestamp || data.timestamp || new Date())
      };
      console.log('Adding new contact to top:', newContact.phone_number);
      return [newContact, ...prevContacts];
    } else {
      const updatedContacts = [...prevContacts];
      updatedContacts[existingIndex] = {
        ...updatedContacts[existingIndex],
        ...data.contact,
        timestamp: new Date(data.contact.timestamp || data.timestamp || new Date())
      };
      const contact = updatedContacts.splice(existingIndex, 1)[0];
      return [contact, ...updatedContacts];
    }
  };

  setContacts(prev => dedupeContacts(updateContactList(prev)));
  setAllContacts(prev => dedupeContacts(updateContactList(prev)));
});

socket.on('receive_message', (messageData) => {
  if (!isMountedRef.current || !messageData) return;

  if (messageData.from === 'me') return;
  if (messageData._selfSent === true) return;

  // ── DEDUPLICATION ─────────────────────────────────────────
  const dedupKeys = [
    messageData._emissionId,
    messageData.messageId,       // WhatsApp WAMID — most reliable
    messageData._id?.toString(),
  ].filter(Boolean);

  // Block if ANY key was already seen
  const isDuplicate = dedupKeys.some(key => seenEmissionIds.current.has(key));
  if (isDuplicate) {
    console.log('🔁 Duplicate socket message blocked:', dedupKeys[0]);
    return;
  }

  // Register ALL keys so future dupes (with any key) are caught
  dedupKeys.forEach(key => {
    seenEmissionIds.current.add(key);
  });

  // Keep Set lean — max 500 entries
  while (seenEmissionIds.current.size > 500) {
    const first = seenEmissionIds.current.values().next().value;
    seenEmissionIds.current.delete(first);
  }

 // ── END DEDUPLICATION ─────────────────────────────────────

  const phoneNumber = messageData.from === 'me' || messageData.from.length > 15
    ? messageData.to
    : messageData.from;

  const isCurrentlySelected = selectedContact?.phone_number === phoneNumber;

  // Update contact list (both allContacts and contacts)
  const updateContactInList = (prevContacts) => {
    const existingIndex = prevContacts.findIndex(c => c.phone_number === phoneNumber);

    if (existingIndex > -1) {
      const updatedContacts = [...prevContacts];
      updatedContacts[existingIndex] = {
        ...updatedContacts[existingIndex],
        lastMessage: messageData.text || getMessageTypeDisplay(messageData.type),
        timestamp: new Date(messageData.timestamp),
        unreadCount: (!isCurrentlySelected && messageData.from !== 'me')
          ? (updatedContacts[existingIndex].unreadCount || 0) + 1
          : 0
      };
      const contact = updatedContacts.splice(existingIndex, 1)[0];
      return [contact, ...updatedContacts];
    } else if (messageData.contact) {
      return [messageData.contact, ...prevContacts];
    }
    return prevContacts;
  };

  setAllContacts(updateContactInList);
  setContacts(updateContactInList);

  // Add to current chat if it matches
  const messagePhone = messageData.from === 'me' || messageData.from.length > 15
    ? messageData.to
    : messageData.from;

  const isForCurrentChat = selectedContact &&
    (messagePhone === selectedContact.phone_number ||
     messageData.to === selectedContact.phone_number);

  if (isForCurrentChat) {
    setMessages(prevMessages => {
      // Secondary safety check (catches edge cases after re-mount)
            const alreadyInState = prevMessages.some(m =>
        (m._id && m._id === messageData._id) ||
        (m.messageId && messageData.messageId && m.messageId === messageData.messageId) ||
        (m._emissionId && messageData._emissionId && m._emissionId === messageData._emissionId)
      );
      if (alreadyInState) return prevMessages;


      const newMessages = [...prevMessages, messageData];
      return newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });

    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  }
});


// Handle outgoing messages (sent by us)
socket.on('message_sent', (messageData) => {
  if (!isMountedRef.current || !messageData) return;

  const phoneNumber = messageData.to;

  // ✅ FIX: Update BOTH allContacts AND contacts with unreadCount: 0
  const updateContactInList = (prevContacts) => {
    const existingIndex = prevContacts.findIndex(c => c.phone_number === phoneNumber);

    if (existingIndex > -1) {
      const updatedContacts = [...prevContacts];
      updatedContacts[existingIndex] = {
        ...updatedContacts[existingIndex],
        lastMessage: messageData.text || getMessageTypeDisplay(messageData.type),
        timestamp: new Date(messageData.timestamp),
        unreadCount: 0 // ✅ Clear unread when WE send a message
      };
      // Move to top
      const contact = updatedContacts.splice(existingIndex, 1)[0];
      return [contact, ...updatedContacts];
    }
    return prevContacts;
  };

  // ✅ Update BOTH states
  setAllContacts(prev => dedupeContacts(updateContactInList(prev)));
  setContacts(prev => dedupeContacts(updateContactInList(prev)));

  const isForCurrentChat = selectedContact && (() => {
    const contactPhone = selectedContact.phone_number;
    const messagePhone = messageData.to;
    const normalizePhone = (phone) => phone.replace(/^\+/, '').replace(/^91/, '');
    const normalizedContact = normalizePhone(contactPhone);
    const normalizedMessage = normalizePhone(messagePhone);
    return contactPhone === messagePhone || normalizedContact === normalizedMessage;
  })();

  if (isForCurrentChat) {
    console.log('✅ Message is for current chat');

    setMessages(prevMessages => {
      const tempMessageIndex = prevMessages.findIndex(m =>
        m.clientId === messageData.clientId &&
        (m._id?.startsWith('temp-') || m._tempFile === true || m.status === 'sending')
      );

      if (tempMessageIndex !== -1) {
        console.log('✅ Found temp message, replacing with real message');
        const updatedMessages = [...prevMessages];

        const tempMsg = updatedMessages[tempMessageIndex];
        if (tempMsg.mediaUrl && tempMsg.mediaUrl.startsWith('blob:')) {
          URL.revokeObjectURL(tempMsg.mediaUrl);
        }

        updatedMessages[tempMessageIndex] = {
          ...messageData,
          from: 'me',
          _id: messageData._id,
          _tempFile: false,
          uploadProgress: undefined
        };

        return updatedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }

      const exists = prevMessages.some(m =>
        (m._id && m._id === messageData._id) ||
        (m.messageId && m.messageId === messageData.messageId) ||
        (m.clientId && m.clientId === messageData.clientId)
      );

      if (exists) {
        console.log('⚠️ Message already exists, skipping');
        return prevMessages;
      }

      console.log('✅ New message, adding to list');
      const newMessages = [...prevMessages, { ...messageData, from: 'me' }];
      return newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });

    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  }
});


          socket.on('contact_updated', (data) => {
          if (!isMountedRef.current || !data?.contact) return;

          console.log('Contact updated:', data.contact.phone_number, 'Action:', data.action);

          const updateContactList = (prevContacts) => {
            const updatedContacts = prevContacts.map(contact => {
              if (contact.phone_number === data.contact.phone_number) {
                return {
                  ...contact,
                  ...data.contact,
                  timestamp: new Date(data.timestamp)
                };
              }
              return contact;
            });

            return updatedContacts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          };

          // ✅ Update BOTH states
          setContacts(prev => dedupeContacts(updateContactList(prev)));
          setAllContacts(prev => dedupeContacts(updateContactList(prev)));

          // Update selected contact if it's the same one
          if (selectedContact && selectedContact.phone_number === data.contact.phone_number) {
            setSelectedContact(prev => ({
              ...prev,
              ...data.contact
            }));
          }
        });

            // Handle human agent requests
            socket.on('human_agent_requested', (data) => {
              if (!isMountedRef.current || !data) return;

              console.log('Human agent requested event received:', data);

              // Update the contact list to reflect human agent request
              setContacts(prevContacts => {
                return prevContacts.map(contact => {
                  if (contact.phone_number === data.phoneNumber) {
                    return {
                      ...contact,
                      humanAgentRequested: true,
                      humanAgentStatus: 'requested',
                      lastHumanAgentRequest: new Date(data.requestedAt),
                      timestamp: new Date(data.requestedAt)
                    };
                  }
                  return contact;
                });
              });

              // Show notification
              toast.info(`Human agent requested by ${data.customerName || data.phoneNumber}`);
            });

            socket.on('message_status_update', (data) => {
              if (!isMountedRef.current) return;

              setMessages(prevMessages => {
                return prevMessages.map(msg => {
                  if (msg.messageId === data.messageId || msg._id === data.messageId) {
                    return {
                      ...msg,
                      status: data.status,
                      statusUpdatedAt: new Date()
                    };
                  }
                  return msg;
                });
              });
            });

            socket.on('welcome_message_sent', (data) => {
              console.log('Welcome message sent:', data);
            });
            // ── CALLING SOCKET EVENTS ──────────────────────────────────
        socket.on('call_permission_updated', (data) => {
          if (!isMountedRef.current) return;
          if (selectedContact?.phone_number === data.phone) {
            setCallPermissionStatus(data.status === 'accept' ? (data.isPermanent ? 'permanent' : 'temporary') : 'no_permission');
          }
        });

        // ✅ Handle Incoming Calls from Customers
        socket.on('incoming_call', (data) => {
          if (!isMountedRef.current) return;

          const callerContact = allContacts.find(c => c.phone_number === data.customerPhone);
          const callerName = callerContact
            ? (callerContact.profile_name || callerContact.name || data.customerPhone)
            : data.customerPhone;

          setActiveCall({
            callId: data.callId,
            customerPhone: data.customerPhone,
            sdpOffer: data.sdpOffer,
            callerName: callerName,
            state: 'incoming'
          });

          // ✅ Browser notification for background tabs
          if ('Notification' in window && Notification.permission === 'granted') {
            const digits = String(data.customerPhone || '').replace(/\D/g, '');
            let formatted = `+${digits}`;
            if (digits.length === 12 && digits.startsWith('91')) {
              formatted = `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
            }
            try {
              new Notification('📞 Incoming WhatsApp Call', {
                body: `${callerName !== data.customerPhone ? callerName + '\n' : ''}${formatted}`,
                icon: '/favicon.ico',
                tag: 'incoming-call',
                requireInteraction: true, // stays until dismissed
              });
            } catch (e) { console.warn('Notification failed:', e); }
          }
        });

        socket.on('call_initiated', (data) => {
          if (!isMountedRef.current) return;
          setActiveCall(prev => prev ? { ...prev, callId: data.callId, state: 'ringing' } : null);
        });

        socket.on('call_sdp_answer', (data) => {
          if (!isMountedRef.current) return;
          // Expose to CallingPanel via window for WebRTC handling
          if (window.__pendingSDPAnswer) {
            window.__pendingSDPAnswer(data.sdpAnswer);
          }
          setActiveCall(prev => prev ? { ...prev, state: 'active' } : null);
        });

        socket.on('call_status_update', (data) => {
          if (!isMountedRef.current) return;
          const stateMap = { RINGING: 'ringing', ACCEPTED: 'active', REJECTED: 'ended' };
          const newState = stateMap[data.status];
          if (newState) {
            setActiveCall(prev => prev ? { ...prev, state: newState } : null);
          }
        });

        socket.on('call_ended', (data) => {
          if (!isMountedRef.current) return;
          setActiveCall(null);
          setCallPermissionStatus(prev => prev); // keep permission
        });


          };

          initializeSocket();

          return () => {
            if (socketRef.current) {
              console.log('Cleaning up socket connection');
              socketRef.current.removeAllListeners();
              socketRef.current.disconnect();
              socketRef.current = null;
            }
          };
        }, [user, selectedContact?.phone_number, getMessageTypeDisplay]);

        // Separate useEffect for joining chat rooms when contact changes
        useEffect(() => {
          if (!socketRef.current?.connected || !selectedContact) {
            return;
          }

          // Join the specific chat room for this contact
          socketRef.current.emit('join_chat', selectedContact.phone_number);
          console.log('Joined chat room for:', selectedContact.phone_number);

        }, [selectedContact?.phone_number]);


        useEffect(() => {
          if (!user) return;

          let isMounted = true;

          const loadContacts = async (page = 1, append = false) => {
            try {
              if (!append) {
                setLoading(true);
              } else {
                setContactsLoading(true);
              }

              console.log(`📞 Loading contacts page ${page}...`);

              const params = {
                page,
                limit: 50,
                search: searchTerm,
                tags: selectedFilterTags.join(','),
                tab: 'all'
              };

              const response = await api.get('/api/contacts', { params });

              if (response.data && isMounted) {
                const { contacts: newContacts, pagination } = response.data;

                console.log(`✅ Loaded ${newContacts.length} contacts (page ${page}/${pagination.totalPages})`);

                if (append) {
                   setAllContacts(prev => mergeContactLists(prev, newContacts));
                  setContacts(prev => mergeContactLists(prev, newContacts));
                } else {
                  const deduped = dedupeContacts(newContacts);
                  setAllContacts(deduped);
                  setContacts(deduped);
                }

                setContactsHasMore(pagination.hasMore);
                setContactsPage(page);
                // Restore last selected contact on first load
		if (page === 1 && !append) {
		  const lastPhone = sessionStorage.getItem('lastSelectedPhone');
		  if (lastPhone) {
		    const restoredContact = newContacts.find(
		      c => c.phone_number === lastPhone
		    );
		    if (restoredContact) {
		      setTimeout(() => {
		        handleContactSelect(restoredContact);
		      }, 300);
		    }
		  }
		}		 
              }
            } catch (error) {
              console.error('Failed to load contacts:', error);
              if (isMounted) {
                toast.error('Failed to load contacts');
                setAllContacts([]);
                setContacts([]);
              }
            } finally {
              if (isMounted) {
                setLoading(false);
                setContactsLoading(false);
              }
            }
          };

          // ✅ DEBOUNCE: Only reload after user stops typing
          const timeoutId = setTimeout(() => {
            loadContacts(1, false);
          }, 300); // Wait 300ms after last keystroke

          return () => {
            isMounted = false;
            clearTimeout(timeoutId); // Cancel pending load if user keeps typing
          };
        }, [user, searchTerm, selectedFilterTags]);


        const handleLoadMore = useCallback(() => {
          if (!contactsLoading && contactsHasMore) {
            const nextPage = contactsPage + 1;
            console.log(`📄 Loading page ${nextPage}...`);

            const loadMore = async () => {
              try {
                setContactsLoading(true);

                const params = {
                  page: nextPage,
                  limit: 50,
                  search: searchTerm,
                  tags: selectedFilterTags.join(','),
                  tab: 'all'
                };

                const response = await api.get('/api/contacts', { params });

                if (response.data) {
                  const { contacts: newContacts, pagination } = response.data;

                   setAllContacts(prev => mergeContactLists(prev, newContacts));
                  setContacts(prev => mergeContactLists(prev, newContacts));
                  setContactsHasMore(pagination.hasMore);
                  setContactsPage(nextPage);
                }
              } catch (error) {
                console.error('Failed to load more contacts:', error);
              } finally {
                setContactsLoading(false);
              }
            };

            loadMore();
          }
        }, [contactsLoading, contactsHasMore, contactsPage, searchTerm, selectedFilterTags]);


useEffect(() => {
  if (!selectedContact) {
    setMessages([]);
    setIsChatLocked(false);
    setLastCustomerMessageTime(null);
    setWindowExpiryTime(null);
    setTimeUntilExpiry(null);
    setAwaitingCustomerResponse(false);
  }
}, [selectedContact]);

          // Real-time window timer
useEffect(() => {
  if (windowTimerRef.current) {
    clearInterval(windowTimerRef.current);
    windowTimerRef.current = null;
  }

  if (windowExpiryTime && !awaitingCustomerResponse) {
    windowTimerRef.current = setInterval(() => {
      const now = new Date();
      const timeDiff = windowExpiryTime - now;

      if (timeDiff <= 0) {
        setTimeUntilExpiry(0);
        setIsChatLocked(true);
        if (windowTimerRef.current) {
          clearInterval(windowTimerRef.current);
          windowTimerRef.current = null;
        }
      } else {
        setTimeUntilExpiry(timeDiff);
      }
    }, 1000);
  }

  return () => {
    if (windowTimerRef.current) {
      clearInterval(windowTimerRef.current);
      windowTimerRef.current = null;
    }
  };
}, [windowExpiryTime, awaitingCustomerResponse]);

useEffect(() => {
  if (selectedContact && messages.length > 0) {
    calculate24HourWindow(messages, selectedContact);
  } else if (selectedContact && messages.length === 0) {
    // No messages yet - unlock, user can try sending template
    setIsChatLocked(false);
  }
}, [messages.length, selectedContact?.phone_number, calculate24HourWindow]);


// Auto-scroll handling  ← this comes after
useEffect(() => {
  const scrollToBottom = () => {

              if (messagesEndRef.current && autoScroll) {
                messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
              }
            };

            scrollToBottom();
            const timeoutId = setTimeout(scrollToBottom, 100);
            return () => clearTimeout(timeoutId);
          }, [messages, autoScroll]);

          // Component cleanup
          useEffect(() => {
            isMountedRef.current = true;

            return () => {
              isMountedRef.current = false;

              if (windowTimerRef.current) {
                clearInterval(windowTimerRef.current);
                windowTimerRef.current = null;
              }

              if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
              }

              if (mediaRecorderRef.current) {
                try {
                  mediaRecorderRef.current.stop();
                  mediaRecorderRef.current.stream?.getTracks()?.forEach(track => track.stop());
                } catch (error) {
                  console.error('Error stopping media recorder:', error);
                }
                mediaRecorderRef.current = null;
              }

              if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
              }
            };
          }, []);

          // FIXED: Send message handler
          const handleSendMessage = useCallback(async () => {
          if (!newMessage.trim() || !selectedContact) {
            console.log('Cannot send - missing message or contact');
            return;
          }

          if (isChatLocked && !awaitingCustomerResponse) {
            console.log('Chat locked - 24-hour window expired');
            toast.error("24-hour messaging window expired. Send a template message to re-engage.");
            return;
          }

          const messageText = newMessage.trim();
          const replyContext = replyingTo; // Capture reply context before clearing
          setNewMessage("");
          setReplyingTo(null); // Clear reply state

          if (textareaRef.current) {
            textareaRef.current.style.height = '40px';
          }

          const clientId = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Prefer WAMID (messageId) for WhatsApp compatibility, fallback to _id for internal
          const quotedId = replyContext ? (replyContext.messageId || replyContext._id) : undefined;

          const tempMessage = {
            text: messageText,
            timestamp: new Date(),
            from: 'me',
            to: selectedContact.phone_number,
            _id: `temp-${clientId}`,
            clientId: clientId,
            quotedMessageId: quotedId,
            quotedMessageText: replyContext ? replyContext.text : undefined,
            status: 'sending',
            type: 'text'
          };

          processedMessageIds.current.add(clientId);

          setMessages(prev => {
            const newMessages = [...prev, tempMessage];
            return newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          });

          updateContactsList(tempMessage, true);

          try {
            const response = await api.post("/api/messages/send", {
              to: selectedContact.phone_number,
              text: messageText,
              clientId: clientId,
              quotedMessageId: quotedId,
              quotedMessageText: replyContext ? replyContext.text : undefined
            });

            if (response.data?.message) {
              console.log('✅ Message sent successfully, socket will update');
            }
          } catch (error) {
            console.error('Failed to send message:', error);
            setMessages(prev => prev.filter(msg => msg.clientId !== clientId));
            processedMessageIds.current.delete(clientId);
            toast.error("Failed to send message");
          }
        }, [newMessage, selectedContact, isChatLocked, awaitingCustomerResponse, updateContactsList, replyingTo]);


          // FIXED: Template send handler
          const sendTemplate = useCallback(async (templateName) => {
          if (!templateName || !selectedContact) {
            console.error('Missing template name or selected contact');
            toast.error('Invalid template or contact');
            return;
          }

          try {
            const templateNameStr = typeof templateName === 'object' ? templateName.name : templateName;
            console.log("Sending template:", templateNameStr);

            const response = await api.post('/api/messages/send-template', {
              templateName: templateName,
              recipientPhone: selectedContact.phone_number,
              language: "en"
            });

            if (response.data?.success) {
              setShowTemplates(false);
              toast.success(`Template "${templateNameStr}" sent successfully.`);

            } else {
              throw new Error(response.data?.details || 'Failed to send template');
            }

          } catch (error) {
            console.error("Error sending template:", error);

            let errorMessage = 'Failed to send template';
            if (error.response?.data?.error) {
              errorMessage = error.response.data.error;
            } else if (error.response?.data?.details) {
              errorMessage = error.response.data.details;
            } else if (error.message) {
              errorMessage = error.message;
            }

            toast.error(errorMessage);
          }
        }, [selectedContact]);

        const handleAutocorrect = useCallback(async () => {
          if (!newMessage.trim() || isAutocorrecting) return;

          setIsAutocorrecting(true);

          try {
            const containsThanglish = /[a-zA-Z]+[a-z]*[aeiou]+[a-z]*[^aeiousAEIOU\s]{2,}|enn?[aeiou]|[a-z]+kku\b|[a-z]+le\b|[a-z]+la\b|vandh?[aeiou]|pann?[aeiou]|th[aeiou]r[aeiou]|p[o0]d?[aeiou]|[a-z]+ngal\b/i.test(newMessage);

            let response;

            if (containsThanglish) {
              response = await api.post('/api/autocorrect/thanglish-to-english', {
                text: newMessage
              });

              if (response.data?.translatedText) {
                setNewMessage(response.data.translatedText);
              }
            } else {
              response = await api.post('/api/autocorrect', {
                text: newMessage
              });

              if (response.data?.correctedText) {
                setNewMessage(response.data.correctedText);
              }
            }
          } catch (error) {
            console.error('Error processing text:', error);
            toast.error('Failed to process message');
          } finally {
            setIsAutocorrecting(false);
          }
        }, [newMessage, isAutocorrecting]);


         const handleAssignTags = useCallback(async (tagIds) => {
          if (!selectedContact?._id) {
            console.error('DEBUG: Cannot update tags. Selected contact ID is missing.');
            toast.error('Cannot update tags. Please re-select the contact.');
            return;
          }

          try {
            const response = await api.put(`/api/contacts/${selectedContact._id}/tags`, {
              tags: tagIds
            });

            console.log('API Response for tags update:', response.data);

                if (response.data?.success) {
                  setSelectedContactTags(tagIds);

                  // ✅ FIX 2: Update BOTH allContacts and selectedContact
                  setAllContacts(prev => prev.map(c =>
                    c._id === selectedContact._id
                      ? { ...c, tags: tagIds }
                      : c
                  ));

                  setSelectedContact(prev => ({
                    ...prev,
                    tags: tagIds
                  }));

                  // ✅ Clear tags cache so fresh data loads next time
                  sessionStorage.removeItem('tags');
                  sessionStorage.removeItem('tags_fetched_at');

                  toast.success('Tags updated successfully');
                  setShowTagModal(false);
                } else {

            console.error('API succeeded but returned failure status:', response.data);
              toast.error(response.data?.message || 'Tags not updated due to server-side check.');
            }
          } catch (error) {
            console.error('Failed to update tags:', error.message, error.response?.data);
            toast.error('Failed to update tags');
          }
        }, [selectedContact]);


        const getTagColor = useCallback((tagId) => {
          const tag = tags.find(t => t._id === tagId);
          return tag?.color || '#999';
        }, [tags]);

        const getTagName = useCallback((tagId) => {
          const tag = tags.find(t => t._id === tagId);
          return tag?.name || 'Unknown';
        }, [tags]);

        const isColorDark = useCallback((hexColor) => {
          if (!hexColor) return false;
          const r = parseInt(hexColor.slice(1, 3), 16);
          const g = parseInt(hexColor.slice(3, 5), 16);
          const b = parseInt(hexColor.slice(5, 7), 16);
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          return brightness < 128;
        }, []);


       const handleContactSelect = useCallback(async (contact) => {
          if (!contact) return;

          console.log('FIXED: Contact selected:', contact.phone_number, 'Name:', contact.name);

          // Join socket room for this contact
          if (socketRef.current?.connected) {
            socketRef.current.emit('join_chat', contact.phone_number);
            console.log('Joined chat room for:', contact.phone_number);
          }

          // Close all modals
          setShowEmojiPicker(false);
          setShowMenu(false);
          setShowTemplates(false);
          setShowTagModal(false);
          setShowCaptionModal(false);
          setShowQuickResponses(false);
          setShowListModal(false);
          setShowButtonModal(false);
          setShowProfilePanel(false);

          // Clear previous state
          setMessages([]);
          setLoading(true);
          setIsChatLocked(false);
          setLastCustomerMessageTime(null);
          setWindowExpiryTime(null);
          setTimeUntilExpiry(null);
          setAwaitingCustomerResponse(false);

          // Set selected contact
          setSelectedContact(contact);
          setAutoScroll(true);

          try {
           // Mark as read immediately in UI so it disappears from Unread tab.
            if (contact.unreadCount > 0) {
              const clearUnreadLocally = (prev) =>
                prev.map((c) =>
                  c.phone_number === contact.phone_number ? { ...c, unreadCount: 0 } : c
                );

              setContacts(clearUnreadLocally);
              setAllContacts(clearUnreadLocally);
              setSelectedContact((prev) =>
                prev?.phone_number === contact.phone_number
                  ? { ...prev, unreadCount: 0 }
                  : prev
              );

                setTimeout(() => {
                  markMessagesAsRead(contact.phone_number);
                }, 1000);

            }

            console.log('FIXED: Loading messages for contact:', contact.phone_number);

            const loadMessages = async (retries = 2) => {
                  try {
                    return await api.get('/api/messages', {
                      params: { phone_number: contact.phone_number },
                      timeout: 30000
                    });
                  } catch (err) {
                    if (retries > 0 && err.code !== 'ECONNABORTED') {
                      await new Promise(r => setTimeout(r, 1000));
                      return loadMessages(retries - 1);
                    }
                    throw err;
                  }
                };
           const response = await loadMessages();


            if (response.data) {
              const messages = Array.isArray(response.data) ? response.data : [];
              const sortedMessages = messages.sort((a, b) =>
                new Date(a.timestamp) - new Date(b.timestamp)
              );

              console.log(`FIXED: Loaded ${sortedMessages.length} messages for ${contact.phone_number}`);

              setMessages(sortedMessages);

              processedMessageIds.current.clear();
              sortedMessages.forEach(msg => {
                if (msg._id) processedMessageIds.current.add(msg._id);
              });

              calculate24HourWindow(sortedMessages, contact);

              // Fetch call permission status for this contact
                try {
                  const permRes = await api.get(`/api/calling/permission-status?phone=${contact.phone_number}`);
                  setCallPermissionStatus(permRes.data?.permission?.status || 'no_permission');
                } catch {
                  setCallPermissionStatus('no_permission');
                }

              setLoading(false);
            } else {
              console.log('No messages data received');
              setMessages([]);
              setLoading(false);
            }

          } catch (error) {
            console.error('FIXED: Error loading messages for contact:', error);

            if (error.response?.status === 404) {
              console.log('No messages found for contact');
              setMessages([]);
            } else if (error.code === 'ECONNABORTED') {
              toast.error('Loading messages timed out. Please try again.');
              setMessages([]);
            } else {
              toast.error(`Failed to load messages: ${error.message}`);
              setMessages([]);
            }

            setLoading(false);
          }
        }, [calculate24HourWindow, markMessagesAsRead]);

const answerGlobalCall = useCallback(async () => {
  if (!activeCall?.sdpOffer) return;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
   ];

  try {
    // ✅ Try to get microphone — but don't block the call if it fails
    let stream = null;
    try {
      // First check if mediaDevices is available (requires HTTPS)
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
          },
          video: false
        });
      }
    } catch (micErr) {
      console.warn('Microphone not available:', micErr.message);
      // ✅ Don't throw — continue without mic (listen-only mode)
      toast('Answering without microphone — listen only mode', { icon: '🎧' });
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // ✅ Add mic tracks only if we got the stream
    if (stream) {
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
    }

    pc.ontrack = (event) => {
      let audio = document.getElementById('__global_call_audio');
      if (!audio) {
        audio = new Audio();
        audio.id = '__global_call_audio';
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true'); // ✅ Required for iOS
        document.body.appendChild(audio);
      }
      audio.srcObject = event.streams[0];
      // ✅ iOS requires user gesture to play — try to play manually
      audio.play().catch(e => console.warn('Audio play failed:', e));
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await api.post('/api/calling/ice-candidate', {
            callId: activeCall.callId,
            candidate: event.candidate,
            direction: 'answer',
          });
        } catch (e) { console.warn('ICE send failed:', e.message); }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Global call PC state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        toast.error('Call connection lost');
        setActiveCall(null);
      }
    };

    await pc.setRemoteDescription({ type: 'offer', sdp: activeCall.sdpOffer });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await api.post('/api/calling/accept', {
      callId: activeCall.callId,
      sdpAnswer: answer.sdp,
    });

    window.__globalCallPC = pc;
    window.__globalCallStream = stream;

    setActiveCall(prev => ({ ...prev, state: 'active' }));

    // ✅ Navigate to caller's contact
    if (activeCall.customerPhone) {
      const callerContact = allContacts.find(c =>
        c.phone_number === activeCall.customerPhone ||
        c.phone_number === activeCall.customerPhone?.replace(/^\+/, '') ||
        c.phone_number?.replace(/^\+/, '') === activeCall.customerPhone
      );
      if (callerContact) {
        await handleContactSelect(callerContact);
        if (isMobileView) setShowChatArea(true);
      }
    }

  } catch (err) {
    console.error('answerGlobalCall error:', err);
    toast.error('Failed to answer: ' + err.message);
    setActiveCall(null);
  }
}, [activeCall, allContacts, handleContactSelect, isMobileView]);


  useEffect(() => {
  if (!user) return;

  // ✅ Cache templates in sessionStorage (they rarely change)
  const cachedTemplates = sessionStorage.getItem('templates');
  const cachedAt = sessionStorage.getItem('templates_fetched_at');
  const TEN_MINUTES = 10 * 60 * 1000;

  if (cachedTemplates && cachedAt && Date.now() - parseInt(cachedAt) < TEN_MINUTES) {
    try {
      setTemplates(JSON.parse(cachedTemplates));
      return; // Skip API call
    } catch (e) {
      sessionStorage.removeItem('templates');
      sessionStorage.removeItem('templates_fetched_at');
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/api/templates');

      if (response.data) {
        let templatesList = [];

        if (Array.isArray(response.data.templates)) {
          templatesList = response.data.templates;
        } else if (Array.isArray(response.data.approvedTemplates)) {
          templatesList = response.data.approvedTemplates;
        } else if (Array.isArray(response.data.data)) {
          templatesList = response.data.data;
        } else if (Array.isArray(response.data)) {
          templatesList = response.data;
        }

        const validTemplates = templatesList.filter(template =>
          template &&
          typeof template === 'object' &&
          template.name &&
          template.id
        );

        setTemplates(validTemplates);

        // ✅ Cache for 10 minutes
        sessionStorage.setItem('templates', JSON.stringify(validTemplates));
        sessionStorage.setItem('templates_fetched_at', Date.now().toString());
      }
    } catch (error) {
      console.error('Template fetch error:', error);
      setTemplates([]);
      toast.error("Failed to load templates");
    }
  };

  fetchTemplates();
}, [user]);

          // Handle file upload function
          const handleFileUpload = useCallback(async (file, type, caption = null) => {
          if (!file || !selectedContact) {
            toast.error('Invalid file or no contact selected');
            return;
          }

          if (isChatLocked && !awaitingCustomerResponse) {
            toast.error("24-hour messaging window expired. Send a template message to re-engage.");
            return;
          }

          let fileType = type;
          if (!fileType) {
            if (file.type.startsWith('image/')) fileType = 'image';
            else if (file.type.startsWith('video/')) fileType = 'video';
            else if (file.type.startsWith('audio/')) fileType = 'audio';
            else fileType = 'document';
          }

          // ✅ Generate unique clientId
          const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // ✅ Create temp message with preview
          const tempMessage = {
            _id: `temp-${clientId}`,
            clientId: clientId,
            from: 'me',
            to: selectedContact.phone_number,
            type: fileType,
            text: caption || (fileType === 'document' ? file.name : ''),
            timestamp: new Date(),
            status: 'sending',
            uploadProgress: 0,
            _tempFile: true,
            mediaUrl: fileType === 'image' || fileType === 'video'
              ? URL.createObjectURL(file)
              : null
          };

          // ✅ Add temp message to UI immediately
          setMessages(prev => {
            const newMessages = [...prev, tempMessage];
            return newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          });

          // ✅ Track the clientId
          processedMessageIds.current.add(clientId);

          try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('to', selectedContact.phone_number);
            formData.append('mediaType', fileType);
            formData.append('clientId', clientId); // ✅ Send clientId to server

            if (caption) {
              formData.append('caption', caption);
            }

            if (fileType === 'document' && file.name) {
              formData.append('caption', caption || file.name);
            }

            const response = await api.post('/api/messages/send-media', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 120000,
              onUploadProgress: (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);

                // ✅ Update progress in the message itself
                setMessages(prev => prev.map(msg =>
                  msg.clientId === clientId
                    ? { ...msg, uploadProgress: percentCompleted }
                    : msg
                ));
              }
            });

            if (response.data?.success) {
              console.log('✅ Media uploaded successfully');
              // Socket handler will replace the temp message with the real one
            }
          } catch (error) {
            console.error('Failed to send media:', error);

            // ✅ Remove failed message
            setMessages(prev => prev.filter(msg => msg.clientId !== clientId));
            processedMessageIds.current.delete(clientId);

            // Cleanup blob URL
            if (tempMessage.mediaUrl && tempMessage.mediaUrl.startsWith('blob:')) {
              URL.revokeObjectURL(tempMessage.mediaUrl);
            }

            if (error.response?.status === 413) {
              toast.error(`File too large. Max 16MB`);
            } else if (error.code === 'ECONNABORTED') {
              toast.error(`Upload timeout`);
            } else {
              toast.error(`Failed to send ${fileType}`);
            }
          }
        }, [selectedContact, isChatLocked, awaitingCustomerResponse]);

        const linkify = (text) => {
          if (!text) return '';

          // ✅ Enhanced URL regex that properly captures complete URLs
          const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

          const parts = [];
          let lastIndex = 0;
          let match;

          // Reset regex
          urlRegex.lastIndex = 0;

          while ((match = urlRegex.exec(text)) !== null) {
            // Add text before the URL
            if (match.index > lastIndex) {
              parts.push(text.substring(lastIndex, match.index));
            }

            // Get the matched URL
            const url = match[0];

            // Create proper href (add http:// if it starts with www.)
            const href = url.startsWith('www.') ? `http://${url}` : url;

            // Add the link
            parts.push(
              <a
                key={`link-${match.index}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {url}
              </a>
            );

            lastIndex = match.index + url.length;
          }

          // Add remaining text after last URL
          if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
          }

          // If no URLs found, return original text
          return parts.length > 0 ? parts : text;
        };

        const handleMediaWithCaption = useCallback((file, type) => {
          setPendingMedia({ file, type });
          setMediaCaption('');
          setShowCaptionModal(true);
        }, []);

        const handleSendMediaWithCaption = useCallback(() => {
          if (pendingMedia) {
            handleFileUpload(pendingMedia.file, pendingMedia.type, mediaCaption.trim() || null);
            setShowCaptionModal(false);
            setPendingMedia(null);
            setMediaCaption('');
          }
        }, [pendingMedia, mediaCaption, handleFileUpload]);

        const handleInputDragOver = useCallback((e) => {
          e.preventDefault();
          e.stopPropagation();
        }, []);

        // ✅ NEW: Logic to handle confirming files from the Preview Modal
        const handleConfirmSendFiles = useCallback(async (caption) => {
          setShowPreviewModal(false);
          const filesToSend = [...previewFiles];
          setPreviewFiles([]);

          toast.success(`Sending ${filesToSend.length} files...`);

          for (let i = 0; i < filesToSend.length; i++) {
            const file = filesToSend[i];
            let type = 'document';
            if (file.type.startsWith('image/')) type = 'image';
            else if (file.type.startsWith('video/')) type = 'video';
            else if (file.type.startsWith('audio/')) type = 'audio';

            // Only add caption to the first image
            const fileCaption = (i === 0) ? caption : null;

            // Small delay to ensure order
            if (i > 0) await new Promise(r => setTimeout(r, 200));

            handleFileUpload(file, type, fileCaption);
          }
        }, [previewFiles, handleFileUpload]);

        // ✅ NEW: Process files dropped or pasted
        const processFileSelection = useCallback((fileList) => {
          if (!selectedContact) {
            toast.error("Please select a contact first");
            return;
          }

          const files = Array.from(fileList);
          if (files.length === 0) return;

          // Validate size
          const validFiles = files.filter(file => {
            if (file.size > 16 * 1024 * 1024) {
              toast.error(`File ${file.name} skipped (too large, max 16MB)`);
              return false;
            }
            return true;
          });

          if (validFiles.length > 0) {
            // Add to preview state and show modal
            setPreviewFiles(prev => [...prev, ...validFiles]);
            setShowPreviewModal(true);
          }
        }, [selectedContact]);

        // ✅ UPDATED: Handle Drop to use processFileSelection
        const handleInputDrop = useCallback((e) => {
          e.preventDefault();
          e.stopPropagation();

          // Pass the files to our new helper function
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFileSelection(e.dataTransfer.files);
          }
        }, [processFileSelection]);

        // ✅ NEW: Handle Paste to use processFileSelection
        const handlePaste = useCallback((e) => {
          // Check if clipboard has files
          if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault(); // Prevent the file name from being pasted as text
            processFileSelection(e.clipboardData.files);
          }
        }, [processFileSelection]);

          const handleMarkUnread = useCallback(async () => {
          if (!selectedContact?._id) return;

          try {
            // 1. Call API to update database
            await api.put(`/api/contacts/${selectedContact._id}/mark-unread`);

            // 2. Update local contacts state
            setContacts(prev => prev.map(c =>
              c._id === selectedContact._id
                ? { ...c, unreadCount: 1 }
                : c
            ));

            setAllContacts(prev => prev.map(c =>
              c._id === selectedContact._id
                ? { ...c, unreadCount: 1 }
                : c
            ));

            // 3. Clear selection
            setSelectedContact(null);
            sessionStorage.removeItem('lastSelectedPhone'); 
            setMessages([]);

            // ✅ FIX: Force mobile view back to contact list
            if (isMobileView) {
              setShowChatArea(false);
            }

            toast.success("Marked as unread");

          } catch (error) {
            console.error("Failed to mark as unread:", error);
            toast.error("Failed to mark as unread");
          }
        }, [selectedContact, isMobileView]);

        const handleDownloadContacts = () => {
          // ✅ FIX: Use filteredContacts to download what user is currently seeing
          const contactsToDownload = filteredContacts.length > 0 ? filteredContacts : allContacts;

          if (!contactsToDownload || contactsToDownload.length === 0) {
            toast.error("No contacts to download");
            return;
          }

          // Define headers
          const headers = ["Name", "Phone Number", "Tags"];

          // Map data
          const csvContent = contactsToDownload.map(contact => {
            // Get tag names from IDs
            const contactTags = contact.tags?.map(tId => {
               const tag = tags.find(t => t._id === tId);
               return tag ? tag.name : '';
            }).filter(Boolean).join(', ') || '';

            // Helper to escape quotes and handle nulls for CSV format
            const escape = (str) => {
                if (str === null || str === undefined) return '';
                return `"${String(str).replace(/"/g, '""')}"`;
            };

            // Determine the name to display (Profile Name preferred, fallback to Name)
            const displayName = contact.profile_name || contact.name || "Unknown";

            return [
              escape(displayName),
              escape(contact.phone_number),
              escape(contactTags)
            ].join(',');
          });

          // Combine headers and content
          const csvString = [headers.join(','), ...csvContent].join('\n');

          // Create Blob and download link
          const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `contacts_export_${dayjs().format('YYYY-MM-DD')}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // ✅ Show success message with count
          toast.success(`Downloaded ${contactsToDownload.length} contacts`);
        };

          // Render component
          if (loading && !selectedContact) {
            return (
              <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
              </div>
            );
          }

          return (
             <Container className={isMobileView ? 'mobile-view' : ''}>

                {/* ✅ MOBILE: Back button for chat area */}
                {/* {isMobileView && showChatArea && (
                  <div className="mobile-back-button">
                    <button
                      onClick={handleBackToContacts}
                      className="p-2 rounded-full bg-white shadow-md hover:bg-gray-100 transition-colors"
                    >
                      <ChevronLeft size={24} />
                    </button>
                  </div>
                )} */}

                {/* ✅ Mobile: Show sidebar only when not in chat area */}

                {(!isMobileView || !showChatArea) && (
                  <Sidebar className={isMobileView ? 'mobile-sidebar' : ''}>


<div className="px-4 pt-2.5 pb-0 bg-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2 gap-2 md:gap-0">
            <h1 className="hidden md:block text-[22px] font-bold text-green-600">GoWhats</h1>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:hidden">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 bg-gray-100 border-transparent focus:bg-white border focus:border-green-500 rounded-full text-sm transition-all focus:ring-0"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />

                {searchTerm && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSearchTerm("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Add Contact Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPopupOpen(true);
                  }}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
                  title="Add new contact"
                >
                  <AiOutlinePlus size={22} className="text-gray-600" />
                </button>

                {/* Menu Button - FIXED */}
                <div className="relative z-20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHeaderMenu(!showHeaderMenu);
                      setShowTagFilter(false);
                    }}
                    className={`p-2 rounded-full transition-colors ${
                      showHeaderMenu || showTagFilter ? 'bg-gray-100' : 'hover:bg-gray-100'
                    }`}
                  >
                    <MoreVertical size={22} className="text-gray-600" />
                  </button>

                  {/* Dropdown Menu */}
                  {showHeaderMenu && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-[25]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHeaderMenu(false);
                        }}
                      />

                      {/* Menu Content */}
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 z-[30] overflow-hidden py-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowTagFilter(!showTagFilter);
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm text-gray-700"
                        >
                          <ListFilter size={18} className="text-gray-500" />
                          <div className="flex-1">
                            Filter by Tags
                            {selectedFilterTags.length > 0 && (
                              <span className="ml-2 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                                {selectedFilterTags.length} Active
                              </span>
                            )}
                          </div>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadContacts();
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm text-gray-700"
                        >
                          <Download size={18} className="text-gray-500" />
                          Download Excel
                        </button>

                        <div className="h-px bg-gray-100 my-1"></div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsPopupOpen(true);
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm text-green-600 font-medium"
                        >
                          <AiOutlinePlus size={18} />
                          Add New Contact
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="relative hidden md:block">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-gray-100 border-transparent focus:bg-white border focus:border-green-500 rounded-full text-sm transition-all focus:ring-0"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />

            {searchTerm && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Active Filter Chips */}
          {selectedFilterTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedFilterTags.map(tagId => {
                const tag = tags.find(t => t._id === tagId);
                if (!tag) return null;
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-all"
                    style={{
                      borderColor: tag.color,
                      backgroundColor: `${tag.color}15`,
                      color: 'black'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFilterTag(tagId);
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }}></span>
                    {tag.name}
                    <X size={12} className="text-gray-500 hover:text-red-500 ml-1" />
                  </span>
                );
              })}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllFilterTags();
                }}
                className="text-xs text-red-500 hover:text-red-700 underline px-1"
              >
                Clear
              </button>
            </div>
          )}
        </div>


{/* Tag Filter Dropdown - Centered and Smaller */}
{showTagFilter && (
  <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 z-[25]"
      onClick={() => setShowTagFilter(false)}
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
    />

    {/* Dropdown - Centered */}
    <div
      className="fixed bg-white border border-gray-200 rounded-lg shadow-2xl z-[30]"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '280px',
        maxHeight: '350px',
        overflow: 'hidden'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Tag size={16} className="text-gray-600" />
            Filter by Tags
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTagFilter(false);
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tags List */}
      <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
        {tags.length === 0 ? (
          <div className="text-center py-6 px-4 text-gray-500">
            <Tag className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-xs font-medium">No tags available</p>
            <p className="text-xs mt-1 text-gray-400">Create tags in Settings</p>
          </div>
        ) : (
          <div>
            {tags.map((tag, index) => (
              <label
                key={tag._id}
                className={`flex items-center px-3 py-2.5 cursor-pointer transition-colors hover:bg-gray-50 ${
                  index !== tags.length - 1 ? 'border-b border-gray-100' : ''
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedFilterTags.includes(tag._id)}
                  onChange={() => toggleFilterTag(tag._id)}
                  className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-2 focus:ring-green-500 cursor-pointer flex-shrink-0"
                />
                <div className="ml-2.5 flex items-center gap-2 flex-1 min-w-0">
                  <Tag
                    size={14}
                    className="flex-shrink-0"
                    style={{ color: tag.color }}
                  />
                  <span className="text-sm font-normal truncate text-gray-800">
                    {tag.name}
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {selectedFilterTags.length > 0 && (
        <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearAllFilterTags();
            }}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Clear all ({selectedFilterTags.length})
          </button>
        </div>
      )}
    </div>
  </>
)}

{/* ✅ TABS - Minimal top padding, tight spacing */}
<div className="flex bg-white px-3 pt-0.5 pb-1 border-b border-gray-100">
  <button
    className={`flex-1 py-1.5 text-sm font-medium transition-all relative flex items-center justify-center gap-2 ${
      activeTab === 'all'
        ? 'text-gray-900'
        : 'text-gray-600 hover:text-gray-900'
    }`}
    onClick={() => setActiveTab('all')}
  >
    <span className={`inline-flex items-center justify-center gap-2 px-4 py-1 rounded-full transition-all ${
      activeTab === 'all'
        ? 'bg-green-100'
        : 'hover:bg-gray-100'
    }`}>
      All
      {tabCounts.total > 0 && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center ${
          activeTab === 'all'
            ? 'bg-green-500 text-white'
            : 'bg-gray-200 text-gray-600'
        }`}>
          {tabCounts.total}
        </span>
      )}
    </span>
  </button>

  <button
    className={`flex-1 py-1.5 text-sm font-medium transition-all relative flex items-center justify-center gap-2 ${
      activeTab === 'unread'
        ? 'text-gray-900'
        : 'text-gray-600 hover:text-gray-900'
    }`}
    onClick={() => setActiveTab('unread')}
  >
    <span className={`inline-flex items-center justify-center gap-2 px-4 py-1 rounded-full transition-all ${
      activeTab === 'unread'
        ? 'bg-green-100'
        : 'hover:bg-gray-100'
    }`}>
      Unread
      {tabCounts.unread > 0 && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center ${
          activeTab === 'unread'
            ? 'bg-green-500 text-white'
            : 'bg-gray-200 text-gray-600'
        }`}>
          {tabCounts.unread}
        </span>
      )}
    </span>
  </button>

  <button
    className={`flex-1 py-1.5 text-sm font-medium transition-all relative flex items-center justify-center gap-2 ${
      activeTab === 'team'
        ? 'text-gray-900'
        : 'text-gray-600 hover:text-gray-900'
    }`}
    onClick={() => setActiveTab('team')}
  >
    <span className={`inline-flex items-center justify-center gap-2 px-4 py-1 rounded-full transition-all ${
      activeTab === 'team'
        ? 'bg-green-100'
        : 'hover:bg-gray-100'
    }`}>
      Team
      {tabCounts.team > 0 && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center ${
          activeTab === 'team'
            ? 'bg-green-500 text-white'
            : 'bg-gray-200 text-gray-600'
        }`}>
          {tabCounts.team}
        </span>
      )}
    </span>
  </button>
</div>

    {/* Contact List */}
    <ContactList>
      {allContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 bg-white">
          <div className="bg-gray-100 rounded-full p-4 mb-4">
            <Tag size={48} className="text-gray-400" />
          </div>
          <p className="text-center font-semibold text-gray-700 mb-2">
            No contacts found
          </p>
          {selectedFilterTags.length > 0 && (
            <p className="text-sm text-center text-gray-500 mb-3">
              No contacts match the selected tags
            </p>
          )}
          {searchTerm && (
            <p className="text-sm text-center text-gray-500 mb-3">
              No matches for "<span className="font-medium">{searchTerm}</span>"
            </p>
          )}
          {(selectedFilterTags.length > 0 || searchTerm) && (
            <button
              onClick={() => {
                clearAllFilterTags();
                setSearchTerm("");
              }}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg transition-colors font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <VirtualContactList
          contacts={filteredContacts}
          selectedContact={selectedContact}
          onContactSelect={isMobileView ? handleContactSelectMobile : handleContactSelect}
          tags={tags}
          hasMore={contactsHasMore}
          onLoadMore={handleLoadMore}
          loading={contactsLoading}
        />
      )}
    </ContactList>


     </Sidebar>
     )}

     {/* ✅ Mobile: Show chat area only when selected contact exists */}
        {(!isMobileView || showChatArea) && (
          <div className="flex flex-1 overflow-hidden">
            <ChatArea className={`${isMobileView ? 'mobile-chat-area' : ''} ${showProfilePanel ? 'w-2/3' : 'w-full'}`}>
        {selectedContact ? (
          <>
            <ChatHeader>
              {/* ✅ Keep ONLY this Back button in the header */}
              {isMobileView && (
                <button
                  onClick={handleBackToContacts}
                  className="mr-3 p-2 rounded-full hover:bg-green-600 hover:text-white transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
              )}

                  <div className="header-details">
                  <div
                  className="avatar-header cursor-pointer flex items-center justify-center bg-green-100 rounded-full"
                  onClick={() => setShowProfilePanel(prev => !prev)}
                  title="Toggle Profile Panel"
                >
                  <User size={20} className="text-green-600" />
                </div>

                  </div>
                  <div className="chat-info cursor-pointer" onClick={() => setShowProfilePanel(prev => !prev)}>
                   <div className="chat-name">

                      {selectedContact?.profile_name || selectedContact?.name || selectedContact?.phone_number || 'Unknown'}
                    </div>
                    <div className="status flex items-center gap-2">
                      <span>+{selectedContact?.phone_number || 'Unknown'}</span>
                      {/* Tags Display */}
                      {selectedContactTags.length > 0 && (
                        <div className="flex items-center gap-1">
                          {selectedContactTags.slice(0, 2).map(tagId => {
                            const tagColor = getTagColor(tagId);
                            const tagName = getTagName(tagId);
                            return (
                              <span
                                key={tagId}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                  backgroundColor: tagColor,
                                  color: isColorDark(tagColor) ? 'white' : 'black'
                                }}
                              >
                                {tagName}
                              </span>
                            );
                          })}
                          {selectedContactTags.length > 2 && (
                            <span className="text-xs text-gray-500">
                              +{selectedContactTags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ✅ UPDATED ACTION BUTTONS SECTION */}
                  <div className="ml-auto flex items-center gap-1 mr-4">

                {/* ── CALLING BUTTON ── */}
                <CallingPanel
                  contact={selectedContact}
                  permissionStatus={callPermissionStatus}
                  activeCall={activeCall}
                  setActiveCall={setActiveCall}
                  socketRef={socketRef}
                  hideIncoming={true}
                />

                    {/* 1. Mark as Unread Button */}
                    <button
                      onClick={handleMarkUnread}
                      className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-green-600"
                      title="Mark as Unread"
                    >
                      <Mail size={20} />
                    </button>

                    {/* 2. Tags Button */}
                    <button
                      onClick={() => setShowTagModal(true)}
                      className="p-2 hover:bg-green-100 rounded-full transition-colors"
                      title="Manage tags"
                    >
                      <Tag size={20} className="text-gray-600" />
                    </button>
                  </div>

                  {/* Resolve Team Assist Button */}
                  {selectedContact?.humanAgentRequested && (
                    <div className="mr-4">
                      <button
                        onClick={async () => {
                          try {
                            const response = await api.put(`/api/contacts/${selectedContact._id}/resolve-human-agent`);
                            if (response.data) {
                              setContacts(prev => prev.map(c =>
                                c._id === selectedContact._id
                                  ? { ...c, humanAgentRequested: false, humanAgentStatus: 'resolved' }
                                  : c
                              ));
                              setSelectedContact(prev => ({
                                ...prev,
                                humanAgentRequested: false,
                                humanAgentStatus: 'resolved'
                              }));
                              toast.success('Team assist request resolved');
                            }
                          } catch (error) {
                            console.error('Error resolving human agent request:', error);
                            toast.error('Failed to resolve request');
                          }
                        }}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        ✓ Resolve Request
                      </button>
                    </div>
                  )}
                </ChatHeader>

                    {/* FIXED: 24-Hour Window Banner */}
                    <Messages
                    ref={messagesContainerRef}
                    onScroll={() => {
                        if (!messagesContainerRef.current) return;
                        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
                        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
                        setAutoScroll(isNearBottom);
                    }}
                >
                    {Array.isArray(messages) && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-gray-500 text-center">
              <div className="mb-4">
                <div className="w-16 h-16 rounded-full bg-gray-200 mx-auto mb-2"></div>
                <div className="h-4 w-40 bg-gray-200 rounded mx-auto"></div>
              </div>
              <p>No messages yet</p>
              <p className="text-sm">Send a message to start chatting</p>
            </div>
          </div>
        ) : (

        Array.isArray(messages) && messages.reduce((acc, msg, idx) => {
            if (!msg) return acc;

            const msgDate = dayjs(msg.timestamp).format("YYYY-MM-DD");
            const prevMsgDate = idx > 0 ? dayjs(messages[idx - 1]?.timestamp).format("YYYY-MM-DD") : null;

            if (msgDate !== prevMsgDate) {
                acc.push(
                    <div key={`date-${msgDate}-${idx}`} className="text-center text-xs py-2 mb-2">
                        <span className="bg-gray-200 text-gray-600 px-2 py-1 rounded-lg">
                            {formatMessageDate(msg.timestamp)}
                        </span>
                    </div>
                );
            }

            const isSentByMe = msg.from !== selectedContact.phone_number;

        acc.push(
            <div
                id={`msg-${msg._id || msg.messageId || msg.clientId || `${msg.type}-${idx}`}`}
                key={`msg-${msg._id || msg.messageId || msg.clientId || `${msg.type}-${idx}`}`}
                className={`flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} transition-colors duration-500`}
            >
		  <MessageBubble
		    $sent={isSentByMe}
		    className="group relative"
		    onContextMenu={(e) => {
		        e.preventDefault();
		        const x = Math.min(e.clientX, window.innerWidth - 170);
		        const y = Math.min(e.clientY, window.innerHeight - 100);
		        setContextMenu({ x, y, message: msg });
		    }}
		    onTouchStart={(e) => {
		        const touch = e.touches[0];
		        const timer = setTimeout(() => {
		            const x = Math.min(touch.clientX, window.innerWidth - 170);
		            const y = Math.min(touch.clientY, window.innerHeight - 100);
		            setContextMenu({ x, y, message: msg });
		        }, 500);
		        e.currentTarget._longPressTimer = timer;
		    }}
		    onTouchEnd={(e) => {
		        clearTimeout(e.currentTarget._longPressTimer);
		    }}
		    onTouchMove={(e) => {
		        clearTimeout(e.currentTarget._longPressTimer);
		    }}
		>

                  {/* Quoted Message Display inside Bubble */}
                    {msg.quotedMessageId && (
                        <div
                            className={`mb-1 p-2 rounded border-l-4 border-green-500 cursor-pointer ${isSentByMe ? 'bg-green-500 bg-opacity-20' : 'bg-gray-100'}`}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                const originalMsg = messages.find(m =>
                                    m.messageId === msg.quotedMessageId ||
                                    m._id === msg.quotedMessageId ||
                                    (m.context && m.context.id === msg.quotedMessageId)
                                );

                                let targetDomId = null;
                                if (originalMsg) {
                                    targetDomId = `msg-${originalMsg._id || originalMsg.messageId || originalMsg.clientId}`;
                                } else {
                                    targetDomId = `msg-${msg.quotedMessageId}`;
                                }

                                const targetElement = document.getElementById(targetDomId);

                                if (targetElement) {
                                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    targetElement.classList.add('highlight-message');
                                    setTimeout(() => {
                                        targetElement.classList.remove('highlight-message');
                                    }, 2000);
                                } else {
                                    toast.error('Message not found in current view');
                                }
                            }}
                        >
                            <p className="text-xs font-bold text-green-700">Replying to</p>
                            <p className="text-sm text-gray-600 truncate">{msg.quotedMessageText || 'Loading...'}</p>
                        </div>
                    )}

                    {/* Context Menu Button */}
                    <button
                        className="absolute top-1 right-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        onClick={(e) => {
                            e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
			const rawX = isSentByMe ? rect.right - 150 : rect.left;
			const x = Math.min(Math.max(rawX, 10), window.innerWidth - 170);
			const y = Math.min(rect.bottom + 5, window.innerHeight - 100);
			setContextMenu({ x, y, message: msg });

                      }}
                    >
                        <ChevronDownIcon size={20} className="text-gray-600" />
                    </button>

                    {(() => {
                        // ===================================================================
                        // WELCOME MESSAGE
                        // ===================================================================
                        if (isSentByMe && msg.isWelcomeMessage) {
                            return (
                                <WelcomeMessageComponent
                                    message={msg}
                                    onWelcomeAction={handleWelcomeAction}
                                    welcomeConfig={welcomeConfig}
                                    customerPhone={selectedContact.phone_number}
                                />
                            );
                        }

                        // Robust detection for "Interactive message" text
                        const isCallUI = msg.type === 'call' ||
                                         msg.subType === 'call' ||
                                         msg.interactive?.type === 'call_permission_request' ||
                                         msg.text === 'Interactive message' ||
                                         (msg.text && msg.text.toLowerCase().includes('call'));

                        if (isCallUI) {
                            return <CallLogComponent msg={msg} isSentByMe={isSentByMe} />;
                        }

                        // ===================================================================
                        // FLOW COMPLETION (CUSTOMER'S FORM SUBMISSION)
                        // ===================================================================
                        if (msg.isFlowCompletion || msg.flowResponseData || msg.interactive?.type === 'nfm_reply') {
                            return <FlowCompletionMessage message={msg} />;
                        }

                        // ===================================================================
                        // OUTGOING FLOW & INTERACTIVE MESSAGES (SENT BY BOT)
                        // ===================================================================
                        if (isSentByMe && (msg.type === 'interactive' || msg.type === 'flow')) {
                            if (msg.subType === 'order_completion' || (msg.text && msg.text.includes('Order completion flow'))) {
                                return <FlowSendingMessage message={msg} flowType="order" />;
                            }
                            if (msg.subType === 'registration_flow') {
                                return <FlowSendingMessage message={msg} flowType="registration" />;
                            }
                            if (msg.subType === 'shipping_options_list') {
                                return <ShippingOptionsMessage message={msg} />;
                            }
                            if (msg.subType === 'order_details' || msg.isPaymentMessage || msg.subType === 'registration_payment') {
                                return <PaymentMessageComponent message={msg} />;
                            }
                            return <CatalogMessageComponent message={msg} />;
                        }

                        // Ticket Message
                        if (msg.type === 'image' && (msg.caption?.includes('Ticket ID') || msg.text?.includes('Ticket ID') || msg.caption?.includes('🎫'))) {
                            return <TicketMessage message={msg} />;
                        }

                        // ===================================================================
                        // INCOMING ORDER FROM CATALOG
                        // ===================================================================
                        if (msg.type === 'order') {
                            // Check if it's a catalog order (has orderData with items)
                            if (msg.orderData && msg.orderData.items && msg.orderData.items.length > 0) {
                                return <CatalogMessageComponent message={msg} />;
                            }
                            // Otherwise use the regular OrderMessage component
                            return <OrderMessage message={msg} />;
                        }

                        // ===================================================================
                        // ALL OTHER MESSAGE TYPES
                        // ===================================================================
                        switch (msg.type) {
                            case 'template':
                                if (msg.isOrderDispatched || msg.templateName === 'order_dispatched' ||
                                    msg.templateName === 'order_dispatched_website' ||
                                    (msg.orderDetails && msg.orderDetails.trackingNumber)) {
                                    return <DispatchMessage message={{
                                        ...msg,
                                        orderDetails: msg.orderDetails || {
                                            customerName: msg.customerName || msg.text?.match(/Hi (\w+)/)?.[1] || 'Customer',
                                            orderId: msg.orderDetails?.orderId || msg.text?.match(/Order ID:(\S+)/)?.[1] || 'N/A',
                                            orderNumber: msg.orderDetails?.orderNumber || msg.text?.match(/#(\d+)/)?.[1] || 'N/A',
                                            trackingNumber: msg.orderDetails?.trackingNumber || msg.text?.match(/Tracking Number:\s*(\S+)/)?.[1] || 'Not available',
                                            trackingCompany: msg.orderDetails?.trackingCompany || msg.text?.match(/Tracking Company:\s*([^\n]+)/)?.[1]?.trim() || 'Standard Shipping',
                                            trackingUrl: msg.orderDetails?.trackingUrl || null,
                                            products: msg.orderDetails?.products || msg.text?.match(/Products:\s*([^\n]+)/)?.[1] || msg.text,
                                            total: msg.orderDetails?.total || msg.text?.match(/Amount:\s*INR\s*([\d.]+)/)?.[1] || 'N/A',
                                            platform: msg.orderDetails?.platform || 'shopify'
                                        }
                                    }} />;
                                } else if (msg.isAbandonedCartReminder || msg.templateName === 'shopify_template') {
                                    return <AbandonedCartMessage message={{
                                        ...msg,
                                        cartDetails: msg.cartData || msg.cartDetails || {
                                            items: msg.text?.match(/Items:\s*(\d+)/)?.[1] ?
                                                Array(parseInt(msg.text.match(/Items:\s*(\d+)/)[1])).fill({}) : [],
                                            total: msg.text?.match(/Cart Total:\s*INR\s*([\d.]+)/)?.[1] ||
                                                msg.text?.match(/INR\s*([\d.]+)/)?.[1] || '0',
                                            currency: 'INR',
                                            itemCount: msg.text?.match(/Items:\s*(\d+)/)?.[1] ||
                                                msg.text?.match(/(\d+)\s+items/)?.[1] || '0'
                                        },
                                        customerName: msg.customerName || msg.text?.match(/Hi (\w+)/)?.[1] || 'Customer'
                                    }} />;
                                } else if ((msg.isOrderConfirmation || msg.templateName === 'order_confirmation_website' ||
                                            msg.templateName === 'order_confirmation') && msg.orderData) {
                                    return <OrderConfirmationMessageComponent message={msg} />;
                                } else {
                                    return (
                                        <TemplateContainer $sent={isSentByMe}>
                                            <div className="template-header">
                                                <span className="font-medium">{msg.templateName || 'Template'}</span>
                                            </div>
                                            <div className="template-body mt-2">{msg.text}</div>
                                            <MessageFooter timestamp={msg.timestamp} status={msg.status} isSent={isSentByMe} />
                                        </TemplateContainer>
                                    );
                                }

                            case 'image':
                                return <ImageMessage msg={msg} selectedContact={selectedContact} />;
                            case 'video':
                                return <VideoMessage msg={msg} selectedContact={selectedContact} />;
                            case 'audio':
                                return <AudioMessage msg={msg} selectedContact={selectedContact} />;
                            case 'document':
                                return <DocumentMessage msg={msg} selectedContact={selectedContact} />;
                            case 'sticker':
                                return <StickerMessage msg={msg} selectedContact={selectedContact} />;
                            case 'location':
                                return <LocationMessage msg={msg} selectedContact={selectedContact} />;
                            case 'reaction':
                                return <ReactionMessage msg={msg} selectedContact={selectedContact} />;

                            default:
                                return (
                                    <>
                                        <div className="message-text">{linkify(msg.text || 'Message')}</div>
                                        <MessageFooter timestamp={msg.timestamp} status={msg.status} isSent={isSentByMe} />
                                    </>
                                );
                        }
                    })()}
                </MessageBubble>
              </div>
            );

            return acc;
        }, [])

 )}
 <div ref={messagesEndRef} />
        </Messages>


        {/* Reply Preview */}
        {replyingTo && (
  <div className="bg-gray-100 p-2 border-l-4 border-green-500 rounded-t-lg mb-1 flex justify-between items-center mx-2">
    <div className="overflow-hidden">
      <p className="text-xs font-bold text-green-600">Replying to</p>
      <p className="text-sm text-gray-600 truncate">{replyingTo.text || "Message"}</p>
    </div>
    <button onClick={() => setReplyingTo(null)} className="text-gray-400 p-1">
      <X size={16} />
    </button>
  </div>
)}

<MessageInput>
  <div
    onDragOver={handleInputDragOver}
    onDrop={handleInputDrop}
    style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}
  >
    <div className="relative">
      <SmileIcon
        ref={emojiButtonRef}
        className={`emoji-button ${showEmojiPicker ? 'active' : ''} ${(isChatLocked && !awaitingCustomerResponse) ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!(isChatLocked && !awaitingCustomerResponse)) {
            setShowEmojiPicker(!showEmojiPicker);
          }
        }}
      />
      {showEmojiPicker && !(isChatLocked && !awaitingCustomerResponse) && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-12 left-0 z-50"
          onClick={e => e.stopPropagation()}
        >
          <Picker
            data={data}
            onEmojiSelect={(emoji) => {
              setNewMessage(prev => prev + emoji.native);
              setShowEmojiPicker(false);
            }}
          />
        </div>
      )}
    </div>

    <div className="relative">
      <Paperclip
        ref={attachButtonRef}
        className={`attach-button ${showMenu ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        title="Attach files or send templates"
      />

    {showMenu && (
      <div
        ref={attachMenuRef}
        className="absolute bottom-12 left-0 mt-2 w-48 bg-white border border-gray-300 rounded-lg shadow-md z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="py-2 text-sm text-gray-700">
          {!(isChatLocked && !awaitingCustomerResponse) && (
            <>
              <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.multiple = true;
                  input.onchange = async (e) => {
                    const files = Array.from(e.target.files);
                    if (files.length === 0) return;

                    if (files.length === 1) {
                      // Single image - show caption modal
                      handleMediaWithCaption(files[0], 'image');
                    } else {
                      // Multiple images - send without caption
                      // ✅ NEW: Use file process logic for multiple files
                      processFileSelection(files);
                    }
                  };
                  input.click();
                  setShowMenu(false);
                }}>
                  <Image size={16} className="mr-2" /> Photo
                </li>

              <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center" onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'video/*';
                input.onchange = (e) => {
                  if (e.target.files[0]) {
                    handleMediaWithCaption(e.target.files[0], 'video');
                  }
                };
                input.click();
                setShowMenu(false);
              }}>
                <Camera size={16} className="mr-2" /> Video
              </li>
              <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center" onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.onchange = (e) => {
                  if (e.target.files[0]) {
                    handleFileUpload(e.target.files[0], 'document');
                  }
                };
                input.click();
                setShowMenu(false);
              }}>
                <FileText size={16} className="mr-2" /> Document
              </li>
          <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center" onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/webp';
            input.onchange = (e) => {
              if (e.target.files[0]) {
                handleFileUpload(e.target.files[0], 'sticker');
              }
            };
            input.click();
            setShowMenu(false);
          }}>
            <span className="text-xl mr-2">🎨</span> Sticker
          </li>

          {/* NEW: Request Location Option */}
          <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center" onClick={async () => {
            try {
              await api.post('/api/messages/send-location-request', {
                to: selectedContact.phone_number,
                bodyText: "Please share your location for delivery 📍"
              });
              toast.success('Location request sent');
              setShowMenu(false);
            } catch (error) {
              console.error('Failed to send location request:', error);
              toast.error('Failed to send location request');
            }
          }}>
            <MapPin size={16} className="mr-2" /> Request Location
          </li>

          {/* NEW: Share My Location Option */}
          <li className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center" onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                async (position) => {
                  try {
                    await api.post('/api/messages/send-location', {
                      to: selectedContact.phone_number,
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                      name: "My Location",
                      address: "Current Location"
                    });
                    toast.success('Location shared');
                    setShowMenu(false);
                  } catch (error) {
                    console.error('Failed to send location:', error);
                    toast.error('Failed to send location');
                  }
                },
                (error) => {
                  console.error('Geolocation error:', error);
                  toast.error('Unable to get your location');
                }
              );
            } else {
              toast.error('Geolocation not supported');
            }
          }}>
            <Navigation size={16} className="mr-2" /> Share My Location
          </li>
            </>
          )}

          <li
            className={`px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center ${
              (isChatLocked && !awaitingCustomerResponse) ? 'bg-blue-50 border-l-4 border-blue-500 font-medium text-blue-700' : ''
            }`}
            onClick={() => {
              setShowTemplates(true);
              setShowMenu(false);
            }}
          >
            <LayoutPanelTop size={16} className={`mr-2 ${(isChatLocked && !awaitingCustomerResponse) ? 'text-blue-600' : ''}`} />
            {(isChatLocked && !awaitingCustomerResponse) ? 'Send Template Message' : 'Template'}
            {(isChatLocked && !awaitingCustomerResponse) && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                Required
              </span>
            )}
          </li>

          {/* ✅ FIXED: Quick Response Menu Item */}
          <li
            className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
            onClick={(e) => {
              e.stopPropagation();
              setShowQuickResponses(true);
              setShowMenu(false);
            }}
          >
            <MessageSquare size={16} className="mr-2 text-gray-700" />
            Quick Responses
          </li>

          {(isChatLocked && !awaitingCustomerResponse) && (
            <li className="px-4 py-2 text-xs text-gray-500 italic border-t border-gray-200 mt-1">
              24-hour window expired - only templates allowed
            </li>
          )}
        </ul>
      </div>
    )}

    {/* Quick Response Modal */}
    {showQuickResponses && (
      <QuickResponseChat
        isOpen={showQuickResponses}
        onClose={() => setShowQuickResponses(false)}
        onSelectResponse={(text) => {
          // Replace "/" if it was the trigger, otherwise use the selected text
          if (newMessage.trim() === '/' || newMessage.trim().endsWith(' /')) {
            const cleanMessage = newMessage.trim().replace(/\/$/, '').trim();
            setNewMessage(cleanMessage ? cleanMessage + ' ' + text : text);
          } else {
            setNewMessage(text);
          }
          setShowQuickResponses(false);

          // Auto-focus and resize textarea
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              autoResizeTextarea(textareaRef.current);
            }
          }, 0);
        }}
      />
    )}
    </div>

    {isRecording ? (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: 1,
        padding: '8px 12px',
        backgroundColor: '#f0f9ff',
        borderRadius: '20px',
        border: '1px solid #0ea5e9'
      }}>
        {/* Waveform */}
        <div style={{
          flex: 1,
          height: '4px',
          backgroundColor: '#bae6fd',
          borderRadius: '2px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: '100%',
            background: 'linear-gradient(90deg, #0ea5e9 0%, #06b6d4 50%, #0ea5e9 100%)',
            backgroundSize: '200% 100%',
            animation: 'wave 1.5s ease-in-out infinite'
          }}></div>
        </div>

        {/* Timer */}
        <span style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#0369a1',
          minWidth: '45px'
        }}>
          {formatDuration(recordingTime)}
        </span>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();

            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.ondataavailable = null;
              mediaRecorderRef.current.onstop = null;

              if (mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }

              if (mediaRecorderRef.current.stream) {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
              }

              mediaRecorderRef.current = null;
            }

            if (recordingIntervalRef.current) {
              clearInterval(recordingIntervalRef.current);
              recordingIntervalRef.current = null;
            }

            setIsRecording(false);
            setRecordingTime(0);
            toast.info('Recording cancelled');
          }}
          style={{
            padding: '6px',
            background: '#fee2e2',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Cancel recording"
        >
          <X size={18} style={{ color: '#dc2626' }} />
        </button>

        {/* Send Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();

            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              if (mediaRecorderRef.current.shouldSend) {
                mediaRecorderRef.current.shouldSend(true);
              }
              mediaRecorderRef.current.stop();
            }
          }}
          style={{
            padding: '8px 16px',
            background: '#10b981',
            border: 'none',
            borderRadius: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '500'
          }}
          title="Send voice message"
        >
          <Send size={16} />
          Send
        </button>
      </div>
    ) : (isChatLocked && !awaitingCustomerResponse) ? (
      <div className={`locked-input-container flex items-center w-full p-3 bg-gray-50 border border-gray-300 rounded-lg gap-3 ${isMobileView ? 'justify-center p-2' : ''}`}>

                    {/* Hide Text and Icon on Mobile */}
                    {!isMobileView && (
                      <>
                        <AlertCircle size={16} className="text-orange-500 flex-shrink-0" />
                        <span className="text-gray-600 text-sm flex-1">
                          24-hour messaging window expired. Send a template to re-engage.
                        </span>
                      </>
                    )}

                    {/* Button - Full width on mobile */}
                    <button
                      onClick={() => setShowTemplates(true)}
                      className={`px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors ${isMobileView ? 'w-full py-3 font-semibold text-base' : 'flex-shrink-0'}`}
                    >
                      Send Template
                    </button>
                  </div>
                ) : awaitingCustomerResponse ? (
      <div className="locked-input-container flex items-center w-full p-3 bg-blue-50 border border-blue-300 rounded-lg gap-3">
        <AlertCircle size={16} className="text-blue-500 flex-shrink-0" />
        <span className="text-blue-700 text-sm flex-1">
          Waiting for customer response to template message...
        </span>
      </div>
    ) : (
     <div className="input-container flex min-w-0 flex-1 items-end gap-1.5 sm:gap-2">
      <textarea
        ref={textareaRef}
        placeholder="Type a message"
        value={newMessage}
        onPaste={handlePaste}
        onChange={(e) => {
          const value = e.target.value;
          setNewMessage(value);
          autoResizeTextarea(e.target);
          triggerTypingIndicator(value);

          // ✅ Trigger quick responses when "/" is typed
          if (value === '/' || value.endsWith(' /')) {
            setShowQuickResponses(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (e.shiftKey) {
              return;
            } else {
              e.preventDefault();
              handleSendMessage();
            }
          }
          // ✅ Close quick responses on Escape
          if (e.key === "Escape" && showQuickResponses) {
            setShowQuickResponses(false);
          }
        }}
        rows={1}
        className="min-w-0 flex-1"
        style={{
          resize: 'none',
          overflowY: 'auto',
          maxHeight: '120px',
          minHeight: '40px',
          padding: '10px 12px',
          lineHeight: '1.5',
          border: '1px solid #ccc',
          outline: 'none',
          borderRadius: '20px',
          backgroundColor: 'white',
          fontFamily: 'inherit',
          fontSize: '14px',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = '#25d366';
          e.target.style.boxShadow = '0 0 0 2px rgba(37, 211, 102, 0.1)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = '#ccc';
          e.target.style.boxShadow = 'none';
        }}
      />

    {!isChatLocked && !isRecording && (
      <div className="relative flex-shrink-0">
        <div
          className="autocorrect-button p-2 rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
          onClick={() => handleAutocorrect()}
          title="Autocorrect message"
        >
          {isAutocorrecting ? (
            <div className="spinner-border animate-spin h-5 w-5 border-2 border-t-transparent rounded-full border-blue-500"></div>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-600"
            >
              <path d="M20 6L9 17l-5-5"></path>
            </svg>
          )}
        </div>
      </div>
    )}

        {/* Send/Mic button */}
        <button
          type="button"
          className={`send-button ${isRecording ? 'recording' : ''}`}
          onClick={() => {
            if (isRecording) {
              if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop();
              }
            } else if (newMessage.trim()) {
              handleSendMessage();
            } else {
              // Start recording
              navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                  const mimeType = 'audio/webm;codecs=opus';

                  const recorder = new MediaRecorder(stream, {
                    mimeType: mimeType,
                    audioBitsPerSecond: 128000
                  });

                  mediaRecorderRef.current = recorder;
                  let recordedChunks = [];
                  let shouldSend = false;

                  recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                      recordedChunks.push(e.data);
                    }
                  };

                  recorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());

                    if (shouldSend && recordedChunks.length > 0) {
                      const audioBlob = new Blob(recordedChunks, { type: mimeType });
                      const audioFile = new File([audioBlob], 'voice-message.webm', {
                        type: mimeType
                      });

                      console.log('🎤 Sending voice message:', {
                        size: audioFile.size,
                        type: audioFile.type
                      });

                      handleFileUpload(  audioFile, 'audio', null);
                    }

                    recordedChunks = [];
                    shouldSend = false;
                    setIsRecording(false);
                    setRecordingTime(0);
                    if (recordingIntervalRef.current) {
                      clearInterval(recordingIntervalRef.current);
                    }
                  };

                  recorder.shouldSend = (value) => { shouldSend = value; };
                  recorder.start();

                  setIsRecording(true);
                  setRecordingTime(0);

                  const interval = setInterval(() => {
                    setRecordingTime(prev => prev + 1);
                  }, 1000);
                  recordingIntervalRef.current = interval;
                })
                .catch(error => {
                  console.error('Failed to start recording:', error);
                  toast.error('Failed to access microphone');
                });
            }
          }}
        >
          {isRecording ? (
            <div className="recording-stop"></div>
          ) : newMessage.trim() ? (
            <Send size={20} />
          ) : (
            <Mic size={20} />
          )}
        </button>
      </div>
    )}
  </div>
</MessageInput>

          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            {isMobileView ? 'Select a contact to start chatting' : 'Select a contact to start chatting'}
          </div>
        )}
</ChatArea>
 {/* Profile Panel */}
     {selectedContact && showProfilePanel && (
        <div
          className={`${
            isMobileView
              ? 'fixed inset-0 z-[1002] w-full bg-[#f0f2f5]'
              : 'w-[35%] min-w-[320px] bg-[#f0f2f5] border-l border-gray-200'
          } flex flex-col h-full overflow-hidden`}
        >

       {/* Header */}
          <div className="h-[60px] bg-[#f0f2f5] px-4 flex items-center gap-4 border-b border-gray-200 flex-shrink-0">
            <button onClick={() => setShowProfilePanel(false)} className="text-gray-600 hover:bg-gray-200 p-2 rounded-full transition-colors">
              <X size={20} />
            </button>
            <span className="text-gray-800 font-medium text-base">Contact info</span>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto pb-8">

            {/* Avatar & Name */}
            <div className="bg-white pb-4 pt-4 px-4 flex flex-col items-center shadow-sm mb-2">
              <div className="w-24 h-24 rounded-full bg-green-100 mb-2 flex items-center justify-center">
                <User size={48} className="text-green-600" />
              </div>
              <h2 className="text-lg font-normal text-gray-900 mb-0.5 text-center">
                {getDisplayName(selectedContact)}
              </h2>
              {selectedContact.alias && (
                <p className="text-gray-400 text-sm mb-1">~ {selectedContact.profile_name || selectedContact.name || 'Unknown'}</p>
              )}
              <p className="text-gray-500 text-base">{selectedContact?.phone_number}</p>
            </div>

            {/* Tabs */}
                <div className="bg-white border-b border-gray-200 flex mb-2">
                  <button
                    onClick={() => setActiveProfileTab('business')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeProfileTab === 'business' ? 'text-green-600 border-green-600' : 'text-gray-500 border-transparent'}`}
                  >Business</button>
                  <button
                    onClick={() => setActiveProfileTab('details')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeProfileTab === 'details' ? 'text-green-600 border-green-600' : 'text-gray-500 border-transparent'}`}
                  >Details</button>
                </div>

             {activeProfileTab === 'details' ? (
              <>
                {/* Nickname */}
                <div className="bg-white p-4 shadow-sm mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-sm text-gray-500 font-medium">Nickname</h3>
                    <div className="flex gap-1">
                      {!isEditingAlias && (
                        <>
                          <button onClick={() => { setTempAlias(selectedContact.alias || ''); setIsEditingAlias(true); }} className="text-green-600 hover:bg-green-50 p-1 rounded">
                            <Edit2 size={16} />
                          </button>
                          {selectedContact.alias && (
                            <button onClick={async () => {
                              if (!window.confirm('Remove this nickname?')) return;
                              try {
                                const res = await api.put(`/api/contacts/${selectedContact._id}`, { alias: '', name: selectedContact.name, phone_number: selectedContact.phone_number });
                                if (res.data) {
                                  const updated = { ...selectedContact, alias: '' };
                                  setSelectedContact(updated);
                                  setAllContacts(prev => prev.map(c => c._id === updated._id ? updated : c));
                                  toast.success('Nickname removed');
                                }
                              } catch { toast.error('Failed to remove nickname'); }
                            }} className="text-red-500 hover:bg-red-50 p-1 rounded">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {isEditingAlias ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tempAlias}
                        onChange={(e) => setTempAlias(e.target.value)}
                        placeholder="#nickname"
                        className="flex-1 p-1 border border-gray-300 rounded text-sm focus:border-green-500 outline-none"
                        autoFocus
                      />
                      <button onClick={async () => {
                        try {
                          const finalAlias = tempAlias.trim() && !tempAlias.trim().startsWith('#') ? `#${tempAlias.trim()}` : tempAlias.trim();
                          const res = await api.put(`/api/contacts/${selectedContact._id}`, { alias: finalAlias, name: selectedContact.name, phone_number: selectedContact.phone_number });
                          if (res.data) {
                            const updated = { ...selectedContact, alias: finalAlias };
                            setSelectedContact(updated);
                            setAllContacts(prev => prev.map(c => c._id === updated._id ? updated : c));
                            setIsEditingAlias(false);
                            toast.success('Nickname updated');
                          }
                        } catch { toast.error('Failed to update nickname'); }
                      }} className="p-1 bg-green-500 text-white rounded hover:bg-green-600"><Check size={16} /></button>
                      <button onClick={() => setIsEditingAlias(false)} className="p-1 bg-gray-200 text-gray-600 rounded"><X size={16} /></button>
                    </div>
                  ) : (
                    <p className="text-gray-900 text-base">{selectedContact.alias || <span className="text-gray-400 italic">No nickname set</span>}</p>
                  )}
                </div>

                {/* Notes */}
                <div className="bg-white p-4 shadow-sm mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-sm text-gray-500 font-medium">Notes</h3>
                    {!isEditingNotes && (
                      <button onClick={() => {
                        const cur = selectedContact.notes || '';
                        setTempNotes(cur);
                        setNoteMode(isChecklistFormat(cur) ? 'checklist' : 'text');
                        setIsEditingNotes(true);
                      }} className="text-green-600 hover:bg-green-50 p-1 rounded"><Edit2 size={16} /></button>
                    )}
                  </div>
                  {isEditingNotes ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 bg-gray-100 p-1 rounded-lg self-start">
                        <button onClick={() => setNoteMode('text')} className={`px-3 py-1 text-xs rounded-md ${noteMode === 'text' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Text</button>
                        <button onClick={() => setNoteMode('checklist')} className={`px-3 py-1 text-xs rounded-md ${noteMode === 'checklist' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Checklist</button>
                      </div>
                      {noteMode === 'text' ? (
                        <textarea value={tempNotes} onChange={(e) => setTempNotes(e.target.value)} placeholder="Add notes..." className="w-full p-2 border border-gray-300 rounded text-sm focus:border-green-500 outline-none resize-none" rows={4} autoFocus />
                      ) : (
                        <div className="border border-gray-300 rounded-lg p-2 max-h-60 overflow-y-auto bg-gray-50">
                          {(() => {
                            const items = parseChecklist(tempNotes);
                            if (items.length === 0) items.push({ checked: false, text: '' });
                            const updateList = (newItems) => setTempNotes(newItems.map(i => `- [${i.checked ? 'x' : ' '}] ${i.text}`).join('\n'));
                            return (
                              <div className="space-y-2">
                                {items.map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-gray-100">
                                    <input type="checkbox" checked={item.checked} onChange={(e) => { const n = [...items]; n[idx].checked = e.target.checked; updateList(n); }} className="rounded text-green-600 cursor-pointer" />
                                    <input type="text" value={item.text} onChange={(e) => { const n = [...items]; n[idx].text = e.target.value; updateList(n); }} className="flex-1 text-sm border-none focus:ring-0 p-0 bg-transparent outline-none" placeholder="List item..." autoFocus={idx === items.length - 1} />
                                    <button onClick={() => { const n = items.filter((_, i) => i !== idx); updateList(n); }} className="text-gray-400 hover:text-red-500"><Minus size={16} /></button>
                                  </div>
                                ))}
                                <button onClick={() => { const n = [...items, { checked: false, text: '' }]; updateList(n); }} className="flex items-center gap-1 text-xs text-green-600 font-medium mt-2 hover:text-green-700 px-2 py-1 hover:bg-green-50 rounded w-full"><Plus size={14} /> Add Item</button>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      <div className="flex justify-end gap-2 mt-1">
                        <button onClick={() => setIsEditingNotes(false)} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-sm">Cancel</button>
                        <button onClick={async () => {
                          try {
                            const res = await api.put(`/api/contacts/${selectedContact._id}`, { notes: tempNotes.trim(), name: selectedContact.name, phone_number: selectedContact.phone_number });
                            if (res.data) {
                              const updated = { ...selectedContact, notes: tempNotes.trim() };
                              setSelectedContact(updated);
                              setAllContacts(prev => prev.map(c => c._id === updated._id ? updated : c));
                              setIsEditingNotes(false);
                              toast.success('Notes updated');
                            }
                          } catch { toast.error('Failed to update notes'); }
                        }} className="px-3 py-1 bg-green-500 text-white rounded text-sm">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {isChecklistFormat(selectedContact.notes) ? (
                        <div className="space-y-2 mt-2">
                          {parseChecklist(selectedContact.notes).map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <div className={`mt-0.5 cursor-pointer ${item.checked ? 'text-green-600' : 'text-gray-400'}`} onClick={async () => {
                                const items = parseChecklist(selectedContact.notes);
                                items[idx].checked = !items[idx].checked;
                                const newNotes = items.map(i => `- [${i.checked ? 'x' : ' '}] ${i.text}`).join('\n');
                                try {
                                  const updated = { ...selectedContact, notes: newNotes };
                                  setSelectedContact(updated);
                                  await api.put(`/api/contacts/${selectedContact._id}`, { notes: newNotes, name: selectedContact.name, phone_number: selectedContact.phone_number });
                                  setAllContacts(prev => prev.map(c => c._id === updated._id ? updated : c));
                                } catch { toast.error("Failed to update note"); }
                              }}>
                                {item.checked ? <CheckSquare size={18} /> : <Square size={18} />}
                              </div>
                              <span className={`text-sm ${item.checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-900 text-base whitespace-pre-wrap mt-1">{selectedContact.notes || <span className="text-gray-400 italic">No notes added</span>}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="bg-white p-4 shadow-sm mb-2">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm text-gray-500 font-medium">Tags</h3>
                    <button onClick={() => setShowTagModal(true)} className="text-green-600 hover:bg-green-50 p-1.5 rounded-full"><EditIcon size={16} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedContactTags.length > 0 ? selectedContactTags.map(tagId => {
                      const tag = tags.find(t => t._id === tagId);
                      return tag ? (
                        <span key={tagId} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full border border-gray-200 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }}></span>
                          {tag.name}
                        </span>
                      ) : null;
                    }) : <span className="text-gray-400 italic text-sm">No tags assigned</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="bg-white shadow-sm mb-8">
                  <button className="w-full flex items-center gap-4 p-4 text-red-500 hover:bg-red-50 transition-colors text-left">
                    <BanIcon size={20} />
                    <span className="font-medium text-sm">Block {selectedContact?.profile_name || 'Contact'}</span>
                  </button>
                  <button className="w-full flex items-center gap-4 p-4 text-red-500 hover:bg-red-50 transition-colors text-left border-t border-gray-100">
                    <Trash2 size={20} />
                    <span className="font-medium text-sm">Delete chat</span>
                  </button>
                </div>
              </>
            ) : (

        /* Business Tab */
              <div className="bg-white p-4 shadow-sm mb-2">
                <div className="rounded-xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white p-3 mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Business Overview</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-green-100 bg-green-50 p-3 min-h-[86px] flex flex-col justify-between">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-green-700">Total Orders</p>
                      <p className="text-2xl leading-none font-bold text-green-800">{customerOrders.length}</p>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 min-h-[86px] flex flex-col justify-between">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-blue-700">Total Amount</p>
                      <p className="text-2xl leading-none font-bold text-blue-800">
                        ₹{completedOrderAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 min-h-[86px] flex flex-col justify-between">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-emerald-700">Template Sent</p>
                      <p className="text-2xl leading-none font-bold text-emerald-800">{contactTemplateStats.sent}</p>
                    </div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 min-h-[86px] flex flex-col justify-between">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-rose-700">Template Failed</p>
                      <p className="text-2xl leading-none font-bold text-rose-800">{contactTemplateStats.failed}</p>
                    </div>
                  </div>
                </div>

                {/* Order Filters */}
                <div className="mb-3 space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium">Date:</span>
                    <div className="flex items-center gap-2">
                      <input type="date" value={orderDateFilter} onChange={(e) => setOrderDateFilter(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:border-green-500 focus:outline-none text-gray-600" />
                      {orderDateFilter && <button onClick={() => setOrderDateFilter('')} className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                    <span className="text-xs text-gray-500 font-medium">Payment:</span>
                    <div className="flex items-center gap-2">
                      <select value={orderPaymentStatusFilter} onChange={(e) => setOrderPaymentStatusFilter(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:border-green-500 focus:outline-none text-gray-600 w-[140px]">
                        <option value="">All Statuses</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                      </select>
                      {orderPaymentStatusFilter && <button onClick={() => setOrderPaymentStatusFilter('')} className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>}
                    </div>
                  </div>
                </div>

                {/* Orders List */}
                <div className="space-y-3">
                  {ordersLoading ? (
                    <div className="text-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto mb-2"></div>
                      <p className="text-xs text-gray-400">Loading orders...</p>
                    </div>
                  ) : (() => {
                    const filtered = customerOrders.filter(order => {
                      const matchesDate = !orderDateFilter || dayjs(order.createdAt).format('YYYY-MM-DD') === orderDateFilter;
                      const matchesStatus = !orderPaymentStatusFilter || (order.paymentStatus || '').toLowerCase() === orderPaymentStatusFilter.toLowerCase();
                      return matchesDate && matchesStatus;
                    });
                    if (filtered.length === 0) return (
                      <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <ShoppingBag size={24} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-500 font-medium">No orders found</p>
                      </div>
                    );
                    const display = isViewAllOrders ? filtered : filtered.slice(0, 5);
                    return display.map(order => (
                      <div key={order.id || order.orderId || Math.random()} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold text-gray-800 text-sm">#{order.orderId || order.orderNumber || 'N/A'}</span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            (order.status === 'completed' || order.status === 'delivered') ? 'bg-green-100 text-green-700' :
                            (order.status === 'cancelled' || order.status === 'returned') ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{order.status || 'Pending'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500 mt-2">
                          <span>{dayjs(order.createdAt).format('MMM D, YYYY')}</span>
                          <span className="font-bold text-gray-700">₹{(order.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                {customerOrders.filter(order => {
                  const matchesDate = !orderDateFilter || dayjs(order.createdAt).format('YYYY-MM-DD') === orderDateFilter;
                  const matchesStatus = !orderPaymentStatusFilter || (order.paymentStatus || '').toLowerCase() === orderPaymentStatusFilter.toLowerCase();
                  return matchesDate && matchesStatus;
                }).length > 5 && (
                  <button onClick={() => setIsViewAllOrders(!isViewAllOrders)} className="w-full mt-3 py-2 text-xs text-green-600 font-medium hover:bg-green-50 rounded">
                    {isViewAllOrders ? 'Show Less' : `View All`}
                  </button>
                )}
              </div>

            )}
          </div>
        </div>
      )}
    </div>
  )}

      {/* FIXED: Templates Modal - Always accessible */}
      {showTemplates && selectedContact && (
        // ✅ CHANGE 1: Changed 'z-50' to 'z-[1001]' to ensure it sits above the mobile chat area (which is z-100)
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[1001]">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 transform transition-all shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">
                {(isChatLocked && !awaitingCustomerResponse) ? 'Send Template to Re-engage' : 'Select Template'}
              </h2>
              <button
                className="text-gray-500 hover:text-gray-700 text-xl px-2"
                onClick={() => {
                  setShowTemplates(false);
                  setSelectedTemplate(null);
                  setTemplateFilter('');
                }}
              >×</button>
            </div>

            {(isChatLocked && !awaitingCustomerResponse) && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-700">
                  <AlertCircle size={16} className="inline mr-2" />
                  24-hour window expired. Send a template to restart conversation.
                </p>
              </div>
            )}

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search templates..."
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div className="max-h-[50vh] overflow-y-auto border border-gray-200 rounded-lg">
              {loading ? (
                <div className="p-4 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Loading templates...
                </div>
              ) : Array.isArray(filteredTemplates) && filteredTemplates.length > 0 ? (
                filteredTemplates.map((template, index) => (
                  <div
                    key={`${template.id || template.name}-${index}`}
                    className={`p-4 border-b cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'bg-green-100 border-green-500'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Status: <span className={`font-medium ${template.status === 'APPROVED' ? 'text-green-600' : 'text-orange-600'}`}>
                        {template.status}
                      </span> | Language: {template.language}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <div className="mb-4">📋</div>
                  <div className="font-medium mb-2">
                    {templateFilter ? 'No matching templates' : 'No templates available'}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                onClick={() => {
                  setShowTemplates(false);
                  setSelectedTemplate(null);
                  setTemplateFilter('');
                }}
              >
                Cancel
              </button>
              <button
                className={`px-4 py-2 text-white rounded-lg transition-colors ${
                  selectedTemplate
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-green-300 cursor-not-allowed'
                }`}
                disabled={!selectedTemplate}
                onClick={() => {
                  if (selectedTemplate) {
                    sendTemplate(selectedTemplate);
                  }
                }}
              >
                {selectedTemplate ? 'Send Template' : 'Select'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Popup */}
      {isPopupOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
          onClick={() => setIsPopupOpen(false)}
        >
          <div
            className="bg-white p-5 rounded-lg shadow-lg w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-3">Add New Contact</h2>

            <input
              type="text"
              placeholder="Enter contact name"
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded mb-3"
            />

            <div className="mb-3">
              <input
                type="text"
                placeholder="+91"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                onClick={() => setIsPopupOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={async () => {
                  if (!phoneNumber.trim()) {
                    toast.error("Please enter a phone number.");
                    return;
                  }

                  const cleanedNumber = phoneNumber.trim().replace(/\D/g, '');
                        if (cleanedNumber.length < 7 || cleanedNumber.length > 15) {
                          toast.error("Please include country code (e.g. +971501234567 for UAE, +6591234567 for Singapore)");
                          return;
                        }

                  const contactName = newContactName.trim() || "New Contact";
                  let formattedNumber = phoneNumber.trim().replace(/[\s\-\(\)\+]/g, '').replace(/\D/g, '');

                  try {
                    const response = await api.post("/api/contacts", {
                      phone_number: formattedNumber,
                      name: contactName
                    });

                    if (response.data) {
                      const newContact = {
                        ...response.data,
                        timestamp: new Date()
                      };

                     setContacts(prev => {
                        const updatedContacts = [newContact, ...prev];
                        return updatedContacts.sort((a, b) =>
                          new Date(b.timestamp) - new Date(a.timestamp)
                        );
                      });

                      setPhoneNumber("");
                      setNewContactName("");
                      setIsPopupOpen(false);

                      toast.success("Contact added successfully");
                    }
                  } catch (error) {
                    console.error("Error saving contact:", error);
                    toast.error(error.response?.data?.error || "Failed to save contact");
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Caption Modal for Images and Videos */}
       {showCaptionModal && pendingMedia && (
        // ✅ FIX: Added wrapper with high z-index to show above mobile chat area
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MediaComponents.MediaCaptionModal
            isOpen={showCaptionModal}
            onClose={() => {
              setShowCaptionModal(false);
              setPendingMedia(null);
              setMediaCaption('');
            }}
            pendingFile={pendingMedia}
            caption={mediaCaption}
            setCaption={setMediaCaption}
            onSend={handleSendMediaWithCaption}
          />
        </div>
      )}


      {/* Tags Assignment Modal */}
{showTagModal && selectedContact && (
  <div
    className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
    style={{ zIndex: 9999 }} // ✅ FIX: Force very high Z-Index for mobile overlay
  >
    <div
      className="bg-white rounded-lg p-6 w-full mx-4"
      style={{ maxWidth: '400px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} // ✅ FIX: Responsive dimensions
    >
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Tag size={20} />
          Assign user tags
        </h3>
        <button
          onClick={() => setShowTagModal(false)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <div className="mb-4 overflow-y-auto border border-gray-200 rounded-lg p-2 flex-1">
        <label className="block text-sm font-medium text-gray-700 mb-2 px-2">
          Select tags
        </label>
        {tags.map(tag => (
          <label
            key={tag._id}
            className="flex items-center p-3 rounded-md hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
          >
            <input
              type="checkbox"
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              checked={selectedContactTags.includes(tag._id)}
              onChange={() => {
                setSelectedContactTags(prevTags =>
                  prevTags.includes(tag._id)
                    ? prevTags.filter(id => id !== tag._id)
                    : [...prevTags, tag._id]
                );
              }}
            />
            <span className="ml-3 text-sm text-gray-800 font-medium">{tag.name}</span>
            <span
              className="ml-auto w-4 h-4 rounded-full border border-gray-200 shadow-sm"
              style={{ backgroundColor: tag.color }}
            ></span>
          </label>
        ))}
      </div>

      <div className="flex justify-end gap-3 flex-shrink-0 pt-2">
        <button
          onClick={() => {
            setShowTagModal(false);
            setSelectedContactTags(selectedContact.tags || []);
          }}
          className="px-4 py-3 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors w-full sm:w-auto"
        >
          Cancel
        </button>
        <button
          onClick={() => handleAssignTags(selectedContactTags)}
          className="px-4 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
)}

      <FilePreviewModal
        isOpen={showPreviewModal}
        files={previewFiles}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewFiles([]);
        }}
        onRemove={(indexToRemove) => {
          setPreviewFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
          if (previewFiles.length <= 1) setShowPreviewModal(false);
        }}
        onSend={handleConfirmSendFiles}
      />


{contextMenu && (
  <>
    <div
      className="fixed inset-0 z-[99998]"
      onClick={() => setContextMenu(null)}
    />
    <div
      className="fixed z-[99999] bg-white shadow-lg rounded-lg py-1 min-w-[150px] border border-gray-200"
      style={{ top: contextMenu.y, left: contextMenu.x }}
    >
      <button
        className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-2"
        onClick={() => {
          setReplyingTo(contextMenu.message);
          setContextMenu(null);
          if (textareaRef.current) textareaRef.current.focus();
        }}
      >
        <Reply size={16} /> Reply
      </button>
      <button
        className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-2"
        onClick={() => {
          const textToCopy = contextMenu.message.text || contextMenu.message.caption || '';
          if (textToCopy) {
            navigator.clipboard.writeText(textToCopy);
            toast.success('Message copied');
          } else {
            toast.error('No text to copy');
          }
          setContextMenu(null);
        }}
      >
        <Copy size={16} /> Copy
      </button>
    </div>
  </>
)}

<input type="file" ref={fileInputRef} className="hidden" onChange={handleDocumentSelect} />

{/*
<ScrollingFooter>
  <div className="scroll-wrapper">
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} className="scroll-item">

        <span className="hearts">
          <span>❤️</span>
          <span>•</span>
          <span>🤝</span>
        </span>

        <span>Happy Valentine’s Day</span>

        <span className="separator">•</span>

        <span>
          Business is built on relationships, and relationships are built through conversations.
        </span>

        <span className="hearts">
          <span>💬</span>
          <span>•</span>
          <span>❤️</span>
        </span>

      </span>
    ))}
  </div>
</ScrollingFooter>
*/}



<GlobalIncomingCallPopup
  activeCall={activeCall}
  isMobileView={isMobileView}
  onAnswer={answerGlobalCall}
  onDecline={declineGlobalCall}
/>

</Container>
  );
};

export default ChatApp;
