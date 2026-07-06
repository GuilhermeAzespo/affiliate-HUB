import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('ml4.html', 'utf8');
const $ = cheerio.load(html);

const scriptContent = $('script#__NORDIC_RENDERING_CTX__').html();
if (!scriptContent) {
  console.log('Script tag not found');
  process.exit(1);
}

const match = scriptContent.match(/_n\.ctx\.r\s*=\s*(.*);/s);
if (!match) {
  console.log('JSON not found in script');
  process.exit(1);
}

try {
  const data = JSON.parse(match[1]);
  const items = data.appProps?.pageProps?.data?.items || [];
  console.log(`Found ${items.length} items`);
  
  if (items.length > 0) {
    const item = items[0].card;
    console.log(JSON.stringify(item, null, 2));
  }
} catch (e) {
  console.log('Error parsing JSON:', e.message);
}
