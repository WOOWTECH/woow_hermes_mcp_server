import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Loader2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Save,
  Search,
  Wrench,
  Globe,
  FileText,
  Database,
  Code,
  Terminal,
  Shield,
  Cpu,
  Zap,
  BookOpen,
  MessageSquare,
} from 'lucide-react';
import { apiGet, apiPut } from '../api';

const toolsetIcons = {
  web: Globe,
  file: FileText,
  database: Database,
  code: Code,
  terminal: Terminal,
  security: Shield,
  ai: Cpu,
  automation: Zap,
  knowledge: BookOpen,
  chat: MessageSquare,
  default: Wrench,
};

function getToolsetIcon(toolset) {
  if (toolset.icon && toolsetIcons[toolset.icon]) {
    return toolsetIcons[toolset.icon];
  }
  const name = (toolset.name || '').toLowerCase();
  for (const [key, Icon] of Object.entries(toolsetIcons)) {
    if (name.includes(key)) return Icon;
  }
  return toolsetIcons.default;
}

function ToolsetCard({ toolset, onToggle, isPending }) {
  const Icon = getToolsetIcon(toolset);

  return (
    <div
      className={`bg-gray-900 border rounded-xl p-4 hover:border-gray-600 transition-colors ${
        toolset.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-lg ${
              toolset.enabled
                ? 'bg-brand-600/20 text-brand-400'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            <Icon size={18} />
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-200">{toolset.name}</h4>
            {toolset.category && (
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                {toolset.category}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onToggle(toolset.name, toolset.enabled)}
          disabled={isPending}
          className="shrink-0 disabled:opacity-50 transition-opacity"
          title={toolset.enabled ? 'Disable' : 'Enable'}
        >
          {isPending ? (
            <Loader2 size={22} className="animate-spin text-gray-500" />
          ) : toolset.enabled ? (
            <ToggleRight size={26} className="text-brand-500" />
          ) : (
            <ToggleLeft size={26} className="text-gray-600" />
          )}
        </button>
      </div>
      {toolset.description && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {toolset.description}
        </p>
      )}
      {toolset.tool_count != null && (
        <p className="text-[10px] text-gray-600 mt-2">
          {toolset.tool_count} tool{toolset.tool_count !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export default function HermesToolsets() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pendingToggles, setPendingToggles] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [localToolsets, setLocalToolsets] = useState(null);

  const { data: toolsetsData, isLoading, error, refetch } = useQuery({
    queryKey: ['hermes-tools'],
    queryFn: () => apiGet('/hermes-tools'),
    onSuccess: (data) => {
      if (!localToolsets) {
        setLocalToolsets(data.toolsets || []);
      }
    },
  });

  const toolsets = localToolsets || toolsetsData?.toolsets || [];

  const saveMutation = useMutation({
    mutationFn: (ts) => apiPut('/hermes-tools', { toolsets: ts }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hermes-tools'] });
      setHasChanges(false);
      setLocalToolsets(null);
    },
  });

  const filteredToolsets = useMemo(() => {
    if (!search.trim()) return toolsets;
    const q = search.toLowerCase();
    return toolsets.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q)
    );
  }, [toolsets, search]);

  const categories = useMemo(() => {
    const grouped = {};
    for (const t of filteredToolsets) {
      const cat = t.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredToolsets]);

  function handleToggle(name, currentEnabled) {
    setPendingToggles((prev) => ({ ...prev, [name]: true }));
    const updated = toolsets.map((t) =>
      t.name === name ? { ...t, enabled: !currentEnabled } : t
    );
    setLocalToolsets(updated);
    setHasChanges(true);
    setTimeout(() => {
      setPendingToggles((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }, 300);
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
        <p className="text-red-400 font-medium">Failed to load toolsets</p>
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

  const enabledCount = toolsets.filter((t) => t.enabled).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Hermes Agent Toolsets</h2>
          <p className="text-sm text-gray-500 mt-1">
            {enabledCount} of {toolsets.length} toolsets enabled
          </p>
        </div>
        <button
          onClick={() => saveMutation.mutate(localToolsets || toolsets)}
          disabled={!hasChanges || saveMutation.isPending}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-lg text-sm transition-colors ${
            hasChanges
              ? 'bg-brand-600 hover:bg-brand-500 text-white'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          {saveMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          <span>Apply Changes</span>
        </button>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-4 bg-amber-600/10 border border-amber-600/20 rounded-lg text-sm text-amber-400">
          <AlertTriangle size={16} className="shrink-0" />
          <span>Gateway restart required to apply changes</span>
        </div>
      )}

      {saveMutation.isSuccess && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
          <CheckCircle2 size={16} />
          <span>Changes saved. Restart the Gateway to apply.</span>
        </div>
      )}

      {saveMutation.isError && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          <XCircle size={16} />
          <span>{saveMutation.error.message}</span>
        </div>
      )}

      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search toolsets..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
        />
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Settings size={32} className="mx-auto mb-3 opacity-50" />
          <p>No toolsets match your search</p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map(([category, categoryToolsets]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                {category}
                <span className="ml-2 text-gray-600 font-normal">({categoryToolsets.length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {categoryToolsets.map((toolset) => (
                  <ToolsetCard
                    key={toolset.name}
                    toolset={toolset}
                    onToggle={handleToggle}
                    isPending={pendingToggles[toolset.name]}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
