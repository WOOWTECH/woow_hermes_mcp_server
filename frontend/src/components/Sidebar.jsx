import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Wrench,
  Link,
  KeyRound,
  ScrollText,
  Shield,
  Settings,
  LogOut,
  Brain,
  BookOpen,
  Server,
  FileText,
  Power,
  MessageSquare,
  Clock,
  Webhook,
  X,
} from 'lucide-react';
import { apiGet, clearToken } from '../api';

const navSections = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/config', label: 'Connection', icon: Link },
    ],
  },
  {
    label: 'MCP Wrapper',
    items: [
      { to: '/tools', label: 'MCP Tools', icon: Wrench },
      { to: '/tokens', label: 'Tokens', icon: KeyRound },
    ],
  },
  {
    label: 'Hermes Agent',
    items: [
      { to: '/model', label: 'Model', icon: Brain },
      { to: '/skills', label: 'Skills', icon: BookOpen },
      { to: '/mcp-servers', label: 'MCP Servers', icon: Server },
      { to: '/hermes-tools', label: 'Toolsets', icon: Settings },
      { to: '/config-editor', label: 'Config', icon: FileText },
      { to: '/gateway', label: 'Gateway', icon: Power },
      { to: '/sessions', label: 'Sessions', icon: MessageSquare },
      { to: '/cron', label: 'Cron Jobs', icon: Clock },
      { to: '/webhooks', label: 'Webhooks', icon: Webhook },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/logs', label: 'Logs', icon: ScrollText },
      { to: '/deny-list', label: 'Security', icon: Shield },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate();

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/health'),
    staleTime: 30_000,
  });

  const gatewayOk = health?.gateway?.healthy;
  const dashboardOk = health?.dashboard?.healthy;

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  function handleNavClick() {
    if (onClose) onClose();
  }

  return (
    <aside
      className={`w-60 bg-gray-900 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform duration-200 ease-in-out ${
        open ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}
    >
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-100 tracking-tight">Hermes MCP Admin</h1>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span>Gateway</span>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                gatewayOk === true
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                  : gatewayOk === false
                  ? 'bg-red-500 shadow-lg shadow-red-500/50'
                  : 'bg-gray-600'
              }`}
            />
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span>Dashboard</span>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                dashboardOk === true
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                  : dashboardOk === false
                  ? 'bg-red-500 shadow-lg shadow-red-500/50'
                  : 'bg-gray-600'
              }`}
            />
          </span>
        </div>
        {health?.namespace && (
          <p className="text-xs text-gray-600 mt-1 font-mono">{health.namespace}</p>
        )}
      </div>

      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {navSections.map((section, sIdx) => (
          <div key={sIdx}>
            {section.label && (
              <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
                {section.label}
              </div>
            )}
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`
                }
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-800">
        {health?.version && (
          <div className="px-3 py-1.5 mb-2 text-xs text-gray-600 font-mono">
            v{health.version}
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors w-full"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
