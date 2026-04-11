import React, { useState, useEffect } from 'react';
import api from '../utils/axios';
import { toast } from 'react-hot-toast';
import { HiTemplate, HiX, HiCheckCircle, HiSearch } from 'react-icons/hi';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

const TemplateSelector = ({ onSelect, onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await api.get('/api/templates');
        const approvedTemplates = response.data.templates?.filter(t => t.status === 'APPROVED') || [];
        setTemplates(approvedTemplates);
      } catch (error) {
        console.error('Template load error:', error);
        toast.error('Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    loadTemplates();
  }, []);

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.components?.find(c => c.type === 'BODY')?.text || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="absolute bottom-16 left-0 right-0 w-full bg-white shadow-2xl rounded-t-2xl z-50 animate-in slide-in-from-bottom duration-300 border-t-4 border-green-500">
      
      {/* Header */}
      <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-green-500 to-green-600 p-2.5 rounded-xl shadow-lg">
              <HiTemplate className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Message Templates</h3>
              <p className="text-xs text-gray-500">{templates.length} approved templates available</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-all"
          >
            <HiX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <AiOutlineLoading3Quarters className="w-10 h-10 text-green-600 animate-spin mb-3" />
            <p className="text-gray-500 font-medium">Loading templates...</p>
          </div>
        ) : filteredTemplates.length > 0 ? (
          <div className="space-y-3">
            {filteredTemplates.map(template => {
              const bodyComponent = template.components?.find(c => c.type === 'BODY');
              const bodyText = bodyComponent?.text || 'No content';
              
              return (
                <div
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className="group p-4 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:shadow-md cursor-pointer transition-all bg-white"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-gradient-to-br from-green-100 to-green-50 p-2.5 rounded-lg text-green-600 group-hover:from-green-200 group-hover:to-green-100 transition-all">
                      <HiTemplate className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="font-bold text-gray-900 group-hover:text-green-600 transition-colors truncate">
                          {template.name}
                        </h4>
                        <HiCheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                        {bodyText}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                          {template.category}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">
                          {template.language}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <HiTemplate className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 font-semibold mb-1">
              {searchQuery ? 'No templates found' : 'No templates available'}
            </p>
            <p className="text-sm text-gray-400">
              {searchQuery ? 'Try a different search term' : 'Create your first template to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateSelector;
