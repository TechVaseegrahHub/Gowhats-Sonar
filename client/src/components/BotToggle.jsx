// components/BotToggle.jsx - FIXED VERSION
import React, { useState, useEffect } from 'react';
import { publicApi } from '../utils/axios.js';
import toast from 'react-hot-toast';
import { Brain, AlertCircle, MessageSquare, CheckCircle } from 'lucide-react';

const BotToggle = () => {
  const [botStatus, setBotStatus] = useState('offline');
  const [welcomeStatus, setWelcomeStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasKnowledgeBase, setHasKnowledgeBase] = useState(false);
  const [knowledgeBaseStats, setKnowledgeBaseStats] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    loadBotData();
  }, []);

  const loadBotData = async () => {
    await Promise.all([
      fetchBotStatus(),
      fetchWelcomeStatus(),
      checkKnowledgeBase()
    ]);
  };

  const fetchBotStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setBotStatus('offline');
        return;
      }

      const response = await publicApi.get('/api/bot/status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Bot status response:', response.data);

      if (response.data?.bot?.status) {
        setBotStatus(response.data.bot.status);
      } else {
        setBotStatus('offline');
      }

    } catch (error) {
      console.error('Error fetching bot status:', error);
      setBotStatus('offline');
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchWelcomeStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await publicApi.get('/api/welcome-message', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWelcomeStatus(response.data?.isActive || false);
    } catch (error) {
      console.error('Error fetching welcome status:', error);
      setWelcomeStatus(false);
    }
  };

  const checkKnowledgeBase = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await publicApi.get('/api/bot/knowledge-base-status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Knowledge base response:', response.data);

      const hasKB = response.data?.hasKnowledgeBase || false;
      setHasKnowledgeBase(hasKB);
      
      if (hasKB) {
        setKnowledgeBaseStats({
          chunksCount: response.data.chunksCount || 0,
          embeddingsCount: response.data.embeddingsCount || 0,
          fileName: response.data.fileName || 'Unknown'
        });
      } else {
        setKnowledgeBaseStats({});
      }

    } catch (error) {
      console.error('Error checking knowledge base:', error);
      setHasKnowledgeBase(false);
      setKnowledgeBaseStats({});
    }
  };

  const toggleBot = async () => {
    if (!hasKnowledgeBase) {
      toast.error('Please upload a knowledge base file first in the AI Assistant settings');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const newStatus = botStatus === 'online' ? 'offline' : 'online';

      const response = await publicApi.post('/api/bot/toggle', {
        status: newStatus
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data?.success) {
        setBotStatus(newStatus);
        toast.success(`🤖 AI Assistant ${newStatus === 'online' ? 'enabled' : 'disabled'} successfully`);
        
        // Show additional info when turning on
        if (newStatus === 'online' && knowledgeBaseStats.chunksCount) {
          setTimeout(() => {
            toast.success(`AI ready with ${knowledgeBaseStats.chunksCount} knowledge chunks`, {
              duration: 3000
            });
          }, 1000);
        }
      } else {
        throw new Error(response.data?.message || 'Failed to toggle bot');
      }

    } catch (error) {
      console.error('Error toggling bot:', error);
      const errorMsg = error.response?.data?.message || 'Failed to toggle AI assistant';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const testBot = async () => {
    if (botStatus !== 'online') {
      toast.error('Please turn on the AI Assistant first');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await publicApi.post('/api/bot/test', {
        query: 'What products do you have?'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data?.test?.response) {
        toast.success('✅ AI Assistant is working correctly!');
        console.log('Test response:', response.data.test.response);
      } else {
        toast.error('❌ AI Assistant test failed');
      }

    } catch (error) {
      console.error('Bot test error:', error);
      toast.error('Failed to test AI assistant');
    }
  };

  if (initialLoading) {
    return (
      <div className="animate-pulse flex items-center space-x-2">
        <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
        <div className="w-16 h-4 bg-gray-200 rounded"></div>
      </div>
    );
  }

  const bothOff = botStatus === 'offline' && !welcomeStatus;
  const bothOn = botStatus === 'online' && welcomeStatus;
  const isReady = botStatus === 'online' && hasKnowledgeBase;

  return (
    <div className="flex items-center space-x-4">
      {/* System Status */}
      <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all duration-300 ${
        bothOff
          ? 'bg-red-50 text-red-700 border-red-200'
          : bothOn && hasKnowledgeBase
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          bothOff ? 'bg-red-500' : bothOn && hasKnowledgeBase ? 'bg-green-500' : 'bg-yellow-500'
        }`} />
        <span>
          {bothOff ? 'All Off' : bothOn && hasKnowledgeBase ? 'Ready' : 'Partial'}
        </span>
      </div>

      {/* Welcome Status */}
      <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
        welcomeStatus
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-gray-50 text-gray-600 border-gray-200'
      }`}>
        <MessageSquare className={`w-4 h-4 ${welcomeStatus ? 'text-blue-600' : 'text-gray-500'}`} />
        <span>Welcome: {welcomeStatus ? 'On' : 'Off'}</span>
      </div>

      {/* AI Chatbot Status with Knowledge Base Info */}
      <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
        isReady
          ? 'bg-green-50 text-green-700 border-green-200'
          : botStatus === 'online'
            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
            : hasKnowledgeBase
              ? 'bg-gray-50 text-gray-600 border-gray-200'
              : 'bg-red-50 text-red-700 border-red-200'
      }`}>
        <Brain className={`w-4 h-4 ${
          isReady ? 'text-green-600' : 
          botStatus === 'online' ? 'text-yellow-600' : 
          hasKnowledgeBase ? 'text-gray-500' : 'text-red-600'
        }`} />
        <span>AI: {botStatus === 'online' ? 'Online' : 'Offline'}</span>
        {hasKnowledgeBase && knowledgeBaseStats.chunksCount && (
          <span className="text-xs opacity-75">
            ({knowledgeBaseStats.chunksCount} chunks)
          </span>
        )}
      </div>

      {/* Toggle Switch */}
      <button
        onClick={toggleBot}
        disabled={loading || !hasKnowledgeBase}
        className={`relative inline-flex items-center h-7 rounded-full w-12 transition-all duration-300 focus:outline-none shadow-lg ${
          botStatus === 'online'
            ? 'bg-gradient-to-r from-green-500 to-green-600'
            : hasKnowledgeBase
              ? 'bg-gray-300 hover:bg-gray-400'
              : 'bg-red-200 cursor-not-allowed opacity-50'
        }`}
        title={hasKnowledgeBase ? 'Toggle AI Assistant' : 'Upload knowledge base first'}
      >
        <span
          className={`inline-block w-5 h-5 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
            botStatus === 'online' ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          </div>
        )}
      </button>

      {/* Test Button */}
      {botStatus === 'online' && hasKnowledgeBase && (
        <button
          onClick={testBot}
          className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          title="Test AI Assistant"
        >
          Test AI
        </button>
      )}

      {/* Status Indicators */}
      {!hasKnowledgeBase && (
        <div className="flex items-center space-x-1 text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs">No Knowledge Base</span>
        </div>
      )}

      {hasKnowledgeBase && knowledgeBaseStats.embeddingsCount && (
        <div className="flex items-center space-x-1 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-xs">{knowledgeBaseStats.embeddingsCount} embeddings</span>
        </div>
      )}
    </div>
  );
};

export default BotToggle;
