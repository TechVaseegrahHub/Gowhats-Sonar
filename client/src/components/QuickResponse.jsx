import React, { useState, useEffect } from "react";
import api from "../utils/axios"; // ✅ Already correct - imports 'api'
import { PlusIcon, PencilIcon, TrashIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { toast } from "react-hot-toast";

const QuickResponseCreator = () => {
  const [shortcut, setShortcut] = useState("");
  const [message, setMessage] = useState("");
  const [responses, setResponses] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // =================== Fetch Responses ===================
  useEffect(() => {
    fetchResponses();
  }, []);

  const fetchResponses = async () => {
    try {
      setLoading(true);
      // ✅ FIXED: Using 'api' instead of 'axios'
      const response = await api.get("/api/quick-responses");
      setResponses(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching quick responses:", error);
      toast.error("Failed to load quick responses");
      setResponses([]);
    } finally {
      setLoading(false);
    }
  };

  // =================== Search ===================
  const handleSearch = async () => {
    try {
      if (!searchTerm.trim()) {
        return fetchResponses();
      }
      setLoading(true);
      const response = await api.get(
        `/api/quick-responses/search/${encodeURIComponent(searchTerm)}`
      );
      setResponses(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error searching quick responses:", error);
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  // =================== Create Response ===================
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const formattedShortcut = shortcut.startsWith("/") ? shortcut : `/${shortcut}`;

      const response = await api.post("/api/quick-responses", {
        shortcut: formattedShortcut,
        message,
      });

      setResponses((prev) => (Array.isArray(prev) ? [...prev, response.data] : [response.data]));
      toast.success("Quick response created successfully");

      setShortcut("");
      setMessage("");
      setShowForm(false);
    } catch (error) {
      console.error("Error creating quick response:", error);
      toast.error(error.response?.data?.message || "Failed to create quick response");
    } finally {
      setSubmitting(false);
    }
  };

  // =================== Edit ===================
  const handleEdit = (response) => {
    setEditingId(response._id);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // =================== Update ===================
  const handleUpdateResponse = async (id) => {
    try {
      setSubmitting(true);
      const updatedShortcut = document.getElementById(`edit-shortcut-${id}`).value;
      const updatedMessage = document.getElementById(`edit-message-${id}`).value;

      const formattedShortcut = updatedShortcut.startsWith("/")
        ? updatedShortcut
        : `/${updatedShortcut}`;

      const response = await api.put(`/api/quick-responses/${id}`, {
        shortcut: formattedShortcut,
        message: updatedMessage,
      });

      if (response.data) {
        setResponses((prev) =>
          prev.map((r) => (r._id === id ? response.data : r))
        );
        toast.success("Quick response updated successfully");
        setEditingId(null);
      }
    } catch (error) {
      console.error("Error updating quick response:", error);
      toast.error(error.response?.data?.message || "Failed to update quick response");
    } finally {
      setSubmitting(false);
    }
  };

  // =================== Delete ===================
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this quick response?")) return;
    try {
      await api.delete(`/api/quick-responses/${id}`);
      setResponses((prev) => prev.filter((r) => r._id !== id));
      toast.success("Quick response deleted successfully");
    } catch (error) {
      console.error("Error deleting quick response:", error);
      toast.error("Failed to delete quick response");
    }
  };

  // =================== Filter ===================
  const filteredResponses = Array.isArray(responses)
    ? responses.filter(
        (r) =>
          r.shortcut?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.message?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  // =================== Render ===================
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="relative w-full md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="pl-10 w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Search responses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <button
            className="w-full md:w-auto bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center justify-center gap-2 shadow-sm"
            onClick={() => {
              setShowForm(true);
              setShortcut("");
              setMessage("");
            }}
          >
            <PlusIcon size={18} />
            <span>Add Response</span>
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100 transition-all duration-300 ease-in-out">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Create New Quick Response</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2 font-medium" htmlFor="shortcut">
                  Shortcut
                </label>
                <input
                  type="text"
                  id="shortcut"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="/welcome"
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value)}
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  Type this shortcut in chat to quickly send this message
                </p>
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 mb-2 font-medium" htmlFor="message">
                  Message
                </label>
                <textarea
                  id="message"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows="6"
                  placeholder="Type your quick response message here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                ></textarea>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors duration-200"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center gap-2"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List of Quick Responses */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <h2 className="text-xl font-semibold mb-6 text-gray-800">Your Quick Responses</h2>

          {loading ? (
            <div className="text-center py-8">
              <Loader2Icon className="mx-auto h-8 w-8 text-green-500 animate-spin" />
              <p className="mt-2 text-gray-500">Loading quick responses...</p>
            </div>
          ) : filteredResponses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No quick responses found.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredResponses.map((response) => (
                <div
                  key={response._id}
                  className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow duration-200"
                >
                  {editingId === response._id ? (
                    <div className="animate-fadeIn">
                      <div className="mb-3">
                        <label
                          className="block text-gray-700 mb-1 text-sm font-medium"
                          htmlFor={`edit-shortcut-${response._id}`}
                        >
                          Shortcut
                        </label>
                        <input
                          type="text"
                          id={`edit-shortcut-${response._id}`}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          defaultValue={response.shortcut}
                          autoFocus
                        />
                      </div>
                      <div className="mb-4">
                        <label
                          className="block text-gray-700 mb-1 text-sm font-medium"
                          htmlFor={`edit-message-${response._id}`}
                        >
                          Message
                        </label>
                        <textarea
                          id={`edit-message-${response._id}`}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          rows="5"
                          defaultValue={response.message}
                        ></textarea>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition-colors duration-200 text-sm"
                          onClick={handleCancelEdit}
                          disabled={submitting}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors duration-200 text-sm flex items-center gap-2"
                          onClick={() => handleUpdateResponse(response._id)}
                          disabled={submitting}
                        >
                          {submitting ? (
                            <>
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <span>Save Changes</span>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                            {response.shortcut}
                          </span>
                        </div>
                        <p className="text-gray-800 whitespace-pre-wrap text-sm">
                          {response.message}
                        </p>
                      </div>
                      <div className="flex items-start space-x-2 md:ml-4">
                        <button
                          className="p-1.5 rounded-full text-gray-500 hover:text-green-600 hover:bg-green-50 transition-colors duration-200"
                          onClick={() => handleEdit(response)}
                          aria-label="Edit response"
                        >
                          <PencilIcon size={18} />
                        </button>
                        <button
                          className="p-1.5 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors duration-200"
                          onClick={() => handleDelete(response._id)}
                          aria-label="Delete response"
                        >
                          <TrashIcon size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickResponseCreator;
