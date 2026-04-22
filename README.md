# SupplySync Backend v3.0

## What's Fixed in v3.0
- ✅ Description: EXACT copy from supplier (no AI modification)
- ✅ Variant images: All images captured including per-variant
- ✅ Bulk importer: Reliable with proper error handling & retry
- ✅ Inventory tracking: Per-variant inventory
- ✅ All platforms: Shopify, WooCommerce, AliExpress, Amazon, Generic
- ✅ Collection/Catalog: Auto-paginate through all pages

## Files
- `server.js` — Main server with all routes
- `scraper.js` — Universal product scraper
- `ai.js` — Groq AI for SEO only (description never changed)
- `shopify.js` — Shopify product creation with variant images
- `sync.js` — Auto price/inventory sync database

## Render.com Environment Variables
| Key | Value |
|-----|-------|
| SHOPIFY_STORE_URL | 8isjna-2t.myshopify.com |
| SHOPIFY_ACCESS_TOKEN | shpat_f9bf... |
| SHOPIFY_API_KEY | a0e1e0bf... |
| SHOPIFY_API_SECRET | shpss_89df... |
| SHOPIFY_API_VERSION | 2024-01 |
| GROQ_API_KEY | gsk_gNvi... |
| MARKUP_PERCENTAGE | 30 |
| AUTO_PUBLISH | false |

## API Endpoints
- GET /health — Check status
- POST /scrape — Scrape single product
- POST /scrape-and-rewrite — Scrape + AI SEO
- POST /publish — Create product in Shopify
- POST /bulk-import — Import collection/URL list
- POST /scrape-collection — Get all product URLs from collection page
- GET /tracked — List tracked products
- POST /sync — Manual price sync
- GET /test-shopify — Test Shopify connection
