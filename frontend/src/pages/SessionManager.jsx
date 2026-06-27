import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Trash2,
  Search,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { apiGet, apiDelete, apiPost } from '../api';

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function SessionRow({ session, selected, onSelect, onDelete, onExpand, expanded, deleting }) {
  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
          <button
            onClick={() => onSelect(session.id)}
            className="text-gray-500 hover:text-gray-300 shrink-0"
          >
            {selected ? (
              <CheckSquare size={16} className="text-brand-400" />
            ) : (
              <Square size={16} />
            )}
          </button>
          <button
            onClick={() => onExpand(session.id)}
            className="text-gray-500 hover:text-gray-300 shrink-0"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-gray-300">
                {session.id ? session.id.substring(0, 16) + '...' : 'Unknown'}
              </span>
              {session.message_count != null && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 text-gray-400">
                  {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              {session.created && <span>Created: {formatDate(session.created)}</span>}
              {session.last_active && <span>Active: {formatDate(session.last_active)}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={() => onDelete(session.id)}
          disabled={deleting}
          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors shrink-0"
          title="Delete session"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      {/* Expanded Message History */}
      {expanded && (
        <div className="px-4 pb-3 pl-16">
          {session.messages && session.messages.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {session.messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-2 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-gray-800 border border-gray-700 text-gray-300'
                      : msg.role === 'assistant'
                      ? 'bg-brand-600/10 border border-brand-600/20 text-gray-300'
                      : 'bg-gray-800/50 border border-gray-700/50 text-gray-400'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 block mb-0.5">
                    {msg.role || 'system'}
                  </span>
                  <p className="whitespace-pre-wrap break-words text-xs">
                    {typeof msg.content === 'string'
                      ? msg.content.substring(0, 500)
                      : JSON.stringify(msg.content).substring(0, 500)}
                    {(typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length) > 500 && '...'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              No message history available (expand may require fetching session details)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const { data: sessionsData, isLoading, error, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiGet('/sessions'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiDelete(`/sessions/${encodeURIComponent(id)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setDeletingId(null);
      setFeedback({ type: 'success', message: 'Session deleted' });
    },
    onError: (err) => {
      setDeletingId(null);
      setFeedback({ type: 'error', message: err.message });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => apiPost('/sessions/bulk-delete', { session_ids: Array.from(ids) }),
    onSuccess: (_data, ids) => {
      const count = ids.size;
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setSelectedIds(new Set());
      setFeedback({ type: 'success', message: `${count} sessions deleted` });
    },
    onError: (err) => {
      setFeedback({ type: 'error', message: err.message });
    },
  });

  const sessions = sessionsData?.sessions || [];

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.id || '').toLowerCase().includes(q)
    );
  }, [sessions, search]);

  function handleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map((s) => s.id)));
    }
  }

  function handleDelete(id) {
    setDeletingId(id);
    deleteMutation.mutate(id);
  }

  function handleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-500" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400 font-medium">Failed to load sessions</p>
        <p className="text-red-400/70 text-sm mt-1">{error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Session Manager</h2>
          <p className="text-sm text-gray-500 mt-1">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <button
              onClick={() => bulkDeleteMutation.mutate(selectedIds)}
              disabled={bulkDeleteMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 font-medium rounded-lg text-sm transition-colors"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              <span>Delete {selectedIds.size} selected</span>
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-sm transition-colors"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 px-3 py-2.5 mb-4 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Search & Select All */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by session ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
          />
        </div>
        {filteredSessions.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-sm transition-colors shrink-0"
          >
            {selectedIds.size === filteredSessions.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {/* Session List */}
      {filteredSessions.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <MessageSquare size={32} className="mx-auto mb-3 text-gray-600 opacity-50" />
          <p className="text-gray-500">
            {search ? 'No sessions match your search' : 'No sessions found'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          {filteredSessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              selected={selectedIds.has(session.id)}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onExpand={handleExpand}
              expanded={expandedId === session.id}
              deleting={deletingId === session.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
