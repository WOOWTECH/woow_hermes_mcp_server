import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Webhook, Plus, Trash2, Loader2, RefreshCw, CheckCircle2, XCircle,
  ToggleLeft, ToggleRight, Power, X, Copy,
} from 'lucide-react';
import { apiGet, apiPost, apiDelete, apiPut } from '../api';

const inputClass =
  'w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors font-mono text-sm';

function WebhookRow({ webhook, onToggle, onDelete }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors border-b border-gray-800 last:border-b-0">
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
        <span className={`w-2 h-2 rounded-full shrink-0 ${webhook.enabled ? 'bg-emerald-500' : 'bg-gray-500'}`} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-200">{webhook.name}</span>
          {webhook.prompt && <p className="text-xs text-gray-500 mt-0.5 truncate">{webhook.prompt}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onToggle(webhook.name, webhook.enabled)} className="shrink-0 transition-opacity" title={webhook.enabled ? 'Disable' : 'Enable'}>
          {webhook.enabled ? <ToggleRight size={24} className="text-brand-500" /> : <ToggleLeft size={24} className="text-gray-600" />}
        </button>
        <button onClick={() => onDelete(webhook.name)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function CreateWebhookModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-gray-100">Create Webhook</h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="order-notification" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Prompt Template</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              placeholder="Received webhook data: {{payload}}&#10;&#10;Please analyze and summarize."
              className={inputClass + ' resize-none'} />
            <p className="text-xs text-gray-600 mt-1">Use <code className="text-brand-400">{'{{payload}}'}</code> for incoming webhook data</p>
          </div>
          <button
            onClick={() => { onCreate({ name, prompt, enabled: true }); onClose(); }}
            disabled={!name || !prompt}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          >
            <Plus size={16} /> Create Webhook
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WebhookManager() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => apiGet('/webhooks'),
  });

  const enableMut = useMutation({
    mutationFn: () => apiPost('/webhooks/enable'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhooks'] }); setFeedback({ type: 'success', message: 'Webhook platform enabled. Gateway restarting...' }); },
    onError: (err) => setFeedback({ type: 'error', message: err.message }),
  });

  const createMut = useMutation({
    mutationFn: (wh) => apiPost('/webhooks', wh),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhooks'] }); setFeedback({ type: 'success', message: 'Webhook created' }); },
    onError: (err) => setFeedback({ type: 'error', message: err.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (name) => apiDelete(`/webhooks/${name}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhooks'] }); setFeedback({ type: 'success', message: 'Webhook deleted' }); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ name, enabled }) => apiPut(`/webhooks/${name}/enabled`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const platformEnabled = data?.enabled ?? false;
  const baseUrl = data?.base_url || '';
  const webhooks = data?.subscriptions || [];

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin text-gray-500" size={24} /></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center"><p className="text-red-400">{error.message}</p><button onClick={() => refetch()} className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Retry</button></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Webhooks</h2>
          <p className="text-sm text-gray-500 mt-1">{webhooks.length} subscription{webhooks.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {platformEnabled && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-lg text-sm transition-colors">
              <Plus size={14} /> New Webhook
            </button>
          )}
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

      {/* Platform Status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${platformEnabled ? 'bg-emerald-500/10' : 'bg-gray-800'}`}>
              <Power size={20} className={platformEnabled ? 'text-emerald-400' : 'text-gray-500'} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Webhook Platform</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {platformEnabled ? `Listening at ${baseUrl}` : 'Not enabled'}
              </p>
            </div>
          </div>
          {!platformEnabled && (
            <button onClick={() => enableMut.mutate()} disabled={enableMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-lg text-sm transition-colors">
              {enableMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
              Enable Platform
            </button>
          )}
          {platformEnabled && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
            </span>
          )}
        </div>
      </div>

      {/* Webhook List */}
      {webhooks.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Webhook size={32} className="mx-auto mb-3 text-gray-600 opacity-50" />
          <p className="text-gray-500">{platformEnabled ? 'No webhooks configured' : 'Enable the platform first'}</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          {webhooks.map((wh) => (
            <WebhookRow key={wh.name} webhook={wh}
              onToggle={(name, curr) => toggleMut.mutate({ name, enabled: !curr })}
              onDelete={(name) => deleteMut.mutate(name)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateWebhookModal onClose={() => setShowCreate(false)} onCreate={(wh) => createMut.mutate(wh)} />}
    </div>
  );
}
