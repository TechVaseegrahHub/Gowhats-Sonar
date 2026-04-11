import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send, Upload, Users, ShoppingBag, Plus, X, Ticket, Calendar,
  Image as ImageIcon, Video, File, Download, CheckSquare, Search,
  Filter, Clock, BarChart2, CheckCircle, AlertCircle, Check, Layers,
  ChevronDown, LayoutTemplate, FileSpreadsheet, ChevronRight, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import useSubscription from '../hooks/useSubscription';
import ProFeatureLockCard from '../components/ProFeatureLockCard';

// --- CUSTOM TEMPLATE SELECTOR COMPONENT (Unmodified) ---
const TemplateSelector = ({ templates, value, onChange, error }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedTemplate = templates.find(t => t.name === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border-2 p-3 sm:p-4 rounded-lg flex justify-between items-center cursor-pointer transition-all duration-200 ${
          error
            ? 'border-red-500 bg-red-50/20'
            : isOpen
              ? 'border-green-500 bg-green-50/50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className={`${error ? 'bg-red-500' : 'bg-green-500'} p-2 sm:p-2.5 rounded-lg text-white flex-shrink-0`}>
            <LayoutTemplate size={18} className="sm:w-5 sm:h-5" />
          </div>
          {selectedTemplate ? (
            <div className="flex flex-col text-left flex-1 min-w-0">
              <span className="font-semibold text-gray-900 text-sm sm:text-base truncate">{selectedTemplate.name}</span>
              <span className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wide">
                {selectedTemplate.language} • {selectedTemplate.category || 'MARKETING'}
              </span>
            </div>
          ) : (
            <span className={`${error ? 'text-red-500' : 'text-gray-400'} text-sm sm:text-base font-medium`}>Select a Template</span>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ml-2 sm:w-5 sm:h-5 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {error && (
        <p className="text-red-500 text-xs font-bold mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3"/> {error}
        </p>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white border-2 border-green-200 rounded-lg shadow-xl max-h-72 sm:max-h-96 flex flex-col">
          <div className="p-3 sm:p-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-lg">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 sm:top-3 text-gray-400 w-4 h-4" />
              <input
                autoFocus
                type="text"
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {filteredTemplates.length > 0 ? (
              <div className="space-y-1">
                {filteredTemplates.map((t) => (
                  <div
                    key={t.name}
                    onClick={() => {
                      onChange(t.name);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`p-3 sm:p-3.5 rounded-lg cursor-pointer flex justify-between items-center transition-all duration-150 ${
                      value === t.name
                        ? 'bg-green-50 border-2 border-green-500 shadow-sm'
                        : 'hover:bg-gray-50 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex flex-col flex-1 min-w-0 mr-2 sm:mr-3">
                      <span className={`text-xs sm:text-sm font-semibold truncate ${
                        value === t.name ? 'text-green-700' : 'text-gray-800'
                      }`}>
                        {t.name}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">
                        {t.category || 'MARKETING'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      <span className="text-[9px] sm:text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-md uppercase border border-gray-200">
                        {t.language}
                      </span>
                      {value === t.name && (
                        <div className="bg-green-500 rounded-full p-0.5 sm:p-1">
                          <Check size={10} className="text-white sm:w-3 sm:h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 sm:p-12 text-center">
                <p className="text-gray-400 text-sm font-medium">No templates found</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- REPORT MODAL COMPONENT (Unmodified) ---
const BroadcastReportModal = ({ broadcastId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`https://bot.gowhats.in/api/broadcasts/${broadcastId}/report`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 404) {
            setError("Report not found");
            setLoading(false);
            return;
        }

        const json = await res.json();
        if (json.success) setData(json);
        else setError("Failed to load report");
      } catch (err) {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [broadcastId]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'read': return <span className="inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-green-50 text-green-700 border border-green-200"><Check size={10} className="mr-1 sm:w-3 sm:h-3" /> Read</span>;
      case 'delivered': return <span className="inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-green-50 text-green-600 border border-green-200"><Check size={10} className="mr-1 sm:w-3 sm:h-3" /> Delivered</span>;
      case 'sent': return <span className="inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200"><Check size={10} className="mr-1 sm:w-3 sm:h-3" /> Sent</span>;
      case 'failed': return <span className="inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-red-50 text-red-700 border border-red-200"><AlertCircle size={10} className="mr-1 sm:w-3 sm:h-3" /> Failed</span>;
      default: return <span className="text-[10px] sm:text-xs text-gray-400 font-medium">Pending</span>;
    }
  };

  const filteredMessages = data?.messages?.filter(msg => {
    const matchesSearch = msg.to.includes(search);
    const matchesFilter = filter === 'all' ? true : msg.status === filter;
    return matchesSearch && matchesFilter;
  }) || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-5xl h-[95vh] sm:h-[85vh] flex flex-col overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b-2 border-gray-100 flex justify-between items-center bg-gradient-to-r from-green-50 to-white">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Campaign Report</h2>
            {!error && <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 font-medium truncate">{data?.broadcast?.name} • {filteredMessages.length} Messages</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all text-gray-500 hover:text-gray-700 ml-2">
            <X size={20}/>
          </button>
        </div>

        {error ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 flex-col p-4">
                <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 mb-3 text-red-400"/>
                <p className="font-semibold text-base sm:text-lg">{error}</p>
            </div>
        ) : (
            <>
                <div className="p-3 sm:p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 sm:gap-4 bg-white">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 sm:top-3 text-gray-400 w-4 h-4"/>
                        <input
                          className="w-full pl-10 pr-4 py-2 sm:py-2.5 border-2 border-gray-200 rounded-lg text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"
                          placeholder="Search phone number..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                      className="w-full sm:w-auto px-4 py-2 sm:py-2.5 border-2 border-gray-200 rounded-lg text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 font-medium transition-all bg-white"
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="read">Read</option>
                        <option value="delivered">Delivered</option>
                        <option value="sent">Sent</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
                <div className="flex-1 overflow-auto bg-gray-50">
                {loading ? (
                    <div className="flex items-center justify-center h-full"><div className="text-center"><div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-green-200 border-t-green-500 mx-auto mb-4"></div><p className="text-gray-500 font-medium text-sm sm:text-base">Loading report...</p></div></div>
                ) : (
                    <>
                      {/* Mobile Card View */}
                      <div className="sm:hidden p-3 space-y-3">
                        {filteredMessages.map((msg) => (
                          <div key={msg._id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-mono text-sm text-gray-800 font-medium">{msg.to}</span>
                              {getStatusBadge(msg.status)}
                            </div>
                            <div className="text-xs text-gray-500 font-medium">
                              {dayjs(msg.timestamp).format('MMM D, YYYY • h:mm A')}
                            </div>
                          </div>
                        ))}
                        {filteredMessages.length === 0 && (
                          <div className="text-center py-8 text-gray-500">No messages found</div>
                        )}
                      </div>

                      {/* Desktop Table View */}
                      <table className="hidden sm:table w-full text-left text-sm">
                          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 font-semibold border-b-2 border-gray-200 sticky top-0">
                              <tr><th className="px-6 py-4 text-sm uppercase tracking-wide">Recipient</th><th className="px-6 py-4 text-sm uppercase tracking-wide">Status</th><th className="px-6 py-4 text-sm uppercase tracking-wide">Timestamp</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                              {filteredMessages.map((msg) => (
                                  <tr key={msg._id} className="hover:bg-green-50/30 transition-colors">
                                    <td className="px-6 py-4 font-mono text-gray-800 font-medium">{msg.to}</td>
                                    <td className="px-6 py-4">{getStatusBadge(msg.status)}</td>
                                    <td className="px-6 py-4 text-gray-600 font-medium">{dayjs(msg.timestamp).format('MMM D, YYYY • h:mm A')}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                    </>
                )}
                </div>
            </>
        )}
      </div>
    </div>
  );
};

// --- MOBILE BROADCAST CARD COMPONENT (Unmodified) ---
const MobileBroadcastCard = ({ broadcast, index, onViewReport, onDelete }) => {
 return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase ${
              broadcast.status === 'completed'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              {broadcast.status}
            </span>
          </div>
          <h4 className="font-bold text-base text-gray-900 truncate">{broadcast.name}</h4>
          <p className="text-xs text-gray-500 mt-0.5 font-medium truncate">
            {broadcast.templateName}
          </p>
        </div>

         <div className="flex gap-2">
          <button
            onClick={() => onViewReport(broadcast._id)}
            className="p-2 border-2 border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-all text-gray-600 hover:text-green-600 flex-shrink-0"
          >
            <BarChart2 size={16}/>
          </button>
          <button
            onClick={() => onDelete(broadcast._id, broadcast.name)}
            className="p-2 border-2 border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all text-gray-600 hover:text-red-600 flex-shrink-0"
          >
            <Trash2 size={16}/>
          </button>
        </div>
        </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold bg-green-50 text-green-700 px-2.5 py-1 rounded-lg border border-green-200 capitalize">
          {broadcast.audienceType}
        </span>
        <span className="text-xs text-gray-500 font-medium">
          {new Date(broadcast.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3">
        <div className="text-center">
          <div className="font-bold text-gray-900 text-lg">{broadcast.sentCount}</div>
          <div className="text-[10px] text-gray-500 font-medium uppercase">Sent</div>
        </div>
        <div className="text-center border-x border-gray-200">
          <div className="font-bold text-green-600 text-lg">{broadcast.deliveredCount}</div>
          <div className="text-[10px] text-gray-500 font-medium uppercase">Delivered</div>
        </div>
        <div className="text-center">
          <div className="font-bold text-green-700 text-lg">{broadcast.readCount}</div>
          <div className="text-[10px] text-gray-500 font-medium uppercase">Read</div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
export default function BroadcastMessage() {
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const hasProAccess = subscription?.hasProAccess ?? subscription?.isPro ?? false;
  const trialExpired = subscription?.trial?.isExpired;
  const proExpired = subscription?.pro?.isExpired;
  const [broadcasts, setBroadcasts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [availableContacts, setAvailableContacts] = useState([]);
  const [isSending, setIsSending] = useState(false);

  const [errors, setErrors] = useState({});

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedBroadcastId, setSelectedBroadcastId] = useState(null);

  const [step, setStep] = useState(1);
  const [broadcastForm, setBroadcastForm] = useState({
    name: '',
    audience: 'all',
    templateName: '',
    mediaFile: null,
    scheduled: false,
    scheduledDateTime: '',
    orderStatusFilter: 'all'
  });
  const [carouselFiles, setCarouselFiles] = useState({});

  const [selectedContactPhones, setSelectedContactPhones] = useState([]);
  const [autoSelectedRecipients, setAutoSelectedRecipients] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [orderFilters, setOrderFilters] = useState({ minAmount: '', maxAmount: '' });
  const [bookingFilters, setBookingFilters] = useState({ status: 'all' });
  const [estimatedReach, setEstimatedReach] = useState(0);
  const [importFile, setImportFile] = useState(null);
  const [importStats, setImportStats] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, name: '' });
  const selectedTemplateDetails = templates.find(t => t.name === broadcastForm.templateName);
  const carouselComponent = selectedTemplateDetails?.components?.find(c => c.type === 'CAROUSEL');
  const isCarousel = !!carouselComponent;
  const requiresMedia = !isCarousel && selectedTemplateDetails?.components?.some(c => c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format));
  const mediaTypeRequired = selectedTemplateDetails?.components?.find(c => c.type === 'HEADER')?.format;

  useEffect(() => {
    if (subscriptionLoading || !hasProAccess) {
      return;
    }
    fetchBroadcasts();
    fetchTemplates();
    fetchContacts();
  }, [subscriptionLoading, hasProAccess]);

  const fetchBroadcasts = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('https://bot.gowhats.in/api/broadcasts', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if(data.success) setBroadcasts(data.broadcasts);
    } catch(e) { console.error(e); }
  };

  const fetchTemplates = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('https://bot.gowhats.in/api/templates', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if(data.success) setTemplates((data.templates || []).filter(t => t.status === 'APPROVED'));
    } catch(e) { console.error(e); }
  };

  const fetchContacts = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('https://bot.gowhats.in/api/contacts?limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        // API returns { contacts: [...], pagination: {...} }
        if (Array.isArray(data?.contacts)) {
            setAvailableContacts(data.contacts);
        } else if (Array.isArray(data)) {
            setAvailableContacts(data);
        } else {
            console.error('Unexpected contacts format:', data);
            setAvailableContacts([]);
        }
    } catch(e) {
        console.error('Failed to fetch contacts:', e);
    }
};
  const handleViewReport = (id) => {
      setSelectedBroadcastId(id);
      setShowReportModal(true);
  };
const handleDeleteBroadcast = (id, name) => {
      setDeleteConfirm({ show: true, id, name });
  };

  const confirmDelete = async () => {
      try {
          const token = localStorage.getItem('token');
          const res = await fetch(`https://bot.gowhats.in/api/broadcasts/${deleteConfirm.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success) {
              toast.success('Campaign deleted');
              fetchBroadcasts();
          } else {
              toast.error('Failed to delete campaign');
          }
      } catch (e) {
          toast.error('Network error');
      } finally {
          setDeleteConfirm({ show: false, id: null, name: '' });
      }
  };

  const clearError = (field) => {
    if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateStep1 = () => {
      const newErrors = {};
      let isValid = true;

      if (!broadcastForm.name.trim()) {
          newErrors.name = "Please enter a campaign name";
          isValid = false;
      }

      if (!broadcastForm.audience) {
          newErrors.audience = "Please select a target audience";
          isValid = false;
      }

      if (broadcastForm.audience === 'custom' && selectedContactPhones.length === 0) {
          newErrors.customContacts = "Please select at least one contact";
          isValid = false;
      }

      if (broadcastForm.audience === 'import' && (!importFile && selectedContactPhones.length === 0)) {
           newErrors.importFile = "Please upload and validate a CSV file";
           isValid = false;
      }

      setErrors(newErrors);
      return isValid;
  };

  const getAudiencePreview = async () => {
      // 1. Basic validation from Step 1
      const newErrors = {};
      let isValid = true;

      if (!broadcastForm.name.trim()) {
          newErrors.name = "Please enter a campaign name";
          isValid = false;
      }

      if (!broadcastForm.audience) {
          newErrors.audience = "Please select a target audience";
          isValid = false;
      }

      if (broadcastForm.audience === 'custom' && selectedContactPhones.length === 0) {
          newErrors.customContacts = "Please select at least one contact";
          isValid = false;
      }

      if (broadcastForm.audience === 'import' && (!importFile && selectedContactPhones.length === 0)) {
           newErrors.importFile = "Please upload and validate a CSV file";
           isValid = false;
      }

      setErrors(newErrors);
      if (!isValid) return;


      // 2. Local Audience Handling ('custom' and 'import')
      let finalRecipients = [];
      if(broadcastForm.audience === 'custom' || broadcastForm.audience === 'import') {
          finalRecipients = selectedContactPhones;

          if (finalRecipients.length === 0) {
              toast.error("0 contacts selected. Please select contacts or import a file.");
              return;
          }

          setAutoSelectedRecipients(finalRecipients);
          setEstimatedReach(finalRecipients.length);
          setStep(2);
          return;
      }


      // 3. API Audience Handling ('all', 'orders', 'bookings')
      const token = localStorage.getItem('token');

      // Payload for API call (for 'all', 'orders', or 'bookings')
      const payload = {
          audienceType: broadcastForm.audience,
          filters: {
              orderFilters,
              bookingFilters,
              orderStatus: broadcastForm.orderStatusFilter
          }
      };

      setIsSending(true); // Show loading state on the Next Step button

      try {
          console.log(`Audience Preview API call for: ${broadcastForm.audience}`);

          const res = await fetch('https://bot.gowhats.in/api/broadcasts/audience/preview', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          const data = await res.json();

          if(data.success) {
              finalRecipients = data.phoneNumbers || [];

              setAutoSelectedRecipients(finalRecipients);
              setEstimatedReach(finalRecipients.length);

              if (finalRecipients.length > 0) {
                  toast.success(`Found ${finalRecipients.length} contacts`);
                  setStep(2);
              } else {
                  toast.error("0 contacts found. Please check your filters.");
              }
          } else {
              toast.error(data.error || "Could not fetch audience preview");
          }
      } catch(e) {
          console.error("Error calculating reach:", e);
          toast.error("Error calculating reach");
      } finally {
          setIsSending(false);
      }
  };

  const handleSubmitBroadcast = async () => {
      const newErrors = {};
      let isValid = true;

      if (!broadcastForm.templateName) {
          newErrors.templateName = "Please select a template";
          isValid = false;
      }

      if (requiresMedia && !broadcastForm.mediaFile) {
          newErrors.mediaFile = "Please upload header media";
          isValid = false;
      }

      if (isCarousel) {
          carouselComponent.cards.forEach((_, index) => {
              if (!carouselFiles[index]) {
                  newErrors[`carousel_${index}`] = "Image required";
                  isValid = false;
              }
          });
      }

      if (broadcastForm.scheduled && !broadcastForm.scheduledDateTime) {
          newErrors.scheduledDateTime = "Please select schedule date and time";
          isValid = false;
      }

      let finalRecipients = [];
      if(broadcastForm.audience === 'custom' || broadcastForm.audience === 'import') finalRecipients = selectedContactPhones;
      else if(broadcastForm.audience === 'all') finalRecipients = availableContacts.map(c => c.phone_number);
      else finalRecipients = autoSelectedRecipients;

      if(finalRecipients.length === 0) {
          toast.error("No recipients selected in previous step");
          return;
      }

      if (!isValid) {
          setErrors(newErrors);
          return;
      }

      setIsSending(true);

      try {
          const token = localStorage.getItem('token');
          const payload = new FormData();
          payload.append('name', broadcastForm.name);
          payload.append('templateName', broadcastForm.templateName);
          payload.append('templateLanguage', selectedTemplateDetails?.language || 'en_US');
          payload.append('audienceType', broadcastForm.audience);
          payload.append('recipients', JSON.stringify(finalRecipients));
          payload.append('isScheduled', broadcastForm.scheduled);
          payload.append('isCarousel', isCarousel);

          if(broadcastForm.scheduled && broadcastForm.scheduledDateTime) {
              payload.append('scheduledDate', new Date(broadcastForm.scheduledDateTime).toISOString());
          }

          if(isCarousel && carouselComponent) {
              carouselComponent.cards.forEach((card, i) => {
                  if(carouselFiles[i]) payload.append(`carousel_${i}`, carouselFiles[i]);
              });
          } else if(requiresMedia && broadcastForm.mediaFile) {
              payload.append('mediaFile', broadcastForm.mediaFile);
          }

          const res = await fetch('https://bot.gowhats.in/api/broadcasts', {
              method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: payload
          });
          const data = await res.json();

          if(data.success) {
              toast.success("Campaign Created Successfully!");
              setShowCreateModal(false);
              fetchBroadcasts();
              setStep(1);
              setBroadcastForm({ name: '', audience: 'all', templateName: '', mediaFile: null, scheduled: false, scheduledDateTime: '', orderStatusFilter: 'all' });
              setCarouselFiles({});
              setSelectedContactPhones([]);
              setImportStats(null);
              setErrors({});
          } else {
              toast.error(data.error || "Failed to create campaign");
          }
      } catch(e) {
          console.error(e);
          toast.error("Network error");
      } finally {
          setIsSending(false);
      }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    clearError('importFile');

    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('https://bot.gowhats.in/api/broadcasts/import/validate', {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
        });
        const data = await res.json();
        if(data.success) { setImportStats(data); setImportFile(file); toast.success("File validated"); }
    } catch(err) { toast.error("Upload failed"); }
  };

  const finalizeImport = async () => {
      if(!importFile) return;
      const formData = new FormData();
      formData.append('file', importFile);
      const token = localStorage.getItem('token');
      try {
          const res = await fetch('https://bot.gowhats.in/api/broadcasts/import/contacts', {
              method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
          });
          const data = await res.json();
          if(data.success) { setSelectedContactPhones(data.phoneNumbers); setEstimatedReach(data.phoneNumbers.length); setBroadcastForm({ ...broadcastForm, audience: 'import' }); toast.success(`Imported ${data.phoneNumbers.length} contacts`); }
      } catch(err) { toast.error("Import error"); }
  }

  const downloadSampleCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,Phone Number\nJohn Doe,919876543210\nJane Smith,+919876543211";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "sample_contacts.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleContactSelection = (phone) => {
    clearError('customContacts');

    if (selectedContactPhones.includes(phone)) setSelectedContactPhones(prev => prev.filter(p => p !== phone));
    else setSelectedContactPhones(prev => [...prev, phone]);
  };

  const selectAllContacts = () => {
    clearError('customContacts');
    if (selectedContactPhones.length === availableContacts.length) setSelectedContactPhones([]);
    else setSelectedContactPhones(availableContacts.map(c => c.phone_number));
  };

  const filteredContacts = availableContacts.filter(c =>
    (c.name?.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone_number.includes(contactSearch))
  );

if (subscriptionLoading) {
    return (
      <div className="p-8 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-green-200 border-t-green-600"></div>
      </div>
    );
  }

  if (!hasProAccess) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-green-50/20 min-h-[calc(100vh-5rem)] flex items-center justify-center">
        <ProFeatureLockCard
          featureName="Broadcast Manager"
          description={proExpired
            ? "Your Pro subscription has expired. Please pay to continue using Broadcast Manager."
            : trialExpired
              ? "Your free trial has ended. Upgrade to Pro plan to create and manage campaigns."
              : "Broadcast Manager is locked for Free Trial accounts. Upgrade to Pro plan to create and manage campaigns."
          }
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-green-50/20 min-h-screen font-sans">
      {/* Header */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border-2 border-gray-100 shadow-sm mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Broadcast Manager</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 font-medium">Manage and track your WhatsApp campaigns</p>
        </div>
        <button
          onClick={() => {
              setShowCreateModal(true);
              setErrors({});
          }}
          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition-all hover:shadow-xl"
        >
          <Plus className="w-5 h-5"/> New Campaign
        </button>
      </div>

      {/* Broadcast List - Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border-2 border-gray-100 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-gradient-to-r from-gray-50 to-green-50/30 border-b-2 border-gray-100 font-semibold text-sm text-gray-700 uppercase tracking-wide">
          <div className="col-span-1">#</div>
          <div className="col-span-3">Campaign</div>
          <div className="col-span-2">Audience</div>
          <div className="col-span-3 text-center">Performance</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-1 text-right">Report</div>
        </div>

        {broadcasts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-300 mb-3">
              <BarChart2 size={48} className="mx-auto" />
            </div>
            <p className="text-gray-500 font-semibold">No campaigns yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first broadcast campaign</p>
          </div>
        ) : (
          broadcasts.map((b, i) => (
            <div
              key={b._id}
              className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-green-50/30 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="col-span-1 text-sm font-bold text-gray-600">{i + 1}</div>
              <div className="col-span-3">
                <h4 className="font-bold text-base text-gray-900">{b.name}</h4>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  {b.templateName} • {new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-xs font-bold bg-green-50 text-green-700 px-3 py-1.5 rounded-lg border border-green-200 capitalize">
                  {b.audienceType}
                </span>
              </div>
              <div className="col-span-3 flex justify-center gap-6 text-sm">
                <div className="text-center">
                  <div className="font-bold text-gray-900 text-lg">{b.sentCount}</div>
                  <div className="text-xs text-gray-500 font-medium">Sent</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-green-600 text-lg">{b.deliveredCount}</div>
                  <div className="text-xs text-gray-500 font-medium">Delivered</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-green-700 text-lg">{b.readCount}</div>
                  <div className="text-xs text-gray-500 font-medium">Read</div>
                </div>
              </div>
              <div className="col-span-2 text-center">
                <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border uppercase ${
                  b.status === 'completed'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}>
                  {b.status}
                </span>
              </div>
              <div className="col-span-1 text-right flex justify-end gap-2">
                <button
                  onClick={() => handleViewReport(b._id)}
                  className="p-2.5 border-2 border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-all text-gray-600 hover:text-green-600"
                >
                  <BarChart2 size={18}/>
                </button>
                <button
                  onClick={() => handleDeleteBroadcast(b._id, b.name)}
                  className="p-2.5 border-2 border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all text-gray-600 hover:text-red-600"
                >
                  <Trash2 size={18}/>
                </button>
              </div>
           </div>
          ))
        )}
      </div>

      {/* Broadcast List - Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {broadcasts.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border-2 border-gray-100">
            <div className="text-gray-300 mb-3">
              <BarChart2 size={40} className="mx-auto" />
            </div>
            <p className="text-gray-500 font-semibold">No campaigns yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first broadcast campaign</p>
          </div>
        ) : (
          broadcasts.map((b, i) => (
            <MobileBroadcastCard
              key={b._id}
              broadcast={b}
              index={i}
              onViewReport={handleViewReport}
              onDelete={handleDeleteBroadcast}
             />
          ))
        )}
      </div>

      {showReportModal && <BroadcastReportModal broadcastId={selectedBroadcastId} onClose={() => setShowReportModal(false)} />}
      {deleteConfirm.show && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                  <div className="p-6">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Trash2 className="w-6 h-6 text-red-600" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Campaign?</h3>
                      <p className="text-sm text-gray-500 text-center mb-1">You are about to delete</p>
                      <p className="text-sm font-bold text-gray-800 text-center mb-4 truncate px-4">"{deleteConfirm.name}"</p>
                      <p className="text-xs text-red-500 text-center font-medium mb-6">This action cannot be undone.</p>
                      <div className="flex gap-3">
                          <button
                              onClick={() => setDeleteConfirm({ show: false, id: null, name: '' })}
                              className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all text-sm"
                          >
                              Cancel
                          </button>
                          <button
                              onClick={confirmDelete}
                              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all text-sm shadow-lg shadow-red-200"
                          >
                              Yes, Delete
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
             <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
                {/* Modal Header */}
                <div className="px-4 sm:px-8 py-4 sm:py-6 border-b-2 border-gray-100 bg-gradient-to-r from-green-50 to-white flex justify-between items-center">
                    <div>
                      <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Create New Campaign</h2>
                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 font-medium">Step {step} of 2</p>
                    </div>
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all text-gray-500 hover:text-gray-700"
                    >
                      <X size={20} className="sm:w-6 sm:h-6"/>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-4 sm:p-8 overflow-y-auto flex-1">
                    {step === 1 && (
                        <div className="space-y-4 sm:space-y-6">
                            {/* Campaign Name */}
                            <div>
                              <label className="block text-sm font-bold mb-2 sm:mb-3 text-gray-700">Campaign Name *</label>
                              <input
                                value={broadcastForm.name}
                                onChange={e => {
                                    setBroadcastForm({...broadcastForm, name: e.target.value});
                                    clearError('name');
                                }}
                                className={`w-full border-2 p-3 sm:p-3.5 rounded-lg outline-none transition-all font-medium text-sm sm:text-base ${
                                    errors.name
                                    ? 'border-red-500 focus:ring-2 focus:ring-red-100 focus:border-red-500 bg-red-50/10'
                                    : 'border-gray-200 focus:ring-2 focus:ring-green-100 focus:border-green-500'
                                }`}
                                placeholder="e.g. Diwali Sale Campaign"
                              />
                              {errors.name && (
                                  <p className="text-red-500 text-xs font-bold mt-1.5 flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3"/> {errors.name}
                                  </p>
                              )}
                            </div>

                            {/* Target Audience */}
                            <div>
                                <label className="block text-sm font-bold mb-2 sm:mb-3 text-gray-700">Target Audience *</label>
                                <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4">
                                    {[
                                      {id: 'all', label: 'All Contacts', icon: Users},
                                      {id: 'custom', label: 'Select', icon: CheckSquare},
                                      {id: 'orders', label: 'Orders', icon: ShoppingBag},
                                      {id: 'bookings', label: 'Bookings', icon: Ticket},
                                      {id: 'import', label: 'Import', icon: Upload}
                                    ].map(type => (
                                        <button
                                          key={type.id}
                                          onClick={() => {
                                              setBroadcastForm({...broadcastForm, audience: type.id});
                                              clearError('audience');
                                          }}
                                          className={`p-3 sm:p-4 rounded-xl border-2 flex flex-col items-center gap-1.5 sm:gap-2 transition-all ${
                                            broadcastForm.audience === type.id
                                              ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                                              : 'border-gray-200 hover:border-green-300 hover:bg-green-50/30'
                                          }`}
                                        >
                                          <type.icon className="w-5 h-5 sm:w-6 sm:h-6"/>
                                          <span className="text-[10px] sm:text-xs font-bold text-center leading-tight">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                                {errors.audience && (
                                    <p className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3"/> {errors.audience}
                                    </p>
                                )}
                            </div>

                            {/* Order Filter */}
                            {broadcastForm.audience === 'orders' && (
                                <div className="bg-blue-50 p-4 sm:p-5 rounded-xl border-2 border-blue-200">
                                    <h4 className="font-bold text-blue-900 text-sm mb-3">Order Status Filter</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {['all', 'completed', 'pending'].map(status => (
                                            <button
                                                key={status}
                                                onClick={() => setBroadcastForm({...broadcastForm, orderStatusFilter: status})}
                                                className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                                                    broadcastForm.orderStatusFilter === status
                                                    ? 'bg-blue-600 text-white shadow-md'
                                                    : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-100'
                                                }`}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-blue-700 mt-2">
                                        Sending to: <b>{broadcastForm.orderStatusFilter.toUpperCase()}</b> orders
                                    </p>
                                </div>
                            )}
                            {/* Bookings Filter */}
                            {broadcastForm.audience === 'bookings' && (
                                <div className="bg-purple-50 p-4 sm:p-5 rounded-xl border-2 border-purple-200">
                                    <h4 className="font-bold text-purple-900 text-sm mb-3">Booking Status Filter</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {['all', 'active', 'used', 'pending_payment'].map(status => (
                                            <button
                                                key={status}
                                                onClick={() => setBookingFilters({ status })}
                                                className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                                                    bookingFilters.status === status
                                                    ? 'bg-purple-600 text-white shadow-md'
                                                    : 'bg-white text-purple-600 border border-purple-200 hover:bg-purple-100'
                                                }`}
                                            >
                                                {status.replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-purple-700 mt-2">
                                        Sending to: <b>{bookingFilters.status.toUpperCase()}</b> bookings
                                    </p>
                                </div>
                            )}
                            {/* Custom Contacts Selection */}
                            {broadcastForm.audience === 'custom' && (
                                <div className={`p-4 sm:p-5 rounded-xl border-2 ${errors.customContacts ? 'border-red-200 bg-red-50/10' : 'bg-green-50 border-green-100'}`}>
                                    <div className="flex justify-between items-center mb-3">
                                      <h4 className={`font-bold text-sm ${errors.customContacts ? 'text-red-900' : 'text-green-900'}`}>Select Contacts</h4>
                                      <button
                                        onClick={selectAllContacts}
                                        className={`text-xs font-bold bg-white px-2.5 sm:px-3 py-1.5 rounded-lg border ${errors.customContacts ? 'text-red-700 border-red-200' : 'text-green-700 hover:text-green-800 border-green-200'}`}
                                      >
                                        {selectedContactPhones.length === availableContacts.length ? 'Deselect' : 'Select All'}
                                      </button>
                                    </div>
                                    <input
                                      className={`w-full border-2 p-2.5 sm:p-3 rounded-lg mb-3 text-sm outline-none ${errors.customContacts ? 'border-red-200 focus:border-red-500' : 'border-green-200 focus:border-green-500 focus:ring-2 focus:ring-green-100'}`}
                                      placeholder="Search contacts..."
                                      onChange={e => setContactSearch(e.target.value)}
                                    />
                                    <div className="max-h-48 sm:max-h-56 overflow-y-auto space-y-2">
                                      {filteredContacts.map(c => (
                                        <label
                                          key={c._id}
                                          className={`flex gap-3 p-2.5 sm:p-3 bg-white border-2 rounded-lg cursor-pointer transition-colors ${errors.customContacts ? 'border-red-100 hover:bg-red-50' : 'border-green-100 hover:bg-green-50/50'}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedContactPhones.includes(c.phone_number)}
                                            onChange={() => toggleContactSelection(c.phone_number)}
                                            className="w-4 h-4 accent-green-600 flex-shrink-0 mt-0.5"
                                          />
                                          <span className="text-sm font-medium text-gray-800 truncate">{c.name || c.phone_number}</span>
                                        </label>
                                      ))}
                                    </div>
                                    <div className="mt-3 p-2.5 sm:p-3 bg-white rounded-lg border border-green-200 flex justify-between items-center">
                                      <p className="text-xs font-bold text-green-700">
                                        Selected: {selectedContactPhones.length} contacts
                                      </p>
                                    </div>
                                    {errors.customContacts && (
                                        <p className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3"/> {errors.customContacts}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Import CSV */}
                            {broadcastForm.audience === 'import' && (
                                <div className={`p-4 sm:p-5 rounded-xl border-2 ${errors.importFile ? 'border-red-200 bg-red-50/10' : 'bg-green-50 border-green-200'}`}>
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                                        <h4 className={`font-bold text-sm flex items-center gap-2 ${errors.importFile ? 'text-red-900' : 'text-green-900'}`}>
                                            <Upload className="w-4 h-4" />
                                            Upload CSV File
                                        </h4>
                                        <button
                                            onClick={downloadSampleCsv}
                                            className="text-xs text-green-700 font-bold hover:underline flex items-center gap-1"
                                        >
                                            <FileSpreadsheet className="w-3 h-3"/> Sample Template
                                        </button>
                                    </div>

                                    <input
                                      type="file"
                                      onChange={handleFileUpload}
                                      accept=".csv,.xlsx"
                                      className={`block w-full text-sm text-gray-600 file:mr-3 sm:file:mr-4 file:py-2 sm:file:py-2.5 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:text-xs sm:file:text-sm file:font-bold file:cursor-pointer border-2 rounded-lg bg-white ${
                                          errors.importFile
                                          ? 'border-red-200 file:bg-red-500 file:text-white hover:file:bg-red-600'
                                          : 'border-green-200 file:bg-green-600 file:text-white hover:file:bg-green-700'
                                      }`}
                                    />
                                    {errors.importFile && (
                                        <p className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3"/> {errors.importFile}
                                        </p>
                                    )}

                                    <div className="mt-2 text-[10px] text-gray-500">
                                        ℹ️ File must contain "Name" and "Phone" columns.
                                    </div>

                                    {importStats && (
                                      <div className="mt-3 p-2.5 sm:p-3 bg-white rounded-lg border border-green-300">
                                        <div className="flex items-center gap-2 text-green-700">
                                          <CheckCircle className="w-4 h-4" />
                                          <span className="text-sm font-bold">{importStats.validRows} valid contacts found</span>
                                        </div>
                                      </div>
                                    )}
                                    {importStats && (
                                      <button
                                        onClick={finalizeImport}
                                        className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all"
                                      >
                                        Import Contacts
                                      </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4 sm:space-y-6">
                            {/* Template Selection */}
                            <div>
                                <label className="block text-sm font-bold mb-2 sm:mb-3 text-gray-700">Select Template *</label>
                                <TemplateSelector
                                    templates={templates}
                                    value={broadcastForm.templateName}
                                    onChange={(val) => {
                                        setBroadcastForm({...broadcastForm, templateName: val});
                                        setCarouselFiles({});
                                        clearError('templateName');
                                        setErrors({});
                                    }}
                                    error={errors.templateName}
                                />
                            </div>

                            {/* CAROUSEL MEDIA INPUTS */}
                            {isCarousel && (
                                <div className="bg-green-50 p-4 sm:p-5 rounded-xl border-2 border-green-200 space-y-3 sm:space-y-4">
                                    <div className="flex items-center gap-2 text-green-900 border-b-2 border-green-200 pb-3">
                                        <Layers className="w-4 h-4 sm:w-5 sm:h-5"/>
                                        <h4 className="font-bold text-xs sm:text-sm">Carousel Media Configuration</h4>
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-green-700 font-medium">Upload a media file for each card.</p>

                                    <div className="space-y-2 sm:space-y-3">
                                        {carouselComponent.cards.map((card, index) => {
                                            const header = card.components.find(c => c.type === 'HEADER');
                                            const format = header?.format || 'IMAGE';
                                            const acceptType = format === 'VIDEO' ? "video/*" : "image/*";
                                            const hasError = errors[`carousel_${index}`];

                                            return (
                                                <div key={index} className={`p-3 sm:p-4 rounded-lg border-2 flex items-center justify-between gap-3 sm:gap-4 ${hasError ? 'bg-red-50 border-red-200' : 'bg-white border-green-100'}`}>
                                                    <div className="flex-1 min-w-0">
                                                        <label className={`text-[10px] sm:text-xs font-bold block mb-1.5 sm:mb-2 ${hasError ? 'text-red-700' : 'text-gray-700'}`}>
                                                          Card {index + 1} ({format})
                                                        </label>
                                                        <input
                                                            type="file"
                                                            accept={acceptType}
                                                            className={`w-full text-[10px] sm:text-xs text-gray-600 file:mr-2 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-2 sm:file:px-4 file:rounded-lg file:border-0 file:text-[10px] sm:file:text-xs file:font-bold hover:file:bg-green-100 file:cursor-pointer ${
                                                                hasError ? 'file:bg-red-100 file:text-red-700' : 'file:bg-green-50 file:text-green-700'
                                                            }`}
                                                            onChange={(e) => {
                                                                const file = e.target.files[0];
                                                                setCarouselFiles(prev => ({...prev, [index]: file}));
                                                                clearError(`carousel_${index}`);
                                                            }}
                                                        />
                                                        {hasError && <p className="text-red-500 text-[10px] font-bold mt-1">{hasError}</p>}
                                                    </div>
                                                    {carouselFiles[index] ? (
                                                      <CheckCircle className="text-green-500 w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                                                    ) : (
                                                      <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex-shrink-0 ${hasError ? 'border-red-300' : 'border-gray-300'}`}></div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* STANDARD MEDIA INPUT */}
                            {requiresMedia && !isCarousel && (
                                <div className={`p-4 sm:p-5 rounded-xl border-2 ${errors.mediaFile ? 'border-red-200 bg-red-50/10' : 'bg-green-50 border-green-200'}`}>
                                    <label className={`block text-sm font-bold mb-2 sm:mb-3 flex items-center gap-2 ${errors.mediaFile ? 'text-red-900' : 'text-green-900'}`}>
                                        {mediaTypeRequired === 'IMAGE' ? <ImageIcon className="w-4 h-4"/> : <Video className="w-4 h-4"/>}
                                        Upload Header Media
                                    </label>
                                    <input
                                      type="file"
                                      className={`w-full bg-white p-2.5 sm:p-3 rounded-lg border-2 text-sm file:mr-3 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:text-xs sm:file:text-sm file:font-bold file:cursor-pointer ${
                                          errors.mediaFile
                                          ? 'border-red-200 file:bg-red-600 file:text-white hover:file:bg-red-700'
                                          : 'border-green-200 file:bg-green-600 file:text-white hover:file:bg-green-700'
                                      }`}
                                      accept={mediaTypeRequired === 'IMAGE' ? "image/*" : "video/*"}
                                      onChange={e => {
                                          setBroadcastForm({...broadcastForm, mediaFile: e.target.files[0]});
                                          clearError('mediaFile');
                                      }}
                                    />
                                    {errors.mediaFile && (
                                        <p className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3"/> {errors.mediaFile}
                                        </p>
                                    )}
                                    {broadcastForm.mediaFile && (
                                      <div className="mt-3 p-2 bg-white rounded-lg border border-green-300 flex items-center gap-2 text-green-700 text-xs font-bold">
                                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                        <span className="truncate">{broadcastForm.mediaFile.name}</span>
                                      </div>
                                    )}
                                </div>
                            )}

                            {/* Schedule Option */}
                            <div>
                                <label className="flex items-center gap-3 p-3 sm:p-4 border-2 border-gray-200 rounded-xl cursor-pointer hover:bg-green-50 hover:border-green-300 transition-all">
                                    <input
                                      type="checkbox"
                                      checked={broadcastForm.scheduled}
                                      onChange={e => {
                                          setBroadcastForm({...broadcastForm, scheduled: e.target.checked});
                                          clearError('scheduledDateTime');
                                      }}
                                      className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 accent-green-600 flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-bold text-gray-800">Schedule for later</span>
                                      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">Choose a specific date and time</p>
                                    </div>
                                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                                </label>

                                {broadcastForm.scheduled && (
                                  <div className={`mt-3 sm:mt-4 p-3 sm:p-4 rounded-xl border-2 ${errors.scheduledDateTime ? 'border-red-200 bg-red-50/10' : 'bg-green-50 border-green-200'}`}>
                                    <label className={`block text-xs font-bold mb-2 ${errors.scheduledDateTime ? 'text-red-900' : 'text-green-900'}`}>Select Date & Time</label>
                                    <input
                                      type="datetime-local"
                                      className={`w-full p-2.5 sm:p-3 border-2 rounded-lg outline-none font-medium text-sm ${errors.scheduledDateTime ? 'border-red-200 focus:border-red-500 focus:ring-2 focus:ring-red-100' : 'border-green-200 focus:border-green-500 focus:ring-2 focus:ring-green-100'}`}
                                      value={broadcastForm.scheduledDateTime}
                                      onChange={e => {
                                          setBroadcastForm({...broadcastForm, scheduledDateTime: e.target.value});
                                          clearError('scheduledDateTime');
                                      }}
                                    />
                                    {errors.scheduledDateTime && (
                                        <p className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3"/> {errors.scheduledDateTime}
                                        </p>
                                    )}
                                  </div>
                                )}
                            </div>

                            {/* Estimated Reach */}
                            <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 sm:p-4 rounded-xl border-2 border-green-200">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-[10px] sm:text-xs font-bold text-green-900 uppercase tracking-wide">Estimated Reach</p>
                                  <p className="text-xl sm:text-2xl font-bold text-green-700 mt-0.5 sm:mt-1">{estimatedReach} contacts</p>
                                </div>
                                <Users className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />
                              </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 sm:p-6 border-t-2 border-gray-100 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center gap-3">
                    {step > 1 ? (
                        <button
                          onClick={() => setStep(step - 1)}
                          disabled={isSending}
                          className="text-gray-600 font-bold hover:text-gray-900 disabled:opacity-50 px-3 sm:px-4 py-2 hover:bg-gray-100 rounded-lg transition-all text-sm sm:text-base"
                        >
                          ← Back
                        </button>
                    ) : <div></div>}

                    {step < 2 ? (
                        <button
                          onClick={() => {
                            getAudiencePreview();
                          }}
                          disabled={isSending}
                          className="bg-green-600 text-white px-5 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200 hover:shadow-xl text-sm sm:text-base disabled:bg-gray-400"
                        >
                          {isSending ? (
                              <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-white border-t-transparent"></div>
                          ) : (
                              'Next Step →'
                          )}
                        </button>
                    ) : (
                        <button
                          onClick={handleSubmitBroadcast}
                          disabled={isSending}
                          className="bg-green-600 text-white px-5 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-green-700 transition-all flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg shadow-green-200 hover:shadow-xl text-sm sm:text-base"
                        >
                            {isSending ? (
                              <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-white border-t-transparent"></div>
                            ) : (
                              <Send className="w-4 h-4 sm:w-5 sm:h-5"/>
                            )}
                            {isSending ? 'Sending...' : (broadcastForm.scheduled ? 'Schedule' : 'Send Now')}
                        </button>
                    )}
                </div>
             </div>
          </div>
      )}
    </div>
  );
}
