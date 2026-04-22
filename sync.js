/**
 * SYNC.JS
 * Tracked products ka database aur auto-price update
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'tracked-products.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { products: [] };
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { products: [] }; }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getAll() {
  return loadDB().products;
}

function trackProduct(sourceUrl, shopifyId, originalPrice) {
  const db = loadDB();
  const existing = db.products.findIndex(p => p.sourceUrl === sourceUrl);
  const entry = {
    sourceUrl,
    shopifyId: String(shopifyId),
    originalPrice: String(originalPrice || '0'),
    syncEnabled: true,
    trackedAt: new Date().toISOString(),
    lastSynced: new Date().toISOString()
  };
  if (existing >= 0) db.products[existing] = { ...db.products[existing], ...entry };
  else db.products.push(entry);
  saveDB(db);
}

function untrack(shopifyId) {
  const db = loadDB();
  db.products = db.products.filter(p => String(p.shopifyId) !== String(shopifyId));
  saveDB(db);
}

async function syncAll() {
  const db = loadDB();
  const enabled = db.products.filter(p => p.syncEnabled && p.shopifyId);
  const markup = parseFloat(process.env.MARKUP_PERCENTAGE || 30);
  const results = { synced: 0, updated: 0, failed: 0 };

  const scraper = require('./scraper');
  const shopify = require('./shopify');

  for (const tracked of enabled) {
    try {
      console.log('[SYNC] Checking:', tracked.sourceUrl);
      const fresh = await scraper.scrapeProduct(tracked.sourceUrl);

      if (fresh.price && fresh.price !== tracked.originalPrice) {
        const newPrice = (parseFloat(fresh.price) * (1 + markup / 100)).toFixed(2);
        await shopify.updatePriceAndInventory(tracked.shopifyId, newPrice, fresh.inventory ?? null);
        tracked.originalPrice = fresh.price;
        tracked.lastSynced = new Date().toISOString();
        results.updated++;
        console.log('[SYNC] Price updated:', fresh.price, '->', newPrice);
      } else {
        tracked.lastSynced = new Date().toISOString();
      }
      results.synced++;
    } catch (err) {
      console.error('[SYNC] Error for', tracked.sourceUrl, err.message);
      results.failed++;
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  saveDB(db);
  return results;
}

module.exports = { getAll, trackProduct, untrack, syncAll };
