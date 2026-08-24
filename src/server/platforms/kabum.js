/**
 * KaBuM! via API Pública + Link de Afiliado AWIN
 *
 * Busca produtos na API pública do KaBuM e envolve os links com o tracker AWIN.
 * Não requer credenciais da API AWIN — apenas o Publisher ID (awinAffid).
 *
 * Configuração no workspace (Plataformas → KaBuM):
 *   awinAffid   — Seu Publisher ID na AWIN (ex: 3043887)
 *   filters.keyword      — Palavras-chave separadas por vírgula
 *   filters.minDiscount  — Desconto mínimo em %
 *
 * Variável de ambiente (fallback global):
 *   AWIN_AFFID  — Publisher ID AWIN
 */

import db from '../db.js';

const KABUM_API   = 'https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2';
const KABUM_AWIN_MID = '17729';

async function getConfig(workspaceId) {
  const record = await db.workspacePlatform.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'kabum' } },
  });
  return record?.config ?? null;
}

export async function searchOffers(workspaceId, filters = {}) {
  const config = await getConfig(workspaceId);

  // Publisher ID AWIN para montar o link de afiliado
  const awinAffid = config?.awinAffid || process.env.AWIN_AFFID || '';

  if (!awinAffid) {
    console.warn('[KaBuM!] awinAffid (Publisher ID AWIN) não configurado — links serão diretos (sem rastreio).');
  }

  const {
    keyword,
    minDiscount = 0,
    limit = 50,
  } = filters;

  const keywords = keyword
    ? keyword.split(',').map((k) => k.trim()).filter(Boolean)
    : ['ofertas'];

  const maxKeywords = keywords.slice(0, 5);

  const fetchPromises = maxKeywords.map(async (kw) => {
    try {
      const pageSize = Math.min(Math.ceil(limit / maxKeywords.length), 30);
      const url = `${KABUM_API}/products?query=${encodeURIComponent(kw)}&page_number=1&page_size=${pageSize}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.kabum.com.br/',
          'Origin': 'https://www.kabum.com.br',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        // 404 com CATALOG_NOT_MATCH = nenhum produto para esta keyword
        if (res.status === 404 && text.includes('CATALOG_NOT_MATCH')) return [];
        console.error(`[KaBuM!] HTTP ${res.status} para "${kw}":`, text.slice(0, 200));
        return [];
      }

      const json = await res.json();
      const items = json.data ?? [];
      console.log(`[KaBuM!] "${kw}": ${items.length} produtos encontrados`);
      return items;
    } catch (err) {
      console.error(`[KaBuM!] Erro buscando "${kw}":`, err.message);
      return [];
    }
  });

  const resultsArrays = await Promise.all(fetchPromises);
  const allItems = resultsArrays.flat();

  // Remove duplicatas pelo id
  const seen = new Set();
  const uniqueItems = allItems.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // Embaralha para variar
  uniqueItems.sort(() => Math.random() - 0.5);

  const offers = [];

  for (const item of uniqueItems) {
    // A API v2 retorna os dados dentro de item.attributes
    const attr = item.attributes ?? item;

    const externalId    = String(item.id || '');
    const title         = attr.title || attr.name || '';
    const currentPrice  = parseFloat(attr.price || attr.price_with_discount || '0');
    const originalPrice = parseFloat(attr.old_price || '0') || null;
    const discountPct   = parseInt(attr.discount_percentage || '0', 10) || null;
    const productSlug   = attr.product_link || '';

    // Imagem: preferência para tamanho grande (g ou gg)
    const imageUrl = attr.photos?.g?.[0] || attr.photos?.gg?.[0]
      || attr.images?.[0] || null;

    // URL do produto
    const productUrl = `https://www.kabum.com.br/produto/${externalId}/${productSlug}`;

    // Link de afiliado AWIN (tracking via redirect)
    const affiliateUrl = awinAffid
      ? `https://www.awin1.com/cread.php?awinmid=${KABUM_AWIN_MID}&awinaffid=${awinAffid}&ued=${encodeURIComponent(productUrl)}`
      : productUrl;

    if (!externalId || !title || !currentPrice) continue;

    const discount = discountPct ?? (
      originalPrice && originalPrice > currentPrice
        ? Math.round((1 - currentPrice / originalPrice) * 100)
        : null
    );

    // Filtra por desconto mínimo
    if (minDiscount > 0 && (discount === null || discount < minDiscount)) continue;

    // Só inclui produtos disponíveis
    if (attr.available === false) continue;

    offers.push({
      platform: 'kabum',
      externalId,
      title,
      price: currentPrice,
      originalPrice: originalPrice && originalPrice > currentPrice ? originalPrice : null,
      discount,
      imageUrl,
      affiliateUrl,
      description: null,
      category: attr.menu || null,
      workspaceId,
    });
  }

  console.log(`[KaBuM!] ${offers.length} ofertas após filtragem (minDiscount: ${minDiscount}%)`);
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
