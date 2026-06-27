import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  Cpu,
  Layers,
} from 'lucide-react';
import { apiGet, apiPost } from '../api';

const inputClass =
  'w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors';

const selectClass =
  'w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors appearance-none';

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-brand-400" />
        <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function ModelManager() {
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [auxModel, setAuxModel] = useState('');
  const [moaEnabled, setMoaEnabled] = useState(false);
  const [moaModels, setMoaModels] = useState('');
  const [feedback, setFeedback] = useState(null);

  const { data: modelInfo, isLoading } = useQuery({
    queryKey: ['model'],
    queryFn: () => apiGet('/model'),
  });

  const { data: modelOptions } = useQuery({
    queryKey: ['model-options'],
    queryFn: () => apiGet('/model/options'),
  });

  useEffect(() => {
    if (modelInfo) {
      setSelectedProvider(modelInfo.provider || '');
      setSelectedModel(modelInfo.model || '');
      setAuxModel(modelInfo.aux_model || '');
      setMoaEnabled(modelInfo.moa_enabled || false);
      setMoaModels(
        Array.isArray(modelInfo.moa_models)
          ? modelInfo.moa_models.join(', ')
          : modelInfo.moa_models || ''
      );
    }
  }, [modelInfo]);

  const applyMutation = useMutation({
    mutationFn: (data) => apiPost('/model/set', data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['model'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      setFeedback({ type: 'success', message: result.message || 'Model configuration applied' });
    },
    onError: (err) => {
      setFeedback({ type: 'error', message: err.message });
    },
  });

  function handleApply() {
    const data = {
      provider: selectedProvider,
      model: selectedModel,
      aux_model: auxModel || undefined,
      moa_enabled: moaEnabled,
    };
    if (moaEnabled && moaModels.trim()) {
      data.moa_models = moaModels.split(',').map((m) => m.trim()).filter(Boolean);
    }
    applyMutation.mutate(data);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-500" size={24} />
      </div>
    );
  }

  const providers = modelOptions?.providers || [];
  const models = modelOptions?.models || {};
  const availableModels = selectedProvider && models[selectedProvider]
    ? models[selectedProvider]
    : [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Model Manager</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure the Hermes Agent LLM model and provider
        </p>
      </div>

      <div className="space-y-6 max-w-xl">
        {/* Current Model Display */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={18} className="text-brand-400" />
            <h3 className="text-lg font-semibold text-gray-100">Current Model</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Provider</span>
              <p className="text-sm font-medium text-gray-200 mt-0.5 font-mono">
                {modelInfo?.provider || 'Not configured'}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Model</span>
              <p className="text-sm font-medium text-gray-200 mt-0.5 font-mono">
                {modelInfo?.model || 'Not configured'}
              </p>
            </div>
          </div>
        </div>

        {/* Model Selector */}
        <SectionCard title="Model Configuration" icon={Cpu}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Provider
              </label>
              <div className="relative">
                <select
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    setSelectedModel('');
                    setFeedback(null);
                  }}
                  className={selectClass}
                >
                  <option value="">Select provider...</option>
                  {providers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  {!providers.length && selectedProvider && (
                    <option value={selectedProvider}>{selectedProvider}</option>
                  )}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Model
              </label>
              {availableModels.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={(e) => {
                      setSelectedModel(e.target.value);
                      setFeedback(null);
                    }}
                    className={selectClass}
                  >
                    <option value="">Select model...</option>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    setFeedback(null);
                  }}
                  placeholder="Enter model name"
                  className={inputClass}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Auxiliary Model <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={auxModel}
                onChange={(e) => {
                  setAuxModel(e.target.value);
                  setFeedback(null);
                }}
                placeholder="Auxiliary model for secondary tasks"
                className={inputClass}
              />
              <p className="text-xs text-gray-600 mt-1">
                Used for summarization, classification, and other secondary tasks
              </p>
            </div>
          </div>
        </SectionCard>

        {/* MOA Settings */}
        <SectionCard title="Mixture of Agents (MOA)" icon={Layers}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-300">Enable MOA</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Use multiple models for improved response quality
                </p>
              </div>
              <button
                onClick={() => {
                  setMoaEnabled(!moaEnabled);
                  setFeedback(null);
                }}
                className="shrink-0"
              >
                {moaEnabled ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600/20 text-brand-400 border border-brand-600/30 rounded-lg text-sm font-medium">
                    Enabled
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-400 border border-gray-700 rounded-lg text-sm font-medium">
                    Disabled
                  </span>
                )}
              </button>
            </div>

            {moaEnabled && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  MOA Models <span className="text-gray-600">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={moaModels}
                  onChange={(e) => {
                    setMoaModels(e.target.value);
                    setFeedback(null);
                  }}
                  placeholder="gpt-4o, claude-3-5-sonnet, gemini-1.5-pro"
                  className={inputClass}
                />
                <p className="text-xs text-gray-600 mt-1">
                  Models to use in the Mixture of Agents ensemble
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Feedback */}
        {feedback && (
          <div
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Apply Button */}
        <button
          onClick={handleApply}
          disabled={applyMutation.isPending || !selectedProvider || !selectedModel}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {applyMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          <span>Apply</span>
        </button>
      </div>
    </div>
  );
}
