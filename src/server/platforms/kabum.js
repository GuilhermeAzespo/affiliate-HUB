/**
 * KaBuM! via AWIN Product Feed API
 *
 * Fluxo correto:
 *   1. GET /datafeed/list/apikey/{KEY}  → CSV com todos os feeds configurados
 *   2. Filtra pelo merchantId 17729 (KaBuM!)
 *   3. Baixa o feed encontrado via sua própria URL de download
 *   4. Faz filtragem local por keyword e desconto mínimo
 *
 * Como configurar:
 *   1. Acesse app.awin.com → Toolbox → Create-a-Feed → selecione KaBuM!
 *   2. Gere o feed e copie a API Key (mostrada na URL do feedList)
 *   3. Publisher ID está no canto superior direito (ex: 3043887)
 *   4. Configure "awinApiKey" e "awinAffid" no workspace via painel Plataformas
 */

import db from '../db.js';

const KABUM_AWIN_MID = '17729';

// URL correta do feedList: usa ut.awin.com com publisherId + apiKey no path
// (exatamente como exibido em app.awin.com → Toolbox → Create-a-Feed)
const AWIN_FEED_LIST = (publisherId, apiKey) =>
  `https://ut.awin.com/productdata-darwin.download/publisher/${publisherId}/${apiKey}/1/feedList`;

async function getConfig(workspaceId) {
  const record = await db.workspacePlatform.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'kabum' } },
  });
  return record?.config ?? null;
}

/**
 * Parser CSV simples (delimitador vírgula com suporte a campos entre aspas).
 * Retorna array de objetos com o cabeçalho como chave.
 */
function parseCsv(text, delimiter = ',') {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

/**
 * Passo 1: Obtém a lista de feeds disponíveis e retorna a URL de download
 * do feed do KaBuM! (merchantId 17729).
 */
async function getKabumFeedUrl(awinApiKey, publisherId) {
  const listUrl = AWIN_FEED_LIST(publisherId, awinApiKey);
  console.log(`[KaBuM!/AWIN] Buscando lista de feeds (publisher: ${publisherId})...`);

  const res = await fetch(listUrl, {
    headers: { 'User-Agent': 'AfiliadoHUB/1.0' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FeedList HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const csvText = await res.text();
  console.log(`[KaBuM!/AWIN] FeedList raw (primeiros 500 chars):\n${csvText.slice(0, 500)}`);

  // A feedList usa vírgula como delimitador
  const feeds = parseCsv(csvText, ',');
  console.log(`[KaBuM!/AWIN] Total de feeds disponíveis: ${feeds.length}`);

  if (feeds.length > 0) {
    console.log(`[KaBuM!/AWIN] Colunas disponíveis no feedList:`, Object.keys(feeds[0]));
  }

  // Procura feed do KaBuM pelo merchantId
  const kabumFeed = feeds.find(
    (f) => String(f.merchant_id || f.merchantId || f['Merchant ID'] || f.merchantid || '') === KABUM_AWIN_MID
  );

  if (!kabumFeed) {
    // Mostra todos os feeds disponíveis para debug
    console.error('[KaBuM!/AWIN] Feed do KaBuM não encontrado. Feeds disponíveis:',
      JSON.stringify(feeds.map((f) => ({
        merchant_id: f.merchant_id || f.merchantId || f['Merchant ID'],
        merchant_name: f.merchant_name || f.merchantName || f['Merchant Name'],
      })))
    );
    return null;
  }

  // A URL de download está em algum campo: url, download_url, feed_url, etc.
  const downloadUrl = kabumFeed.url || kabumFeed.download_url || kabumFeed.feed_url
    || kabumFeed['URL'] || kabumFeed['Download URL'] || kabumFeed['Feed URL'];

  console.log(`[KaBuM!/AWIN] Feed KaBuM encontrado:`, JSON.stringify(kabumFeed));

  return downloadUrl || null;
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

  const keywordList = keyword
    ? keyword.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
    : [];

  // ── Passo 1: Descobre a URL de download do feed ─────────────────────────────
  if (!awinAffid) {
    console.error('[KaBuM!/AWIN] awinAffid (Publisher ID) não configurado. Configure em Plataformas → KaBuM!');
    return [];
  }

  let feedDownloadUrl;
  try {
    feedDownloadUrl = await getKabumFeedUrl(awinApiKey, awinAffid);
  } catch (err) {
    console.error('[KaBuM!/AWIN] Erro ao obter feedList:', err.message);
    return [];
  }

  if (!feedDownloadUrl) {
    console.error('[KaBuM!/AWIN] Nenhum feed do KaBuM configurado. Crie um feed em app.awin.com → Toolbox → Create-a-Feed selecionando KaBuM! (merchantId 17729).');
    return [];
  }

  // ── Passo 2: Baixa o CSV do feed ─────────────────────────────────────────────
  console.log(`[KaBuM!/AWIN] Baixando feed: ${feedDownloadUrl}`);
  let rawItems = [];

  try {
    const res = await fetch(feedDownloadUrl, {
      headers: {
        'Accept': 'text/csv, text/plain, */*',
        'User-Agent': 'AfiliadoHUB/1.0',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[KaBuM!/AWIN] HTTP ${res.status} ao baixar feed:`, text.slice(0, 500));
      return [];
    }

    const csvText = await res.text();

    // Detecta o delimitador automaticamente (| ou ,)
    const delimiter = csvText.split('\n')[0]?.includes('|') ? '|' : ',';
    rawItems = parseCsv(csvText, delimiter);

    console.log(`[KaBuM!/AWIN] Feed recebido: ${rawItems.length} produtos (delimitador: "${delimiter}")`);
    if (rawItems.length > 0) {
      console.log(`[KaBuM!/AWIN] Colunas do feed:`, Object.keys(rawItems[0]));
    }
  } catch (err) {
    console.error('[KaBuM!/AWIN] Erro ao baixar feed:', err.message);
    return [];
  }

  // ── Filtragem local ──────────────────────────────────────────────────────────

  const seen = new Set();
  let items = rawItems.filter((item) => {
    const key = item.aw_product_id || item.merchant_product_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (keywordList.length > 0) {
    items = items.filter((item) => {
      const title = (item.product_name || '').toLowerCase();
      return keywordList.some((kw) => title.includes(kw));
    });
  }

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

    let affiliateUrl = item.aw_deep_link || '';
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
