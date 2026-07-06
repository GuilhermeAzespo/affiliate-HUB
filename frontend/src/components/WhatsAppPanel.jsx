import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';

const STATUS_MAP = {
  connected:    { label: 'Conectado', color: 'var(--c-green)',   icon: '✅' },
  connecting:   { label: 'Conectando', color: 'var(--c-warning)', icon: '⏳' },
  qr:           { label: 'Escanear QR', color: 'var(--c-info)',  icon: '📱' },
  disconnected: { label: 'Desconectado', color: 'var(--c-text-3)', icon: '🔴' },
};

export default function WhatsAppPanel({ workspace, onRefresh }) {
  const [groups, setGroups] = useState(workspace.groups ?? []);
  const [waGroups, setWaGroups] = useState([]);
  const [qrImage, setQrImage] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const { addToast } = useToast();

  const status = workspace.waStatus ?? 'disconnected';
  const statusInfo = STATUS_MAP[status] ?? STATUS_MAP.disconnected;

  // Gera imagem do QR quando recebe string
  useEffect(() => {
    if (workspace.waQr) {
      QRCode.toDataURL(workspace.waQr, { width: 240, margin: 2 })
        .then(setQrImage).catch(console.error);
    } else {
      setQrImage(null);
    }
  }, [workspace.waQr]);

  async function handleConnect() {
    try {
      await api.whatsapp.connect(workspace.id);
      addToast('Iniciando conexão...', 'info');
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar WhatsApp? A sessão será encerrada.')) return;
    try {
      await api.whatsapp.disconnect(workspace.id);
      addToast('WhatsApp desconectado', 'info');
      onRefresh();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function loadWaGroups() {
    setLoadingGroups(true);
    try {
      const data = await api.whatsapp.groups(workspace.id);
      setWaGroups(data);
    } catch (err) {
      addToast('Erro ao buscar grupos. Certifique-se que o WhatsApp está conectado.', 'error');
    } finally {
      setLoadingGroups(false);
    }
  }

  async function addGroup(group) {
    try {
      await api.groups.add(workspace.id, { groupJid: group.jid, name: group.name });
      addToast(`Grupo "${group.name}" adicionado!`, 'success');
      onRefresh();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function toggleGroup(gid, active) {
    try {
      await api.groups.toggle(workspace.id, gid, active);
      setGroups((prev) => prev.map((g) => g.id === gid ? { ...g, active } : g));
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function removeGroup(gid) {
    try {
      await api.groups.remove(workspace.id, gid);
      setGroups((prev) => prev.filter((g) => g.id !== gid));
      addToast('Grupo removido', 'info');
    } catch (err) { addToast(err.message, 'error'); }
  }

  const registeredJids = new Set(groups.map((g) => g.groupJid));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      {/* Status Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Conexão WhatsApp</h2>
            <p className="text-sm text-muted mt-2">Sessão isolada para este workspace</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`status-dot ${status}`} />
            <span style={{ fontSize: 14, color: statusInfo.color, fontWeight: 600 }}>
              {statusInfo.icon} {statusInfo.label}
            </span>
          </div>
        </div>

        {/* QR Code */}
        {status === 'qr' && qrImage && (
          <div style={{ textAlign: 'center', margin: 'var(--sp-6) 0' }}>
            <p className="text-sm text-muted mb-4">
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="qr-container">
                <img src={qrImage} alt="QR Code WhatsApp" width={240} height={240} />
              </div>
            </div>
            <p className="text-xs text-dimmed mt-4">QR Code expira em ~60 segundos</p>
          </div>
        )}

        <div className="flex gap-3">
          {status === 'disconnected' && (
            <button id="wa-connect-btn" className="btn btn-primary" onClick={handleConnect}>
              📱 Conectar WhatsApp
            </button>
          )}
          {(status === 'qr' || status === 'connecting') && (
            <button className="btn btn-ghost" onClick={handleConnect}>
              🔄 Gerar Novo QR
            </button>
          )}
          {status === 'connected' && (
            <>
              <button
                id="wa-load-groups-btn"
                className="btn btn-ghost"
                onClick={loadWaGroups}
                disabled={loadingGroups}
              >
                {loadingGroups ? <span className="spinner" /> : '📋'}
                {loadingGroups ? ' Carregando...' : ' Listar Grupos'}
              </button>
              <button className="btn btn-danger" onClick={handleDisconnect}>
                🔌 Desconectar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Available WA Groups */}
      {waGroups.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            Grupos Disponíveis ({waGroups.length})
          </h3>
          <p className="text-sm text-muted mb-4">Clique em "+" para adicionar ao workspace</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {waGroups.map((g) => {
              const already = registeredJids.has(g.jid);
              return (
                <div
                  key={g.jid}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 'var(--r-md)',
                    background: 'var(--c-bg-3)', border: '1px solid var(--c-border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</div>
                    <div className="text-xs text-dimmed">{g.participantCount} participantes</div>
                  </div>
                  {already ? (
                    <span className="badge badge-green">✅ Adicionado</span>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => addGroup(g)}>
                      + Adicionar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Registered Groups */}
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          Grupos Cadastrados ({groups.filter((g) => g.active).length} ativos)
        </h3>

        {groups.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
            <div className="empty-state-icon">💬</div>
            <p className="empty-state-desc">
              Conecte o WhatsApp e adicione grupos para receber as ofertas aprovadas.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map((g) => (
              <div
                key={g.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 'var(--r-md)',
                  background: g.active ? 'rgba(34,197,94,0.05)' : 'var(--c-bg-3)',
                  border: `1px solid ${g.active ? 'rgba(34,197,94,0.2)' : 'var(--c-border)'}`,
                  opacity: g.active ? 1 : 0.6,
                  transition: 'all 0.2s ease',
                }}
              >
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 18 }}>{g.active ? '💬' : '🔇'}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="toggle" title={g.active ? 'Desativar' : 'Ativar'}>
                    <input
                      type="checkbox"
                      checked={g.active}
                      onChange={(e) => toggleGroup(g.id, e.target.checked)}
                    />
                    <div className="toggle-track" />
                    <div className="toggle-thumb" />
                  </label>
                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    onClick={() => removeGroup(g.id)}
                    title="Remover grupo"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
