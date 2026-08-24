/**
 * KaBuM! via AWIN Product Feed API
 *
 * Como configurar:
 *   1. Acesse app.awin.com → Toolbox → Create-a-Feed
 *   2. Selecione o anunciante KaBuM! (awinmid: 17729)
 *   3. Gere a URL do feed e copie a sua API Key de produtos
 *   4. Configure "awinApiKey" e "awinaffid" no workspace via painel Plataformas
 *
 * Variáveis de ambiente (fallback global):
 *   AWIN_API_KEY   — API Key do product feed (Create-a-Feed)
 *   AWIN_AFFID     — Seu Publisher ID na AWIN (awinaffid)
 */

import db from '../db.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

// Anunciante KaBuM! na plataforma AWIN
const KABUM_AWIN_MID = '17729';

// Colunas mínimas necessárias do feed AWIN
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
 * Monta a URL do feed AWIN para o KaBuM!
 * Documentação: https://productdata.awin.com
 */
function buildFeedUrl(awinApiKey, keyword = '', page = 1, pageSize = 50) {
  const base = `https://productdata.awin.com/datafeed/download/apikey/${awinApiKey}`;
  const params = new URLSearchParams({
    mid: KABUM_AWIN_MID,
    columns: FEED_COLUMNS,
    format: 'json',
    // Se não houver keyword, busca todos os produtos em oferta
    ...(keyword ? { keyword } : {}),
    pagenumber: String(page),
    pagesize: String(Math.min(pageSize, 100)),
  });

  return `${base}?${params.toString()}`;
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
    limit = 50,
  } = filters;

  const keywords = keyword
    ? keyword.split(',').map((k) => k.trim()).filter(Boolean)
    : ['']; // string vazia = sem filtro de keyword (busca ampla)

  const maxKeywords = keywords.slice(0, 5);

  const fetchPromises = maxKeywords.map(async (kw) => {
    try {
      const url = buildFeedUrl(awinApiKey, kw, 1, Math.ceil(limit / maxKeywords.length));

      console.log(`[KaBuM!/AWIN] Buscando keyword="${kw || '(todas)'}" — ${url.split('?')[0]}`);

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AfiliadoHUB/1.0',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[KaBuM!/AWIN] HTTP ${res.status} para keyword="${kw}":`, text.slice(0, 300));
        return [];
      }

      // AWIN pode retornar gzip dependendo do Accept-Encoding
      const contentType = res.headers.get('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        // Tenta parsear como JSON de qualquer forma
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          console.error(`[KaBuM!/AWIN] Resposta inesperada para "${kw}":`, text.slice(0, 300));
          return [];
        }
      }

      // O feed AWIN retorna array direto ou { data: [] }
      return Array.isArray(data) ? data : (data?.data ?? data?.products ?? []);
    } catch (err) {
      console.error(`[KaBuM!/AWIN] Erro buscando "${kw}":`, err.message);
      return [];
    }
  });

  const resultsArrays = await Promise.all(fetchPromises);
  const allResults = resultsArrays.flat();

  // Remove duplicatas pelo ID do produto AWIN
  const seen = new Set();
  const uniqueResults = allResults.filter((item) => {
    const key = item.aw_product_id || item.merchant_product_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Embaralha para variar os resultados
  uniqueResults.sort(() => Math.random() - 0.5);

  const offers = [];

  for (const item of uniqueResults) {
    const externalId   = String(item.aw_product_id || item.merchant_product_id || '');
    const title        = item.product_name || item.name || '';
    const currentPrice = parseFloat(item.search_price || item.price || '0');
    const originalPrice = item.was_price ? parseFloat(item.was_price) : null;
    const imageUrl     = item.merchant_image_url || item.image_url || null;
    const category     = item.category_name || item.category || null;
    const description  = item.description || null;

    // O aw_deep_link já é o link de afiliado gerado pela AWIN (com tracking)
    let affiliateUrl = item.aw_deep_link || '';

    // Se o publisher tiver awinaffid e o link não tiver, constrói manualmente
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

  // Filtra por desconto mínimo
  const filtered = minDiscount > 0
    ? offers.filter((o) => o.discount !== null && o.discount >= minDiscount)
    : offers;

  return filtered.slice(0, limit);
}

export const PLATFORM_META = {
  id: 'kabum',
  name: 'KaBuM!',
  icon: '🥷',
  color: '#fc6b0f',
  requiresOAuth: false,
  searchOffers,
};
