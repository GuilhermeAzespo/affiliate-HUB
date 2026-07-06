import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexts/ToastContext.jsx';

const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PLATFORM_STYLES = {
  mercadolivre: { label: 'ML', icon: '🛒', cls: 'badge-ml' },
  shopee: { label: 'Shopee', icon: '🛍️', cls: 'badge-shopee' },
};

const STATUS_FILTERS = [
  { value: 'pending',  label: '⏳ Pendentes' },
  { value: 'approved', label: '✅ Aprovadas' },
  { value: 'rejected', label: '❌ Rejeitadas' },
  { value: 'sent',     label: '📤 Enviadas' },
];

export default function OffersInbox({ workspaceId }) {
  const [offers, setOffers] = useState([]);
  const [status, setStatus] = useState('pending');
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const { addToast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await api.offers.list(workspaceId, {
        status, ...(platform ? { platform } : {}),
      });
      setOffers(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId, status, platform]);

  async function handleApprove(offer) {
    try {
      await api.offers.approve(workspaceId, offer.id);
      addToast('Oferta aprovada!', 'success');
      load();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleReject(offer) {
    try {
      await api.offers.reject(workspaceId, offer.id);
      addToast('Oferta rejeitada', 'info');
      load();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleSend(offer) {
    if (!confirm('Enviar esta oferta para todos os grupos ativos?')) return;
    try {
      const result = await api.offers.send(workspaceId, offer.id);
      addToast(`✅ Enviada para ${result.sentGroups?.length ?? 0} grupo(s)!`, 'success');
      load();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleSearch() {
    setSearching(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/search`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      addToast('Busca iniciada! Ofertas aparecerão em breve.', 'info');
      setTimeout(load, 3000);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              id={`filter-${f.value}`}
              className={`filter-pill ${status === f.value ? 'active' : ''}`}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
          <button
            className={`filter-pill ${platform === '' ? 'active' : ''}`}
            onClick={() => setPlatform('')}
          >Todas</button>
          <button
            className={`filter-pill ${platform === 'mercadolivre' ? 'active' : ''}`}
            onClick={() => setPlatform('mercadolivre')}
          >🛒 ML</button>
          <button
            className={`filter-pill ${platform === 'shopee' ? 'active' : ''}`}
            onClick={() => setPlatform('shopee')}
          >🛍️ Shopee</button>
        </div>

        <button
          id="trigger-search"
          className="btn btn-ghost btn-sm"
          onClick={handleSearch}
          disabled={searching}
        >
          {searching ? <span className="spinner" /> : '🔄'}
          {searching ? ' Buscando...' : ' Buscar Ofertas'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center" style={{ height: 200 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : offers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-title">Nenhuma oferta {status === 'pending' ? 'pendente' : ''}</div>
          <p className="empty-state-desc">
            {status === 'pending'
              ? 'Clique em "Buscar Ofertas" para encontrar novos produtos.'
              : 'Nenhuma oferta nesta categoria ainda.'}
          </p>
          {status === 'pending' && (
            <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
              {searching ? 'Buscando...' : '🔍 Buscar Agora'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid-offers">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              status={status}
              onApprove={() => handleApprove(offer)}
              onReject={() => handleReject(offer)}
              onSend={() => handleSend(offer)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, status, onApprove, onReject, onSend }) {
  const [imgError, setImgError] = useState(false);
  const ps = PLATFORM_STYLES[offer.platform] ?? {};

  return (
    <div className="offer-card">
      {/* Image */}
      {offer.imageUrl && !imgError ? (
        <img
          src={offer.imageUrl}
          alt={offer.title}
          className="offer-card-image"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="offer-card-image-placeholder">{ps.icon ?? '📦'}</div>
      )}

      <div className="offer-card-body">
        {/* Platform badge */}
        <span className={`badge ${ps.cls}`}>
          {ps.icon} {ps.label}
        </span>

        <p className="offer-card-title">{offer.title}</p>

        {/* Price */}
        <div className="offer-card-price">
          <span className="offer-card-price-main">{brl(offer.price)}</span>
          {offer.originalPrice && (
            <span className="offer-card-price-old">{brl(offer.originalPrice)}</span>
          )}
          {offer.discount && (
            <span className="offer-card-discount">-{offer.discount}%</span>
          )}
        </div>

        {/* Link */}
        <a
          href={offer.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--c-text-3)' }}
          className="truncate"
        >
          🔗 Ver produto
        </a>
      </div>

      {/* Actions */}
      <div className="offer-card-actions">
        {status === 'pending' && (
          <>
            <button className="btn btn-success btn-sm" onClick={onApprove}>✅</button>
            <button className="btn btn-danger btn-sm" onClick={onReject}>❌</button>
          </>
        )}
        {status === 'approved' && (
          <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={onSend}>
            📤 Enviar
          </button>
        )}
        {status === 'sent' && (
          <div className="flex items-center gap-2" style={{ padding: '0 8px', fontSize: 12, color: 'var(--c-green-neon)' }}>
            ✅ Enviada
          </div>
        )}
      </div>
    </div>
  );
}
