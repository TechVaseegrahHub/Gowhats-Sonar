/**
 * components/BotToggle.jsx
 * AI Chatbot on/off toggle with integrated agent key management.
 */

import React, { useState, useEffect } from 'react';
import { publicApi } from '../utils/axios.js';
import toast from 'react-hot-toast';
import AgentKeySetup from './AgentKeySetup.jsx';
import {
  Brain,
  AlertCircle,
  MessageSquare,
  CheckCircle,
  Loader2,
  Zap,
  WifiOff
} from 'lucide-react';

const BotToggle = () => {
  const [botStatus, setBotStatus]               = useState('offline');
  const [welcomeStatus, setWelcomeStatus]       = useState(false);
  const [loading, setLoading]                   = useState(false);
  const [hasKnowledgeBase, setHasKnowledgeBase] = useState(false);
  const [hasAgentKey, setHasAgentKey]           = useState(false);
  const [keyPrefix, setKeyPrefix]               = useState(null);
  const [knowledgeBaseStats, setKnowledgeBaseStats] = useState({});
  const [initialLoading, setInitialLoading]     = useState(true);

  useEffect(() => { loadBotData(); }, []);

  const getToken = () => localStorage.getItem('token');

  const loadBotData = async () => {
    await Promise.all([
      fetchBotStatus(),
      fetchWelcomeStatus(),
      checkKnowledgeBase(),
      fetchKeyStatus()
    ]);
  };

  const fetchBotStatus = async () => {
    try {
      const response = await publicApi.get('/api/bot/status', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setBotStatus(response.data?.bot?.status || 'offline');
    } catch {
      setBotStatus('offline');
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchWelcomeStatus = async () => {
    try {
      const response = await publicApi.get('/api/welcome-message', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setWelcomeStatus(response.data?.isActive || false);
    } catch {
      setWelcomeStatus(false);
    }
  };

  const checkKnowledgeBase = async () => {
    try {
      const response = await publicApi.get('/api/bot/knowledge-base-status', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const hasKB = response.data?.hasKnowledgeBase || false;
      setHasKnowledgeBase(hasKB);
      if (hasKB) {
        setKnowledgeBaseStats({
          chunksCount: response.data.chunksCount || 0,
          fileName: response.data.fileName || 'Unknown',
          websiteUrl: response.data.websiteUrl || null
        });
      }
    } catch {
      setHasKnowledgeBase(false);
    }
  };

  const fetchKeyStatus = async () => {
    try {
      const response = await publicApi.get('/api/bot/agent-key-status', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setHasAgentKey(response.data?.hasAgentKey || false);
      setKeyPrefix(response.data?.keyPrefix || null);
    } catch {
      setHasAgentKey(false);
    }
  };

  const toggleBot = async () => {
    if (!hasKnowledgeBase) {
      toast.error('Please upload a knowledge base file first');
      return;
    }
    if (!hasAgentKey) {
      toast.error('Please configure the agent key first');
      return;
    }

    setLoading(true);
    try {
      const newStatus = botStatus === 'online' ? 'offline' : 'online';
      const response = await publicApi.post('/api/bot/toggle',
        { status: newStatus },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );

      if (response.data?.success) {
        setBotStatus(newStatus);
        toast.success(newStatus === 'online' ? '🤖 AI Bot is now ONLINE' : 'AI Bot turned OFF');
        if (newStatus === 'online' && knowledgeBaseStats.chunksCount > 0) {
          setTimeout(() => {
            toast.success(`Ready with ${knowledgeBaseStats.chunksCount} knowledge chunks`, { duration: 3000 });
          }, 800);
        }
        setTimeout(fetchBotStatus, 500);
      } else {
        throw new Error(response.data?.message || 'Toggle failed');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to toggle AI bot');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="animate-pulse flex items-center space-x-3 p-4">
        <div className="w-10 h-10 bg-gray-200 rounded-full" />
        <div className="space-y-2">
          <div className="w-32 h-3 bg-gray-200 rounded" />
          <div className="w-20 h-3 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const isOnline = botStatus === 'online';
  const isReady  = isOnline && hasKnowledgeBase && hasAgentKey;
  const canToggle = hasKnowledgeBase && hasAgentKey && !loading;

  const getSystemStatus = () => {
    if (isReady)           return { label: 'Ready',       color: 'green' };
    if (!hasKnowledgeBase) return { label: 'No KB',       color: 'red'   };
    if (!hasAgentKey)      return { label: 'Key Missing', color: 'red'   };
    if (isOnline)          return { label: 'Online',      color: 'green' };
    return                        { label: 'Offline',     color: 'gray'  };
  };

  const systemStatus = getSystemStatus();

  const colorMap = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red:   'bg-red-50 text-red-700 border-red-200',
    gray:  'bg-gray-50 text-gray-600 border-gray-200',
  };
  const dotMap = {
    green: 'bg-green-500',
    red:   'bg-red-500',
    gray:  'bg-gray-400',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* ── Header with toggle ── */}
      <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isReady
                ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                : 'bg-gray-200'
            }`}>
              <Brain className={`w-5 h-5 ${isReady ? 'text-white' : 'text-gray-400'}`} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">AI Chatbot</h3>
              <p className="text-xs text-gray-500">
                {isReady
                  ? 'Responding to WhatsApp messages'
                  : isOnline
                    ? 'Online but not fully configured'
                    : 'Not responding to messages'}
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <button
            onClick={toggleBot}
            disabled={!canToggle}
            className={`relative inline-flex items-center h-8 rounded-full w-14 transition-all duration-300 focus:outline-none shadow-md ${
              isOnline
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                : canToggle
                  ? 'bg-gray-300 hover:bg-gray-400'
                  : 'bg-gray-200 cursor-not-allowed opacity-60'
            }`}
            title={
              !hasKnowledgeBase ? 'Upload a knowledge base first'
              : !hasAgentKey    ? 'Configure agent key first'
              : isOnline        ? 'Turn OFF AI bot'
              :                   'Turn ON AI bot'
            }
          >
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              </div>
            ) : (
              <span className={`inline-block w-6 h-6 transform rounded-full bg-white shadow transition-transform duration-300 ${
                isOnline ? 'translate-x-7' : 'translate-x-1'
              }`} />
            )}
          </button>
        </div>
      </div>

      {/* ── Status badges ── */}
      <div className="px-6 py-3 flex items-center flex-wrap gap-2 border-b border-gray-100">
        <span className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colorMap[systemStatus.color]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotMap[systemStatus.color]}`} />
          <span>{systemStatus.label}</span>
        </span>

        <span className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
          welcomeStatus ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'
        }`}>
          <MessageSquare className="w-3 h-3" />
          <span>Welcome {welcomeStatus ? 'On' : 'Off'}</span>
        </span>

        {hasKnowledgeBase ? (
          <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle className="w-3 h-3" />
            <span>
              {knowledgeBaseStats.fileName || 'KB loaded'}
              {knowledgeBaseStats.chunksCount > 0 && ` · ${knowledgeBaseStats.chunksCount} chunks`}
            </span>
          </span>
        ) : (
          <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="w-3 h-3" />
            <span>No knowledge base</span>
          </span>
        )}
      </div>

      {/* ── No KB warning ── */}
      {!hasKnowledgeBase && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>Upload a knowledge base file above to enable the AI bot.</span>
          </p>
        </div>
      )}

      {/* ── Agent Key Section ── */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          Agent API Key
        </h4>
        <AgentKeySetup
          hasAgentKey={hasAgentKey}
          keyPrefix={keyPrefix}
          onRefresh={loadBotData}
        />
      </div>

      {/* ── Footer ── */}
      <div className="px-6 py-3">
        <p className="text-xs text-gray-400">
          {isReady
            ? '✅ Bot is live — customers will get AI replies on WhatsApp'
            : !hasKnowledgeBase
              ? '⚠️ Upload a knowledge base file to get started'
              : !hasAgentKey
                ? '⚠️ Configure the agent key above to activate the bot'
                : '⚠️ Turn ON the toggle above to start responding'}
        </p>
      </div>
    </div>
  );
};

export default BotToggle;
