import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Plus, Trash2, Play, Pause, RotateCw, Loader2, RefreshCw,
  CheckCircle2, XCircle, ChevronDown, ChevronRight, X,
} from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';

const inputClass =
  'w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors font-mono text-sm';

function JobRow({ job, onTrigger, onPause, onResume, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isPaused = job.state === 'paused';

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300 shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            isPaused ? 'bg-amber-500' : job.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-200">{job.name}</span>
              <code className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 text-brand-400">{job.schedule}</code>
              {isPaused && <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-600/20 text-amber-400 border border-amber-600/30">paused</span>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{job.prompt}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onTrigger(job.id)} className="p-1.5 text-gray-500 hover:text-brand-400 transition-colors" title="Trigger now">
            <Play size={14} />
          </button>
          {isPaused ? (
            <button onClick={() => onResume(job.id)} className="p-1.5 text-amber-400 hover:text-emerald-400 transition-colors" title="Resume">
              <RotateCw size={14} />
            </button>
          ) : (
            <button onClick={() => onPause(job.id)} className="p-1.5 text-gray-500 hover:text-amber-400 transition-colors" title="Pause">
              <Pause size={14} />
            </button>
          )}
          <button onClick={() => onDelete(job.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 pl-12 space-y-1 text-xs text-gray-400">
          <p><span className="text-gray-500">Next run:</span> {job.next_run ? new Date(job.next_run).toLocaleString() : 'N/A'}</p>
          <p><span className="text-gray-500">State:</span> {job.state || 'scheduled'}</p>
          <p><span className="text-gray-500">Prompt:</span></p>
          <pre className="bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap text-gray-300">{job.prompt}</pre>
        </div>
      )}
    </div>
  );
}

function CreateJobModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [prompt, setPrompt] = useState('');
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-gray-100">Create Cron Job</h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="daily-report" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Schedule (cron)</label>
            <input value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="0 9 * * 1-5" className={inputClass} />
            <p className="text-xs text-gray-600 mt-1">Format: minute hour day month weekday</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="Generate a daily status report..." className={inputClass + ' resize-none'} />
          </div>
          <button
            onClick={() => { onCreate({ name, schedule, prompt, enabled }); onClose(); }}
            disabled={!name || !schedule || !prompt}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          >
            <Plus size={16} /> Create Job
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CronManager() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cron-jobs'],
    queryFn: () => apiGet('/cron/jobs'),
  });

  const createMut = useMutation({
    mutationFn: (job) => apiPost('/cron/jobs', job),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cron-jobs'] }); setFeedback({ type: 'success', message: 'Job created' }); },
    onError: (err) => setFeedback({ type: 'error', message: err.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => apiDelete(`/cron/jobs/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cron-jobs'] }); setFeedback({ type: 'success', message: 'Job deleted' }); },
  });

  const triggerMut = useMutation({
    mutationFn: (id) => apiPost(`/cron/jobs/${id}/trigger`),
    onSuccess: () => setFeedback({ type: 'success', message: 'Job triggered' }),
  });

  const pauseMut = useMutation({
    mutationFn: (id) => apiPost(`/cron/jobs/${id}/pause`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cron-jobs'] }); setFeedback({ type: 'success', message: 'Job paused' }); },
  });

  const resumeMut = useMutation({
    mutationFn: (id) => apiPost(`/cron/jobs/${id}/resume`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cron-jobs'] }); setFeedback({ type: 'success', message: 'Job resumed' }); },
  });

  const jobs = Array.isArray(data) ? data : [];

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin text-gray-500" size={24} /></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center"><p className="text-red-400">{error.message}</p><button onClick={() => refetch()} className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Retry</button></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Cron / Scheduling</h2>
          <p className="text-sm text-gray-500 mt-1">{jobs.length} scheduled job{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-lg text-sm transition-colors">
            <Plus size={14} /> New Job
          </button>
          <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-sm transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`flex items-center gap-2 px-3 py-2.5 mb-4 rounded-lg text-sm border ${feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Clock size={32} className="mx-auto mb-3 text-gray-600 opacity-50" />
          <p className="text-gray-500">No cron jobs configured</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          {jobs.map((job) => (
            <JobRow key={job.id || job.name} job={job}
              onTrigger={(id) => triggerMut.mutate(id)}
              onPause={(id) => pauseMut.mutate(id)}
              onResume={(id) => resumeMut.mutate(id)}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} onCreate={(job) => createMut.mutate(job)} />}
    </div>
  );
}
