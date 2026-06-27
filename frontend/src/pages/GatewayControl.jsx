import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Power,
  RotateCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Activity,
  Droplets,
} from 'lucide-react';
import { apiGet, apiPost } from '../api';

function StatusBadge({ running }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
        running
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
      {running ? 'Running' : 'Stopped'}
    </span>
  );
}

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return 'N/A';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default function GatewayControl() {
  const queryClient = useQueryClient();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmDrain, setConfirmDrain] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const { data: gatewayStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['gateway-status'],
    queryFn: () => apiGet('/gateway/status'),
    refetchInterval: 10_000,
  });

  const restartMutation = useMutation({
    mutationFn: () => apiPost('/gateway/restart'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['gateway-status'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      setConfirmRestart(false);
      setFeedback({ type: 'success', message: result.message || 'Gateway restart initiated' });
    },
    onError: (err) => {
      setConfirmRestart(false);
      setFeedback({ type: 'error', message: err.message });
    },
  });

  const drainMutation = useMutation({
    mutationFn: () => apiPost('/gateway/drain-restart'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['gateway-status'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      setConfirmDrain(false);
      setFeedback({ type: 'success', message: result.message || 'Drain and restart initiated' });
    },
    onError: (err) => {
      setConfirmDrain(false);
      setFeedback({ type: 'error', message: err.message });
    },
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
        <p className="text-red-400 font-medium">Failed to load gateway status</p>
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

  const isRunning = gatewayStatus?.running ?? false;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Gateway Control</h2>
          <p className="text-sm text-gray-500 mt-1">
            Monitor and control the Hermes Agent gateway process
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

      <div className="max-w-xl space-y-6">
        {/* Status Panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl ${
                  isRunning ? 'bg-emerald-500/10' : 'bg-red-500/10'
                }`}
              >
                <Power
                  size={24}
                  className={isRunning ? 'text-emerald-400' : 'text-red-400'}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Gateway Status</h3>
                <StatusBadge running={isRunning} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">Uptime</span>
              </div>
              <p className="text-sm font-medium text-gray-200 font-mono">
                {formatUptime(gatewayStatus?.uptime_seconds)}
              </p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">Last Restart</span>
              </div>
              <p className="text-sm font-medium text-gray-200 font-mono">
                {gatewayStatus?.last_restart
                  ? new Date(gatewayStatus.last_restart).toLocaleString()
                  : 'N/A'}
              </p>
            </div>
          </div>

          {gatewayStatus?.pid && (
            <div className="mt-3 text-xs text-gray-600 font-mono">
              PID: {gatewayStatus.pid}
              {gatewayStatus.restart_count != null && (
                <span> | Restarts: {gatewayStatus.restart_count}</span>
              )}
            </div>
          )}
        </div>

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

        {/* Restart Controls */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Controls
          </h3>

          <div className="space-y-4">
            {/* Restart */}
            {!confirmRestart ? (
              <button
                onClick={() => setConfirmRestart(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/30 font-medium rounded-lg transition-colors w-full justify-center"
              >
                <RotateCw size={16} />
                <span>Restart Gateway</span>
              </button>
            ) : (
              <div className="border border-amber-600/30 bg-amber-600/10 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">Confirm Gateway Restart</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
                      This will restart the gateway process. Active sessions may be interrupted.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => restartMutation.mutate()}
                    disabled={restartMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 text-white font-medium rounded-lg text-sm transition-colors"
                  >
                    {restartMutation.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RotateCw size={14} />
                    )}
                    <span>Confirm Restart</span>
                  </button>
                  <button
                    onClick={() => setConfirmRestart(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Drain + Restart */}
            {!confirmDrain ? (
              <button
                onClick={() => setConfirmDrain(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 font-medium rounded-lg transition-colors w-full justify-center"
              >
                <Droplets size={16} />
                <span>Drain + Restart</span>
              </button>
            ) : (
              <div className="border border-gray-600 bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <Droplets size={18} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-300">Confirm Drain + Restart</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Waits for active sessions to complete before restarting the gateway.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => drainMutation.mutate()}
                    disabled={drainMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-200 font-medium rounded-lg text-sm transition-colors"
                  >
                    {drainMutation.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Droplets size={14} />
                    )}
                    <span>Confirm Drain + Restart</span>
                  </button>
                  <button
                    onClick={() => setConfirmDrain(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
