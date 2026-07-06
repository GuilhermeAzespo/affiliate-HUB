import React, { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';

const COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2'];

export default function WorkspaceModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', color: COLORS[0] });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  function set(key, val) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.workspaces.create(form);
      addToast('Workspace criado!', 'success');
      onCreated();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="modal-title">Novo Workspace</h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <div className="form-group">
            <label className="form-label">Nome do Workspace *</label>
            <input
              id="ws-name"
              className="form-input"
              placeholder="ex: Tech, Beauty, Casa..."
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descrição (opcional)</label>
            <input
              id="ws-description"
              className="form-input"
              placeholder="ex: Produtos de tecnologia e gadgets"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Cor do Nicho</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: c, border: form.color === c ? `3px solid white` : '3px solid transparent',
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <button
              id="ws-create-btn"
              type="submit"
              className="btn btn-primary flex-1"
              disabled={saving || !form.name.trim()}
              style={{ justifyContent: 'center' }}
            >
              {saving ? <span className="spinner" /> : null}
              {saving ? ' Criando...' : '✅ Criar Workspace'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
