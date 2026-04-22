/**
 * networkExtractor.js — Layer 2: Smart Network/Script Discovery
 * Finds hidden APIs from HTML, script tags, window objects, Next.js data
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const { getHeaders } = require('./utils');

async function extract(url) {
  const res = await axios.get(url, {
    headers: getHeaders(),
    timeout: 20000,
    maxRedirects: 5
  });

  const html = res.data;
  const $    = cheerio.load(html);

  // Try all discovery strategies
  let data = null;

  data = tryNextJsData($, html);
  if (data?.title) return data;

  data = tryWindowProduct($, html);
  if (data?.title) return data;

  data = tryLdJson($);
  if (data?.title) return data;

  data = tryMetaTags($);
  if (data?.title) return data;

  data = tryHiddenJsonBlobs(html);
  if (data?.title) return data;

  throw new Error('Network extraction: no structured data found');
}

// ─── Next.js __NEXT_DATA__ ───────────────────────────────────
function tryNextJsData($, html) {
  try {
    const script = $('#__NEXT_DATA__').html() || '';
    if (!script) return null;

    const json = JSON.parse(script);
    const props = json?.props?.pageProps;

    // Common patterns
    const p = props?.product || props?.data?.product ||
              props?.initialState?.product || props?.productData;

    if (!p) return null;

    return {
      title:       p.title || p.name,
      description: p.description || p.body_html || p.content,
      price:       p.price || p.variants?.[0]?.price || p.priceRange?.min,
      compare_at_price: p.compareAtPrice || p.compare_at_price,
      images:      extractImages(p),
      variants:    extractVariants(p),
      sku:         p.sku || p.variants?.[0]?.sku,
      _source:     'next-data'
    };
  } catch { return null; }
}

// ─── window.product / window.__product__ ─────────────────────
function tryWindowProduct($, html) {
  try {
    const patterns = [
      /window\.product\s*=\s*({.+?});/s,
      /window\.__product\s*=\s*({.+?});/s,
      /var\s+product\s*=\s*({.+?});/s,
      /ProductData\s*=\s*({.+?});/s,
      /"product"\s*:\s*({.+?})\s*[,}]/s,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const p = JSON.parse(match[1]);
        if (p?.title || p?.name) {
          return {
            title:       p.title || p.name,
            description: p.description || p.body_html,
            price:       p.price || p.variants?.[0]?.price,
            images:      extractImages(p),
            variants:    extractVariants(p),
            sku:         p.sku,
            _source:     'window-object'
          };
        }
      }
    }
  } catch { }
  return null;
}

// ─── JSON-LD Schema.org ───────────────────────────────────────
function tryLdJson($) {
  try {
    let found = null;
    $('script[type="application/ld+json"]').each((i, el) => {
      if (found) return;
      try {
        const raw = $(el).html().trim();
        const json = JSON.parse(raw);

        const schemas = Array.isArray(json) ? json : [json];
        for (const schema of schemas) {
          const product = schema['@type'] === 'Product' ? schema :
                         schema['@graph']?.find(g => g['@type'] === 'Product');

          if (product) {
            const offer = product.offers?.[0] || product.offers || {};
            found = {
              title:       product.name,
              description: product.description,
              price:       offer.price || offer.lowPrice,
              compare_at_price: null,
              images:      flattenImages(product.image),
              variants:    [],
              sku:         product.sku || offer.sku,
              brand:       product.brand?.name,
              _source:     'ld-json'
            };
            return;
          }
        }
      } catch { }
    });
    return found;
  } catch { return null; }
}

// ─── Open Graph / Meta Tags ───────────────────────────────────
function tryMetaTags($) {
  const title = $('meta[property="og:title"]').attr('content') ||
                $('title').text();
  if (!title) return null;

  const price = $('meta[property="product:price:amount"]').attr('content') ||
                $('meta[property="og:price:amount"]').attr('content');
  const image = $('meta[property="og:image"]').attr('content');
  const desc  = $('meta[property="og:description"]').attr('content') ||
                $('meta[name="description"]').attr('content');

  return {
    title,
    description: desc,
    price,
    images: image ? [image] : [],
    variants: [],
    _source: 'meta-tags'
  };
}

// ─── Raw JSON blobs in scripts ────────────────────────────────
function tryHiddenJsonBlobs(html) {
  try {
    // Look for large JSON objects in scripts
    const matches = [...html.matchAll(/<script[^>]*>([^<]{200,})<\/script>/gs)];

    for (const match of matches) {
      const content = match[1];
      if (!content.includes('"title"') && !content.includes('"name"')) continue;

      try {
        // Try to find embedded JSON
        const jsonMatch = content.match(/\{[^{}]*"title"\s*:[^{}]*\}/);
        if (jsonMatch) {
          const p = JSON.parse(jsonMatch[0]);
          if (p.title) return { title: p.title, description: p.description, price: p.price, images: [], variants: [], _source: 'blob' };
        }
      } catch { }
    }
  } catch { }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────
function extractImages(p) {
  if (!p) return [];
  const imgs = p.images || p.media || p.photos || [];
  if (Array.isArray(imgs)) {
    return imgs.map(i => {
      if (typeof i === 'string') return i;
      return i.src || i.url || i.originalSrc || i.transformedSrc || null;
    }).filter(Boolean);
  }
  if (p.image) return [typeof p.image === 'string' ? p.image : p.image.src];
  return [];
}

function extractVariants(p) {
  if (!p) return [];
  const variants = p.variants || p.skus || [];
  return variants.map(v => ({
    title:            v.title || v.option_string,
    price:            v.price,
    compare_at_price: v.compare_at_price,
    sku:              v.sku,
    option1:          v.option1,
    option2:          v.option2,
    available:        v.available !== false
  }));
}

function flattenImages(img) {
  if (!img) return [];
  if (typeof img === 'string') return [img];
  if (Array.isArray(img)) return img.map(i => typeof i === 'string' ? i : i.url || i.src).filter(Boolean);
  return [img.url || img.src].filter(Boolean);
}

module.exports = { extract };
