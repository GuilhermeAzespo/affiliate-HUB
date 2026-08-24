/**
 * KaBuM! via AWIN Product Feed API
 *
 * A AWIN usa URLs com parâmetros no PATH (não query string):
 *   https://productdata.awin.com/datafeed/download/apikey/{KEY}/columns/{cols}/format/json/merchantid/{MID}/
 *
 * Como configurar:
 *   1. Acesse app.awin.com → Toolbox → Create-a-Feed → copie a API Key
 *   2. Publisher ID está no canto superior direito (ex: 3043887)
 *   3. Configure "awinApiKey" e "awinAffid" no workspace via painel Plataformas
 *
 * Variáveis de ambiente (fallback global):
 *   AWIN_API_KEY   — API Key do product feed
 *   AWIN_AFFID     — Seu Publisher ID na AWIN
 */

import db from '../db.js';

// ID do anunciante KaBuM! na plataforma AWIN
const KABUM_AWIN_MID = '17729';

// Colunas solicitadas ao feed AWIN
const FEED_COLUMNS = [
  'aw_deep_link',
  'product_name',
  'aw_product_id',
  'merchant_product_id',
  'search_price',
  'was_price',
  'discount_percent',
  'merchant_image_url',
  'description',
  'category_name',
].join(',');

async function getConfig(workspaceId) {
  const record = await db.workspacePlatform.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'kabum' } },
  });
  return record?.config ?? null;
}

/**
 * Monta a URL do feed AWIN usando path-segments (formato obrigatório da API).
 * Ref: https://productdata.awin.com/datafeed/download/apikey/{KEY}/columns/{cols}/format/json/merchantid/{MID}/
 */
function buildFeedUrl(awinApiKey) {
  // A AWIN não suporta filtro por keyword no download do feed —
  // baixamos todos os produtos do KaBuM e filtramos localmente.
  return [
    `https://productdata.awin.com/datafeed/download/apikey/${awinApiKey}`,
    `columns/${encodeURIComponent(FEED_COLUMNS)}`,
    'format/json',
    `merchantid/${KABUM_AWIN_MID}`,
    '', // trailing slash
  ].join('/');
}

export async function searchOffers(workspaceId, filters = {}) {
  const config = await getConfig(workspaceId);

  // Credenciais: config do workspace tem prioridade sobre variáveis de ambiente
  const awinApiKey = config?.awinApiKey || process.env.AWIN_API_KEY || '';
  const awinAffid  = config?.awinAffid  || process.env.AWIN_AFFID   || '';

  if (!awinApiKey) {
    console.error('[KaBuM!/AWIN] awinApiKey não configurado. Configure em Plataformas → KaBuM!');
    return [];
  }
  if (!awinAffid) {
    console.warn('[KaBuM!/AWIN] awinAffid (Publisher ID) não configurado. Links de afiliado serão diretos.');
  }

  const {
    keyword,
    minDiscount = 0,
    limit = 100,
  } = filters;

  // Keywords para filtro local (case-insensitive)
  const keywordList = keyword
    ? keyword.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
    : [];

  const url = buildFeedUrl(awinApiKey);
  console.log(`[KaBuM!/AWIN] Baixando feed completo do KaBuM! — ${url}`);

  let rawItems = [];

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AfiliadoHUB/1.0',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[KaBuM!/AWIN] HTTP ${res.status}:`, text.slice(0, 400));
      return [];
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      rawItems = await res.json();
    } else {
      const text = await res.text();
      try {
        rawItems = JSON.parse(text);
      } catch {
        console.error('[KaBuM!/AWIN] Resposta inesperada (não é JSON):', text.slice(0, 400));
        return [];
      }
    }

    // Normaliza: AWIN pode retornar array direto ou { data: [] }
    if (!Array.isArray(rawItems)) {
      rawItems = rawItems?.data ?? rawItems?.products ?? [];
    }

    console.log(`[KaBuM!/AWIN] Feed recebido: ${rawItems.length} produtos`);
  } catch (err) {
    console.error('[KaBuM!/AWIN] Erro ao buscar feed:', err.message);
    return [];
  }

  // ── Filtragem local ──────────────────────────────────────────────────────────

  // 1. Remove duplicatas pelo ID do produto AWIN
  const seen = new Set();
  let items = rawItems.filter((item) => {
    const key = item.aw_product_id || item.merchant_product_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 2. Filtro por keyword (title contains any keyword)
  if (keywordList.length > 0) {
    items = items.filter((item) => {
      const title = (item.product_name || '').toLowerCase();
      return keywordList.some((kw) => title.includes(kw));
    });
  }

  // 3. Embaralha para variar os resultados
  items.sort(() => Math.random() - 0.5);

  // ── Monta as ofertas ─────────────────────────────────────────────────────────

  const offers = [];

  for (const item of items) {
    const externalId    = String(item.aw_product_id || item.merchant_product_id || '');
    const title         = item.product_name || item.name || '';
    const currentPrice  = parseFloat(item.search_price || item.price || '0');
    const originalPrice = item.was_price ? parseFloat(item.was_price) : null;
    const imageUrl      = item.merchant_image_url || item.image_url || null;
    const category      = item.category_name || item.category || null;
    const description   = item.description || null;

    // O aw_deep_link já é o link de afiliado gerado pela AWIN (com tracking)
    let affiliateUrl = item.aw_deep_link || '';

    // Fallback: monta o link manualmente com awinaffid se não houver aw_deep_link
    if (!affiliateUrl && awinAffid) {
      const directLink = item.merchant_deep_link || item.product_url || '';
      affiliateUrl = directLink
        ? `https://www.awin1.com/cread.php?awinmid=${KABUM_AWIN_MID}&awinaffid=${awinAffid}&ued=${encodeURIComponent(directLink)}`
        : '';
    }

    if (!externalId || !title || !currentPrice || !affiliateUrl) continue;

    const discountRaw = item.discount_percent ? parseInt(item.discount_percent, 10) : null;
    const discount = discountRaw ?? (
      originalPrice && originalPrice > currentPrice
        ? Math.round((1 - currentPrice / originalPrice) * 100)
        : null
    );

    // 4. Filtro por desconto mínimo
    if (minDiscount > 0 && (discount === null || discount < minDiscount)) continue;

    offers.push({
      platform: 'kabum',
      externalId,
      title,
      price: currentPrice,
      originalPrice,
      discount,
      imageUrl,
      affiliateUrl,
      description,
      category,
      workspaceId,
    });
  }

  console.log(`[KaBuM!/AWIN] ${offers.length} ofertas após filtragem (keyword: "${keyword || 'todas'}", minDiscount: ${minDiscount}%)`);

  return offers.slice(0, limit);
}

export const PLATFORM_META = {
  id: 'kabum',
  name: 'KaBuM!',
  icon: '🥷',
  color: '#fc6b0f',
  requiresOAuth: false,
  searchOffers,
};
