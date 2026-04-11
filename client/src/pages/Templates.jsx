import React, { useState, useEffect } from 'react';
import {
Search, RefreshCw, CheckCircle, XCircle,
  Clock, Plus, MessageSquare, Trash2, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import TemplateModal from './TemplateModal';
import TemplateViewModal from '../components/TemplateViewModal';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [loadingTemplateDetails, setLoadingTemplateDetails] = useState(false);
  
   const fetchTemplates = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('https://bot.gowhats.in/api/templates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.success) {
        setTemplates(data.templates || []);
      } else {
        toast.error("Failed to load templates");
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error("Network error fetching templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);
  
 const handleViewTemplate = async (template) => {
    setViewingTemplate(template);
    setLoadingTemplateDetails(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`https://bot.gowhats.in/api/templates/${encodeURIComponent(template.name)}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch template details');
      }

      const detailData = await response.json();
      if (detailData?.name) {
        setViewingTemplate(detailData);
      }
    } catch (error) {
      console.warn('Template detail fetch failed, using list data:', error);
    } finally {
      setLoadingTemplateDetails(false);
    }
  };

  const handleDelete = async (templateName) => {
    if (!window.confirm(`Delete template "${templateName}"? This action cannot be undone.`)) return;
    const toastId = toast.loading("Deleting template...");
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`https://bot.gowhats.in/api/templates/${templateName}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Template deleted successfully", { id: toastId });
        fetchTemplates();
      } else {
        toast.error(data.error || "Failed to delete template", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      toast.error("Delete failed", { id: toastId });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-green-50 text-green-700 border border-green-200"><CheckCircle size={10} className="sm:w-3 sm:h-3"/> Active</span>;
      case 'REJECTED': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-red-50 text-red-700 border border-red-200"><XCircle size={10} className="sm:w-3 sm:h-3"/> Rejected</span>;
      case 'PENDING': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-200"><Clock size={10} className="sm:w-3 sm:h-3"/> Review</span>;
      default: return <span className="text-gray-500 text-xs font-mono">{status}</span>;
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen font-sans">

      {/* Header Box - Responsive */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">WhatsApp Templates</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Create and manage your message templates</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 sm:px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <Plus className="w-5 h-5" /> Create Template
          </button>
        </div>
      </div>

      {/* Search Bar & Refresh - Responsive */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search templates..."
              className="w-full pl-10 pr-4 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={fetchTemplates}
            className="p-2.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition border border-gray-300 bg-white flex items-center justify-center gap-2 sm:gap-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="sm:hidden text-sm font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-sm font-bold uppercase tracking-wider">
                <th className="px-6 py-4">S.No</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Language</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && templates.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : filteredTemplates.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-400">No templates found.</td></tr>
              ) : (
                filteredTemplates.map((t, index) => (
                  <tr key={t.id || index} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 text-sm text-gray-500 font-medium">{index + 1}</td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">{t.id}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-[11px] font-bold uppercase">{t.category}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.language}</td>
                    <td className="px-6 py-4">{getStatusBadge(t.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewTemplate(t)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                          title="View template"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(t.name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {loading && templates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-200 border-t-green-500 mx-auto mb-3"></div>
            Loading...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            No templates found.
          </div>
        ) : (
          filteredTemplates.map((t, index) => (
            <div key={t.id || index} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="bg-green-50 p-2.5 rounded-lg text-green-600 border border-green-100 shrink-0">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 text-sm truncate">{t.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{t.id}</p>
                    </div>
                  </div>
                  {getStatusBadge(t.status)}
                </div>

                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold uppercase">{t.category}</span>
                    <span className="text-xs text-gray-500">{t.language}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleViewTemplate(t)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="View template"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.name)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <TemplateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => fetchTemplates()}
        />
      )}

    <TemplateViewModal
        isOpen={Boolean(viewingTemplate)}
        template={viewingTemplate}
        loading={loadingTemplateDetails}
        onClose={() => {
          setViewingTemplate(null);
          setLoadingTemplateDetails(false);
        }}
      />
    </div>
  );
}
