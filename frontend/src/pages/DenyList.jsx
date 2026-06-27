import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  Lock,
  RefreshCw,
  AlertTriangle,
  FileText,
  Server,
  Terminal,
  Clock,
  XOctagon,
} from 'lucide-react';
import { apiGet } from '../api';

function DenySection({ title, icon: Icon, items, emptyMessage }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{title}</h3>
        <span className="text-xs text-gray-600">({items ? items.length : 0})</span>
      </div>

      {!items || items.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{emptyMessage}</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg"
            >
              <Lock size={12} className="text-gray-600 shrink-0" />
              <span className="text-sm text-gray-300 font-mono">{typeof item === 'string' ? item : item.key || item.name || JSON.stringify(item)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockedAttemptRow({ attempt }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/50 transition-colors border-b border-gray-800 last:border-b-0">
      <XOctagon size={14} className="text-red-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-gray-300">
            {attempt.operation || attempt.key || 'Unknown'}
          </span>
          {attempt.type && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-600/20 text-red-400 border border-red-600/30">
              {attempt.type}
            </span>
          )}
        </div>
        {attempt.reason && (
          <p className="text-xs text-gray-500 mt-0.5">{attempt.reason}</p>
        )}
      </div>
      <span className="text-xs text-gray-600 shrink-0">
        {attempt.timestamp ? new Date(attempt.timestamp).toLocaleString() : ''}
      </span>
    </div>
  );
}

export default function DenyList() {
  const { data: denyData, isLoading, error, refetch } = useQuery({
    queryKey: ['deny-list'],
    queryFn: () => apiGet('/deny-list'),
    refetchInterval: 30_000,
  });

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
        <p className="text-red-400 font-medium">Failed to load security data</p>
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

  const configKeys = denyData?.denied_config_keys || [];
  const mcpOps = denyData?.denied_mcp_operations || [];
  const envOps = denyData?.denied_env_operations || [];
  const blockedAttempts = denyData?.blocked_attempts || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Security - Deny List</h2>
          <p className="text-sm text-gray-500 mt-1">
            Read-only view of security restrictions and blocked operations
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-sm transition-colors"
        >
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 mb-6 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-400">
        <Shield size={16} className="shrink-0" />
        <span>
          This page is read-only. Deny lists are configured by the system administrator and cannot be modified through the UI.
        </span>
      </div>

      <div className="space-y-6 max-w-2xl">
        <DenySection
          title="Denied Config Keys"
          icon={FileText}
          items={configKeys}
          emptyMessage="No config keys are denied"
        />

        <DenySection
          title="Denied MCP Operations"
          icon={Server}
          items={mcpOps}
          emptyMessage="No MCP operations are denied"
        />

        <DenySection
          title="Denied Environment Operations"
          icon={Terminal}
          items={envOps}
          emptyMessage="No environment operations are denied"
        />

        {/* Blocked Attempts Log */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center gap-2 p-6 pb-4">
            <AlertTriangle size={18} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Recent Blocked Attempts
            </h3>
            <span className="text-xs text-gray-600">({blockedAttempts.length})</span>
          </div>

          {blockedAttempts.length === 0 ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-500 italic">No recent blocked attempts</p>
            </div>
          ) : (
            <div className="pb-2">
              {blockedAttempts.map((attempt, idx) => (
                <BlockedAttemptRow key={idx} attempt={attempt} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
