import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { publicApi } from "../utils/axios.js";
import {
  Upload,
  FileText,
  Trash2,
  RefreshCw,
  AlertCircle,
  Brain,
  X,
  Loader2,
  CheckCircle2,
  Database,
  Zap,
} from "lucide-react";

const FileUpload = ({ embedded = false }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkKnowledgeBaseStatus();
  }, []);

  const checkKnowledgeBaseStatus = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await publicApi.get("/api/bot/knowledge-base-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setKnowledgeBaseStatus(res.data);
    } catch (error) {
      console.error("Error checking knowledge base status:", error);
      toast.error("Failed to check knowledge base status");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (!selected.name.endsWith(".txt")) {
      toast.error("Please select a .txt file");
      e.target.value = "";
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("File must be less than 10MB");
      e.target.value = "";
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }

    // Check if upload is already in progress
    if (uploading) {
      toast.error("Upload already in progress. Please wait...");
      return;
    }

    // Check if another upload is in progress from status
    if (knowledgeBaseStatus?.uploadInProgress) {
      toast.error("Another upload is in progress. Please wait for it to complete.");
      return;
    }

    const token = localStorage.getItem("token");
    const tenentId = localStorage.getItem("tenentid");
    
    if (!token || !tenentId) {
      toast.error("Authentication error. Please log in again.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tenentId", tenentId);

    setUploading(true);

    try {
      const response = await publicApi.post("/api/bot/upload-knowledge-base", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
        timeout: 300000, // 5 minutes timeout
      });

      if (response.data.success) {
        toast.success(
          `Knowledge base uploaded successfully! ${response.data.stats?.chunksCount || 0} chunks, ${response.data.stats?.embeddingsCount || 0} embeddings created.`,
          { duration: 5000 }
        );
        setFile(null);
        const fileInput = document.getElementById("file-input");
        if (fileInput) fileInput.value = "";
        await checkKnowledgeBaseStatus();
      }
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage = error.response?.data?.message || "Upload failed. Please try again.";
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm("Are you sure you want to delete the knowledge base? This action cannot be undone.")) {
      return;
    }

    // Prevent deletion during upload
    if (knowledgeBaseStatus?.uploadInProgress || uploading) {
      toast.error("Cannot delete knowledge base while upload is in progress");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const tenentId = localStorage.getItem("tenentid");
      await publicApi.delete("/api/bot/knowledge-base", {
        headers: { Authorization: `Bearer ${token}` },
        data: { tenentId },
      });
      setKnowledgeBaseStatus(null);
      toast.success("Knowledge base removed successfully");
      await checkKnowledgeBaseStatus();
    } catch (error) {
      console.error("Delete error:", error);
      const errorMessage = error.response?.data?.message || "Failed to remove knowledge base";
      toast.error(errorMessage);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] bg-white">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-gray-200 rounded-full mx-auto mb-3 border-t-[#005E2C]"></div>
          <p className="text-gray-600 font-medium">Loading AI Assistant...</p>
        </div>
      </div>
    );
  }

  const embeddingsCount = knowledgeBaseStatus?.embeddingsCount || 0;
  const isUploadInProgress = knowledgeBaseStatus?.uploadInProgress || uploading;

  return (
    <div className={`w-full ${embedded ? 'bg-transparent' : 'bg-white'} py-1`}>
      {/* Header */}
      <div className="w-full max-w-5xl mx-auto bg-green-50 border border-green-100 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-[#005E2C] to-[#00A86B] text-white rounded-xl flex items-center justify-center shadow-md shrink-0">
            <Brain className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 flex flex-wrap items-center gap-2">
              AI Assistant Configuration
              {embeddingsCount > 0 && (
                <span className="text-sm bg-[#E6F4EA] text-[#005E2C] font-medium px-3 py-1 rounded-lg">
                  {embeddingsCount} Embeddings Processed
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-600">
              Manage your AI knowledge base and chatbot intelligence.
            </p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="mt-5 sm:mt-6 w-full max-w-5xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
        {/* Card Header with Action Buttons */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Knowledge Base Status</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={checkKnowledgeBaseStatus}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2 bg-[#005E2C] text-white rounded-lg text-sm font-medium hover:bg-[#00A86B] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {knowledgeBaseStatus?.hasKnowledgeBase && (
              <button
                onClick={handleRemove}
                disabled={isUploadInProgress}
                className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Card Content */}
        <div className="p-4 sm:p-6 space-y-6">
          {knowledgeBaseStatus?.hasKnowledgeBase ? (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 sm:p-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#005E2C] rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-bold text-gray-900">Knowledge Base Active</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#005E2C]" />
                      <span className="text-gray-700">
                        <strong>File:</strong> {knowledgeBaseStatus.fileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#005E2C]" />
                      <span className="text-gray-700">
                        <strong>Size:</strong> {formatFileSize(knowledgeBaseStatus.fileSize)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#005E2C]" />
                      <span className="text-gray-700">
                        <strong>Chunks:</strong> {knowledgeBaseStatus.chunksCount || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#005E2C]" />
                      <span className="text-[#005E2C] font-semibold">
                        <strong>Embeddings:</strong> {embeddingsCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-600 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50">
              <AlertCircle className="w-12 h-12 text-[#00A86B] mb-3" />
              <p className="text-base font-medium">No active knowledge base found</p>
              <p className="text-sm text-gray-500 mt-1">Upload a .txt file to get started</p>
            </div>
          )}

          {/* Upload Section */}
          <div className="space-y-4">
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {knowledgeBaseStatus?.hasKnowledgeBase ? 'Update Knowledge Base' : 'Upload Knowledge Base'}
              </h3>

              <div
                className={`w-full border-2 border-dashed rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center transition-all ${
                  file ? "border-[#00A86B] bg-green-50" : "border-gray-300 hover:border-[#00A86B]"
                } ${isUploadInProgress ? "opacity-50 pointer-events-none" : ""}`}
              >
                {!file ? (
                  <>
                    <div className="w-16 h-16 bg-[#E6F4EA] rounded-2xl flex items-center justify-center mb-4">
                      <Upload className="w-8 h-8 text-[#005E2C]" />
                    </div>
                    <label
                      htmlFor="file-input"
                      className={`cursor-pointer inline-flex items-center px-6 py-3 bg-[#005E2C] text-white rounded-lg hover:bg-[#00A86B] transition font-semibold ${
                        isUploadInProgress ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                      }`}
                    >
                      <Upload className="w-5 h-5 mr-2" /> Choose File
                    </label>
                    <input
                      id="file-input"
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isUploadInProgress}
                    />
                    <p className="text-xs text-gray-500 mt-3">
                      Upload a .txt file with your business details (max 10MB)
                    </p>
                  </>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
                    <div className="flex items-center space-x-3 min-w-0">
                      <FileText className="w-6 h-6 text-[#005E2C]" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 break-all">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-600">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        const fileInput = document.getElementById("file-input");
                        if (fileInput) fileInput.value = "";
                      }}
                      disabled={uploading}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Upload Button - ONLY LOADING INDICATOR */}
              <button
                onClick={handleUpload}
                disabled={!file || isUploadInProgress}
                className={`mt-4 w-full py-3 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 ${
                  isUploadInProgress || !file
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-gradient-to-r from-[#005E2C] to-[#00A86B] hover:from-[#00A86B] hover:to-[#005E2C]"
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm sm:text-base">Processing... This may take a few minutes</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span className="text-sm sm:text-base">Upload Knowledge Base</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-blue-900 mb-2">How Knowledge Base Works:</h4>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>1. Upload your business information as a .txt file</li>
                  <li>2. AI automatically chunks and creates embeddings</li>
                  <li>3. Enable the bot to start responding to customer queries</li>
                  <li>4. Bot uses RAG (Retrieval Augmented Generation) for accurate responses</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;

