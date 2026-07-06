/**
 * Scraper da página pública mercadolivre.com.br/ofertas + variantes.
 *
 * Por que scraping em vez de API:
 *   Desde abril/2025 o ML bloqueou /sites/MLB/search publicamente.
 *   A página /ofertas é HTML estático (SSR), sem anti-bot Akamai.
 *
 * Endpoints disponíveis (descobertos empiricamente em 2026-05):
 *   - /ofertas (geral) — ~48 cards por página, paginado ?page=N (testado até 10)
 *   - /ofertas/supermercado — ~113 cards (single page)
 *   - /ofertas/informatica — página dedicada
 *   - /ofertas/digitais — jogos digitais
 *   Outros slugs (/ofertas/beleza, /ofertas/celulares etc) NÃO existem
 *   (redirecionam pra home /ofertas).
 *
 * Cuidados:
 *   - Volume baixo: 1 página/min máximo
 *   - User-Agent rotativo (3 navegadores reais)
 *   - Delay aleatório 1.5-3s entre páginas
 */
import * as cheerio from 'cheerio';
import { scrapeUrl } from './scraper-listing.js';
import { SOURCE_CATALOG, findSourceById, buildPageUrl } from './sources-catalog.js';
import { createLogger } from '../logger.js';

const log = createLogger('scrape');

const BASE_URL = 'https://www.mercadolivre.com.br';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

function pickUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(min = 1500, max = 3000) {
  const ms = min + Math.floor(Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fontes válidas (URLs do ML que retornam HTML com produtos).
 * Validadas empiricamente — outros slugs redirecionam pra /ofertas.
 */
/**
 * Fontes legadas (slug → URL fixa em /ofertas/<slug>).
 * Mantidas pra compat com workspace_sources existentes.
 * NOVAS fontes usam SOURCE_CATALOG em sources-catalog.js.
 */
export const AVAILABLE_SOURCES = [
  { slug: '',             label: 'Ofertas Gerais',       paginated: true,  defaultPages: 5 },
  { slug: 'supermercado', label: 'Supermercado',         paginated: false, defaultPages: 1 },
  { slug: 'informatica',  label: 'Informática',          paginated: false, defaultPages: 1 },
  { slug: 'digitais',     label: 'Jogos Digitais',       paginated: false, defaultPages: 1 },
];

/**
 * Lista exposta pra UI: tudo do catálogo novo.
 */
export function listCatalogSources() {
  return SOURCE_CATALOG.map((s) => ({
    id: s.id,
    label: s.label,
    pages: s.pages,
    method: s.method,
    category: s.category,
  }));
}

/**
 * Faz scraping de uma fonte do catálogo (por id) com paginação.
 * Usa fetch ou Playwright conforme catálogo. Throttle 2s entre páginas.
 */
export async function scrapeCatalogSource(sourceId, maxPages, onProgress) {
  const source = findSourceById(sourceId);
  if (!source) throw new Error(`Fonte desconhecida: ${sourceId}`);

  const pages = Math.max(1, Math.min(maxPages ?? source.pages, source.pages));
  const allOffers = [];
  const seen = new Set();
  let consecutiveFails = 0;

  for (let page = 1; page <= pages; page++) {
    if (page > 1) await delay(1500, 3000);
    const url = buildPageUrl(source, page);
    // Emite ANTES da request — UI mostra "indo pra pg X" enquanto roda
    if (onProgress) onProgress({ sourceId, page, totalPages: pages, phase: 'fetching', url });
    try {
      const offers = await scrapeUrl(url, source.method);
      let added = 0;
      for (const o of offers) {
        if (seen.has(o.productId)) continue;
        seen.add(o.productId);
        allOffers.push(o);
        added++;
      }
      consecutiveFails = 0;
      if (onProgress) onProgress({ sourceId, page, totalPages: pages, found: offers.length, added, phase: 'done' });
      // Página vazia = chegou no fim, aborta loop
      if (offers.length === 0) {
        if (onProgress) onProgress({ sourceId, page, stopped: 'empty-page' });
        break;
      }
      // Se trouxe ofertas mas ZERO novas (todas duplicadas), provavelmente
      // a paginação está quebrada — para pra não ficar girando.
      if (offers.length > 0 && added === 0 && page > 1) {
        if (onProgress) onProgress({ sourceId, page, stopped: 'all-duplicates', reason: 'paginação parece quebrada — pg atual idêntica a anterior' });
        break;
      }
    } catch (e) {
      consecutiveFails++;
      if (onProgress) onProgress({ sourceId, page, error: e.message });
      if (consecutiveFails >= 3) {
        if (onProgress) onProgress({ sourceId, stopped: 'consecutive-fails' });
        break;
      }
    }
  }
  return allOffers;
}

/**
 * Faz scraping de uma fonte (slug + maxPages).
 * @returns {Promise<Array>} ofertas normalizadas
 */
export async function scrapeSource({ slug = '', maxPages = 1 } = {}, onProgress) {
  const allOffers = [];
  const sourceConfig = AVAILABLE_SOURCES.find((s) => s.slug === slug) ?? AVAILABLE_SOURCES[0];
  const pages = sourceConfig.paginated ? Math.max(1, Math.min(maxPages, 10)) : 1;
  const baseUrl = slug ? `${BASE_URL}/ofertas/${slug}` : `${BASE_URL}/ofertas`;

  for (let page = 1; page <= pages; page++) {
    if (page > 1) await delay(2000, 4000);
    const url = sourceConfig.paginated && page > 1 ? `${baseUrl}?page=${page}` : baseUrl;
    try {
      const offers = await scrapePage(url);
      allOffers.push(...offers);
      if (onProgress) onProgress({ slug: slug || 'geral', page, totalPages: pages, found: offers.length });
    } catch (e) {
      if (onProgress) onProgress({ slug: slug || 'geral', page, error: e.message });
    }
  }
  return allOffers;
}

async function scrapePage(url) {
  await delay(500, 1500);
  const ua = pickUA();
  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} (UA: ${ua.slice(0, 50)})`);
  }
  const html = await res.text();
  const parsed = parseOffersPage(html);
  // Tudo num único debug — só aparece com LOG_LEVEL=debug
  log.debug('page scraped', {
    url: url.slice(-60),
    status: res.status,
    kb: Math.round(html.length / 1024),
    parsed: parsed.length,
  });
  return parsed;
}

function parseOffersPage(html) {
  const $ = cheerio.load(html);
  const offers = [];
  const seen = new Set();
  const reasons = { noTitle: 0, noPermalink: 0, noProductId: 0, dupe: 0, noPrice: 0 };

  const cards = $('div.andes-card.poly-card');

  cards.each((_, el) => {
    const $el = $(el);

    // FIX: seletor velho exigia <h3>, markup novo é só <a class="poly-component__title">
    let titleAnchor = $el.find('a.poly-component__title').first();
    if (!titleAnchor.length) {
      titleAnchor = $el.find('h3.poly-component__title-wrapper a').first();
    }
    const title = titleAnchor.text().trim();
    let permalink = titleAnchor.attr('href') ?? '';
    permalink = permalink.split('#')[0];

    if (!title) { reasons.noTitle++; return; }
    if (!permalink) { reasons.noPermalink++; return; }
    const productId = extractProductId(permalink);
    if (!productId) { reasons.noProductId++; return; }
    if (seen.has(productId)) { reasons.dupe++; return; }
    seen.add(productId);

    const img = $el.find('img.poly-component__picture').first();
    const image = img.attr('data-src') ?? img.attr('src') ?? '';

    // Preço atual
    const $current = $el.find('div.poly-price__current').first();
    const curReais = parseInt(($current.find('span.andes-money-amount__fraction').first().text() || '0').replace(/\./g, ''), 10);
    const curCents = parseInt($current.find('span.andes-money-amount__cents').first().text() || '0', 10);
    const price = isNaN(curReais) || curReais === 0 ? null : curReais + (curCents / 100);

    // Preço original (riscado)
    const $orig = $el.find('s.andes-money-amount--previous').first();
    let originalPrice = null;
    if ($orig.length) {
      const origReais = parseInt(($orig.find('span.andes-money-amount__fraction').first().text() || '0').replace(/\./g, ''), 10);
      const origCents = parseInt($orig.find('span.andes-money-amount__cents').first().text() || '0', 10);
      if (!isNaN(origReais) && origReais > 0) originalPrice = origReais + (origCents / 100);
    }

    const discountPercent = originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

    // Frete grátis
    const shippingText = $el.find('div.poly-component__shipping').text();
    const freeShipping = shippingText.includes('Frete grátis');

    // Selo (Oferta do Dia, Black, Queima, etc)
    const highlight = $el.find('span.poly-component__highlight').first().text().trim();

    // Cupom (pill no rodapé do card)
    const coupon = $el.find('span.poly-coupons__pill, .poly-coupons span').first().text().trim()
                || ($el.text().match(/Cupom[^,\n]{0,30}/i)?.[0]?.trim() ?? '');

    if (price == null) { reasons.noPrice++; return; }

    offers.push({
      productId,
      title,
      price,
      originalPrice,
      discountPercent,
      currency: 'BRL',
      permalink,
      image,
      condition: null,
      freeShipping,
      soldQuantity: 0,
      highlight: highlight || null,
      coupon: coupon || null,
    });
  });

  // Só loga discarded em debug, e só se houver algo significativo
  const discardedTotal = Object.values(reasons).reduce((a, b) => a + b, 0);
  if (discardedTotal > 0) {
    log.trace('parser discartou', { ...reasons, total: discardedTotal, kept: offers.length });
  }

  return offers;
}

/**
 * Extrai o productId (MLBxxx) de um permalink.
 * Suporta /p/MLB12345 (catalog PDP) e /MLB-12345 (item).
 */
export function extractProductId(url) {
  if (!url) return null;
  let m = url.match(/\/p\/(MLB\d+)/i);
  if (m) return m[1];
  m = url.match(/\/(MLB-?\d+)/i);
  if (m) return m[1].replace('-', '');
  return null;
}

/**
 * Carrega 1 produto individual via API ML (endpoint /items que continua acessível).
 * Usado pra "colar URL manual" — você cola um link, sistema extrai o item.
 */
export async function fetchItemByUrl(url) {
  const productId = extractProductId(url);
  if (!productId) {
    throw new Error('URL inválida — não consegui extrair o ID do produto');
  }
  const res = await fetch(`https://api.mercadolibre.com/items/${productId}`, {
    headers: {
      'User-Agent': pickUA(),
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    return await fetchItemByScraping(url);
  }
  const item = await res.json();
  return {
    productId: item.id,
    title: item.title,
    price: item.price,
    originalPrice: item.original_price,
    discountPercent: item.original_price && item.original_price > item.price
      ? Math.round(((item.original_price - item.price) / item.original_price) * 100)
      : 0,
    currency: item.currency_id,
    permalink: item.permalink,
    image: (item.thumbnail || '').replace('-I.jpg', '-O.jpg') || item.pictures?.[0]?.url || '',
    condition: item.condition,
    freeShipping: !!item.shipping?.free_shipping,
    soldQuantity: item.sold_quantity ?? 0,
    highlight: null,
  };
}

async function fetchItemByScraping(url) {
  await delay(1000, 2500);
  const res = await fetch(url, {
    headers: {
      'User-Agent': pickUA(),
      'Accept': 'text/html',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`Scrape produto HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('h1.ui-pdp-title').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') || '';
  const image = $('meta[property="og:image"]').attr('content') || '';

  const priceText = $('meta[property="product:price:amount"]').attr('content');
  const price = priceText ? parseFloat(priceText) : null;
  const originalRaw = $('s.andes-money-amount--previous span.andes-money-amount__fraction').first().text();
  const originalPrice = originalRaw ? parseFloat(originalRaw.replace(/\./g, '')) : null;

  const productId = extractProductId(url);
  if (!title || price == null || !productId) {
    throw new Error('Não consegui extrair dados do produto (HTML mudou?)');
  }
  return {
    productId, title, price, originalPrice,
    discountPercent: originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0,
    currency: 'BRL',
    permalink: url.split('#')[0],
    image,
    condition: null,
    freeShipping: false,
    soldQuantity: 0,
    highlight: null,
  };
}

/**
 * Calcula score de atratividade (0-100) usando RENTABILIDADE + POPULARIDADE
 * como métricas principais.
 *
 * Pesos:
 *   - Comissão estimada (R$): 0-35 pts (ofertas que rendem mais ganham mais)
 *   - Desconto %: 0-20 pts            (incentivo de conversão)
 *   - Vendas (soldQuantity): 0-20 pts (best-sellers sobem)
 *   - Cupom: +12 pts                  (selo "use cupom" tem alta conversão)
 *   - Frete grátis: +8 pts
 *   - Selo destacado: +5 pts          (oferta do dia, queima)
 *
 * Total máximo teórico: 100. Faixa típica: 30-80.
 */
export function scoreOffer(o, opts = {}) {
  const { estimatedCommission = 0, priceMin = 30, priceMax = 500 } = opts;
  let score = 0;

  // Rentabilidade: comissão estimada vira pontos. Curva: 0=0pts, R$5=18pts, R$15+=35pts
  if (estimatedCommission >= 15) score += 35;
  else if (estimatedCommission >= 5) score += 18 + Math.round((estimatedCommission - 5) * 1.7);
  else score += Math.round(estimatedCommission * 3.6);

  // Desconto: 0-20 pts (50% off = 20 pts)
  score += Math.min(20, Math.round(o.discountPercent * 0.4));

  // Vendas: 0-20 pts (curva logaritmica — ML mostra "X vendidos" no card)
  //   100+   = +8
  //   500+   = +12
  //   1000+  = +15
  //   5000+  = +18
  //   10000+ = +20
  const sold = o.soldQuantity ?? 0;
  if      (sold >= 10000) score += 20;
  else if (sold >= 5000)  score += 18;
  else if (sold >= 1000)  score += 15;
  else if (sold >= 500)   score += 12;
  else if (sold >= 100)   score += 8;
  else if (sold >= 50)    score += 4;

  // Cupom: +12 pts
  if (o.coupon) score += 12;

  // Frete grátis: +8 pts
  if (o.freeShipping) score += 8;

  // Selo destacado: +5 pts
  if (o.highlight) score += 5;

  // Penalidade levíssima fora da faixa de preço (mantém ofertas premium acessíveis)
  if (o.price < priceMin || o.price > priceMax) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Filtra ofertas pelo conjunto de keywords (case-insensitive).
 * Se keywords vazio, retorna todas.
 */
export function matchKeywords(offer, keywordsCsv) {
  if (!keywordsCsv?.trim()) return true;
  const keywords = keywordsCsv.toLowerCase().split(',').map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return true;
  const title = offer.title.toLowerCase();
  return keywords.some((k) => title.includes(k));
}
