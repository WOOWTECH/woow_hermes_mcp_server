import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Lock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { apiGet, apiPut } from '../api';

const inputClass =
  'w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors font-mono text-sm';

function ConfigNode({ keyPath, value, deniedKeys, onChange, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDenied = deniedKeys.has(keyPath);
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);

  if (isObject) {
    const entries = Object.entries(value);
    return (
      <div className={depth > 0 ? 'ml-4 border-l border-gray-800 pl-3' : ''}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="font-medium">{keyPath.split('.').pop() || 'config'}</span>
          <span className="text-gray-600 text-xs">({entries.length} keys)</span>
        </button>
        {expanded && (
          <div className="space-y-1 mt-1">
            {entries.map(([k, v]) => {
              const childPath = keyPath ? `${keyPath}.${k}` : k;
              return (
                <ConfigNode
                  key={childPath}
                  keyPath={childPath}
                  value={v}
                  deniedKeys={deniedKeys}
                  onChange={onChange}
                  depth={depth + 1}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const displayKey = keyPath.split('.').pop();

  return (
    <div
      className={`flex items-center gap-2 py-1.5 ${
        depth > 0 ? 'ml-4 border-l border-gray-800 pl-3' : ''
      } ${isDenied ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-[160px] shrink-0">
        {isDenied && <Lock size={10} className="text-gray-600" />}
        <span className={`text-xs font-mono ${isDenied ? 'text-gray-600' : 'text-brand-400'}`}>
          {displayKey}
        </span>
      </div>
      {isDenied ? (
        <span className="text-xs text-gray-600 font-mono px-2 py-1 bg-gray-800/50 rounded">
          {isArray ? JSON.stringify(value) : String(value)}
        </span>
      ) : (
        <input
          type="text"
          value={isArray ? JSON.stringify(value) : String(value ?? '')}
          onChange={(e) => onChange(keyPath, e.target.value)}
          className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 font-mono focus:outline-none focus:border-brand-500 transition-colors"
        />
      )}
    </div>
  );
}

export default function ConfigEditor() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('tree'); // 'tree' | 'json' | 'yaml'
  const [treeData, setTreeData] = useState({});
  const [rawContent, setRawContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [parseError, setParseError] = useState(null);

  const { data: configData, isLoading, error, refetch } = useQuery({
    queryKey: ['hermes-config'],
    queryFn: () => apiGet('/config/editor'),
  });

  const deniedKeys = useMemo(() => {
    return new Set(configData?.denied_keys || []);
  }, [configData]);

  useEffect(() => {
    if (configData?.config) {
      setTreeData(configData.config);
      setRawContent(JSON.stringify(configData.config, null, 2));
      setIsDirty(false);
      setParseError(null);
    }
  }, [configData]);

  const saveMutation = useMutation({
    mutationFn: (config) => apiPut('/config', { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hermes-config'] });
      setIsDirty(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => apiPut('/config/reset'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hermes-config'] });
      setIsDirty(false);
    },
  });

  function handleTreeChange(keyPath, value) {
    setTreeData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = keyPath.split('.');
      let target = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (target[parts[i]] === undefined) target[parts[i]] = {};
        target = target[parts[i]];
      }
      const last = parts[parts.length - 1];
      try {
        target[last] = JSON.parse(value);
      } catch {
        target[last] = value;
      }
      setRawContent(JSON.stringify(next, null, 2));
      return next;
    });
    setIsDirty(true);
  }

  function handleRawChange(e) {
    const value = e.target.value;
    setRawContent(value);
    setIsDirty(true);
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (err) {
      setParseError('JSON syntax error: ' + err.message);
    }
  }

  function handleSave() {
    let config;
    if (viewMode === 'tree') {
      config = treeData;
    } else {
      try {
        config = JSON.parse(rawContent);
      } catch (err) {
        setParseError('Cannot save: ' + err.message);
        return;
      }
    }
    saveMutation.mutate(config);
  }

  function handleReset() {
    if (configData?.config) {
      setTreeData(configData.config);
      setRawContent(JSON.stringify(configData.config, null, 2));
      setIsDirty(false);
      setParseError(null);
    }
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
        <p className="text-red-400 font-medium">Failed to load configuration</p>
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

  const lineCount = rawContent.split('\n').length;

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Config Editor</h2>
          <p className="text-sm text-gray-500 mt-1">
            Edit Hermes Agent configuration
            {isDirty && <span className="text-amber-400 ml-2">(unsaved changes)</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => {
                setViewMode('tree');
                try {
                  setTreeData(JSON.parse(rawContent));
                } catch {}
              }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'tree'
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => {
                setViewMode('json');
                setRawContent(JSON.stringify(treeData, null, 2));
              }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-700 ${
                viewMode === 'json'
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              JSON
            </button>
          </div>

          <button
            onClick={handleReset}
            disabled={!isDirty}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-gray-800 text-gray-400 hover:text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>

          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            {resetMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}
            <span>Reset to Defaults</span>
          </button>

          <button
            onClick={handleSave}
            disabled={!!parseError || saveMutation.isPending || !isDirty}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {saveMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {parseError && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          <AlertCircle size={16} className="shrink-0" />
          <span className="font-mono text-xs">{parseError}</span>
        </div>
      )}

      {saveMutation.isSuccess && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
          <CheckCircle2 size={16} />
          <span>Configuration saved successfully.</span>
        </div>
      )}

      {saveMutation.isError && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          <XCircle size={16} />
          <span>{saveMutation.error.message}</span>
        </div>
      )}

      {resetMutation.isSuccess && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
          <CheckCircle2 size={16} />
          <span>Configuration reset to defaults.</span>
        </div>
      )}

      {/* Denied keys legend */}
      {deniedKeys.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-gray-800/50 border border-gray-700 rounded-lg text-xs text-gray-500">
          <Lock size={12} />
          <span>Greyed-out keys are denied by security policy and cannot be modified</span>
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 relative">
        {viewMode === 'tree' ? (
          <div className="absolute inset-0 bg-gray-950 border border-gray-800 rounded-xl overflow-y-auto p-4">
            <ConfigNode
              keyPath=""
              value={treeData}
              deniedKeys={deniedKeys}
              onChange={handleTreeChange}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
            <div className="py-3 px-2 bg-gray-900 text-right select-none border-r border-gray-800 overflow-y-auto shrink-0">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1} className="text-xs text-gray-600 leading-relaxed font-mono px-1">
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              value={rawContent}
              onChange={handleRawChange}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent text-gray-200 font-mono text-sm leading-relaxed resize-none focus:outline-none placeholder-gray-600 overflow-y-auto"
              placeholder="{}"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <FileText size={12} />
          <span>Hermes Agent Configuration ({viewMode === 'tree' ? 'Tree View' : 'JSON'})</span>
        </div>
        {viewMode !== 'tree' && (
          <span>
            {lineCount} lines &middot; {rawContent.length} chars
          </span>
        )}
      </div>
    </div>
  );
}
