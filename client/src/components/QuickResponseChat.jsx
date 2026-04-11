import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from "../utils/axios";

const QuickResponseChat = ({ isOpen, onClose, onSelectResponse }) => {
  const [quickResponses, setQuickResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchQuickResponses();
    }
  }, [isOpen]);

  const fetchQuickResponses = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/quick-responses');

      if (response.data) {
        setQuickResponses(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      console.error("Error fetching quick responses:", error);
      toast.error("Failed to load quick responses");
      setQuickResponses([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredResponses = quickResponses.filter(response =>
    response.shortcut.toLowerCase().includes(searchTerm.toLowerCase()) ||
    response.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (response) => {
    onSelectResponse(response.message);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-30">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Quick Responses</h2>
          <button
            className="text-gray-500 hover:text-gray-700 text-xl"
            onClick={onClose}
          >
            <X size={24} />
          </button>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="Search quick responses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-500">Loading quick responses...</p>
            </div>
          ) : filteredResponses.length > 0 ? (
            <div className="space-y-2">
              {filteredResponses.map((response) => (
                <div
                  key={response._id}
                  className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleSelect(response)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-600">{response.shortcut}</span>
                    <button
                      className="text-xs text-gray-500 hover:text-blue-600 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(response);
                      }}
                    >
                      Use
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap line-clamp-2">
                    {response.message}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p>No quick responses available</p>
              <p className="text-sm mt-1">Create them in the Settings page</p>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickResponseChat;
