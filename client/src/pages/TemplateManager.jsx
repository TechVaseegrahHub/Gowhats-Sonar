import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import TemplateList from './TemplateList';
import TemplateModal from './TemplateModal';

export default function TemplateManager() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen font-sans">

      {/* Header Box - Responsive */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              WhatsApp Templates
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Create and manage your message templates.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 sm:px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <Plus className="w-5 h-5" /> Create Template
          </button>
        </div>
      </div>

      {/* List */}
      <TemplateList key={refreshKey} onRefresh={() => setRefreshKey(prev => prev + 1)} />

      {/* Modal */}
      {showCreateModal && (
        <TemplateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => setRefreshKey(prev => prev + 1)}
        />
      )}
    </div>
  );
}
