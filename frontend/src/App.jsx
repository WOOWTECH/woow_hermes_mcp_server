import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { getToken } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ToolManager from './pages/ToolManager';
import ConnectionConfig from './pages/ConnectionConfig';
import TokenManager from './pages/TokenManager';
import LogViewer from './pages/LogViewer';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import ModelManager from './pages/ModelManager';
import SkillManager from './pages/SkillManager';
import McpServerManager from './pages/McpServerManager';
import HermesToolsets from './pages/HermesToolsets';
import GatewayControl from './pages/GatewayControl';
import SessionManager from './pages/SessionManager';
import ConfigEditor from './pages/ConfigEditor';
import DenyList from './pages/DenyList';

function ProtectedRoute({ children }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="flex-1 lg:ml-60 p-4 sm:p-6 lg:p-8 overflow-y-auto min-h-screen">
        <div className="flex items-center gap-3 mb-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-400 hover:text-gray-200 bg-gray-800 rounded-lg shrink-0"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-bold text-gray-100 truncate">Hermes MCP Admin</h1>
        </div>
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/config" element={<ConnectionConfig />} />
          <Route path="/tools" element={<ToolManager />} />
          <Route path="/tokens" element={<TokenManager />} />
          <Route path="/model" element={<ModelManager />} />
          <Route path="/skills" element={<SkillManager />} />
          <Route path="/mcp-servers" element={<McpServerManager />} />
          <Route path="/hermes-tools" element={<HermesToolsets />} />
          <Route path="/config-editor" element={<ConfigEditor />} />
          <Route path="/gateway" element={<GatewayControl />} />
          <Route path="/sessions" element={<SessionManager />} />
          <Route path="/logs" element={<LogViewer />} />
          <Route path="/deny-list" element={<DenyList />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </ProtectedRoute>
  );
}
