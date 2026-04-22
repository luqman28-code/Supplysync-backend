require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors()); // Fixes CORS — frontend can now talk to backend
app.use(express.json());

const scraper = require('./scraper');
const ai = require('./ai');
const shopify = require('./shopify');
const sync = require('./sync');

// ── HEALTH ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── SCRAPE COLLECTION (get product links from a store) ──
app.post('/scrape-collection', async (req, res) => {
  try {
    const { url, maxProducts = 100 } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Use Shopify JSON API if it's a Shopify store
    const isShopify = url.includes('myshopify.com') || url.includes('/collections/');
    let links = [];
    let platform = 'generic';
    let pages = 1;

    if (isShopify || url.includes('/products')) {
      platform = 'shopify';
      // Try Shopify products.json API
      const baseUrl = new URL(url).origin;
      const axios = require('axios');
      let page = 1;
      while (links.length < maxProducts) {
        const apiUrl = `${baseUrl}/products.json?limit=250&page=${page}`;
        const r = await axios.get(apiUrl, { timeout: 15000 });
        const products = r.data.products || [];
        if (!products.length) break;
        products.forEach(p => links.push(`${baseUrl}/products/${p.handle}`));
        pages = page;
        page++;
        if (products.length < 250) break;
      }
    }

    // Fallback: scrape the page for /products/ links
    if (!links.length) {
      const axios = require('axios');
      const cheerio = require('cheerio');
      const r = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(r.data);
      const baseUrl = new URL(url).origin;
      const found = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/products/')) {
          found.add(href.startsWith('http') ? href : baseUrl + href);
        }
      });
      links = [...found];
    }

    links = links.slice(0, maxProducts);
    res.json({ links, platform, pages, total: links.length });
  } catch (e) {
    console.error('[/scrape-collection]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── SCRAPE + AI REWRITE (single product preview) ──
app.post('/scrape-and-rewrite', async (req, res) => {
  try {
    const { url, settings = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const scraped = await scraper.scrapeProduct(url);
    const rewritten = await ai.rewriteProduct(scraped, settings);

    res.json({ scraped, rewritten });
  } catch (e) {
    console.error('[/scrape-and-rewrite]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PUBLISH TO SHOPIFY ──
app.post('/publish', async (req, res) => {
  try {
    const { url, scrapedData, rewrittenData, settings = {} } = req.body;

    let scraped = scrapedData;
    let rewritten = rewrittenData;

    // If only URL was sent (bulk mode), scrape + rewrite first
    if (url && !scraped) {
      scraped = await scraper.scrapeProduct(url);
      rewritten = await ai.rewriteProduct(scraped, settings);
    }

    if (!scraped) return res.status(400).json({ error: 'No product data' });

    const product = await shopify.createProduct(scraped, rewritten, settings);

    // Track the product for price sync
    sync.trackProduct(scraped.sourceUrl || url, product.id, scraped.price);

    res.json({
      success: true,
      shopifyId: product.id,
      adminUrl: `https://${process.env.SHOPIFY_STORE_URL}/admin/products/${product.id}`
    });
  } catch (e) {
    console.error('[/publish]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── TRACKED PRODUCTS ──
app.get('/tracked', (req, res) => {
  try {
    res.json({ products: sync.getAll() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/tracked/:id', async (req, res) => {
  try {
    await shopify.deleteProduct(req.params.id);
    sync.untrack(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SYNC ALL PRICES ──
app.post('/sync', async (req, res) => {
  try {
    const results = await sync.syncAll();
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ SupplySync running on port ${PORT}`));
