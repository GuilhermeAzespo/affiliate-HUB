import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';

export default function Layout({ children, workspaces = [] }) {
  const navigate = useNavigate();
  const { addToast } = useToast();

  async function handleLogout() {
    await api.auth.logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      {/* Background mesh */}
      <div className="bg-mesh" />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Logo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div className="sidebar-logo-text">
            Afiliado<span>HUB</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Geral</div>
          <NavLink
            to="/"
            end
            id="nav-dashboard"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">📊</span>
            Dashboard
          </NavLink>

          {workspaces.length > 0 && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 16 }}>
                Workspaces
              </div>
              {workspaces.map((ws) => (
                <NavLink
                  key={ws.id}
                  to={`/workspaces/${ws.id}`}
                  id={`nav-ws-${ws.id}`}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <div className="ws-color-dot" style={{ background: ws.color }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ws.name}
                  </span>
                  {ws.pendingCount > 0 && (
                    <span className="ws-badge">{ws.pendingCount}</span>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            id="logout-btn"
            className="sidebar-link"
            onClick={handleLogout}
            style={{ width: '100%' }}
          >
            <span className="icon">🚪</span>
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">{children}</main>
    </div>
  );
}
