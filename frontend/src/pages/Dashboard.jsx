import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { useConfirm } from '../contexts/ConfirmContext.jsx';
import WorkspaceModal from '../components/WorkspaceModal.jsx';

const STATUS_LABELS = {
  connected: 'Conectado', connecting: 'Conectando',
  qr: 'Aguard. QR', disconnected: 'Desconectado',
};

const PLATFORM_ICONS = { mercadolivre: '🛒', shopee: '🛍️' };

export default function Dashboard() {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState(null);
  const { addToast } = useToast();

  async function load() {
    try {
      const data = await api.workspaces.list();
      setWorkspaces(data);
    } catch (err) {
      addToast('Erro ao carregar workspaces', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalPending = workspaces.reduce((s, w) => s + (w.pendingCount ?? 0), 0);
  const connected = workspaces.filter((w) => w.waStatus === 'connected').length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Gerencie seus nichos e ofertas de afiliados</p>
          </div>
          <button id="new-workspace-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Novo Workspace
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-6">
        <div className="stat-card">
          <span className="stat-label">Workspaces</span>
          <span className="stat-value purple">{workspaces.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">WA Conectados</span>
          <span className="stat-value green">{connected}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Ofertas Pendentes</span>
          <span className="stat-value yellow">{totalPending}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Plataformas Ativas</span>
          <span className="stat-value purple">
            {workspaces.reduce((s, w) => s + (w.platforms?.length ?? 0), 0)}
          </span>
        </div>
      </div>

      {/* Workspace Cards */}
      {loading ? (
        <div className="flex items-center justify-center" style={{ height: 200 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🤖</div>
          <div className="empty-state-title">Nenhum workspace ainda</div>
          <p className="empty-state-desc">Crie seu primeiro workspace para começar a curar ofertas de afiliados.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Criar Workspace
          </button>
        </div>
      ) : (
        <div className="grid-2">
          {workspaces.map((ws) => (
            <WorkspaceCard 
              key={ws.id} 
              workspace={ws} 
              onRefresh={load} 
              onEdit={(w) => setEditingWorkspace(w)} 
            />
          ))}
        </div>
      )}

      {(showModal || editingWorkspace) && (
        <WorkspaceModal
          workspace={editingWorkspace}
          onClose={() => { setShowModal(false); setEditingWorkspace(null); }}
          onCreated={() => { setShowModal(false); setEditingWorkspace(null); load(); }}
        />
      )}
    </div>
  );
}

function WorkspaceCard({ workspace: ws, onRefresh, onEdit }) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  const handleDelete = async () => {
    if (!(await confirm({ 
      title: 'Excluir Workspace', 
      message: `Excluir o workspace "${ws.name}"? Isso removerá todas as ofertas e configurações permanentemente.`,
      isDanger: true,
      confirmText: 'Excluir'
    }))) return;
    try {
      await api.workspaces.delete(ws.id);
      addToast('Workspace excluído', 'success');
      onRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    }
  }

  return (
    <div className="card" style={{ borderLeft: `3px solid ${ws.color}` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 40, height: 40, borderRadius: 'var(--r-md)',
              background: `${ws.color}20`, border: `1px solid ${ws.color}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}
          >
            📦
          </div>
          <div>
            <div className="font-bold" style={{ fontSize: 16 }}>{ws.name}</div>
            <div className="text-xs text-dimmed">{ws.description || `/${ws.slug}`}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`status-dot ${ws.waStatus}`} />
          <span className="text-xs text-muted">{STATUS_LABELS[ws.waStatus] ?? ws.waStatus}</span>
        </div>
      </div>

      {/* Plataformas */}
      <div className="flex gap-2 mb-4">
        {ws.platforms?.length > 0 ? (
          ws.platforms.map((p) => (
            <span key={p.id} className={`badge badge-${p.platform === 'mercadolivre' ? 'ml' : 'shopee'}`}>
              {PLATFORM_ICONS[p.platform]} {p.platform === 'mercadolivre' ? 'ML' : 'Shopee'}
            </span>
          ))
        ) : (
          <span className="badge badge-gray">Sem plataformas</span>
        )}
      </div>

      {/* Ofertas pendentes */}
      {ws.pendingCount > 0 && (
        <div
          style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 'var(--r-md)', padding: '8px 12px',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, marginBottom: 16,
          }}
        >
          <span>⏳</span>
          <span style={{ color: '#fbbf24', fontWeight: 600 }}>
            {ws.pendingCount} oferta{ws.pendingCount > 1 ? 's' : ''} aguardando curadoria
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Link
          to={`/workspaces/${ws.id}`}
          id={`open-ws-${ws.id}`}
          className="btn btn-primary btn-sm flex-1"
          style={{ justifyContent: 'center' }}
        >
          Abrir
        </Link>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          style={{ border: '1px solid var(--c-border)' }}
          onClick={() => onEdit(ws)}
          title="Editar workspace"
        >
          ✏️
        </button>
        <button
          id={`delete-ws-${ws.id}`}
          className="btn btn-danger btn-sm btn-icon"
          onClick={handleDelete}
          title="Excluir workspace"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
