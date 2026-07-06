import { PLATFORM_META as MercadoLivre } from './mercadolivre.js';
import { PLATFORM_META as Shopee } from './shopee.js';

const PLATFORMS = {
  mercadolivre: MercadoLivre,
  shopee: Shopee,
};

export function getPlatform(id) {
  return PLATFORMS[id] ?? null;
}

export function listPlatforms() {
  return Object.values(PLATFORMS);
}

/**
 * Busca ofertas em uma plataforma para um workspace.
 * @param {string} workspaceId
 * @param {string} platformId
 * @param {object} filters
 */
export async function searchOffers(workspaceId, platformId, filters) {
  const platform = getPlatform(platformId);
  if (!platform) throw new Error(`Plataforma desconhecida: ${platformId}`);
  return platform.searchOffers(workspaceId, filters);
}
