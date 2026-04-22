/**
 * router.js — Smart Scraper Router + API Routes
 * Detects platform and routes to correct scraper
 */

const express = require('express');
const router  = express.Router();
const { scrapeProduct } = require('./engine');
const { isValidUrl }    = require('./utils');

// ─── POST /api/scrape ─────────────────────────────────────────
router.post('/scrape', async (req, res) => {
  const { url, markup = 0 } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ status: 'error', message: 'Valid URL is required' });
  }

  try {
    console.log(`\n📥 [Router] Scrape request: ${url}`);
    const result = await scrapeProduct(url, { markup });

    if (result.status === 'error') {
      return res.status(422).json(result);
    }

    res.json({
      status:   'success',
      product:  result.product,
      meta:     result.product?._meta
    });
  } catch (err) {
    console.error('[Router] Scrape error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─── GET /api/scrape?url=... ──────────────────────────────────
router.get('/scrape', async (req, res) => {
  const { url, markup = 0 } = req.query;

  if (!url) return res.status(400).json({ status: 'error', message: 'URL query param required' });

  try {
    const result = await scrapeProduct(decodeURIComponent(url), { markup: parseFloat(markup) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
