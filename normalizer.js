/**
 * normalizer.js — Unified Product Data Structure
 * Takes raw data from any platform and returns consistent format
 */

/**
 * Normalize raw scraped data into unified product format
 * @param {object} raw - Raw product data
 * @param {object} opts - { platform, markup: 0-100 (percentage) }
 */
function normalize(raw, opts = {}) {
  if (!raw) return null;

  const markup = parseFloat(opts.markup) || 0;

  const price           = parsePrice(raw.price);
  const compareAtPrice  = parsePrice(raw.compare_at_price || raw.compareAtPrice || raw.regular_price);
  const finalPrice      = applyMarkup(price, markup);
  const finalCompare    = applyMarkup(compareAtPrice || price, markup);

  return {
    title:            cleanText(raw.title || raw.name || ''),
    description:      cleanHtml(raw.description || raw.body_html || raw.content || ''),
    vendor:           cleanText(raw.vendor || raw.brand || raw.manufacturer || ''),
    product_type:     cleanText(raw.product_type || raw.category || raw.type || ''),
    tags:             normalizeTags(raw.tags),
    sku:              cleanText(raw.sku || raw.mpn || ''),

    price:            formatPrice(finalPrice),
    compare_at_price: formatPrice(finalCompare !== finalPrice ? finalCompare : null),
    original_price:   formatPrice(price),
    markup_percent:   markup,

    images:           normalizeImages(raw.images || raw.photos || raw.media || []),
    variants:         normalizeVariants(raw.variants || raw.skus || [], markup),
    options:          normalizeOptions(raw.options || []),

    inventory:        raw.inventory || raw.stock_quantity || raw.inventory_quantity || null,
    weight:           raw.weight || null,
    dimensions:       raw.dimensions || null,

    _platform:        raw._platform || opts.platform || 'unknown',
    _source:          raw._source || 'scraped'
  };
}

// ─── Price Helpers ────────────────────────────────────────────
function parsePrice(val) {
  if (!val) return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function applyMarkup(price, markup) {
  if (!price || !markup) return price;
  return Math.round(price * (1 + markup / 100) * 100) / 100;
}

function formatPrice(price) {
  if (price === null || price === undefined) return null;
  return parseFloat(price).toFixed(2);
}

// ─── Text Helpers ─────────────────────────────────────────────
function cleanText(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

function cleanHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .trim();
}

// ─── Tags ────────────────────────────────────────────────────
function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

// ─── Images ──────────────────────────────────────────────────
function normalizeImages(images) {
  if (!images) return [];
  const arr = Array.isArray(images) ? images : [images];

  return arr.map(img => {
    if (typeof img === 'string') return ensureHttps(img);
    if (img?.src)           return ensureHttps(img.src);
    if (img?.url)           return ensureHttps(img.url);
    if (img?.originalSrc)   return ensureHttps(img.originalSrc);
    if (img?.transformedSrc)return ensureHttps(img.transformedSrc);
    return null;
  }).filter(img => img && img.startsWith('http'));
}

function ensureHttps(url) {
  if (!url) return null;
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

// ─── Variants ────────────────────────────────────────────────
function normalizeVariants(variants, markup = 0) {
  if (!Array.isArray(variants)) return [];

  return variants.map((v, i) => {
    const price = parsePrice(v.price);
    const compareAt = parsePrice(v.compare_at_price || v.compareAtPrice);

    return {
      id:               v.id || i + 1,
      title:            v.title || v.option_string || buildVariantTitle(v),
      price:            formatPrice(applyMarkup(price, markup)),
      compare_at_price: formatPrice(applyMarkup(compareAt, markup)),
      sku:              v.sku || '',
      inventory:        v.inventory_quantity ?? v.inventory ?? null,
      available:        v.available !== false,
      option1:          v.option1 || null,
      option2:          v.option2 || null,
      option3:          v.option3 || null,
      weight:           v.weight || null
    };
  });
}

function buildVariantTitle(v) {
  const parts = [v.option1, v.option2, v.option3].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Default';
}

// ─── Options ─────────────────────────────────────────────────
function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map(o => ({
    name:   o.name || o.attribute_label || '',
    values: Array.isArray(o.values) ? o.values : [o.values].filter(Boolean)
  }));
}

module.exports = { normalize };
