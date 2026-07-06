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

async function fetchOffersPage(page) {
  const url = page > 1 ? `https://www.mercadolivre.com.br/ofertas?page=${page}` : 'https://www.mercadolivre.com.br/ofertas';
  const ua = pickUA();
  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function parseJSONOffers(html, workspaceId, affiliateTag) {
  const match = html.match(/_n\.ctx\.r\s*=\s*(\{.*?\});/s);
  if (!match) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (e) {
    console.error('[ML] Erro parse JSON state:', e.message);
    return [];
  }

  const items = data?.appProps?.pageProps?.data?.items || [];
  const offers = [];
  const tag = affiliateTag || process.env.ML_AFFILIATE_TAG || '';

  for (const item of items) {
    const card = item?.card;
    if (!card) continue;

    const externalId = card.metadata?.id || card.metadata?.product_id;
    let permalink = card.metadata?.url ? `https://${card.metadata.url}` : null;
    
    // Pegar título dos components
    const titleComp = card.components?.find(c => c.type === 'title');
    const title = titleComp?.title?.text;

    // Pegar preço dos components
    const priceComp = card.components?.find(c => c.type === 'price');
    const currentPrice = priceComp?.price?.current_price?.value;
    const originalPrice = priceComp?.price?.previous_price?.value || null;
    
    // Imagem
    const pictureId = card.pictures?.pictures?.[0]?.id;
    const imageUrl = pictureId ? `https://http2.mlstatic.com/D_NQ_${pictureId}-O.jpg` : null;

    if (!externalId || !title || !currentPrice || !permalink || !imageUrl) continue;

    const discount = originalPrice && originalPrice > currentPrice
      ? Math.round((1 - currentPrice / originalPrice) * 100)
      : null;

    // Limpar âncoras da URL
    permalink = permalink.split('#')[0];

    const affiliateUrl = tag
      ? `${permalink}?matt_tool=affiliate_link&matt_word=${tag}`
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

  return offers;
}

export async function searchOffers(workspaceId, filters = {}) {
  const config = await getConfig(workspaceId);
  const affiliateTag = config?.affiliateTag || '';

  const {
    keyword,
    minDiscount = 0,
    limit = 50,
  } = filters;

  const keywords = keyword 
    ? keyword.toLowerCase().split(',').map((k) => k.trim()).filter(Boolean) 
    : [];

  // Evita usar "oferta" ou "ofertas" como filtro literal de título
  const validKeywords = keywords.filter(k => k !== 'oferta' && k !== 'ofertas');

  try {
    // Buscar 2 páginas de ofertas para ter uma boa amostragem (aprox 96 ofertas)
    const pagesHtml = await Promise.all([
      fetchOffersPage(1),
      fetchOffersPage(2)
    ]);

    const allItems = pagesHtml.flatMap(html => parseJSONOffers(html, workspaceId, affiliateTag));

    // Remove duplicatas
    const uniqueItems = Array.from(new Map(allItems.map(item => [item.externalId, item])).values());

    // Filtros Locais
    const filteredItems = uniqueItems.filter((item) => {
      // 1. Filtro de Desconto
      if (minDiscount > 0 && (!item.discount || item.discount < minDiscount)) {
        return false;
      }
      
      // 2. Filtro de Keyword (local search no título)
      if (validKeywords.length > 0) {
        const titleLower = item.title.toLowerCase();
        const hasKeyword = validKeywords.some(k => titleLower.includes(k));
        if (!hasKeyword) return false;
      }

      return true;
    });

    // Embaralha para variar as ofertas
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
