import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Server,
  Plus,
  Trash2,
  TestTube,
  Loader2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';

const inputClass =
  'w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors';

function ServerRow({ server, onTest, onRemove, onToggle, testPending, removePending, togglePending }) {
  const [testResult, setTestResult] = useState(null);

  function handleTest() {
    setTestResult(null);
    onTest(server.name, {
      onSuccess: (result) => setTestResult({ success: result.success, message: result.message || 'OK' }),
      onError: (err) => setTestResult({ success: false, message: err.message }),
    });
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors border-b border-gray-800 last:border-b-0">
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            server.status === 'connected'
              ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
              : server.status === 'error'
              ? 'bg-red-500 shadow-lg shadow-red-500/50'
              : 'bg-gray-500'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200">{server.name}</span>
            {server.type && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 text-gray-400">
                {server.type}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate font-mono">{server.url}</p>
          {testResult && (
            <div className={`mt-1 text-xs ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
              {testResult.success ? <CheckCircle2 size={10} className="inline mr-1" /> : <XCircle size={10} className="inline mr-1" />}
              {testResult.message}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleTest}
          disabled={testPending}
          className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
          title="Test connection"
        >
          {testPending ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
        </button>
        <button
          onClick={() => onToggle(server.name, server.enabled)}
          disabled={togglePending}
          className="shrink-0 disabled:opacity-50 transition-opacity"
          title={server.enabled ? 'Disable' : 'Enable'}
        >
          {togglePending ? (
            <Loader2 size={20} className="animate-spin text-gray-500" />
          ) : server.enabled ? (
            <ToggleRight size={24} className="text-brand-500" />
          ) : (
            <ToggleLeft size={24} className="text-gray-600" />
          )}
        </button>
        <button
          onClick={() => onRemove(server.name)}
          disabled={removePending}
          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
          title="Remove server"
        >
          {removePending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

function AddServerForm({ onAdd, isPending }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [headerError, setHeaderError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    setHeaderError(null);
    let parsedHeaders = {};
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (err) {
        setHeaderError('Invalid JSON: ' + err.message);
        return;
      }
    }
    onAdd({ name: name.trim(), url: url.trim(), headers: parsedHeaders, type: 'sse' });
    setName('');
    setUrl('');
    setHeaders('');
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Add MCP Server
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-mcp-server"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mcp-server.example.com/sse"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            Headers <span className="text-gray-600">(optional JSON)</span>
          </label>
          <textarea
            value={headers}
            onChange={(e) => {
              setHeaders(e.target.value);
              setHeaderError(null);
            }}
            placeholder='{"Authorization": "Bearer ..."}'
            rows={3}
            className={inputClass + ' font-mono text-sm resize-none'}
          />
          {headerError && (
            <p className="text-xs text-red-400 mt-1">{headerError}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Type</label>
          <div className="relative">
            <select disabled className={inputClass + ' appearance-none opacity-70 cursor-not-allowed'}>
              <option>URL/SSE only</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-gray-500">
              <Lock size={12} />
              <ChevronDown size={14} />
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
            <Lock size={10} />
            stdio transport is blocked by security policy
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending || !name.trim() || !url.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          <span>Add Server</span>
        </button>
      </div>
    </form>
  );
}

export default function McpServerManager() {
  const queryClient = useQueryClient();
  const [testingServer, setTestingServer] = useState(null);
  const [removingServer, setRemovingServer] = useState(null);

  const { data: serversData, isLoading, error, refetch } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => apiGet('/mcp-servers'),
  });

  const addMutation = useMutation({
    mutationFn: (server) => apiPost('/mcp-servers', server),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (name) => apiDelete(`/mcp-servers/${encodeURIComponent(name)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      setRemovingServer(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: (name) => apiPost(`/mcp-servers/${encodeURIComponent(name)}/test`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }) =>
      apiPut(`/mcp-servers/${encodeURIComponent(name)}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
  });

  function handleTest(name, callbacks) {
    setTestingServer(name);
    testMutation.mutate(name, {
      onSuccess: (result) => {
        setTestingServer(null);
        callbacks?.onSuccess?.(result);
      },
      onError: (err) => {
        setTestingServer(null);
        callbacks?.onError?.(err);
      },
    });
  }

  function handleRemove(name) {
    setRemovingServer(name);
    removeMutation.mutate(name);
  }

  function handleToggle(name, currentEnabled) {
    toggleMutation.mutate({ name, enabled: !currentEnabled });
  }

  const servers = serversData?.servers || [];

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
        <p className="text-red-400 font-medium">Failed to load MCP servers</p>
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100">MCP Server Manager</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage external MCP servers connected to the Hermes Agent
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 mb-6 bg-amber-600/10 border border-amber-600/20 rounded-lg text-sm text-amber-400">
        <AlertTriangle size={16} className="shrink-0" />
        <span>Adding or removing MCP servers requires a Gateway restart to take effect</span>
      </div>

      {/* Server List */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
          Configured Servers
          <span className="ml-2 text-gray-600 font-normal">({servers.length})</span>
        </h3>

        {servers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <Server size={32} className="mx-auto mb-3 text-gray-600 opacity-50" />
            <p className="text-gray-500">No MCP servers configured</p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            {servers.map((server) => (
              <ServerRow
                key={server.name}
                server={server}
                onTest={handleTest}
                onRemove={handleRemove}
                onToggle={handleToggle}
                testPending={testingServer === server.name}
                removePending={removingServer === server.name}
                togglePending={toggleMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Server Form */}
      <AddServerForm onAdd={(data) => addMutation.mutate(data)} isPending={addMutation.isPending} />

      {addMutation.isSuccess && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 size={16} />
          <span>Server added. Restart the Gateway to connect.</span>
        </div>
      )}

      {addMutation.isError && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">
          <XCircle size={16} />
          <span>{addMutation.error.message}</span>
        </div>
      )}
    </div>
  );
}
