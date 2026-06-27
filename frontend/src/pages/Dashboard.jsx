import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Server,
  Globe,
  Brain,
  Wrench,
  BookOpen,
  MessageSquare,
  RefreshCw,
  Database,
} from 'lucide-react';
import { apiGet } from '../api';
import StatusCard from '../components/StatusCard';

function getStatus(healthy) {
  if (healthy === true) return 'green';
  if (healthy === false) return 'red';
  return 'gray';
}

export default function Dashboard() {
  const { data: health, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/health'),
    refetchInterval: 30_000,
  });

  const lastRefresh = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

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
        <p className="text-red-400 font-medium">Failed to load health status</p>
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

  const gateway = health?.gateway || {};
  const dashboard = health?.dashboard || {};
  const model = health?.model || {};
  const tools = health?.tools || {};
  const skills = health?.skills || {};
  const mcpServers = health?.mcp_servers || {};
  const sessions = health?.sessions || {};

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">
            Hermes Agent system overview
            {lastRefresh && <span> &middot; Updated {lastRefresh}</span>}
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

      {/* Connection Status */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
        Connection Status
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatusCard
          title="Gateway API"
          status={getStatus(gateway.healthy)}
          value={gateway.healthy ? 'Connected' : 'Disconnected'}
          subtitle={gateway.url || 'Port 8642'}
          icon={Server}
        />
        <StatusCard
          title="Dashboard API"
          status={getStatus(dashboard.healthy)}
          value={dashboard.healthy ? 'Connected' : 'Disconnected'}
          subtitle={dashboard.url || 'Port 9119'}
          icon={Globe}
        />
        <StatusCard
          title="Version"
          status="gray"
          value={health?.hermes_version || health?.version || 'N/A'}
          subtitle="Hermes Agent version"
          icon={Activity}
        />
      </div>

      {/* Agent Info */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
        Agent Info
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatusCard
          title="Model"
          status={model.provider ? 'green' : 'gray'}
          value={model.name || 'N/A'}
          subtitle={model.provider || 'No provider configured'}
          icon={Brain}
        />
        <StatusCard
          title="Tools"
          status={tools.enabled != null ? 'green' : 'gray'}
          value={
            tools.enabled != null
              ? `${tools.enabled} / ${tools.total || tools.enabled}`
              : 'N/A'
          }
          subtitle="Enabled / total toolsets"
          icon={Wrench}
        />
        <StatusCard
          title="Skills"
          status={skills.enabled != null ? 'green' : 'gray'}
          value={
            skills.enabled != null
              ? `${skills.enabled} / ${skills.total || skills.enabled}`
              : 'N/A'
          }
          subtitle="Enabled / total skills"
          icon={BookOpen}
        />
      </div>

      {/* System */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
        System
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatusCard
          title="MCP Servers"
          status={mcpServers.count != null ? 'green' : 'gray'}
          value={mcpServers.count != null ? String(mcpServers.count) : 'N/A'}
          subtitle="Configured MCP servers"
          icon={Database}
        />
        <StatusCard
          title="Sessions"
          status={sessions.active != null || sessions.total != null ? 'green' : 'gray'}
          value={sessions.active != null ? String(sessions.active) : 'N/A'}
          subtitle={sessions.total != null ? `${sessions.total} total sessions` : 'Active agent sessions'}
          icon={MessageSquare}
        />
      </div>

      {/* Recent Sessions */}
      {sessions.recent && sessions.recent.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
            Recent Sessions
          </h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
            {sessions.recent.map((session, idx) => (
              <div key={session.id || idx} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono text-gray-300">
                    {session.id ? session.id.substring(0, 12) + '...' : `Session ${idx + 1}`}
                  </span>
                  {session.message_count != null && (
                    <span className="ml-3 text-xs text-gray-500">
                      {session.message_count} messages
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-600">
                  {session.last_active
                    ? new Date(session.last_active).toLocaleString()
                    : session.created
                    ? new Date(session.created).toLocaleString()
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
