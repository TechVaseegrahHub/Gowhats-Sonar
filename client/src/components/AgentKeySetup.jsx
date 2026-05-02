import React, { useState } from 'react';
import { publicApi } from '../utils/axios.js';
import toast from 'react-hot-toast';
import {
  Key,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  ClipboardPaste,
  Eye,
  EyeOff,
  RotateCcw
} from 'lucide-react';
 
const AgentKeySetup = ({ hasAgentKey, keyPrefix, onRefresh }) => {
  const [mode, setMode] = useState('idle'); // idle | paste | provisioning | testing
  const [pasteValue, setPasteValue] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [testResult, setTestResult] = useState(null);
 
  const getToken = () => localStorage.getItem('token');
 
  const provisionKey = async () => {
    setMode('provisioning');
    setTestResult(null);
    try {
      const res = await publicApi.post('/api/bot/provision-agent-key', {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data?.success) {
        toast.success(`✅ Agent key created! (${res.data.keyPrefix})`);
        onRefresh?.();
      } else {
        toast.error(res.data?.message || 'Provision failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Provision failed — check server logs');
    } finally {
      setMode('idle');
    }
  };
 
  const saveManualKey = async () => {
    if (!pasteValue.trim()) return;
    if (!pasteValue.startsWith('ywk_live_')) {
      toast.error('Key must start with ywk_live_');
      return;
    }
    setMode('provisioning');
    try {
      const res = await publicApi.post('/api/bot/set-agent-key',
        { apiKey: pasteValue.trim() },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      if (res.data?.success) {
        toast.success('✅ Key saved!');
        setPasteValue('');
        setMode('idle');
        onRefresh?.();
      } else {
        toast.error(res.data?.message || 'Save failed');
        setMode('paste');
      }
    } catch (err) {
      toast.error('Save failed');
      setMode('paste');
    }
  };
 
  const testKey = async () => {
    setMode('testing');
    setTestResult(null);
    try {
      const res = await publicApi.post('/api/bot/test-agent-key', {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setTestResult({
        ok: res.data?.success,
        message: res.data?.message,
        preview: res.data?.preview,
        time: res.data?.responseTime
      });
    } catch (err) {
      setTestResult({ ok: false, message: 'Test failed — agent unreachable' });
    } finally {
      setMode('idle');
    }
  };
 
  const clearKey = async () => {
    if (!window.confirm('Clear the agent key? Bot will stop responding.')) return;
    try {
      await publicApi.delete('/api/bot/agent-key', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      toast.success('Key cleared');
      setTestResult(null);
      onRefresh?.();
    } catch {
      toast.error('Failed to clear key');
    }
  };
 
  const isBusy = mode === 'provisioning' || mode === 'testing';
 
  return (
    <div className="space-y-3">
 
      {/* Status row */}
      <div className={`flex items-center justify-between p-3 rounded-xl border-2 ${
        hasAgentKey
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center space-x-2.5">
          {hasAgentKey
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          }
          <div>
            <p className={`text-sm font-bold ${hasAgentKey ? 'text-emerald-900' : 'text-red-900'}`}>
              {hasAgentKey ? 'Agent Key Active' : 'No Agent Key'}
            </p>
            {keyPrefix && (
              <p className="text-xs font-mono text-emerald-700 mt-0.5">{keyPrefix}</p>
            )}
          </div>
        </div>
 
        {/* Action buttons on right */}
        <div className="flex items-center space-x-2">
          {hasAgentKey && (
            <>
              <button
                onClick={testKey}
                disabled={isBusy}
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {mode === 'testing'
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Zap className="w-3 h-3" />
                }
                <span>{mode === 'testing' ? 'Testing...' : 'Test'}</span>
              </button>
              <button
                onClick={clearKey}
                disabled={isBusy}
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Clear key"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
 
      {/* Test result */}
      {testResult && (
        <div className={`p-3 rounded-lg text-xs border ${
          testResult.ok
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <p className="font-semibold">{testResult.ok ? '✅' : '❌'} {testResult.message}</p>
          {testResult.preview && (
            <p className="mt-1 text-gray-600 italic">"{testResult.preview}"</p>
          )}
        </div>
      )}
 
      {/* Action buttons when no key */}
      {!hasAgentKey && mode !== 'paste' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={provisionKey}
            disabled={isBusy}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5
                       bg-gradient-to-r from-violet-600 to-purple-600 text-white
                       rounded-xl text-xs font-semibold hover:from-violet-700 hover:to-purple-700
                       transition-all disabled:opacity-50 shadow-sm"
          >
            {mode === 'provisioning'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Plus className="w-3.5 h-3.5" />
            }
            <span>{mode === 'provisioning' ? 'Creating...' : 'Auto-Provision'}</span>
          </button>
 
          <button
            onClick={() => setMode('paste')}
            disabled={isBusy}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5
                       border-2 border-gray-300 text-gray-700 rounded-xl text-xs font-semibold
                       hover:border-gray-400 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste Key</span>
          </button>
        </div>
      )}
 
      {/* Re-provision when key exists */}
      {hasAgentKey && mode !== 'paste' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode('paste')}
            disabled={isBusy}
            className="flex items-center justify-center space-x-1.5 px-3 py-2
                       border-2 border-gray-200 text-gray-600 rounded-xl text-xs font-semibold
                       hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Replace Key</span>
          </button>
          <button
            onClick={provisionKey}
            disabled={isBusy}
            className="flex items-center justify-center space-x-1.5 px-3 py-2
                       border-2 border-violet-200 text-violet-700 rounded-xl text-xs font-semibold
                       hover:border-violet-300 hover:bg-violet-50 transition-all disabled:opacity-50"
          >
            {mode === 'provisioning'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5" />
            }
            <span>{mode === 'provisioning' ? 'Creating...' : 'New Key'}</span>
          </button>
        </div>
      )}
 
      {/* Paste mode */}
      {mode === 'paste' && (
        <div className="space-y-2 p-3 bg-gray-50 border-2 border-gray-200 rounded-xl">
          <p className="text-xs font-semibold text-gray-700">
            Paste a key from{' '}
            <a
              href="http://43.204.148.39:8000/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              YoWhats Dashboard → Client Keys
            </a>
          </p>
          <div className="relative">
            <input
              type={showPaste ? 'text' : 'password'}
              value={pasteValue}
              onChange={e => setPasteValue(e.target.value)}
              placeholder="ywk_live_c..."
              className="w-full px-3 py-2 pr-10 border-2 border-gray-200 rounded-lg text-xs font-mono
                         focus:outline-none focus:border-violet-400 bg-white"
              autoFocus
            />
            <button
              onClick={() => setShowPaste(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPaste ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={saveManualKey}
              disabled={!pasteValue.trim() || isBusy}
              className="flex-1 flex items-center justify-center space-x-1 px-3 py-2
                         bg-violet-600 text-white rounded-lg text-xs font-semibold
                         hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
              <span>{isBusy ? 'Saving...' : 'Save Key'}</span>
            </button>
            <button
              onClick={() => { setMode('idle'); setPasteValue(''); }}
              className="px-3 py-2 border-2 border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
 
export default AgentKeySetup;
