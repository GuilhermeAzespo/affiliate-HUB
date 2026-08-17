import db from '../db.js';

const KABUM_API = 'https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2';

async function getConfig(workspaceId) {
  const record = await db.workspacePlatform.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'kabum' } },
  });
  return record?.config ?? null;
}

export async function searchOffers(workspaceId, filters = {}) {
  const config = await getConfig(workspaceId);
  const affiliateTag = config?.affiliateTag || process.env.KABUM_AFFILIATE_TAG || '';

  const {
    keyword,
    minDiscount = 0,
    limit = 50,
  } = filters;

  const searchKeyword = keyword || 'ofertas';

  try {
    const url = `${KABUM_API}/products?query=${encodeURIComponent(searchKeyword)}&page_number=1&page_size=${Math.min(limit, 100)}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'application/json',
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
    
    const data = await res.json();
    const results = data.data || [];

    const offers = [];

    for (const item of results) {
      const externalId = String(item.code || item.id);
      const title = item.name;
      const currentPrice = item.price;
      const originalPrice = item.price_old || null;
      
      let imageUrl = item.image ? `https://images.kabum.com.br/produtos/fotos/sync_mirakl/${item.image}` : (item.images?.[0] || null);
      if (!imageUrl && item.image) {
          imageUrl = item.image; // fallback
      }
      if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `https://images.kabum.com.br/produtos/fotos/${imageUrl}`; // simple generic fallback
      }
      
      let permalink = item.friendlyName ? `https://www.kabum.com.br/produto/${externalId}/${item.friendlyName}` : `https://www.kabum.com.br/produto/${externalId}`;
      if (item.product_link) {
         permalink = `https://www.kabum.com.br/produto/${externalId}/${item.product_link}`;
      }

      if (!externalId || !title || !currentPrice || !permalink) continue;

      const discount = originalPrice && originalPrice > currentPrice
        ? Math.round((1 - currentPrice / originalPrice) * 100)
        : null;

      // Gerador de link da Awin (padrão)
      let affiliateUrl = permalink;
      if (affiliateTag) {
        // Formato: https://www.awin1.com/cread.php?awinmid=17729&awinaffid=SEU_ID&ued=LINK_ENCODED
        affiliateUrl = `https://www.awin1.com/cread.php?awinmid=17729&awinaffid=${affiliateTag}&ued=${encodeURIComponent(permalink)}`;
      }

      offers.push({
        platform: 'kabum',
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

    return filteredItems.slice(0, limit);
  } catch (err) {
    console.error(`[KaBuM!] Erro geral na busca:`, err.message);
    return [];
  }
}

export const PLATFORM_META = {
  id: 'kabum',
  name: 'KaBuM!',
  icon: '🥷',
  color: '#fc6b0f',
  requiresOAuth: false,
  searchOffers,
};
