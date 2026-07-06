import React, { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';

export default function AutomationSettings({ workspace, onRefresh }) {
  const settings = workspace.settings ?? {};
  
  const [formData, setFormData] = useState({
    autoApprove: settings.autoApprove ?? false,
    sendIntervalMinutes: settings.sendIntervalMinutes ?? 15,
    shopeeSearchIntervalHours: settings.shopeeSearchIntervalHours ?? 2,
    mlSearchIntervalHours: settings.mlSearchIntervalHours ?? 3,
  });
  
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  async function handleSave() {
    setSaving(true);
    try {
      await api.workspaces.update(workspace.id, { settings: formData });
      addToast('Configurações de automação salvas!', 'success');
      onRefresh();
    } catch (err) {
      addToast('Erro ao salvar configurações', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="mb-4">
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Piloto Automático</h2>
        <p className="text-sm text-muted">Configure a aprovação e envio automático de ofertas para os seus grupos.</p>
        <p className="text-xs text-dimmed mt-1">🕒 O robô só realiza postagens entre as 08:00 e 23:00.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div className="form-group flex items-center justify-between" style={{ background: 'var(--c-surface-hover)', padding: '16px', borderRadius: 'var(--r-md)' }}>
          <div>
            <label className="form-label mb-1" style={{ fontSize: 15 }}>Aprovar e Enviar Automaticamente</label>
            <div className="text-sm text-muted">As ofertas encontradas serão enviadas sozinhas.</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={formData.autoApprove}
              onChange={(e) => setFormData(prev => ({ ...prev, autoApprove: e.target.checked }))}
            />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </div>

        {formData.autoApprove && (
          <div className="form-group p-4" style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
            <label className="form-label">Intervalo de Envio no Grupo (minutos)</label>
            <div className="text-sm text-muted mb-2">Tempo de espera entre uma mensagem e outra no WhatsApp.</div>
            <input
              type="number"
              className="form-input"
              value={formData.sendIntervalMinutes}
              onChange={(e) => setFormData(prev => ({ ...prev, sendIntervalMinutes: parseFloat(e.target.value) || 0 }))}
              min="1"
            />
          </div>
        )}

        <div className="divider" />
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>Frequência de Busca das Plataformas</h3>

        <div className="flex gap-4">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Shopee (horas)</label>
            <input
              type="number"
              className="form-input"
              value={formData.shopeeSearchIntervalHours}
              onChange={(e) => setFormData(prev => ({ ...prev, shopeeSearchIntervalHours: parseFloat(e.target.value) || 0 }))}
              step="0.5"
              min="0.5"
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Mercado Livre (horas)</label>
            <input
              type="number"
              className="form-input"
              value={formData.mlSearchIntervalHours}
              onChange={(e) => setFormData(prev => ({ ...prev, mlSearchIntervalHours: parseFloat(e.target.value) || 0 }))}
              step="0.5"
              min="0.5"
            />
          </div>
        </div>

        <div className="mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : '💾 Salvar Automação'}
          </button>
        </div>
      </div>
    </div>
  );
}
