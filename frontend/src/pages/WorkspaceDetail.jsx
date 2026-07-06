import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, createWsConnection } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import WhatsAppPanel from '../components/WhatsAppPanel.jsx';
import OffersInbox from '../components/OffersInbox.jsx';
import PlatformConnector from '../components/PlatformConnector.jsx';
import AutomationSettings from '../components/AutomationSettings.jsx';

const TABS = [
  { id: 'inbox', label: '📬 Inbox', desc: 'Curadoria de ofertas' },
  { id: 'whatsapp', label: '💬 WhatsApp', desc: 'Conexão e grupos' },
  { id: 'platforms', label: '🛒 Plataformas', desc: 'ML e Shopee' },
  { id: 'automation', label: '🤖 Automação', desc: 'Piloto automático' },
];

export default function WorkspaceDetail() {
  const { id } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [tab, setTab] = useState('inbox');
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  async function load() {
    try {
      const data = await api.workspaces.get(id);
      setWorkspace(data);
    } catch (err) {
      addToast('Erro ao carregar workspace', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // WebSocket para atualizações em tempo real (status WA, QR)
    const ws = createWsConnection((msg) => {
      if (msg.type === 'wa:status' && msg.data.workspaceId === id) {
        setWorkspace((prev) => prev ? { ...prev, waStatus: msg.data.status } : prev);
      }
      if (msg.type === 'wa:qr' && msg.data.workspaceId === id) {
        setWorkspace((prev) => prev ? { ...prev, waQr: msg.data.qr } : prev);
      }
    });

    return () => ws.close();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <div className="empty-state-title">Workspace não encontrado</div>
          <Link to="/" className="btn btn-ghost">← Voltar</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/" className="btn btn-ghost btn-sm">← Voltar</Link>
        </div>
        <div className="page-header-row">
          <div className="flex items-center gap-4">
            <div
              style={{
                width: 48, height: 48, borderRadius: 'var(--r-lg)',
                background: `${workspace.color}20`, border: `1px solid ${workspace.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}
            >
              📦
            </div>
            <div>
              <h1 className="page-title" style={{ marginBottom: 0 }}>{workspace.name}</h1>
              <div className="flex items-center gap-2 mt-2">
                <div className={`status-dot ${workspace.waStatus}`} />
                <span className="text-sm text-muted">
                  {workspace.waStatus === 'connected' ? 'WhatsApp conectado' :
                   workspace.waStatus === 'qr'        ? 'Aguardando QR Code' :
                   workspace.waStatus === 'connecting' ? 'Conectando...' : 'WhatsApp desconectado'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="filters-bar mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            className={`filter-pill ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'inbox'      && <OffersInbox      workspaceId={id} />}
      {tab === 'whatsapp'   && <WhatsAppPanel    workspace={workspace} onRefresh={load} />}
      {tab === 'platforms'  && <PlatformConnector workspace={workspace} onRefresh={load} />}
      {tab === 'automation' && <AutomationSettings workspace={workspace} onRefresh={load} />}
    </div>
  );
}
