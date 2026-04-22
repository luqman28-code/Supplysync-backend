/**
 * engine.js — Master Scraping Engine (3-Layer System)
 * Layer 1: API Extraction (Shopify, WooCommerce, Magento, BigCommerce)
 * Layer 2: Smart Network Discovery (hidden APIs, window objects, Next.js)
 * Layer 3: Headless Browser (Playwright stealth fallback)
 */

const apiExtractor       = require('./apiExtractor');
const networkExtractor   = require('./networkExtractor');
const { scrapeWithPlaywright } = require('./scraper-playwright');
const { scrapeBasic }    = require('./scraper');
const normalizer         = require('./normalizer');
const { detectPlatform } = require('./utils');

/**
 * Main entry point — tries all layers in order
 * @param {string} url - Product or store URL
 * @param {object} options - { mode: 'product'|'collection', markup: 0 }
 */
async function scrapeProduct(url, options = {}) {
  const platform = detectPlatform(url);
  console.log(`🔍 [Engine] URL: ${url} | Platform: ${platform}`);

  let raw = null;
  let method = '';

  // ── LAYER 1: API Extraction ──────────────────────────────────
  try {
    raw = await apiExtractor.extract(url, platform);
    if (raw && raw.title) {
      method = 'api';
      console.log(`✅ [Layer 1] API extraction success`);
    }
  } catch (e) {
    console.log(`⚠️  [Layer 1] API failed: ${e.message}`);
  }

  // ── LAYER 2: Network / Script Discovery ─────────────────────
  if (!raw || !raw.title) {
    try {
      raw = await networkExtractor.extract(url);
      if (raw && raw.title) {
        method = 'network';
        console.log(`✅ [Layer 2] Network extraction success`);
      }
    } catch (e) {
      console.log(`⚠️  [Layer 2] Network failed: ${e.message}`);
    }
  }

  // ── LAYER 3: Headless Playwright ─────────────────────────────
  if (!raw || !raw.title) {
    try {
      if (platform === 'shopify') {
        raw = await scrapeBasic(url);
        method = 'cheerio-shopify';
      } else {
        raw = await scrapeWithPlaywright(url);
        method = 'playwright';
      }
      console.log(`✅ [Layer 3] Headless extraction success`);
    } catch (e) {
      console.log(`❌ [Layer 3] All layers failed: ${e.message}`);
      return { status: 'error', url, message: 'All extraction layers failed', error: e.message };
    }
  }

  // ── NORMALIZE ────────────────────────────────────────────────
  const product = normalizer.normalize(raw, { platform, markup: options.markup || 0 });
  product._meta = { url, platform, method, scrapedAt: new Date().toISOString() };

  return { status: 'success', product };
}

/**
 * Scrape multiple products — with concurrency control
 */
async function scrapeMany(urls, options = {}) {
  const concurrency = options.concurrency || 5;
  const results = [];
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    console.log(`📦 [Engine] Processing batch ${Math.floor(i/concurrency)+1} (${batch.length} items)`);

    const batchResults = await Promise.allSettled(
      batch.map(url => scrapeProduct(url, options))
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ status: 'error', url: batch[idx], message: result.reason?.message });
      }
    });

    // Polite delay between batches
    if (i + concurrency < urls.length) {
      await delay(1500);
    }
  }

  const successful = results.filter(r => r.status === 'success');
  const failed     = results.filter(r => r.status === 'error');

  return {
    status: 'success',
    totalRequested: urls.length,
    totalSuccess:   successful.length,
    totalFailed:    failed.length,
    products:       successful.map(r => r.product),
    errors:         failed
  };
}

module.exports = { scrapeProduct, scrapeMany };
