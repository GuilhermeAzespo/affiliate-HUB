import db from './src/server/db.js';

async function main() {
  const mlOffers = await db.offer.findMany({
    where: { platform: 'mercadolivre' }
  });
  console.log(`ML Offers in DB: ${mlOffers.length}`);
  if (mlOffers.length > 0) {
    console.log(mlOffers[0]);
  }

  const shopeeOffers = await db.offer.findMany({
    where: { platform: 'shopee' }
  });
  console.log(`Shopee Offers in DB: ${shopeeOffers.length}`);
  if (shopeeOffers.length > 0) {
    console.log(shopeeOffers[0]);
  }
}

main().catch(console.error).finally(() => process.exit(0));
