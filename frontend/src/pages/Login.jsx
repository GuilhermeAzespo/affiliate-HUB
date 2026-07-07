import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';

export default function Login() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.auth.login(password);
      navigate('/');
    } catch (err) {
      addToast(err.message || 'Senha incorreta', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🤖</div>
        <h1 className="login-title">Afiliado<span style={{ color: 'var(--c-purple-light)' }}>HUB</span></h1>
        <p className="login-subtitle">
          Plataforma de curadoria e disparo de ofertas
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Senha do Dashboard</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Digite sua senha..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading || !password}
            style={{ justifyContent: 'center', marginTop: 'var(--sp-2)' }}
          >
            {loading ? <span className="spinner" /> : null}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={{ marginTop: 'var(--sp-6)', textAlign: 'center', fontSize: '12px', color: 'var(--c-text-3)' }}>
          Mercado Livre + Shopee Afiliados · WhatsApp
        </p>
      </div>
    </div>
  );
}
