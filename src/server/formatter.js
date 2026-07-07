/**
 * Formata uma oferta para envio via WhatsApp.
 * O WhatsApp usa markdown próprio: *negrito*, _itálico_, ~tachado~
 */

const brl = (n) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PLATFORM_LABELS = {
  mercadolivre: '🛒 Mercado Livre',
  shopee: '🛍️ Shopee',
};

const HOOKS = [
  'CUPOM = ECONOMIA EXTRA 💸',
  '🔥 OLHA ESSA OFERTA!',
  '💥 ACHADINHO IMPERDÍVEL!',
  '⚡ PROMOÇÃO RELÂMPAGO!',
  '🎯 PREÇO DE BLACK FRIDAY!',
  '🤑 ECONOMIZE AGORA!',
  '👀 VÃO ACABAR LOGO!',
];

const CLOSINGS = [
  'Você merece! ✨',
  'Aproveite antes que acabe! 🏃‍♀️',
  'Garanta o seu com desconto! 🛍️',
  'Corre que o estoque é limitado! ⏳',
];

function pickHook() {
  return HOOKS[Math.floor(Math.random() * HOOKS.length)];
}

function pickClosing() {
  return CLOSINGS[Math.floor(Math.random() * CLOSINGS.length)];
}

/**
 * Formata a mensagem principal da oferta.
 */
export function formatOffer(offer) {
  const lines = [];

  lines.push(pickHook());
  lines.push('');
  lines.push(`*${offer.title}*`);
  lines.push('');

  if (offer.originalPrice && offer.originalPrice > offer.price) {
    lines.push(`💸 ~De ${brl(offer.originalPrice)}~`);
    const discountStr = offer.discount ? ` (${offer.discount}% OFF)` : '';
    lines.push(`💰 *Por ${brl(offer.price)}*${discountStr}`);
  } else {
    // Para ofertas que não têm preço original (como Shopee via GraphQL)
    lines.push(`💰 *Por ${brl(offer.price)}*`);
  }

  lines.push('');
  if (offer.platform === 'mercadolivre') {
    lines.push('📦 Via Mercado Livre');
  } else if (offer.platform === 'shopee') {
    lines.push('📦 Via Shopee');
  }
  lines.push(`🛒 Link: ${offer.affiliateUrl}`);
  lines.push('');
  lines.push(pickClosing());
  lines.push(`⚠️ _Preço pode mudar a qualquer momento!_`);

  return lines.join('\n');
}

/**
 * Formata uma mensagem mais curta (para grupos menores).
 */
export function formatOfferCompact(offer) {
  const lines = [];

  lines.push(`🔥 *${offer.title}*`);

  if (offer.originalPrice && offer.originalPrice > offer.price) {
    const discountStr = offer.discount ? ` (-${offer.discount}%)` : '';
    lines.push(`~~${brl(offer.originalPrice)}~~ → *${brl(offer.price)}*${discountStr}`);
  } else {
    lines.push(`💰 *${brl(offer.price)}*`);
  }

  if (offer.platform === 'mercadolivre') {
    lines.push(`📦 Via Mercado Livre`);
  } else if (offer.platform === 'shopee') {
    lines.push(`📦 Via Shopee`);
  }
  lines.push(`🛒 Link: ${offer.affiliateUrl}`);
  lines.push(`⚠️ _Preços sujeitos a alteração_`);

  return lines.join('\n');
}
