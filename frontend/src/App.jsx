import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { ToastProvider } from './contexts/ToastContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WorkspaceDetail from './pages/WorkspaceDetail.jsx';
import { api } from './api.js';

function AuthGuard({ children }) {
  const [status, setStatus] = useState('loading'); // loading | ok | fail

  useEffect(() => {
    api.auth.me()
      .then(() => setStatus('ok'))
      .catch(() => setStatus('fail'));
  }, []);

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    );
  }

  return status === 'ok' ? children : <Navigate to="/login" replace />;
}

function AppWithNav() {
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    api.workspaces.list().then(setWorkspaces).catch(() => {});
    const interval = setInterval(() => {
      api.workspaces.list().then(setWorkspaces).catch(() => {});
    }, 15000); // refresh sidebar a cada 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout workspaces={workspaces}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workspaces/:id" element={<WorkspaceDetail />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <AuthGuard>
                <AppWithNav />
              </AuthGuard>
            }
          />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
