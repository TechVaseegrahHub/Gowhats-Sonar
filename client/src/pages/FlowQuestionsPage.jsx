import React, { useState, useEffect } from 'react';
import { MessageSquare, User, Search, Download, Trash2, RefreshCw, Filter } from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';

const SPEAKERS = [
  { id: 'all', label: 'All Speakers' },
  { id: 'vijaya', label: 'Vijaya Mahadevan' },
  { id: 'sudhan', label: 'Sudhan P' },
  { id: 'habib', label: 'Habib' },
  { id: 'srikanth', label: 'Srikanth' },
  { id: 'rithik', label: 'Rithik Pandian' },
  { id: 'naresh', label: 'Naresh' },
  { id: 'sree', label: 'Sree Karthikeyan' },
];

const SPEAKER_COLORS = {
  vijaya: 'bg-purple-100 text-purple-700 border-purple-200',
  sudhan: 'bg-blue-100 text-blue-700 border-blue-200',
  habib: 'bg-green-100 text-green-700 border-green-200',
  srikanth: 'bg-orange-100 text-orange-700 border-orange-200',
  rithik: 'bg-pink-100 text-pink-700 border-pink-200',
  naresh: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  sree: 'bg-teal-100 text-teal-700 border-teal-200',
};

export default function FlowQuestionsPage() {
  const [submissions, setSubmissions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ limit: 200 });
      if (selectedSpeaker !== 'all') params.append('speaker', selectedSpeaker);

      const res = await fetch(`https://bot.gowhats.in/api/flow-submissions?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.submissions);
        setSummary(data.summary);
      }
    } catch (e) {
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubmissions(); }, [selectedSpeaker]);

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`https://bot.gowhats.in/api/flow-submissions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Deleted');
        setSubmissions(prev => prev.filter(s => s._id !== id));
      }
    } catch (e) {
      toast.error('Delete failed');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleExportCSV = () => {
    const rows = [['Speaker', 'Question', 'Submitted At']];
    filtered.forEach(s => {
      const speakerLabel = SPEAKERS.find(sp => sp.id === s.speaker)?.label || s.speaker;
      rows.push([speakerLabel, `"${s.question}"`, dayjs(s.submittedAt).format('YYYY-MM-DD HH:mm')]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital_sakthi_questions_${dayjs().format('YYYYMMDD')}.csv`;
    a.click();
    toast.success('Exported!');
  };

  const filtered = submissions.filter(s =>
    s.question?.toLowerCase().includes(search.toLowerCase()) ||
    s.speaker?.toLowerCase().includes(search.toLowerCase())
  );

  const getSpeakerLabel = (id) => SPEAKERS.find(s => s.id === id)?.label || id;
  const getSpeakerColor = (id) => SPEAKER_COLORS[id] || 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-green-50/20 min-h-screen font-sans">

      {/* Header */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border-2 border-gray-100 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-green-600" />
              Speaker Questions
            </h1>
            <p className="text-sm text-gray-500 mt-1">Digital Sakthi Event — Questions submitted by attendees</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={fetchSubmissions}
              className="p-2.5 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-gray-600"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-all shadow-lg shadow-green-200"
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 border-2 border-gray-100 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-xs font-bold text-gray-500 uppercase">Total Questions</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{submissions.length}</p>
        </div>
        {summary.slice(0, 3).map(s => (
          <div key={s._id} className="bg-white rounded-xl p-4 border-2 border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase truncate">{getSpeakerLabel(s._id)}</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border-2 border-gray-100 shadow-sm mb-4 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="w-full pl-9 pr-4 py-2 border-2 border-gray-200 rounded-lg text-sm outline-none focus:border-green-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400 flex-shrink-0" />
          <select
            value={selectedSpeaker}
            onChange={e => setSelectedSpeaker(e.target.value)}
            className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm font-medium outline-none focus:border-green-500 bg-white"
          >
            {SPEAKERS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl p-12 text-center border-2 border-gray-100">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-green-200 border-t-green-500 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Loading questions...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border-2 border-gray-100">
            <MessageSquare size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold">No questions yet</p>
            <p className="text-gray-400 text-sm mt-1">Questions submitted via WhatsApp Flow will appear here</p>
          </div>
        ) : (
          filtered.map((s, i) => (
            <div key={s._id} className="bg-white rounded-xl p-4 sm:p-5 border-2 border-gray-100 shadow-sm hover:border-green-200 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-green-700">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${getSpeakerColor(s.speaker)}`}>
                        <User size={11} />
                        {getSpeakerLabel(s.speaker)}
                      </span>
                      <span className="text-xs text-gray-400 font-medium">
                        {dayjs(s.submittedAt).format('MMM D, YYYY • h:mm A')}
                      </span>
                    </div>
                    <p className="text-gray-800 text-sm sm:text-base font-medium leading-relaxed">{s.question}</p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteConfirm(s._id)}
                  className="p-2 border-2 border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all text-gray-400 hover:text-red-600 flex-shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Question?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
