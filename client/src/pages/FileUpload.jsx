/**
 * components/FileUpload.jsx
 * Knowledge base upload component.
 * Sends RAG file + optional website URL to GoWhats backend,
 * which forwards them to the YoWhats Python Agent.
 */

import React, { useState, useEffect, useRef } from 'react';
import { publicApi } from '../utils/axios.js';
import toast from 'react-hot-toast';
import {
  Upload,
  FileText,
  Globe,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Brain,
  Link,
  X
} from 'lucide-react';

const FileUpload = () => {
  const [kbStatus, setKbStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Form state
  const [selectedFile, setSelectedFile] = useState(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchKbStatus();
  }, []);

  const getToken = () => localStorage.getItem('token');

  const fetchKbStatus = async () => {
    try {
      setLoading(true);
      const response = await publicApi.get('/api/bot/knowledge-base-status', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (response.data?.success) {
        setKbStatus(response.data);
        // Pre-fill website URL if already saved
        if (response.data.websiteUrl) {
          setWebsiteUrl(response.data.websiteUrl);
        }
      }
    } catch (error) {
      console.error('Error fetching KB status:', error);
      toast.error('Failed to load knowledge base status');
    } finally {
      setLoading(false);
    }
  };

  const validateUrl = (url) => {
    if (!url) return true; // empty is fine
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const allowed = ['.txt', '.pdf', '.csv', '.md', '.json'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      toast.error(`File type not supported. Use: ${allowed.join(', ')}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setWebsiteUrl(val);
    if (val && !validateUrl(val)) {
      setUrlError('Please enter a valid URL (starting with https://)');
    } else {
      setUrlError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }
    if (websiteUrl && !validateUrl(websiteUrl)) {
      toast.error('Please fix the website URL before uploading');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (websiteUrl.trim()) {
        formData.append('websiteUrl', websiteUrl.trim());
      }

      const response = await publicApi.post(
        '/api/bot/upload-knowledge-base',
        formData,
        {
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data?.success) {
        toast.success(
          `✅ Knowledge base uploaded! ${response.data.stats?.chunksCount || 0} chunks indexed.`
        );
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchKbStatus();
      } else {
        toast.error(response.data?.message || 'Upload failed');
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Upload failed. Please try again.';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete the knowledge base? The bot will go offline.')) return;
    setDeleting(true);
    try {
      const response = await publicApi.delete('/api/bot/knowledge-base', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (response.data?.success) {
        toast.success('Knowledge base deleted. Bot is now offline.');
        setWebsiteUrl('');
        setSelectedFile(null);
        await fetchKbStatus();
      }
    } catch (error) {
      toast.error('Failed to delete knowledge base');
    } finally {
      setDeleting(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading knowledge base...</p>
        </div>
      </div>
    );
  }

  const hasKB = kbStatus?.hasKnowledgeBase;
  const uploadInProgress = kbStatus?.uploadInProgress;

  return (
    <div className="space-y-6">

      {/* Upload in progress notice */}
      {uploadInProgress && (
        <div className="flex items-center space-x-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-blue-900">Upload in progress</p>
            <p className="text-xs text-blue-700">Your file is being processed. Please wait...</p>
          </div>
        </div>
      )}

      {/* Current knowledge base info */}
      {hasKB && !uploadInProgress && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-200">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-bold text-emerald-900">Knowledge Base Active</span>
            </div>
            <button
              onClick={fetchKbStatus}
              className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-emerald-700 mb-1">File</p>
              <p className="text-sm font-semibold text-emerald-900 truncate">
                {kbStatus.fileName || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 mb-1">Size</p>
              <p className="text-sm font-semibold text-emerald-900">
                {formatFileSize(kbStatus.fileSize)}
              </p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 mb-1">Chunks</p>
              <p className="text-sm font-semibold text-emerald-900">
                {kbStatus.chunksCount || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 mb-1">Uploaded</p>
              <p className="text-sm font-semibold text-emerald-900">
                {kbStatus.uploadedAt
                  ? new Date(kbStatus.uploadedAt).toLocaleDateString()
                  : '—'}
              </p>
            </div>
          </div>
          {kbStatus.websiteUrl && (
            <div className="px-5 py-3 bg-emerald-100/50 border-t border-emerald-200 flex items-center space-x-2">
              <Globe className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="text-xs text-emerald-800 truncate">{kbStatus.websiteUrl}</span>
            </div>
          )}
        </div>
      )}

      {/* No knowledge base warning */}
      {!hasKB && !uploadInProgress && (
        <div className="flex items-start space-x-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900">No knowledge base uploaded</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Upload your product catalog or business info file to enable the AI bot.
            </p>
          </div>
        </div>
      )}

      {/* ── Upload Form ── */}
      {!uploadInProgress && (
        <div className="space-y-5">

          {/* File drop zone */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              {hasKB ? 'Replace Knowledge Base File' : 'Upload Knowledge Base File'}
              <span className="text-red-500 ml-1">*</span>
            </label>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50'
                  : selectedFile
                    ? 'border-emerald-400 bg-emerald-50/50'
                    : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.csv,.md,.json"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />

              {selectedFile ? (
                <div className="flex items-center justify-center space-x-3">
                  <FileText className="w-8 h-8 text-emerald-600" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-emerald-900">{selectedFile.name}</p>
                    <p className="text-xs text-emerald-700">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700">
                    Drop your file here or <span className="text-emerald-600">browse</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Supported: .txt, .pdf, .csv, .md, .json — Max 10MB
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Website URL */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1.5">
              Website URL
              <span className="text-xs font-normal text-gray-400 ml-2">
                (Optional — for deep search)
              </span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              The AI will also search your website when the uploaded file doesn't have the answer.
            </p>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={websiteUrl}
                onChange={handleUrlChange}
                placeholder="https://www.yourwebsite.com"
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl text-sm
                  focus:outline-none transition-colors ${
                  urlError
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-gray-200 focus:border-emerald-400'
                }`}
              />
            </div>
            {urlError && (
              <p className="text-xs text-red-600 mt-1 flex items-center space-x-1">
                <AlertCircle className="w-3 h-3" />
                <span>{urlError}</span>
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile || !!urlError}
              className="flex-1 flex items-center justify-center space-x-2 px-6 py-3
                         bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl
                         font-semibold text-sm hover:from-emerald-700 hover:to-teal-700
                         transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading & Indexing...</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  <span>{hasKB ? 'Replace Knowledge Base' : 'Upload Knowledge Base'}</span>
                </>
              )}
            </button>

            {hasKB && (
              <button
                onClick={handleDelete}
                disabled={deleting || uploading}
                className="flex items-center justify-center space-x-2 px-5 py-3
                           border-2 border-red-200 text-red-600 rounded-xl font-semibold text-sm
                           hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{deleting ? 'Deleting...' : 'Delete'}</span>
              </button>
            )}
          </div>

          {/* Info note */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-start space-x-3">
              <Brain className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">How it works</p>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• Your file is sent to the AI agent and indexed using FAISS vectors</li>
                  <li>• Claude uses these vectors to answer customer WhatsApp questions</li>
                  <li>• If a website URL is added, the AI also searches it as a fallback</li>
                  <li>• Indexing usually takes 10–60 seconds depending on file size</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
