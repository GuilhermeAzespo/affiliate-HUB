import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { useConfirm } from '../contexts/ConfirmContext.jsx';

const PLATFORMS_INFO = {
  mercadolivre: {
    name: 'Mercado Livre',
    icon: '🛒',
    color: '#ffe600',
    bg: 'rgba(255,230,0,0.08)',
    border: 'rgba(255,230,0,0.25)',
    description: 'Conecte via OAuth para buscar e anunciar produtos do ML Afiliados.',
    fields: [
      { key: 'affiliateTag', label: 'Tag de Afiliado (matt_word)', placeholder: 'ex: seunome-20' },
      { key: 'filters.keyword', label: 'Palavras-chave (separadas por vírgula)', placeholder: 'ex: iphone, notebook, fralda' },
      { key: 'filters.categoryId', label: 'Categoria ML (opcional)', placeholder: 'ex: MLB1051' },
      { key: 'filters.minDiscount', label: 'Desconto mínimo (%)', placeholder: 'ex: 20', type: 'number' },
    ],
    requiresOAuth: true,
  },
  shopee: {
    name: 'Shopee',
    icon: '🛍️',
    color: '#ee4d2d',
    bg: 'rgba(238,77,45,0.08)',
    border: 'rgba(238,77,45,0.25)',
    description: 'Configure suas credenciais da Shopee Affiliates para buscar produtos.',
    fields: [
      { key: 'appId', label: 'App ID (Shopee Affiliate)', placeholder: 'Seu App ID' },
      { key: 'secret', label: 'Secret Key', placeholder: 'Sua Secret Key', type: 'password' },
      { key: 'affiliateTag', label: 'Sub ID (tag de rastreio)', placeholder: 'ex: meuchannel' },
      { key: 'filters.keyword', label: 'Palavras-chave (separadas por vírgula)', placeholder: 'ex: iphone, notebook, fralda' },
      { key: 'filters.minDiscount', label: 'Desconto mínimo (%)', placeholder: 'ex: 15', type: 'number' },
    ],
    requiresOAuth: false,
  },
};

export default function PlatformConnector({ workspace, onRefresh }) {
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [showForm, setShowForm] = useState(null); // platformId ou null
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  async function loadPlatforms() {
    try {
      const data = await api.platforms.list(workspace.id);
      setConnectedPlatforms(data);
    } catch {}
  }

  useEffect(() => { loadPlatforms(); }, [workspace.id]);

  function openForm(platformId) {
    const existing = connectedPlatforms.find((p) => p.platform === platformId);
    
    const initialData = {};
    if (existing) {
      initialData.appId = existing.appId;
      initialData.affiliateTag = existing.affiliateTag;
      if (existing.filters) {
        for (const [k, v] of Object.entries(existing.filters)) {
          initialData[`filters.${k}`] = v;
        }
      }
    }
    
    setFormData(initialData);
    setShowForm(platformId);
  }

  async function handleSave(platformId) {
    setSaving(true);
    const info = PLATFORMS_INFO[platformId];
    const config = {};

    // Extrai campos do formulário
    for (const field of info.fields) {
      const val = formData[field.key];
      if (val !== undefined) { // Permitir salvar string vazia para limpar o filtro
        if (field.key.startsWith('filters.')) {
          config.filters = config.filters ?? {};
          const fkey = field.key.replace('filters.', '');
          config.filters[fkey] = field.type === 'number' ? Number(val) : val;
        } else {
          config[field.key] = val;
        }
      }
    }

    try {
      await api.platforms.connect(workspace.id, { platform: platformId, config });
      addToast(`${info.name} configurado!`, 'success');
      setShowForm(null);
      loadPlatforms();
      onRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(p) {
    try {
      await api.platforms.update(workspace.id, p.id, { enabled: !p.enabled });
      addToast(`Plataforma ${p.enabled ? 'desativada' : 'ativada'}`, 'success');
      loadPlatforms();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleRemove(p) {
    if (!(await confirm({ title: 'Remover Plataforma', message: `Remover a integração com ${PLATFORMS_INFO[p.platform]?.name}? Você deixará de receber ofertas dela.`, isDanger: true }))) return;
    try {
      await api.platforms.remove(workspace.id, p.id);
      addToast('Plataforma removida', 'info');
      loadPlatforms();
    } catch (err) { addToast(err.message, 'error'); }
  }

  const connectedIds = new Set(connectedPlatforms.map((p) => p.platform));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>Plataformas de Afiliados</h2>

      {Object.entries(PLATFORMS_INFO).map(([id, info]) => {
        const connected = connectedPlatforms.find((p) => p.platform === id);
        const isActive = connected?.enabled ?? false;

        return (
          <div
            key={id}
            className="card"
            style={{
              border: connected ? `1px solid ${info.border}` : '1px solid var(--c-border)',
              background: connected ? info.bg : 'var(--c-surface)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div style={{ fontSize: 28 }}>{info.icon}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{info.name}</div>
                  <div className="text-sm text-muted">{info.description}</div>
                </div>
              </div>
              {connected && (
                <div className="flex items-center gap-3">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => handleToggle(connected)}
                    />
                    <div className="toggle-track" />
                    <div className="toggle-thumb" />
                  </label>
                </div>
              )}
            </div>

            {connected && (
              <div className="flex items-center gap-2 mb-4">
                <span className="badge badge-green">✅ Configurado</span>
                {connected.lastSyncAt && (
                  <span className="text-xs text-dimmed">
                    Última sync: {new Date(connected.lastSyncAt).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
            )}

            {/* ML OAuth Banner */}
            {id === 'mercadolivre' && !connected?.connected && (
              <div style={{
                background: 'rgba(255,230,0,0.08)', border: '1px solid rgba(255,230,0,0.2)',
                borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 16,
                fontSize: 13, color: '#fbbf24',
              }}>
                ℹ️ Você precisará autorizar o app no Mercado Livre via OAuth para ativar a busca.
              </div>
            )}

            {/* Form */}
            {showForm === id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', marginTop: 'var(--sp-2)' }}>
                <div className="divider" />
                {info.fields.map((field) => (
                  <div key={field.key} className="form-group">
                    <label className="form-label">{field.label}</label>
                    <input
                      className="form-input"
                      type={field.type ?? 'text'}
                      placeholder={field.type === 'password' && connected ? '•••••••••••••••• (Salva)' : field.placeholder}
                      value={formData[field.key] ?? ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      autoComplete="new-password"
                      name={`field_${field.key.replace('.', '_')}`}
                    />
                  </div>
                ))}
                <div className="flex gap-3 mt-2">
                  <button
                    id={`save-platform-${id}`}
                    className="btn btn-primary"
                    onClick={() => handleSave(id)}
                    disabled={saving}
                  >
                    {saving ? <span className="spinner" /> : null}
                    {saving ? ' Salvando...' : '💾 Salvar'}
                  </button>
                  {id === 'mercadolivre' && (
                    <a
                      href={`/ml/authorize?workspaceId=${workspace.id}`}
                      className="btn btn-ghost"
                    >
                      🔐 Autorizar ML OAuth
                    </a>
                  )}
                  <button className="btn btn-ghost" onClick={() => setShowForm(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  id={`config-platform-${id}`}
                  className="btn btn-ghost btn-sm"
                  onClick={() => openForm(id)}
                >
                  ⚙️ {connected ? 'Editar Config' : 'Configurar'}
                </button>
                {connected && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemove(connected)}
                  >
                    🗑️ Remover
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
