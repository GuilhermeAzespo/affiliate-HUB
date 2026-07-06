import crypto from 'crypto';
import db from '../db.js';

const SHOPEE_API = 'https://open-api.affiliate.shopee.com.br';

// ─── Helpers de assinatura ────────────────────────────────────────────────────

function buildSignature(appId, secret, timestamp, payload = '') {
  const baseStr = `${appId}${timestamp}${payload}${secret}`;
  return crypto.createHash('sha256').update(baseStr).digest('hex');
}

// ─── Config helpers ───────────────────────────────────────────────────────────

async function getConfig(workspaceId) {
  const record = await db.workspacePlatform.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'shopee' } },
  });
  return record?.config ?? null;
}

function getAppCredentials(config) {
  // Credenciais por workspace ou fallback para globais do .env
  return {
    appId: config?.appId ?? process.env.SHOPEE_APP_ID,
    secret: config?.secret ?? process.env.SHOPEE_SECRET,
    affiliateTag: config?.affiliateTag ?? process.env.SHOPEE_AFFILIATE_TAG,
  };
}

// ─── Busca de ofertas ─────────────────────────────────────────────────────────

async function shopeeRequest(appId, secret, endpoint, body = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(body);
  const signature = buildSignature(appId, secret, timestamp, payload);

  const res = await fetch(`${SHOPEE_API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopee ${endpoint} ${res.status}: ${text.slice(0, 300)}`);

  const data = JSON.parse(text);
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Shopee API error ${data.errcode}: ${data.debug_info ?? data.message ?? ''}`);
  }
  return data;
}

export async function searchOffers(workspaceId, filters = {}) {
  const config = await getConfig(workspaceId);
  const { appId, secret, affiliateTag } = getAppCredentials(config);

  if (!appId || !secret) {
    throw new Error('Shopee não configurada para este workspace');
  }

  const {
    keyword,
    categoryId,
    minDiscount = 0,
    limit = 20,
  } = filters;

  // Shopee Affiliate API: GraphQL endpoint
  const keywords = keyword ? keyword.split(',').map((k) => k.trim()).filter(Boolean) : [''];
  const maxKeywords = keywords.slice(0, 5); // Limita a 5 buscas simultâneas para não estourar rate limit

  const fetchPromises = maxKeywords.map(async (kw) => {
    // Se tiver palavra-chave, faz busca (listType 0). Se não, puxa em alta (listType 1).
    const listType = kw ? 0 : 1;
    const sortType = kw ? 1 : 5;

    // Shopee Affiliate API: GraphQL endpoint
    const query = `
      query {
        productOfferV2(
          keyword: "${kw}",
          listType: ${listType},
          sortType: ${sortType},
          page: 1,
          limit: ${Math.min(limit, 30)}
        ) {
          nodes {
            itemId
            productName
            productLink
            offerLink
            priceMin
            priceMax
            commissionRate
            imageUrl
          }
        }
      }
    `.replace(/\s+/g, ' ').trim();

    try {
      const data = await shopeeRequest(appId, secret, '/graphql', { query });
      return data.data?.productOfferV2?.nodes ?? [];
    } catch (err) {
      console.error(`[Shopee] Erro buscando '${kw}':`, err.message);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  const allNodes = results.flat();
  
  // Remove duplicatas (caso a mesma oferta venha em palavras chave diferentes)
  const uniqueItems = Array.from(new Map(allNodes.map(item => [item.itemId, item])).values());
  
  // Embaralha os resultados para misturar os itens das diferentes palavras chaves no frontend
  uniqueItems.sort(() => Math.random() - 0.5);

  const items = uniqueItems;

  return items
    .filter((item) => {
      if (minDiscount <= 0) return true;
      const commission = parseFloat(item.commissionRate ?? 0) * 100;
      return commission >= minDiscount;
    })
    .map((item) => normalizeOffer(item, workspaceId, affiliateTag));
}

function normalizeOffer(item, workspaceId, affiliateTag) {
  // A GraphQL API pode retornar strings ou floats para priceMin.
  let price = parseFloat(item.priceMin ?? 0);
  if (price > 10000) price = price / 100000; // Tratativa caso venha multiplicado por 100.000 como na REST

  const commission = parseFloat(item.commissionRate ?? 0) * 100;

  // Gera link de afiliado Shopee
  const offerLink = item.offerLink ?? item.productLink ?? '';
  const affiliateUrl = affiliateTag
    ? offerLink.includes('?')
      ? `${offerLink}&sub_id=${affiliateTag}`
      : `${offerLink}?sub_id=${affiliateTag}`
    : offerLink;

  const discount = Math.round(commission);
  const originalPrice = discount > 0 
    ? Number((price / (1 - (discount / 100))).toFixed(2))
    : price;

  return {
    platform: 'shopee',
    externalId: String(item.itemId),
    title: item.productName ?? 'Produto Shopee',
    price,
    originalPrice,
    discount, // Usando a comissão como desconto visual
    imageUrl: item.imageUrl ?? '',
    affiliateUrl,
    category: 'Shopee',
    workspaceId,
  };
}

// ─── Geração de link curto de afiliado ───────────────────────────────────────

export async function generateAffiliateLink(workspaceId, originalUrl) {
  const config = await getConfig(workspaceId);
  const { appId, secret } = getAppCredentials(config);

  const body = { origin_url: originalUrl };
  const data = await shopeeRequest(appId, secret, '/api/v2/link/generate', body);
  return data.result?.short_link ?? originalUrl;
}

// ─── Metadata da plataforma ───────────────────────────────────────────────────

export const PLATFORM_META = {
  id: 'shopee',
  name: 'Shopee',
  icon: '🛍️',
  color: '#ee4d2d',
  requiresOAuth: false,
  searchOffers,
};
