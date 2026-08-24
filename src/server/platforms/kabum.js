/**
 * KaBuM! via AWIN Product Feed API
 *
 * A AWIN usa URLs com path-segments e SOMENTE formato CSV:
 *   https://productdata.awin.com/datafeed/download/apikey/{KEY}/columns/{cols}/format/csv/delimiter/%7C/merchantid/{MID}/
 *
 * Como configurar:
 *   1. Acesse app.awin.com → Toolbox → Create-a-Feed → copie a API Key
 *   2. Publisher ID está no canto superior direito (ex: 3043887)
 *   3. Configure "awinApiKey" e "awinAffid" no workspace via painel Plataformas
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
 * Monta a URL do feed AWIN usando path-segments e formato CSV com delimitador pipe (|).
 * O delimitador pipe (%7C) evita conflitos com vírgulas em nomes de produtos.
 */
function buildFeedUrl(awinApiKey) {
  return [
    `https://productdata.awin.com/datafeed/download/apikey/${awinApiKey}`,
    `columns/${encodeURIComponent(FEED_COLUMNS)}`,
    'format/csv',
    'delimiter/%7C',          // pipe (|) como delimitador
    'compression/none',
    `merchantid/${KABUM_AWIN_MID}`,
    '',                       // trailing slash
  ].join('/');
}

/**
 * Parser CSV simples usando delimitador pipe.
 * Retorna array de objetos com as colunas do cabeçalho como chaves.
 */
function parsePipeCsv(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split('|').map((h) => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map((line) => {
    const values = line.split('|').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

export async function searchOffers(workspaceId, filters = {}) {
  const config = await getConfig(workspaceId);

  const awinApiKey = config?.awinApiKey || process.env.AWIN_API_KEY || '';
  const awinAffid  = config?.awinAffid  || process.env.AWIN_AFFID   || '';

  if (!awinApiKey) {
    console.error('[KaBuM!/AWIN] awinApiKey não configurado. Configure em Plataformas → KaBuM!');
    return [];
  }

  const { keyword, minDiscount = 0, limit = 100 } = filters;

  // Keywords para filtro local (case-insensitive)
  const keywordList = keyword
    ? keyword.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
    : [];

  const url = buildFeedUrl(awinApiKey);
  console.log(`[KaBuM!/AWIN] Baixando feed CSV do KaBuM! — merchantid/${KABUM_AWIN_MID}`);

  let rawItems = [];

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/csv, text/plain, */*',
        'User-Agent': 'AfiliadoHUB/1.0',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[KaBuM!/AWIN] HTTP ${res.status}:`, text.slice(0, 500));
      return [];
    }

    const csvText = await res.text();
    rawItems = parsePipeCsv(csvText);
    console.log(`[KaBuM!/AWIN] Feed recebido: ${rawItems.length} produtos`);
  } catch (err) {
    console.error('[KaBuM!/AWIN] Erro ao buscar feed:', err.message);
    return [];
  }

  // ── Filtragem local ──────────────────────────────────────────────────────────

  // 1. Remove duplicatas
  const seen = new Set();
  let items = rawItems.filter((item) => {
    const key = item.aw_product_id || item.merchant_product_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 2. Filtro por keyword (título contém alguma das palavras-chave)
  if (keywordList.length > 0) {
    items = items.filter((item) => {
      const title = (item.product_name || '').toLowerCase();
      return keywordList.some((kw) => title.includes(kw));
    });
  }

  // 3. Embaralha para variar
  items.sort(() => Math.random() - 0.5);

  // ── Monta as ofertas ─────────────────────────────────────────────────────────

  const offers = [];

  for (const item of items) {
    const externalId    = String(item.aw_product_id || item.merchant_product_id || '');
    const title         = item.product_name || '';
    const currentPrice  = parseFloat(item.search_price || '0');
    const originalPrice = item.was_price && item.was_price !== '' ? parseFloat(item.was_price) : null;
    const imageUrl      = item.merchant_image_url || null;
    const category      = item.category_name || null;
    const description   = item.description || null;

    // aw_deep_link já é o link rastreado pela AWIN
    let affiliateUrl = item.aw_deep_link || '';

    // Fallback manual com awinaffid se não houver aw_deep_link
    if (!affiliateUrl && awinAffid) {
      affiliateUrl = `https://www.awin1.com/cread.php?awinmid=${KABUM_AWIN_MID}&awinaffid=${awinAffid}&ued=${encodeURIComponent(`https://www.kabum.com.br/produto/${externalId}`)}`;
    }

    if (!externalId || !title || !currentPrice || !affiliateUrl) continue;

    const discountRaw = item.discount_percent && item.discount_percent !== ''
      ? parseInt(item.discount_percent, 10)
      : null;
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
