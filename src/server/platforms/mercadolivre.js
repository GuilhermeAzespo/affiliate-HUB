import db from '../db.js';

const ML_API = 'https://api.mercadolibre.com';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

function pickUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── OAuth helpers (mantidos para não quebrar UI frontend) ────────────────────

async function getConfig(workspaceId) {
  const record = await db.workspacePlatform.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'mercadolivre' } },
  });
  return record?.config ?? null;
}

async function saveConfig(workspaceId, config) {
  await db.workspacePlatform.upsert({
    where: { workspaceId_platform: { workspaceId, platform: 'mercadolivre' } },
    create: { workspaceId, platform: 'mercadolivre', config },
    update: { config, updatedAt: new Date() },
  });
}

async function refreshToken(workspaceId, config) {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: config.refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`ML refresh token failed: ${res.status}`);
  const data = await res.json();

  const newConfig = {
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await saveConfig(workspaceId, newConfig);
  return newConfig;
}

export async function getAccessToken(workspaceId) {
  let config = await getConfig(workspaceId);
  if (!config?.accessToken) throw new Error('ML não configurado para este workspace');

  if (config.expiresAt && Date.now() > config.expiresAt - 5 * 60 * 1000) {
    config = await refreshToken(workspaceId, config);
  }
  return config.accessToken;
}

export async function exchangeCode(workspaceId, code) {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code,
      redirect_uri: process.env.ML_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ML OAuth exchange failed: ${err}`);
  }

  const data = await res.json();
  const existingConfig = await getConfig(workspaceId) ?? {};

  await saveConfig(workspaceId, {
    ...existingConfig,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    userId: data.user_id,
  });
}

export function buildAuthorizeUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_CLIENT_ID,
    redirect_uri: process.env.ML_REDIRECT_URI,
  });
  return `https://auth.mercadolivre.com.br/authorization?${params}`;
}

// ─── Busca de ofertas via Extração de Estado JSON ─────────────────────────────

// Funções de scraping removidas (fetchOffersPage, parseJSONOffers) pois usaremos a API oficial.

export async function searchOffers(workspaceId, filters = {}) {
  const config = await getConfig(workspaceId);
  const affiliateTag = config?.affiliateTag || process.env.ML_AFFILIATE_TAG || '';
  
  let token;
  try {
    token = await getAccessToken(workspaceId);
  } catch (err) {
    console.error(`[ML] Erro ao obter token: ${err.message}`);
    return [];
  }

  if (!token) return [];

  const {
    keyword,
    minDiscount = 0,
    limit = 50,
  } = filters;

  const searchKeyword = keyword || 'ofertas';

  try {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchKeyword)}&limit=${Math.min(limit, 50)}`;
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
    
    const data = await res.json();
    const results = data.results || [];

    const offers = [];

    for (const item of results) {
      const externalId = String(item.id);
      let permalink = item.permalink;
      const title = item.title;
      const currentPrice = item.price;
      const originalPrice = item.original_price || null;
      
      let imageUrl = item.thumbnail;
      if (imageUrl) {
        imageUrl = imageUrl.replace('-I.jpg', '-O.jpg').replace('http:', 'https:');
      }

      if (!externalId || !title || !currentPrice || !permalink || !imageUrl) continue;

      const discount = originalPrice && originalPrice > currentPrice
        ? Math.round((1 - currentPrice / originalPrice) * 100)
        : null;

      permalink = permalink.split('#')[0];

      const affiliateUrl = affiliateTag
        ? `${permalink}?matt_tool=affiliate_link&matt_word=${affiliateTag}`
        : permalink;

      offers.push({
        platform: 'mercadolivre',
        externalId,
        title,
        price: currentPrice,
        originalPrice,
        discount,
        imageUrl,
        affiliateUrl,
        category: null,
        workspaceId,
      });
    }

    const filteredItems = offers.filter((item) => {
      if (minDiscount > 0 && (!item.discount || item.discount < minDiscount)) {
        return false;
      }
      return true;
    });

    filteredItems.sort(() => Math.random() - 0.5);

    return filteredItems.slice(0, limit);
  } catch (err) {
    console.error(`[ML] Erro geral na busca:`, err.message);
    return [];
  }
}

// ─── Metadata da plataforma ───────────────────────────────────────────────────

export const PLATFORM_META = {
  id: 'mercadolivre',
  name: 'Mercado Livre',
  icon: '🛒',
  color: '#ffe600',
  requiresOAuth: true, // Mantido para não quebrar UI
  searchOffers,
};
