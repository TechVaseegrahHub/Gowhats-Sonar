// MediaMessages.jsx - COMPLETE ENHANCED VERSION
import React, { useMemo, useState, useEffect, useRef } from "react";
import dayjs from "dayjs";
import { toast } from "react-hot-toast";
import {
  Play, FileText, User, MapPin, Download, Send, Image, X, SmileIcon, Maximize,
  Eye, Expand, Pause, Volume2, VolumeX, RotateCcw, Share, ExternalLink,
  Loader, AlertCircle, CheckCircle, Clock, Phone, Navigation, Camera
} from "lucide-react";

// ✅ Enhanced Media URL Construction
const getMediaUrl = (mediaUrl, tenantId) => {
  console.log('🔗 getMediaUrl called with:', { mediaUrl, tenantId });

  if (!mediaUrl) return '';

  // Handle absolute URLs
  if (mediaUrl.startsWith('http')) {
    return mediaUrl;
  }

  // ✅ If URL already starts with /uploads/, use as-is
  if (mediaUrl.startsWith('/uploads/')) {
    const finalUrl = `${window.location.origin}${mediaUrl}`;
    console.log('🔗 Using uploads path:', finalUrl);
    return finalUrl;
  }

  // For tenant-specific media without /uploads/ prefix
  if (tenantId && mediaUrl.includes('media/')) {
    const finalUrl = `${window.location.origin}/uploads/${mediaUrl}`;
    console.log('🔗 Constructed tenant URL:', finalUrl);
    return finalUrl;
  }

  const fallbackUrl = `${window.location.origin}/uploads/${mediaUrl}`;
  console.log('🔗 Using fallback URL:', fallbackUrl);
  return fallbackUrl;
};

// Format duration helper
const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to check if text is likely a filename
const isFilename = (text) => {
  if (!text) return false;
  const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.pdf', '.doc', '.docx'];
  return extensions.some(ext => text.toLowerCase().includes(ext));
};

// Helper function to get file extension
const getFileExtension = (filename) => {
  if (!filename) return '';
  return filename.split('.').pop()?.toLowerCase() || '';
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const MessageFooter = ({ timestamp, status, isSent }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'sending':
        return <Clock size={12} className="text-gray-400" />;
      case 'sent':
        return <div className="message-status status-sent" />;
      case 'delivered':
        return <div className="message-status status-delivered" />;
      case 'read':
        return <div className="message-status status-read" />;
      case 'failed':
        return <AlertCircle size={12} className="text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="message-footer flex justify-between items-center mt-2 text-xs text-gray-500 w-full">
      <span className="timestamp">{dayjs(timestamp).format("HH:mm")}</span>
      {isSent && (
        <div className="status-icons flex items-center">
          {getStatusIcon()}
        </div>
      )}
    </div>
  );
};

// ✅ ENHANCED: Caption Modal with File Preview
const MediaCaptionModal = ({ isOpen, onClose, pendingFile, caption, setCaption, onSend }) => {
  if (!isOpen || !pendingFile) return null;

  const previewUrl = URL.createObjectURL(pendingFile.file);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Add Caption</h2>
          <button
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mb-4 flex justify-center">
          {pendingFile.type === 'image' && (
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-64 w-full object-contain rounded-lg"
            />
          )}
          {pendingFile.type === 'video' && (
            <video
              src={previewUrl}
              className="max-h-64 w-full object-contain rounded-lg"
              controls
            />
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
            <Image size={16} className="text-blue-500" />
            <span className="truncate">{pendingFile.file.name}</span>
            <span className="ml-auto">{(pendingFile.file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">
            Caption (Optional)
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption for this image..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            rows={3}
            maxLength={1024}
          />
          <div className="text-right text-xs text-gray-500 mt-1">
            {caption.length}/1024 characters
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onSend}
            className="px-5 py-2.5 text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center gap-2"
          >
            <Send size={18} />
            Send Image
          </button>
        </div>
      </div>
    </div>
  );
};

// ✅ ENHANCED: Image Message with Full View and Caption Support
const ImageMessage = ({ msg, selectedContact }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFullView, setIsFullView] = useState(false);

  const imageUrl = useMemo(() => {
    console.log('🖼️ Image message data:', {
      mediaUrl: msg.mediaUrl,
      type: msg.type,
      from: msg.from,
      tenantId: msg.tenantId,
      isTempFile: msg._tempFile,
      uploadProgress: msg.uploadProgress
    });

    if (!msg.mediaUrl) return '';

    // ✅ Handle temporary uploads with blob URLs
    if (msg._tempFile && msg.mediaUrl && msg.mediaUrl.startsWith('blob:')) {
      return msg.mediaUrl;
    }

    return getMediaUrl(msg.mediaUrl, msg.tenantId);
  }, [msg]);

  // Check if message has a proper caption (not filename)
  const hasCaption = msg.text &&
    msg.text !== 'Image message' &&
    msg.text !== 'Photo' &&
    !isFilename(msg.text);

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = hasCaption ? `image_${Date.now()}.jpg` : (msg.text || `image_${Date.now()}.jpg`);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Image downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Download failed. Opening in new tab...');
      window.open(imageUrl, '_blank');
    }
  };

  // ✅ UPLOADING STATE - Show progress bar with preview
  if (msg.status === 'sending' || msg.uploadProgress !== undefined) {
    return (
      <div className="image-message-uploading max-w-sm">
        <div className="relative">
          {/* ✅ Show preview image while uploading */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Uploading..."
              className="rounded-lg max-w-full object-cover opacity-50"
              style={{ maxHeight: '400px', minHeight: '100px' }}
            />
          )}

          {/* ✅ Progress overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-30 rounded-lg">
            <Loader className="animate-spin h-8 w-8 text-white mb-2" />
            {msg.uploadProgress !== undefined && (
              <div className="bg-black bg-opacity-70 px-3 py-1 rounded-full">
                <span className="text-white text-sm font-semibold">
                  {msg.uploadProgress}%
                </span>
              </div>
            )}
          </div>
        </div>

        <MessageFooter
          timestamp={msg.timestamp}
          status={msg.status || 'sending'}
          isSent={msg.from !== selectedContact.phone_number}
        />
      </div>
    );
  }

  return (
    <div className="image-message relative max-w-sm">
      {loading && !error && (
        <div className="loading-skeleton h-48 w-full bg-gray-100 rounded-lg flex items-center justify-center">
          <Loader className="animate-spin h-8 w-8 text-green-500" />
        </div>
      )}

      {!error && imageUrl && (
        <div className="relative group">
          <img
            src={imageUrl}
            alt="Shared Image"
            className="rounded-lg max-w-full object-cover cursor-pointer hover:opacity-95 transition-opacity shadow-sm"
            style={{ maxHeight: '400px', minHeight: '100px' }}
            onLoad={() => setLoading(false)}
            onError={() => {
              console.error('❌ Image load failed:', imageUrl);
              setError(true);
              setLoading(false);
            }}
            onClick={() => setIsFullView(true)}
          />

          {/* Action buttons overlay */}
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg" />

          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFullView(true);
              }}
              className="p-2 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90 transition-colors"
              title="View full size"
            >
              <Expand size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="p-2 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90 transition-colors"
              title="Download image"
            >
              <Download size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              className="p-2 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90 transition-colors"
              title="Share image"
            >
              <Share size={18} />
            </button>
          </div>

          {/* Caption display */}
          {hasCaption && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-700">
              {msg.text}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-container bg-red-50 p-4 rounded-lg text-center border border-red-200">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600 font-medium mb-2">Image unavailable</p>
          <p className="text-xs text-gray-500 mb-3">{msg.mediaUrl?.split('/').pop() || 'Unknown file'}</p>
          {msg.mediaUrl && (
            <button
              onClick={handleDownload}
              className="px-3 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 transition-colors"
            >
              Try download
            </button>
          )}
        </div>
      )}

      {/* Full view modal */}
      {isFullView && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center"
          onClick={() => setIsFullView(false)}
        >
          <div className="max-w-screen-lg max-h-screen-lg p-4 relative">
            <img
              src={imageUrl}
              alt="Full size image"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Close button */}
            <button
              className="absolute top-4 right-4 p-3 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90"
              onClick={() => setIsFullView(false)}
            >
              <X size={24} />
            </button>

            {/* Download button */}
            <button
              className="absolute bottom-4 right-4 p-3 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              <Download size={24} />
            </button>

            {/* Share button */}
            <button
              className="absolute bottom-4 right-20 p-3 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90"
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
            >
              <Share size={24} />
            </button>

            {/* Caption in full view */}
            {hasCaption && (
              <div className="absolute bottom-4 left-4 right-32 p-3 bg-black bg-opacity-70 rounded text-white text-sm">
                {msg.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message footer */}
      <MessageFooter
        timestamp={msg.timestamp}
        status={msg.status}
        isSent={msg.from !== selectedContact.phone_number}
      />
    </div>
  );
};

// ✅ ENHANCED: Video Message with Full View and Caption Support
const VideoMessage = ({ msg, selectedContact }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFullView, setIsFullView] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  const videoUrl = useMemo(() => {
    console.log('🎥 Video message data:', {
      mediaUrl: msg.mediaUrl,
      type: msg.type,
      from: msg.from,
      tenantId: msg.tenantId
    });

    if (!msg.mediaUrl) return '';
    return getMediaUrl(msg.mediaUrl, msg.tenantId);
  }, [msg]);

  const hasCaption = msg.text &&
    msg.text !== 'Video' &&
    msg.text !== 'Video' &&
    !isFilename(msg.text);

  const handleDownload = async () => {
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = hasCaption ? `video_${Date.now()}.mp4` : (msg.text || `video_${Date.now()}.mp4`);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Video downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Download failed. Opening in new tab...');
      window.open(videoUrl, '_blank');
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  return (
    <div className="video-message max-w-sm">
      {loading && (
        <div className="flex justify-center items-center h-32 bg-gray-50 rounded">
          <Loader className="animate-spin h-6 w-6 text-green-500" />
        </div>
      )}

      {/* Uploading state */}
      {msg.uploadProgress !== undefined && msg.uploadProgress < 100 && (
        <div className="loading-skeleton h-48 w-full bg-blue-50 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <Loader className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-2" />
            <div className="text-sm text-blue-600">Uploading video... {msg.uploadProgress}%</div>
          </div>
        </div>
      )}

      <div className="video-container relative group" style={{display: loading ? 'none' : 'block'}}>
        {!error && videoUrl && (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              onLoadedData={() => setLoading(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => {
                console.error('❌ Video load failed:', videoUrl);
                setError(true);
                setLoading(false);
              }}
              className="rounded-md max-w-full max-h-[300px] cursor-pointer"
              poster=""
            />

            {/* Video controls overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-md" />

            {/* Play button overlay */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={handlePlayPause}
                  className="p-4 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90 transition-colors"
                >
                  <Play size={32} fill="white" />
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullView(true);
                }}
                className="p-2 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90 transition-colors"
                title="View full size"
              >
                <Expand size={18} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                className="p-2 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90 transition-colors"
                title="Download video"
              >
                <Download size={18} />
              </button>
            </div>

            {/* Caption */}
            {hasCaption && (
              <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-700">
                {msg.text}
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="error-container p-4 bg-red-50 rounded-lg text-center border border-red-200">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <div className="text-red-600 font-medium mb-2">Video unavailable</div>
          <div className="text-xs text-gray-500 mb-3">
            {msg.text || msg.mediaUrl?.split('/').pop() || "Video"}
          </div>
          {videoUrl && (
            <button
              onClick={handleDownload}
              className="px-3 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 transition-colors"
            >
              Try download
            </button>
          )}
        </div>
      )}

      {/* Full view modal for video */}
      {isFullView && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center"
          onClick={() => setIsFullView(false)}
        >
          <div className="max-w-screen-lg max-h-screen-lg p-4 relative">
            <video
              src={videoUrl}
              controls
              autoPlay
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Close button */}
            <button
              className="absolute top-4 right-4 p-3 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90"
              onClick={() => setIsFullView(false)}
            >
              <X size={24} />
            </button>

            {/* Download button */}
            <button
              className="absolute bottom-4 right-4 p-3 bg-black bg-opacity-70 rounded-full text-white hover:bg-opacity-90"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              <Download size={24} />
            </button>

            {/* Caption in full view */}
            {hasCaption && (
              <div className="absolute bottom-4 left-4 right-20 p-3 bg-black bg-opacity-70 rounded text-white text-sm">
                {msg.text}
              </div>
            )}
          </div>
        </div>
      )}

      <MessageFooter
        timestamp={msg.timestamp}
        status={msg.status}
        isSent={msg.from !== selectedContact.phone_number}
      />
    </div>
  );
};

// ✅ ENHANCED:Audio Message with Fixed Playback and Waveform
const AudioMessage = ({ msg, selectedContact }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);

  const audioUrl = useMemo(() => {
    if (!msg.mediaUrl) return '';
    return getMediaUrl(msg.mediaUrl, msg.tenantId);
  }, [msg]);

  // ✅ CRITICAL: Determine if this is an uploading message
  const isUploading = msg.status === 'sending' ||
                      msg.uploadProgress !== undefined ||
                      msg._tempFile === true;

  // ✅ CRITICAL: Reset states when message changes from uploading to sent
  useEffect(() => {
    if (!isUploading && audioUrl) {
      setError(false);
      setLoading(true); // Start loading the audio
    }
  }, [isUploading, audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      const allAudio = document.querySelectorAll('audio');
      allAudio.forEach(audio => {
        if (audio !== audioRef.current) {
          audio.pause();
        }
      });

      audioRef.current.play().catch(error => {
        console.error('Audio play failed:', error);
        setError(true);
      });
    }
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice_message_${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Audio downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Download failed');
    }
  };

  // ✅ UPLOADING STATE - Green UI
  if (isUploading) {
    return (
      <div className="audio-message-container max-w-xs">
        <div className="audio-controls flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Loader className="animate-spin text-white" size={16} />
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span className="text-green-700 font-medium">
                {msg.uploadProgress !== undefined
                  ? `Uploading ${msg.uploadProgress}%`
                  : 'Sending...'}
              </span>
              <span>0:00</span>
            </div>

            <div className="w-full bg-green-200 rounded-full h-2">
              <div
                className="bg-green-500 h-full rounded-full transition-all duration-300"
                style={{
                  width: msg.uploadProgress !== undefined
                    ? `${msg.uploadProgress}%`
                    : '30%'
                }}
              />
            </div>
          </div>

          <button disabled className="p-1 text-gray-300 cursor-not-allowed">
            <Volume2 size={16} />
          </button>

          <button disabled className="p-1 text-gray-300 cursor-not-allowed">
            <Download size={16} />
          </button>
        </div>

        <MessageFooter
          timestamp={msg.timestamp}
          status={msg.status || 'sending'}
          isSent={msg.from !== selectedContact.phone_number}
        />
      </div>
    );
  }

  // ✅ ERROR STATE - Only show after load attempt
  if (error) {
    return (
      <div className="audio-error p-3 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
        <div className="text-red-600 font-medium mb-2 text-center">Audio unavailable</div>
        <div className="text-xs text-gray-500 mb-3 text-center">
          {msg.mediaUrl?.split('/').pop() || 'Audio file'}
        </div>
        <button
          onClick={handleDownload}
          className="w-full px-3 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200"
        >
          Try download
        </button>
        <MessageFooter
          timestamp={msg.timestamp}
          status={msg.status}
          isSent={msg.from !== selectedContact.phone_number}
        />
      </div>
    );
  }

  // ✅ NORMAL PLAYABLE AUDIO UI (shows immediately after upload, while loading metadata)
  return (
    <div className="audio-message-container max-w-xs">
      <div className="audio-controls flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <button
          className="play-button w-10 h-10 bg-green-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-green-600 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handlePlayPause}
          disabled={loading}
        >
          {loading ? (
            <Loader className="animate-spin text-white" size={16} />
          ) : isPlaying ? (
            <Pause size={16} fill="white" className="text-white" />
          ) : (
            <Play size={16} fill="white" className="text-white ml-0.5" />
          )}
        </button>

        <div className="flex-1">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>{loading ? 'Loading...' : 'Voice message'}</span>
            <span>
              {loading ? '0:00' : `${formatDuration(Math.floor(currentTime))} / ${formatDuration(Math.floor(duration))}`}
            </span>
          </div>

          <div
            className={`w-full bg-gray-300 rounded-full h-2 ${loading ? 'cursor-default' : 'cursor-pointer hover:h-3'} transition-all`}
            onClick={loading ? undefined : handleSeek}
          >
            <div
              className="bg-green-500 h-full rounded-full transition-all duration-300 relative"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            >
              {!loading && (
                <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-green-600 rounded-full opacity-0 hover:opacity-100 transition-opacity"></div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleMute}
          className="p-1 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={isMuted ? "Unmute" : "Mute"}
          disabled={loading}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        <button
          onClick={handleDownload}
          className="p-1 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download audio"
          disabled={loading}
        >
          <Download size={16} />
        </button>

        {/* Hidden audio element - always present to load metadata */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onLoadedMetadata={() => {
              console.log('✅ Audio metadata loaded successfully');
              setDuration(audioRef.current?.duration || 0);
              setError(false);
              setLoading(false); // ✅ Stop loading when metadata is ready
            }}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
            onError={(e) => {
              console.error('❌ Audio load error:', e);
              setError(true);
              setLoading(false);
            }}
            preload="metadata"
          />
        )}
      </div>

      <MessageFooter
        timestamp={msg.timestamp}
        status={msg.status}
        isSent={msg.from !== selectedContact.phone_number}
      />
    </div>
  );
};

// ✅ ENHANCED: Document Message with Better Preview
const DocumentMessage = ({ msg, selectedContact }) => {
 const [isDownloading, setIsDownloading] = useState(false);

 const documentUrl = useMemo(() => {
   if (!msg.mediaUrl) return '';
   return getMediaUrl(msg.mediaUrl, msg.tenantId);
 }, [msg]);

 const getFileIcon = (filename) => {
   if (!filename) return <FileText size={24} className="text-gray-500" />;

   const ext = getFileExtension(filename);
   const iconClass = "text-white";

   switch (ext) {
     case 'pdf':
       return <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center text-xs font-bold text-white">PDF</div>;
     case 'doc':
     case 'docx':
       return <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-xs font-bold text-white">DOC</div>;
     case 'xls':
     case 'xlsx':
       return <div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center text-xs font-bold text-white">XLS</div>;
     case 'ppt':
     case 'pptx':
       return <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center text-xs font-bold text-white">PPT</div>;
     case 'txt':
       return <div className="w-6 h-6 bg-gray-500 rounded flex items-center justify-center text-xs font-bold text-white">TXT</div>;
     case 'zip':
     case 'rar':
       return <div className="w-6 h-6 bg-purple-500 rounded flex items-center justify-center text-xs font-bold text-white">ZIP</div>;
     default:
       return <FileText size={24} className="text-gray-500" />;
   }
 };

 const handleDownload = async (e) => {
   e.preventDefault();
   e.stopPropagation();

   if (!documentUrl) {
     toast.error('Document URL not available');
     return;
   }

   setIsDownloading(true);

   try {
     const response = await fetch(documentUrl);
     if (!response.ok) throw new Error(`Download failed: ${response.status}`);

     const blob = await response.blob();
     const url = window.URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.style.display = 'none';
     a.href = url;
     const filename = msg.text || documentUrl.split('/').pop() || 'document';
     a.download = filename;
     document.body.appendChild(a);
     a.click();
     window.URL.revokeObjectURL(url);
     document.body.removeChild(a);
     toast.success('Document downloaded successfully');
   } catch (err) {
     console.error('Download failed:', err);
     toast.error('Download failed');
     window.open(documentUrl, '_blank');
   } finally {
     setIsDownloading(false);
   }
 };

 const handlePreview = () => {
   if (documentUrl) {
     window.open(documentUrl, '_blank');
   }
 };

 const fileName = msg.text || msg.filename || "Document";
 const fileExt = getFileExtension(fileName);

 return (
   <>
     <div className="document-container bg-white border border-gray-200 rounded-lg overflow-hidden max-w-xs hover:shadow-md transition-shadow">
       {/* Document Header */}
       <div className="document-header p-3 bg-gray-50 border-b">
         <div className="flex items-center justify-between">
           <div className="flex items-center space-x-2">
             {getFileIcon(fileName)}
             <span className="text-xs font-medium text-gray-600 uppercase">{fileExt || 'FILE'}</span>
           </div>
           {msg.uploadProgress !== undefined && msg.uploadProgress < 100 && (
             <div className="text-xs text-blue-600">{msg.uploadProgress}%</div>
           )}
         </div>
       </div>

       {/* Document Info */}
       <div className="document-info p-3">
         <div className="document-name font-medium text-sm text-gray-800 mb-1 line-clamp-2">
           {fileName}
         </div>
         <div className="document-meta text-xs text-gray-500">
           {msg.fileSize ? formatFileSize(msg.fileSize) : 'Document'}
         </div>
       </div>

       {/* Document Actions */}
       <div className="document-actions p-3 bg-gray-50 border-t flex items-center justify-between">
         <button
           onClick={handlePreview}
           className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
           disabled={!documentUrl}
         >
           <ExternalLink size={16} />
           <span>Preview</span>
         </button>

         <button
           onClick={handleDownload}
           disabled={isDownloading || !documentUrl}
           className="flex items-center space-x-1 text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50"
         >
           {isDownloading ? <Loader className="animate-spin" size={16} /> : <Download size={16} />}
           <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
         </button>
       </div>
     </div>

     <MessageFooter
       timestamp={msg.timestamp}
       status={msg.status}
       isSent={msg.from !== selectedContact.phone_number}
     />
   </>
 );
};

// ✅ ENHANCED: Location Message Component
const LocationMessage = ({ msg, selectedContact }) => {
 const locationData = msg.metadata || {};
 const { latitude, longitude, name, address } = locationData;

 const handleViewOnMap = () => {
   if (latitude && longitude) {
     const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
     window.open(url, '_blank');
   }
 };

 const handleGetDirections = () => {
   if (latitude && longitude) {
     const url = `https://maps.google.com/maps?daddr=${latitude},${longitude}`;
     window.open(url, '_blank');
   }
 };

 const handleShareLocation = () => {
   if (navigator.share && latitude && longitude) {
     navigator.share({
       title: name || 'Shared Location',
       text: address || `Location: ${latitude}, ${longitude}`,
       url: `https://maps.google.com?q=${latitude},${longitude}`
     });
   } else {
     const url = `https://maps.google.com?q=${latitude},${longitude}`;
     navigator.clipboard.writeText(url);
     toast.success('Location URL copied to clipboard');
   }
 };

 return (
   <>
     <div className="location-container p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 max-w-xs">
       <div className="flex items-center mb-3">
         <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
           <MapPin size={18} className="text-white" />
         </div>
         <span className="font-semibold text-gray-800">Location Shared</span>
       </div>

       {latitude && longitude ? (
         <>
           {/* Location Details */}
           <div className="location-details mb-4">
             {name && (
               <div className="font-medium text-sm mb-1 text-gray-800">{name}</div>
             )}
             {address && (
               <div className="text-xs text-gray-600 mb-2">{address}</div>
             )}
             <div className="text-xs text-gray-500 font-mono bg-white p-2 rounded border">
               📍 {latitude.toFixed(6)}, {longitude.toFixed(6)}
             </div>
           </div>

           {/* Map Preview (Static) */}
           <div className="map-preview mb-3 rounded overflow-hidden">
             <img
               src={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s-l+000(${longitude},${latitude})/${longitude},${latitude},15/300x150?access_token=pk.your_token_here`}
               alt="Location preview"
               className="w-full h-24 object-cover bg-gray-200"
               onError={(e) => {
                 e.target.src = `https://via.placeholder.com/300x150/e5e7eb/6b7280?text=Map+Preview`;
               }}
             />
           </div>

           {/* Action buttons */}
           <div className="location-actions flex gap-2">
             <button
               onClick={handleViewOnMap}
               className="flex-1 px-3 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
             >
               <MapPin size={12} />
               View Map
             </button>
             <button
               onClick={handleGetDirections}
               className="flex-1 px-3 py-2 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-1"
             >
               <Navigation size={12} />
               Directions
             </button>
             <button
               onClick={handleShareLocation}
               className="px-3 py-2 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors flex items-center justify-center"
             >
               <Share size={12} />
             </button>
           </div>
         </>
       ) : (
         <div className="text-sm text-gray-500 text-center py-4">
           Location information not available
         </div>
       )}
     </div>

     <MessageFooter
       timestamp={msg.timestamp}
       status={msg.status}
       isSent={msg.from !== selectedContact.phone_number}
     />
   </>
 );
};

// ✅ ENHANCED: Contact Message Component
const ContactMessage = ({ msg, selectedContact }) => {
 const contactData = msg.contactData || {};
 const { name, phone, email, organization } = contactData;

 const handleAddContact = () => {
   // Create vCard format
   const vCard = `BEGIN:VCARD
VERSION:3.0
FN:${name || 'Unknown'}
TEL:${phone || ''}
EMAIL:${email || ''}
ORG:${organization || ''}
END:VCARD`;

   const blob = new Blob([vCard], { type: 'text/vcard' });
   const url = window.URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `${name || 'contact'}.vcf`;
   document.body.appendChild(a);
   a.click();
   window.URL.revokeObjectURL(url);
   document.body.removeChild(a);
   toast.success('Contact card downloaded');
 };

 const handleCallContact = () => {
   if (phone) {
     window.open(`tel:${phone}`, '_self');
   }
 };

 return (
   <>
     <div className="contact-container p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 max-w-xs">
       <div className="flex items-center mb-3">
         <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mr-3">
           <User size={24} className="text-white" />
         </div>
         <div>
           <div className="font-semibold text-gray-800">Contact Shared</div>
           <div className="text-xs text-gray-500">Tap to add to contacts</div>
         </div>
       </div>

       <div className="contact-details bg-white p-3 rounded border mb-3">
         {name && (
           <div className="font-medium text-lg mb-2 text-gray-800">{name}</div>
         )}
         {phone && (
           <div className="flex items-center text-sm text-gray-600 mb-1">
             <Phone size={14} className="mr-2" />
             {phone}
           </div>
         )}
         {email && (
           <div className="flex items-center text-sm text-gray-600 mb-1">
             <span className="mr-2">✉️</span>
             {email}
           </div>
         )}
         {organization && (
           <div className="flex items-center text-sm text-gray-600">
             <span className="mr-2">🏢</span>
             {organization}
           </div>
         )}
       </div>

       <div className="contact-actions flex gap-2">
         <button
           onClick={handleAddContact}
           className="flex-1 px-3 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
         >
           <Download size={12} />
           Add Contact
         </button>
         {phone && (
           <button
             onClick={handleCallContact}
             className="px-3 py-2 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors flex items-center justify-center"
           >
             <Phone size={12} />
           </button>
         )}
       </div>
     </div>

     <MessageFooter
       timestamp={msg.timestamp}
       status={msg.status}
       isSent={msg.from !== selectedContact.phone_number}
     />
   </>
 );
};

// ✅ ENHANCED: Sticker Message Component
const StickerMessage = ({ msg, selectedContact }) => {
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(false);

 const stickerUrl = useMemo(() => {
   if (!msg.mediaUrl) return '';
   return getMediaUrl(msg.mediaUrl, msg.tenantId);
 }, [msg]);

 return (
   <div className="sticker-message relative">
     {loading && !error && (
       <div className="loading-skeleton w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center">
         <Loader className="animate-spin h-6 w-6 text-green-500" />
       </div>
     )}

     {!error && stickerUrl && (
       <img
         src={stickerUrl}
         alt="Sticker"
         className="sticker-image max-w-32 max-h-32 object-contain hover:scale-105 transition-transform cursor-pointer"
         onLoad={() => setLoading(false)}
         onError={() => {
           console.error('❌ Sticker load failed:', stickerUrl);
           setError(true);
           setLoading(false);
         }}
       />
     )}

     {error && (
       <div className="error-container bg-red-50 p-3 rounded-lg text-center border border-red-200">
         <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-1" />
         <p className="text-red-600 font-medium mb-1 text-sm">Sticker unavailable</p>
         <p className="text-xs text-gray-500">Failed to load sticker</p>
       </div>
     )}

     <MessageFooter
       timestamp={msg.timestamp}
       status={msg.status}
       isSent={msg.from !== selectedContact.phone_number}
     />
   </div>
 );
};

// ✅ ENHANCED: Interactive Message Component
const InteractiveMessage = ({ msg, selectedContact, onButtonClick }) => {
 const interactiveData = msg.interactive || {};
 const { type, body, header, footer, action } = interactiveData;

 const handleButtonClick = (buttonId, buttonText) => {
   if (onButtonClick) {
     onButtonClick(buttonId, buttonText, msg);
   }
 };

 const handleListItemClick = (itemId, itemTitle) => {
   if (onButtonClick) {
     onButtonClick(itemId, itemTitle, msg);
   }
 };

 return (
   <>
     <div className="interactive-message p-4 bg-white rounded-lg border border-gray-200 shadow-sm max-w-sm">
       {/* Header */}
       {header && (
         <div className="interactive-header mb-3">
           {header.type === 'text' && (
             <div className="font-semibold text-gray-800 text-lg">{header.text}</div>
           )}
           {header.type === 'image' && header.image && (
             <img
               src={header.image.link || header.image.url}
               alt="Header"
               className="w-full h-32 object-cover rounded mb-2"
             />
           )}
         </div>
       )}

       {/* Body */}
       {body && (
         <div className="interactive-body mb-4">
           <p className="text-sm text-gray-700 leading-relaxed">{body.text}</p>
         </div>
       )}

       {/* Action Buttons/List */}
       {action && (
         <div className="interactive-action">
           {type === 'button' && action.buttons && (
             <div className="flex flex-col gap-2">
               {action.buttons.map((button, index) => (
                 <button
                   key={index}
                   onClick={() => handleButtonClick(button.reply?.id, button.reply?.title)}
                   className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium border border-blue-200 hover:border-blue-300"
                 >
                   {button.reply?.title || button.text}
                 </button>
               ))}
             </div>
           )}

           {type === 'list' && action.sections && (
             <div className="list-container">
               <div className="text-sm text-gray-600 mb-2 font-medium">
                 {action.button || 'Select an option'}
               </div>
               {action.sections.map((section, sectionIndex) => (
                 <div key={sectionIndex} className="section mb-2">
                   {section.title && (
                     <div className="section-title font-semibold text-sm text-gray-800 mb-1">
                       {section.title}
                     </div>
                   )}
                   <div className="section-rows border border-gray-200 rounded-lg overflow-hidden">
                     {section.rows?.map((row, rowIndex) => (
                       <button
                         key={rowIndex}
                         onClick={() => handleListItemClick(row.id, row.title)}
                         className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 border-b border-gray-200 last:border-b-0 transition-colors"
                       >
                         <div className="font-medium text-sm">{row.title}</div>
                         {row.description && (
                           <div className="text-xs text-gray-500 mt-1">{row.description}</div>
                         )}
                       </button>
                     ))}
                   </div>
                 </div>
               ))}
             </div>
           )}
         </div>
       )}

       {/* Footer */}
       {footer && (
         <div className="interactive-footer mt-3 pt-3 border-t border-gray-200">
           <div className="text-xs text-gray-500">{footer.text}</div>
         </div>
       )}
     </div>

     <MessageFooter
       timestamp={msg.timestamp}
       status={msg.status}
       isSent={msg.from !== selectedContact.phone_number}
     />
   </>
 );
};

// ✅ ENHANCED: Order Confirmation Message Component
const OrderConfirmationMessage = ({ msg, selectedContact }) => {
 const isSent = msg.from !== selectedContact.phone_number;
 const platform = msg.orderDetails?.platform || 'shopify';

 // Get tenant-specific branding
 const businessName = msg.orderDetails?.tenantInfo?.businessName || 'GoWhats Store';
 const logoUrl = msg.orderDetails?.tenantInfo?.logoUrl;

 // Extract parameters
 const params = msg.templateParams || [];
 const bodyParams = params.find(p => p.type === 'body')?.parameters || [];

 const customerName = bodyParams[0]?.text || msg.orderDetails?.customerName || 'Customer';
 const orderNumber = bodyParams[1]?.text || msg.orderDetails?.orderNumber || '#12345';
 const productsList = bodyParams[2]?.text || msg.orderDetails?.products || 'Products information not available';
 const totalAmount = bodyParams[3]?.text || msg.orderDetails?.total || '$0.00';

 return (
   <div className="order-confirmation-template">
     <div className="template-container bg-white p-4 rounded-lg shadow-sm border border-gray-200 max-w-sm">
       {/* Tenant header */}
       <div className="template-header flex items-center pb-3 border-b border-gray-200 mb-3">
         {logoUrl && (
           <img
             src={logoUrl}
             alt={businessName}
             className="w-8 h-8 rounded-full mr-3"
             onError={(e) => {
               e.target.style.display = 'none';
             }}
           />
         )}
         <div className="flex-1">
           <span className="font-semibold text-green-600">{businessName}</span>
           <div className="text-xs text-gray-500">Order Confirmation</div>
         </div>
         <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
           <CheckCircle size={16} className="text-green-600" />
         </div>
       </div>

       {/* Order details */}
       <div className="template-body mb-4">
         <p className="text-sm mb-3">Hi <strong>{customerName}</strong>,</p>
         <p className="text-sm mb-3 text-gray-700">Thanks for placing your order! Here are your order details:</p>

         <div className="bg-gray-50 p-3 rounded-lg mb-3">
           <div className="flex justify-between items-center mb-2">
             <span className="text-sm font-medium text-gray-600">Order ID:</span>
             <span className="text-sm font-mono font-semibold">{orderNumber}</span>
           </div>

           <div className="text-sm mb-3">
             <p className="font-medium mb-2 text-gray-600">Products:</p>
             <div className="bg-white p-2 rounded border text-xs font-mono whitespace-pre-wrap text-gray-700">
               {productsList}
             </div>
           </div>

           <div className="flex justify-between items-center pt-2 border-t border-gray-200">
             <span className="text-sm font-medium text-gray-600">Total Amount:</span>
             <span className="text-lg font-bold text-green-600">{totalAmount}</span>
           </div>
         </div>

         <p className="text-sm text-gray-700 mb-3">You'll get updates on your order soon 👍</p>

         <div className="flex items-center justify-between">
           <span className="text-sm font-medium text-gray-600">Status:</span>
           <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
             (msg.orderDetails?.status?.toLowerCase() === 'delivered' ||
              msg.orderDetails?.status?.toLowerCase() === 'completed')
               ? 'bg-green-100 text-green-800'
               : msg.orderDetails?.status?.toLowerCase() === 'shipped'
               ? 'bg-blue-100 text-blue-800'
               : 'bg-yellow-100 text-yellow-800'
           }`}>
             {msg.orderDetails?.status || 'Processing'}
           </span>
         </div>
       </div>

       {/* Footer */}
       <div className="template-footer pt-3 border-t border-gray-200 text-xs text-gray-500 text-center">
         Powered by GoWhats
       </div>
     </div>

     <MessageFooter
       timestamp={msg.timestamp}
       status={msg.status}
       isSent={isSent}
     />
   </div>
 );
};

// ✅ Create a MediaComponents object with all exports
const MediaComponents = {
 ImageMessage,
 VideoMessage,
 DocumentMessage,
 AudioMessage,
 LocationMessage,
 ContactMessage,
 StickerMessage,
 InteractiveMessage,
 MediaCaptionModal,
 MessageFooter,
 OrderConfirmationMessage,
 formatDuration,
 getMediaUrl,
 formatFileSize,
 isFilename,
 getFileExtension
};

export default MediaComponents;
