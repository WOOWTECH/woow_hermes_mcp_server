import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Save,
  TestTube,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  KeyRound,
  Globe,
  Server,
} from 'lucide-react';
import { apiGet, apiPut, apiPost } from '../api';

const inputClass =
  'w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors';

function ConnectionSection({ title, icon: Icon, status, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-brand-400" />
          <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
        </div>
        {status !== undefined && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              status === true
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : status === false
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                status === true ? 'bg-emerald-400' : status === false ? 'bg-red-400' : 'bg-gray-500'
              }`}
            />
            {status === true ? 'Connected' : status === false ? 'Disconnected' : 'Unknown'}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function ConnectionConfig() {
  const queryClient = useQueryClient();

  const [gatewayForm, setGatewayForm] = useState({
    gateway_url: '',
    gateway_api_key: '',
  });
  const [dashboardForm, setDashboardForm] = useState({
    dashboard_url: '',
    dashboard_username: '',
    dashboard_password: '',
  });
  const [showGatewayKey, setShowGatewayKey] = useState(false);
  const [showDashboardPw, setShowDashboardPw] = useState(false);
  const [gatewayTestResult, setGatewayTestResult] = useState(null);
  const [dashboardTestResult, setDashboardTestResult] = useState(null);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/health'),
    staleTime: 60_000,
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiGet('/config'),
  });

  useEffect(() => {
    if (!config) return;
    setGatewayForm({
      gateway_url: config.gateway_url || 'http://hermes-agent-svc:8642',
      gateway_api_key: '',
    });
    setDashboardForm({
      dashboard_url: config.dashboard_url || 'http://hermes-agent-svc:9119',
      dashboard_username: config.dashboard_username || 'admin',
      dashboard_password: '',
    });
  }, [config]);

  const testGatewayMutation = useMutation({
    mutationFn: (data) => apiPost('/config/test/gateway', data),
    onSuccess: (result) => {
      setGatewayTestResult({ success: result.success, message: result.message || 'Gateway reachable' });
    },
    onError: (err) => {
      setGatewayTestResult({ success: false, message: err.message });
    },
  });

  const testDashboardMutation = useMutation({
    mutationFn: (data) => apiPost('/config/test/dashboard', data),
    onSuccess: (result) => {
      setDashboardTestResult({ success: result.success, message: result.message || 'Dashboard reachable' });
    },
    onError: (err) => {
      setDashboardTestResult({ success: false, message: err.message });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data) => apiPut('/config/connection', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    },
  });

  function handleSave() {
    saveMutation.mutate({
      ...gatewayForm,
      ...dashboardForm,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-500" size={24} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-100">Connection Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure the dual connection to the Hermes Agent gateway and dashboard
        </p>
      </div>

      <div className="space-y-6 max-w-xl">
        {/* Section A: Gateway API Server */}
        <ConnectionSection
          title="Gateway API Server"
          icon={Server}
          status={health?.gateway?.healthy}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Gateway URL
              </label>
              <div className="relative">
                <Link size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="url"
                  value={gatewayForm.gateway_url}
                  onChange={(e) => {
                    setGatewayForm((prev) => ({ ...prev, gateway_url: e.target.value }));
                    setGatewayTestResult(null);
                  }}
                  placeholder="http://hermes-agent-svc:8642"
                  className={inputClass + ' pl-10'}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                API Key
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={showGatewayKey ? 'text' : 'password'}
                  value={gatewayForm.gateway_api_key}
                  onChange={(e) => {
                    setGatewayForm((prev) => ({ ...prev, gateway_api_key: e.target.value }));
                    setGatewayTestResult(null);
                  }}
                  placeholder={config?.gateway_api_key_masked || 'Enter API key'}
                  className={inputClass + ' pl-10 pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowGatewayKey(!showGatewayKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showGatewayKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                The API key used to authenticate with the Hermes Gateway (port 8642)
              </p>
            </div>

            {gatewayTestResult && (
              <div
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                  gatewayTestResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}
              >
                {gatewayTestResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>{gatewayTestResult.message}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => testGatewayMutation.mutate(gatewayForm)}
              disabled={testGatewayMutation.isPending || !gatewayForm.gateway_url}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 font-medium rounded-lg transition-colors"
            >
              {testGatewayMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <TestTube size={16} />
              )}
              <span>Test Connection</span>
            </button>
          </div>
        </ConnectionSection>

        {/* Section B: Dashboard REST API */}
        <ConnectionSection
          title="Dashboard REST API"
          icon={Globe}
          status={health?.dashboard?.healthy}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Dashboard URL
              </label>
              <div className="relative">
                <Link size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="url"
                  value={dashboardForm.dashboard_url}
                  onChange={(e) => {
                    setDashboardForm((prev) => ({ ...prev, dashboard_url: e.target.value }));
                    setDashboardTestResult(null);
                  }}
                  placeholder="http://hermes-agent-svc:9119"
                  className={inputClass + ' pl-10'}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={dashboardForm.dashboard_username}
                onChange={(e) => {
                  setDashboardForm((prev) => ({ ...prev, dashboard_username: e.target.value }));
                  setDashboardTestResult(null);
                }}
                placeholder="admin"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showDashboardPw ? 'text' : 'password'}
                  value={dashboardForm.dashboard_password}
                  onChange={(e) => {
                    setDashboardForm((prev) => ({ ...prev, dashboard_password: e.target.value }));
                    setDashboardTestResult(null);
                  }}
                  placeholder={config?.dashboard_password_masked || 'Enter password'}
                  className={inputClass + ' pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowDashboardPw(!showDashboardPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showDashboardPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Credentials for the Hermes Dashboard REST API (port 9119)
              </p>
            </div>

            {dashboardTestResult && (
              <div
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                  dashboardTestResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}
              >
                {dashboardTestResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>{dashboardTestResult.message}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => testDashboardMutation.mutate(dashboardForm)}
              disabled={testDashboardMutation.isPending || !dashboardForm.dashboard_url}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 font-medium rounded-lg transition-colors"
            >
              {testDashboardMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <TestTube size={16} />
              )}
              <span>Test Connection</span>
            </button>
          </div>
        </ConnectionSection>

        {/* Save & Restart */}
        {saveMutation.isSuccess && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 size={16} />
            <span>Configuration saved. MCP server will restart.</span>
          </div>
        )}

        {saveMutation.isError && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">
            <XCircle size={16} />
            <span>{saveMutation.error.message}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {saveMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          <span>Save &amp; Restart MCP</span>
        </button>
      </div>
    </div>
  );
}
