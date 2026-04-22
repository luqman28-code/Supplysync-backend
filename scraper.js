/**
 * SCRAPER.JS v5.0 — ALL 17 SUPPLIERS SUPPORTED
 *
 * Supplier Map:
 * 1.  costway.co.uk        — Custom Costway platform (JSON API + HTML)
 * 2.  tuindeco.com         — Shopware 6 (German eCommerce)
 * 3.  celsiumwellness.com  — WordPress/WooCommerce
 * 4.  woodselections.com   — WooCommerce (NL)
 * 5.  tuin.co.uk           — Custom PHP / WordPress hybrid
 * 6.  spapartsvortex.eu    — Shopify
 * 7.  saunamo.pt           — WooCommerce / Custom
 * 8.  polhus.co.uk         — Custom PHP (Polhus platform)
 * 9.  finnmarksauna.com    — Shopify
 * 10. schiedel.com         — Corporate CMS (inquiry only — no cart)
 * 11. geekbuying.com       — Custom China platform
 * 12. banggood.com         — Custom China platform
 * 13. artisanfurniture.net — WordPress/WooCommerce
 * 14. sauneco.co.uk        — WooCommerce
 * 15. heliussauna.com      — Custom CMS / WordPress
 * 16. thermalux.uk/eu      — WordPress/WooCommerce
 * 17. heatandplumb.com     — Acatalog (Actinic)
 */

const axios = require('axios');
const cheerio = require('cheerio');

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeProduct(url) {
  console.log('[SCRAPER] URL:', url);
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const baseUrl = new URL(url).origin;
  const platform = detectPlatform(html, url);
  console.log('[SCRAPER] Platform:', platform);

  let data = {};

  switch (platform) {
    case 'shopify':       data = await scrapeShopify(url, $, baseUrl, html); break;
    case 'woocommerce':   data = scrapeWooCommerce($, baseUrl, url, html); break;
    case 'acatalog':      data = scrapeAcatalog($, baseUrl, url, html); break;
    case 'shopware':      data = scrapeShopware($, baseUrl, url, html); break;
    case 'costway':       data = scrapeCostway($, baseUrl, url, html); break;
    case 'polhus':        data = scrapePolhus($, baseUrl, url, html); break;
    case 'tuin':          data = scrapeTuin($, baseUrl, url, html); break;
    case 'geekbuying':    data = scrapeGeekBuying($, baseUrl, url, html); break;
    case 'banggood':      data = scrapeBanggood($, baseUrl, url, html); break;
    default:              data = scrapeGeneric($, baseUrl, url, html); break;
  }

  // Always merge JSON-LD
  const ld = extractJsonLd($);
  if (ld) data = mergeJsonLd(data, ld);

  // Fill any gaps
  if (!data.descriptionHtml || data.descriptionHtml.trim().length < 20) {
    const { html: dh, text: dt } = extractDescription($);
    if (dh) { data.descriptionHtml = dh; data.description = dt; }
  }
  if (!data.images || data.images.length === 0) data.images = extractAllImages($, baseUrl, html);
  if (!data.inventory && data.inventory !== 0) data.inventory = 0;

  data.sourceUrl = url;
  data.platform = platform;
  data.scrapedAt = new Date().toISOString();
  console.log(`[SCRAPER] ✅ "${data.title}" | imgs:${data.images?.length} | variants:${data.variants?.length||0} | inv:${data.inventory}`);
  return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ══════════════════════════════════════════════════════════════════════════════
function detectPlatform(html, url = '') {
  const u = url.toLowerCase();
  const h = html.toLowerCase();

  // Specific supplier domains
  if (u.includes('costway.co.uk') || u.includes('costway.com')) return 'costway';
  if (u.includes('polhus.co.uk')) return 'polhus';
  if (u.includes('tuin.co.uk')) return 'tuin';
  if (u.includes('geekbuying.com')) return 'geekbuying';
  if (u.includes('banggood.com')) return 'banggood';

  // Platform detection from HTML
  if (u.includes('/acatalog/') || h.includes('acatalog') || h.includes('actinic')) return 'acatalog';
  if (h.includes('shopware') || h.includes('sw-product') || h.includes('shopware6') || h.includes('"shopware"')) return 'shopware';
  if (h.includes('cdn.shopify.com') || h.includes('shopify.theme') || u.includes('myshopify.com') || h.includes('shopify_variant')) return 'shopify';
  if (h.includes('woocommerce') || h.includes('wp-content/plugins/woocommerce') || h.includes('wc-product')) return 'woocommerce';
  if (u.includes('aliexpress.com')) return 'aliexpress';
  if (u.includes('amazon.')) return 'amazon';
  if (h.includes('bigcommerce') || h.includes('bc-storefront')) return 'bigcommerce';
  if (h.includes('magento') || h.includes('mage/')) return 'magento';
  if (h.includes('prestashop') || h.includes('id_product')) return 'prestashop';
  return 'generic';
}

// ══════════════════════════════════════════════════════════════════════════════
// FETCH PAGE
// ══════════════════════════════════════════════════════════════════════════════
async function fetchPage(url, extraHeaders = {}) {
  const res = await axios.get(url, {
    timeout: 28000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      ...extraHeaders
    },
    maxRedirects: 5
  });
  return res.data;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. COSTWAY.CO.UK — Custom platform with JSON product data
// ══════════════════════════════════════════════════════════════════════════════
function scrapeCostway($, baseUrl, url, html) {
  // Costway embeds product data as JSON
  let productData = null;
  try {
    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});\s*<\/script>/s) ||
                  html.match(/window\.productInfo\s*=\s*({.+?});\s*\n/s);
    if (match) productData = JSON.parse(match[1]);
  } catch {}

  const title = productData?.product?.name ||
                $('h1.product-name, h1[class*="product-name"], .product-title h1, h1').first().text().trim();

  let price = '';
  if (productData?.product?.price) price = String(productData.product.price);
  else price = $('.product-price .price-value, [class*="product-price"] .price, .price-box .price, .special-price .price').first().text().replace(/[^0-9.]/g, '') || '';

  const inventory = productData?.product?.quantity || parseInt($('[class*="inventory"], [class*="stock-qty"]').first().text().replace(/[^0-9]/g, '') || '0');

  const { html: descHtml, text: descText } = extractDescription($);

  const images = [];
  const seen = new Set();
  // Costway gallery
  $('img[class*="product-img"], [class*="product-gallery"] img, [class*="product-image"] img').each((_, el) => {
    const src = $(el).attr('data-zoom') || $(el).attr('data-src') || $(el).attr('src') || '';
    addImg(src, images, seen);
  });
  if (productData?.product?.images) {
    productData.product.images.forEach(img => addImg(typeof img === 'string' ? img : img?.url, images, seen));
  }
  if (!images.length) images.push(...extractAllImages($, baseUrl, html));

  const sku = $('[itemprop="sku"], [class*="product-sku"]').first().text().trim() || productData?.product?.sku || '';
  const brand = 'Costway';

  // Costway uses dropdown variants
  const variants = [];
  $('select[name*="attribute"], select[class*="variant"], select[id*="option"]').each((_, sel) => {
    const name = ($(sel).attr('name') || $(sel).attr('id') || '').replace(/option|attribute/gi, '').replace(/_/g, ' ').trim() || 'Option';
    const vals = [];
    $(sel).find('option').each((_, o) => {
      const t = $(o).text().trim();
      if (t && !['choose','select','please'].some(s => t.toLowerCase().includes(s))) vals.push(t);
    });
    if (vals.length) variants.push({ name, values: vals });
  });

  const attributes = extractSpecs($);
  return { title, price, descriptionHtml: descHtml, description: descText, images, variants, attributes, sku, brand, categories: ['Furniture', 'Home & Garden'], inventory };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. TUINDECO.COM — Shopware 6
// ══════════════════════════════════════════════════════════════════════════════
function scrapeShopware($, baseUrl, url, html) {
  // Shopware 6 stores data in sw-product JSON blocks or meta
  let swData = null;
  try {
    const match = html.match(/"product"\s*:\s*(\{.+?"id"\s*:.+?\})/s);
    if (match) swData = JSON.parse(match[1]);
  } catch {}

  const title = $('[itemprop="name"], h1.product-detail-name, h1[class*="product-detail"], h1').first().text().trim();

  let price = '';
  const priceEl = $('[itemprop="price"], .product-detail-price, [class*="product-price"], .price-unit-price').first();
  price = priceEl.attr('content') || priceEl.text().replace(/[^0-9.,]/g, '').replace(',', '.').split('.')[0] + '.' + (priceEl.text().replace(/[^0-9.,]/g, '').split(/[.,]/).pop() || '00');
  price = price.replace(/[^0-9.]/g, '');

  const { html: descHtml, text: descText } = extractDescription($);
  const images = extractAllImages($, baseUrl, html);

  // Shopware variants
  const variants = [];
  $('.product-detail-configurator-option, [class*="variant-option"], [class*="configurator"]').each((_, container) => {
    const name = $(container).find('[class*="option-name"], legend, label').first().text().trim();
    const vals = [];
    $(container).find('input[type="radio"], button[class*="option"]').each((_, opt) => {
      const v = $(opt).val() || $(opt).text().trim() || $(opt).attr('title') || '';
      if (v && v.length < 50) vals.push(v);
    });
    if (name && vals.length) variants.push({ name, values: vals });
  });

  const sku = $('[itemprop="sku"], [class*="product-number"]').first().text().replace(/[^a-zA-Z0-9\-_]/g, '').trim();
  const brand = $('[itemprop="brand"]').first().text().trim() || 'Tuindeco';
  const attributes = extractSpecs($);
  const categories = extractBreadcrumbs($);
  const inventory = parseInt($('[class*="stock-indicator"], [class*="delivery-info"]').first().text().replace(/[^0-9]/g, '') || '0') || 99;

  return { title, price, descriptionHtml: descHtml, description: descText, images, variants, attributes, sku, brand, categories, inventory };
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. POLHUS.CO.UK — Custom PHP platform
// ══════════════════════════════════════════════════════════════════════════════
function scrapePolhus($, baseUrl, url, html) {
  const title = $('h1[class*="product"], h1[class*="title"], .product-heading h1, h1').first().text().trim();

  let price = '';
  for (const sel of ['.product-price', '[class*="product-price"]', '.price', '[itemprop="price"]', '.our-price', '.buy-box [class*="price"]']) {
    const el = $(sel).first();
    const raw = el.attr('content') || el.text();
    const num = raw?.replace(/[^0-9.]/g, '');
    if (num && parseFloat(num) > 0) { price = num; break; }
  }

  const { html: descHtml, text: descText } = extractDescription($);
  const images = extractAllImages($, baseUrl, html);
  const attributes = extractSpecs($);
  const categories = extractBreadcrumbs($);
  const sku = $('[itemprop="sku"], [class*="sku"], [class*="product-code"]').first().text().replace(/[^a-zA-Z0-9\-_]/g, '').trim();

  // Polhus options — size/specification dropdowns
  const variants = extractVariants($);

  let inventory = 99;
  const stockText = $('[class*="stock"], [class*="availability"]').first().text().toLowerCase();
  if (stockText.includes('out of stock') || stockText.includes('unavailable')) inventory = 0;
  else if (stockText.match(/(\d+)/)) inventory = parseInt(stockText.match(/(\d+)/)[1]);

  return { title, price, descriptionHtml: descHtml, description: descText, images, variants, attributes, sku, brand: 'Polhus', categories, inventory };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. TUIN.CO.UK — Custom PHP/WordPress hybrid
// ══════════════════════════════════════════════════════════════════════════════
function scrapeTuin($, baseUrl, url, html) {
  const title = $('h1.product-title, h1[class*="product"], h1[itemprop="name"], h1').first().text().trim();

  let price = '';
  for (const sel of ['[class*="product-price"]', '.price', '[itemprop="price"]', '.our-price', '[class*="sale-price"]']) {
    const el = $(sel).first();
    const raw = el.attr('content') || el.text();
    const num = raw?.replace(/[^0-9.]/g, '');
    if (num && parseFloat(num) > 0 && parseFloat(num) < 99999) { price = num; break; }
  }

  const { html: descHtml, text: descText } = extractDescription($);
  const images = extractAllImages($, baseUrl, html);
  const attributes = extractSpecs($);
  const variants = extractVariants($);
  const categories = extractBreadcrumbs($);
  const sku = $('[itemprop="sku"], [class*="sku"], [class*="product-ref"]').first().text().replace(/[^a-zA-Z0-9\-_]/g, '').trim();
  const brand = $('[itemprop="brand"]').first().text().trim() || 'Tuin';

  let inventory = 99;
  const stockText = $('[class*="stock"], [class*="availability"]').first().text().toLowerCase();
  if (stockText.includes('out of stock')) inventory = 0;
  else if (stockText.match(/(\d+)/)) inventory = parseInt(stockText.match(/(\d+)/)[1]);

  return { title, price, descriptionHtml: descHtml, description: descText, images, variants, attributes, sku, brand, categories, inventory };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. GEEKBUYING.COM
// ══════════════════════════════════════════════════════════════════════════════
function scrapeGeekBuying($, baseUrl, url, html) {
  let gbData = null;
  try {
    const m = html.match(/product_info\s*=\s*(\{.+?\});\s*var/s) || html.match(/"product"\s*:\s*(\{.+?"sku".+?\})/s);
    if (m) gbData = JSON.parse(m[1]);
  } catch {}

  const title = gbData?.name || $('h1[class*="product-name"], h1[itemprop="name"], h1').first().text().trim();
  let price = gbData?.price || $('[class*="product-price"] .price, [itemprop="price"], .sale-price').first().attr('content') || $('[class*="price-now"], [itemprop="price"], .special-price').first().text().replace(/[^0-9.]/g, '') || '';

  const { html: descHtml, text: descText } = extractDescription($);
  const images = extractAllImages($, baseUrl, html);
  const attributes = extractSpecs($);
  const sku = $('[itemprop="sku"]').first().text().trim() || '';
  const variants = extractVariants($);
  const inventory = parseInt($('[class*="stock-qty"], [class*="qty-in-stock"]').first().text().replace(/[^0-9]/g, '') || '99');

  return { title, price, descriptionHtml: descHtml, description: descText, images, variants, attributes, sku, brand: 'GeekBuying', categories: [], inventory };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. BANGGOOD.COM
// ══════════════════════════════════════════════════════════════════════════════
function scrapeBanggood($, baseUrl, url, html) {
  let bgData = null;
  try {
    const m = html.match(/window\.goods_sn\s*=\s*"([^"]+)"/) ;
    if (m) bgData = { sku: m[1] };
  } catch {}

  const title = $('h1.product-name, h1[class*="product-title"], .goods-name, h1').first().text().trim();
  let price = $('[class*="main-price"], .price-now, [class*="current-price"], [itemprop="price"]').first().attr('content') || $('[class*="main-price"], .price-now').first().text().replace(/[^0-9.]/g, '') || '';

  const { html: descHtml, text: descText } = extractDescription($);
  const images = extractAllImages($, baseUrl, html);
  const attributes = extractSpecs($);
  const sku = bgData?.sku || $('[itemprop="sku"]').first().text().trim() || '';
  const variants = extractVariants($);
  const inventory = parseInt($('[class*="stock"]').first().text().replace(/[^0-9]/g, '') || '99');

  return { title, price, descriptionHtml: descHtml, description: descText, images, variants, attributes, sku, brand: '', categories: [], inventory };
}

// ══════════════════════════════════════════════════════════════════════════════
// SHOPIFY SCRAPER — finnmarksauna.com, spapartsvortex.eu, etc.
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeShopify(url, $, baseUrl, html) {
  try {
    const jsonUrl = url.split('?')[0].replace(/\/$/, '') + '.json';
    const res = await axios.get(jsonUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const p = res.data?.product;
    if (p?.title) {
      const allImages = [];
      const seenI = new Set();
      (p.images || []).forEach(i => { if (i.src && !seenI.has(i.src)) { seenI.add(i.src); allImages.push(i.src); } });
      (p.variants || []).forEach(v => {
        if (v.image_id) { const vi = (p.images||[]).find(i=>i.id===v.image_id); if(vi&&!seenI.has(vi.src)){seenI.add(vi.src);allImages.push(vi.src);} }
      });
      const variants = (p.variants||[]).map(v=>({ id:v.id, title:v.title, price:v.price, compareAtPrice:v.compare_at_price, sku:v.sku||'', barcode:v.barcode||'', inventory:v.inventory_quantity||0, weight:v.weight||0, weightUnit:v.weight_unit||'kg', option1:v.option1, option2:v.option2, option3:v.option3, available:v.available!==false }));
      return { title:p.title, description:stripHtml(p.body_html||''), descriptionHtml:p.body_html||'', price:p.variants?.[0]?.price||'', compareAtPrice:p.variants?.[0]?.compare_at_price||'', vendor:p.vendor||'', productType:p.product_type||'', tags:p.tags?p.tags.split(',').map(t=>t.trim()).filter(Boolean):[], sku:p.variants?.[0]?.sku||'', barcode:p.variants?.[0]?.barcode||'', weight:p.variants?.[0]?.weight||0, weightUnit:p.variants?.[0]?.weight_unit||'kg', inventory:variants.reduce((s,v)=>s+(parseInt(v.inventory)||0),0), images:allImages, variants, options:(p.options||[]).map(o=>({name:o.name,values:o.values})), handle:p.handle||'' };
    }
  } catch (e) { console.log('[SCRAPER] Shopify JSON failed:', e.message); }
  return scrapeGeneric($, baseUrl, url, html);
}

// ══════════════════════════════════════════════════════════════════════════════
// WOOCOMMERCE — celsiumwellness.com, woodselections.com, artisanfurniture.net,
//               sauneco.co.uk, thermalux.uk, saunamo.pt, heliussauna.com
// ══════════════════════════════════════════════════════════════════════════════
function scrapeWooCommerce($, baseUrl, url, html) {
  const title = $('h1.product_title, h1.entry-title, [class*="product-title"] h1').first().text().trim();
  let price = '';
  const saleEl = $('.price ins .woocommerce-Price-amount, .price ins bdi').first();
  price = saleEl.length ? saleEl.text().replace(/[^0-9.]/g,'') : $('.woocommerce-Price-amount').first().text().replace(/[^0-9.]/g,'');
  const compareAtPrice = $('.price del .woocommerce-Price-amount').first().text().replace(/[^0-9.]/g,'') || '';

  const { html: descHtml, text: descText } = extractDescription($);
  const images = extractAllImages($, baseUrl, html);

  // WooCommerce variation images
  try {
    const varMatch = html.match(/"variations"\s*:\s*(\[[\s\S]+?\])\s*[,}]/);
    if (varMatch) { JSON.parse(varMatch[1]).forEach(v => { const s=v.image?.url||v.image?.full_src||v.image_src; if(s&&s.startsWith('http')&&!images.includes(s))images.push(s); }); }
  } catch {}

  const attributes = {};
  $('.woocommerce-product-attributes tr, .shop_attributes tr').each((_, row) => {
    const k=$(row).find('th').text().trim().replace(':',''); const v=$(row).find('td').text().trim();
    if (k&&v&&k.length<80) attributes[k]=v;
  });

  const variants = [];
  const seenV = new Set();
  $('.variations select, select[name*="attribute"]').each((_, sel) => {
    const name=($(sel).attr('name')||$(sel).attr('id')||'').replace('attribute_pa_','').replace('attribute_','').replace(/[\[\]]/g,'').replace(/_/g,' ').trim();
    if (!name||seenV.has(name.toLowerCase())) return;
    const vals = [];
    $(sel).find('option').each((_,o)=>{ const t=$(o).text().trim(),v=$(o).val()?.trim(); if(v&&!['','choose','select'].some(s=>t?.toLowerCase().startsWith(s)))vals.push(t||v); });
    if (vals.length) { seenV.add(name.toLowerCase()); variants.push({name,values:vals}); }
  });

  const sku = $('.sku').first().text().replace(/[^a-zA-Z0-9\-_]/g,'').trim();
  const brand = $('[class*="brand"] a, meta[property="product:brand"]').first().attr('content') || $('[class*="brand"] a').first().text().trim() || '';
  const categories = []; $('.posted_in a').each((_,el)=>categories.push($(el).text().trim()));

  let inventory = 0;
  const stockText = $('.stock').first().text().toLowerCase();
  if (stockText.includes('in stock')) { const m=stockText.match(/(\d+)/); inventory=m?parseInt(m[1]):99; }

  return { title, price, compareAtPrice, descriptionHtml:descHtml, description:descText, images, variants, attributes, sku, brand, categories, inventory };
}

// ══════════════════════════════════════════════════════════════════════════════
// ACATALOG — heatandplumb.com (Actinic platform)
// ══════════════════════════════════════════════════════════════════════════════
function scrapeAcatalog($, baseUrl, url, html) {
  const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';

  let price = '';
  for (const sel of ['.product-price','[class*="product-price"]','[class*="price-value"]','[itemprop="price"]','.price','[class*="selling-price"]']) {
    const el=$(sel).first(); const raw=el.attr('content')||el.text(); const num=raw?.replace(/[^0-9.]/g,'');
    if (num&&parseFloat(num)>0){price=num;break;}
  }
  if (!price) { const m=html.match(/£(\d+[\d,.]*)/); if(m)price=m[1].replace(',',''); }

  const descResult = extractAcatalogDescription($);
  const images = extractAcatalogImages($, baseUrl);
  const variants = extractAcatalogVariants($, baseUrl);
  const attributes = extractSpecs($);
  const sku = $('[itemprop="sku"],.product-ref,[class*="product-ref"],[class*="product-code"]').first().text().replace(/[^a-zA-Z0-9\-_]/g,'').trim();
  const brand = $('[itemprop="brand"]').first().text().trim() || $('meta[property="product:brand"]').attr('content') || '';
  const categories = extractBreadcrumbs($);
  let inventory = 0;
  const stockText = $('[class*="stock"],[class*="availability"],[itemprop="availability"]').first().text().toLowerCase();
  if (stockText.includes('in stock')||stockText.includes('available')) { const m=stockText.match(/(\d+)/); inventory=m?parseInt(m[1]):99; }
  else if ($('[class*="add-to-basket"],[class*="add-to-cart"]').length>0) inventory=99;

  return { title, price, descriptionHtml:descResult.html, description:descResult.text, images, variants, attributes, sku, brand, categories, inventory };
}

function extractAcatalogDescription($) {
  const selectors = ['#product-description','.product-description','[class*="product-description"]','[id*="product-description"]','.pdp-description','#description','[class*="description-content"]','.product-info-description'];
  for (const sel of selectors) {
    const el=$(sel).first(); if(!el.length) continue;
    const clone=cheerio.load(el.html()||'');
    clone('script,iframe,form,style,noscript,button,[class*="related"],[class*="upsell"]').remove();
    const html=clone.html(); const text=clone.text().trim();
    if (text.length>50) return {html,text};
  }
  let collectedHtml='';
  $('h2,h3').each((_,heading)=>{
    const $h=$(heading); const ht=$h.text().trim().toLowerCase();
    if (['product description','product features','product specification','important information'].some(k=>ht.includes(k))) {
      let html=$.html($h); let next=$h.next(); let c=0;
      while(next.length&&!['H2','H3'].includes(next.prop('tagName'))&&c<20){html+=$.html(next);next=next.next();c++;}
      collectedHtml+=html;
    }
  });
  if (collectedHtml.length>50) return {html:collectedHtml,text:cheerio.load(collectedHtml).text().trim()};
  const meta=$('meta[name="description"]').attr('content')||$('meta[property="og:description"]').attr('content')||'';
  return {html:meta?`<p>${meta}</p>`:'',text:meta};
}

function extractAcatalogImages($, baseUrl) {
  const images=[]; const seen=new Set();
  const BAD=['logo','icon','badge','payment','trust','star','rating','review','avatar','placeholder','blank','loader','spinner','social','cart','wishlist','header','footer','nav','newsletter','banner','swatch','data:image'];
  function isBad(s){return BAD.some(w=>s.toLowerCase().includes(w));}
  function add(src){if(!src)return;src=src.trim();if(src.startsWith('//'))src='https:'+src;if(!src.startsWith('http')||seen.has(src)||isBad(src))return;seen.add(src);images.push(src);}
  $('script[type="application/ld+json"]').each((_,el)=>{try{const j=JSON.parse($(el).html()||'{}');const items=Array.isArray(j)?j:[j];items.forEach(i=>{if(i['@type']==='Product'&&i.image){const imgs=Array.isArray(i.image)?i.image:[i.image];imgs.forEach(img=>add(typeof img==='string'?img:img?.url));}});}catch{}});
  $('[class*="product-image"] img,[class*="product-gallery"] img,[class*="main-image"] img,[id*="product-image"] img').each((_,el)=>{const $e=$(el);let src=$e.attr('data-zoom')||$e.attr('data-large')||$e.attr('data-src')||$e.attr('src')||'';src=src.replace('/images/products/s/','/images/products/l/').replace('/images/products/m/','/images/products/l/');add(src);});
  $('img[src*="/products/"],img[data-src*="/products/"]').each((_,el)=>{let src=$(el).attr('src')||$(el).attr('data-src')||'';src=src.replace('/s/sm/','/l/sm/').replace('/m/sm/','/l/sm/');add(src);});
  if(!images.length) add($('meta[property="og:image"]').attr('content'));
  return images.slice(0,20);
}

function extractAcatalogVariants($) {
  const groups=[]; const seen=new Set();
  const containerSels=['[class*="product-option"]','[class*="option-group"]','[class*="options-group"]','[class*="variant-selector"]','[class*="colour-selector"]','[class*="size-selector"]','fieldset','[class*="add-on-group"]'];
  containerSels.forEach(cSel=>{
    $(cSel).each((_,container)=>{
      const $c=$(container);
      if($c.closest('[class*="cart"],[class*="footer"],[class*="related"],[class*="review"]').length) return;
      const labelEl=$c.find('legend,label,h3,h4,[class*="option-label"],[class*="option-name"],[class*="selector-label"]').first();
      let name=labelEl.text().trim().replace(':','').trim();
      if(!name||name.length>80||seen.has(name.toLowerCase())) return;
      const vals=[];
      $c.find('[class*="colour-swatch"],[class*="color-swatch"],[class*="swatch-item"]').each((_,s)=>{const l=$(s).find('img').attr('alt')||$(s).find('span,p').first().text().trim()||$(s).attr('title')||'';if(l&&l.length<60&&!vals.includes(l))vals.push(l);});
      if(!vals.length) $c.find('a[href],button,[class*="option-btn"],[class*="option-item"],input[type="radio"]').each((_,btn)=>{const $b=$(btn);const l=$b.text().trim()||$b.attr('data-value')||$b.attr('value')||'';if(l&&l.length>0&&l.length<60&&!vals.includes(l)&&!['add to basket','add to cart','buy now','reset'].includes(l.toLowerCase()))vals.push(l);});
      if(!vals.length) $c.find('select option').each((_,o)=>{const t=$(o).text().trim(),v=$(o).val()?.trim();if(v&&!['','choose','select'].some(s=>t?.toLowerCase().startsWith(s)))vals.push(t||v);});
      if(vals.length){seen.add(name.toLowerCase());groups.push({name,values:vals});}
    });
  });
  if(!groups.length) groups.push(...extractVariants($));
  return groups;
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERIC SCRAPER — fallback for all other sites
// ══════════════════════════════════════════════════════════════════════════════
function scrapeGeneric($, baseUrl, url, html) {
  let title='';
  for (const s of ['[itemprop="name"]','h1[class*="product"]','h1[class*="title"]','[class*="product-title"]','[class*="product-name"]','h1']) {
    const e=$(s).first(); const t=e.text().trim();
    if(t&&t.length>2&&t.length<300){title=t;break;}
  }
  if(!title) title=$('meta[property="og:title"]').attr('content')||$('title').text().trim();

  let price='',compareAtPrice='';
  for (const s of ['[itemprop="price"]','[class*="sale-price"]','[class*="offer-price"]','[class*="current-price"]','[class*="price-now"]','[class*="price--sale"]','[class*="special-price"]','.price','[class*="product-price"]','.amount','#price','[id*="price"]']) {
    const e=$(s).first(); if(!e.length) continue;
    const num=(e.attr('content')||e.attr('data-price')||e.text())?.replace(/[^0-9.]/g,'');
    if(num&&parseFloat(num)>0&&parseFloat(num)<9999999){price=num;break;}
  }
  for (const s of ['[class*="old-price"]','[class*="was-price"]','del .amount','s .amount']) {
    const v=$(s).first().text().replace(/[^0-9.]/g,'');
    if(v&&parseFloat(v)>0){compareAtPrice=v;break;}
  }

  const {html:descHtml,text:descText}=extractDescription($);
  const images=extractAllImages($,baseUrl,html);
  const attributes=extractSpecs($);
  const variants=extractVariants($);
  const sku=$('[itemprop="sku"]').first().text().trim()||$('[class*="sku"]').first().text().replace(/[^a-zA-Z0-9\-_]/g,'').trim();
  const brand=$('[itemprop="brand"]').first().text().trim()||$('meta[property="product:brand"]').attr('content')||'';
  const categories=extractBreadcrumbs($);

  let inventory=0;
  const stockText=($('[class*="stock"],[itemprop="availability"]').first().text()||'').toLowerCase();
  if(stockText.includes('in stock')){const m=stockText.match(/(\d+)/);inventory=m?parseInt(m[1]):99;}
  else if(stockText.includes('out of stock'))inventory=0;

  const shippingInfo=extractInfo($,['[class*="shipping-info"]','[id*="shipping"]','[id*="delivery"]','[class*="dispatch"]']);
  const returnsInfo=extractInfo($,['[class*="returns-info"]','[id*="returns"]','[id*="refund"]']);
  return {title,price,compareAtPrice,descriptionHtml:descHtml,description:descText,images,variants,attributes,sku,brand,categories,inventory,shippingInfo,returnsInfo};
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function extractDescription($) {
  const selectors=['.woocommerce-Tabs-panel--description','#tab-description','.woocommerce-product-details__short-description','[id="product-description"]','[class="product-description"]','[id*="product-description"]','[class*="product-description"]:not([class*="short"]):not([class*="mini"])','[itemprop="description"]','.product__description','.product-single__description','[class*="prod-desc"]','[class*="item-description"]','.pdp-description','.description-content','#description','[id*="description"]'];
  for (const sel of selectors) {
    const el=$(sel).first(); if(!el.length) continue;
    const clone=cheerio.load(el.html()||'');
    clone('script,iframe,form,style,noscript,button,[class*="related"],[class*="upsell"]').remove();
    const html=clone.html(); const text=clone.text().trim();
    if(text.length>30) return {html,text};
  }
  const meta=$('meta[name="description"]').attr('content')||$('meta[property="og:description"]').attr('content')||'';
  return {html:meta?`<p>${meta}</p>`:'',text:meta};
}

function extractAllImages($, baseUrl, html) {
  const images=[]; const seen=new Set();
  const BAD=['logo','icon','badge','payment','trust','flag','star','rating','review','avatar','placeholder','blank','loader','spinner','arrow','btn','social','facebook','twitter','youtube','cart','wishlist','header','footer','nav','newsletter','banner','swatch','data:image','svg'];
  function isBad(src){return BAD.some(w=>src.toLowerCase().includes(w));}
  function add(src){if(!src)return;src=src.trim();if(src.startsWith('//'))src='https:'+src;if(!src.startsWith('http')||seen.has(src)||isBad(src))return;seen.add(src);images.push(src);}
  $('script[type="application/ld+json"]').each((_,el)=>{try{const j=JSON.parse($(el).html()||'{}');const items=Array.isArray(j)?j:[j];items.forEach(i=>{if(i['@type']==='Product'&&i.image){const imgs=Array.isArray(i.image)?i.image:[i.image];imgs.forEach(img=>add(typeof img==='string'?img:img?.url));}});}catch{}});
  try{const m=html.match(/"variations"\s*:\s*(\[[\s\S]+?\])\s*[,}]/);if(m)JSON.parse(m[1]).forEach(v=>{add(v.image?.url);add(v.image?.full_src);add(v.image_src);});}catch{}
  ['[class*="product-gallery"] img','[class*="product-images"] img','[class*="product-image"] img','[id*="product-gallery"] img','.woocommerce-product-gallery img','[class*="gallery-main"] img','.product__media img','[data-zoom-image]','[data-large_image]','figure img[itemprop="image"]','[class*="swiper"] img','[class*="carousel"] img','[class*="slider"] img','img[src*="/products/"]','img[data-src*="/products/"]'].forEach(sel=>{
    $(sel).each((_,el)=>{const $e=$(el);const src=$e.attr('data-zoom-image')||$e.attr('data-large_image')||$e.attr('data-original')||$e.attr('data-full')||$e.attr('data-src')||$e.attr('data-lazy-src')||$e.attr('src');const w=parseInt($e.attr('width')||0),h=parseInt($e.attr('height')||0);if((w>0&&w<60)||(h>0&&h<60))return;add(src);});
  });
  if(!images.length) add($('meta[property="og:image"]').attr('content'));
  return images.slice(0,20);
}

function addImg(src, images, seen) {
  if(!src)return;src=src.trim();if(src.startsWith('//'))src='https:'+src;
  const BAD=['logo','icon','placeholder','blank','loader','spinner','banner','data:image'];
  if(!src.startsWith('http')||seen.has(src)||BAD.some(w=>src.toLowerCase().includes(w)))return;
  seen.add(src);images.push(src);
}

function extractSpecs($) {
  const attrs={};
  $('table').each((_,table)=>{
    const $t=$(table);
    if($t.closest('[class*="related"],[class*="footer"],[class*="nav"],[class*="cart"]').length)return;
    $t.find('tr').each((_,row)=>{const cells=$(row).find('td,th');if(cells.length>=2){const k=$(cells[0]).text().trim().replace(':','');const v=$(cells[1]).text().trim();if(k&&v&&k.length<80&&v.length<300)attrs[k]=v;}});
  });
  $('dl').each((_,dl)=>{const dts=$(dl).find('dt'),dds=$(dl).find('dd');dts.each((i,dt)=>{const k=$(dt).text().trim().replace(':',''),v=$(dds.eq(i)).text().trim();if(k&&v&&k.length<80)attrs[k]=v;});});
  return attrs;
}

function extractVariants($) {
  const variants=[]; const seen=new Set();
  $('select[name*="attribute"],select[id*="attribute"],select[name*="variant"],select[class*="variant"],select[data-option]').each((_,sel)=>{
    const name=($(sel).attr('name')||$(sel).attr('id')||$(sel).attr('data-option-name')||'').replace(/attribute_pa_|attribute_|\[\]/g,'').replace(/_/g,' ').trim();
    if(!name||seen.has(name.toLowerCase()))return;
    const vals=[];$(sel).find('option').each((_,o)=>{const t=$(o).text().trim(),v=$(o).val()?.trim();if(v&&!['','choose','select'].some(s=>t?.toLowerCase().startsWith(s)))vals.push(t||v);});
    if(vals.length){seen.add(name.toLowerCase());variants.push({name,values:vals});}
  });
  return variants;
}

function extractBreadcrumbs($) {
  const cats=[];
  $('[class*="breadcrumb"] a,nav[aria-label*="readcrumb"] a,.breadcrumbs a,.breadcrumb a').each((_,el)=>{
    const t=$(el).text().trim();
    if(t&&t.length>1&&!['home','homepage'].includes(t.toLowerCase()))cats.push(t);
  });
  return cats;
}

function extractInfo($, selectors) {
  for (const sel of selectors) { const el=$(sel).first(); const txt=el.text().trim(); if(txt&&txt.length>20)return el.html()||`<p>${txt}</p>`; }
  return '';
}

function extractJsonLd($) {
  let found=null;
  $('script[type="application/ld+json"]').each((_,el)=>{
    if(found)return;
    try{const j=JSON.parse($(el).html()||'{}');const items=Array.isArray(j)?j:[j];items.forEach(i=>{if(i['@type']==='Product')found=i;});}catch{}
  });
  return found;
}

function mergeJsonLd(data, ld) {
  if(!data.title&&ld.name)data.title=ld.name;
  if((!data.descriptionHtml||data.descriptionHtml.length<20)&&ld.description){data.descriptionHtml=`<p>${ld.description}</p>`;data.description=ld.description;}
  if(!data.brand&&ld.brand?.name)data.brand=ld.brand.name;
  if(!data.sku&&ld.sku)data.sku=ld.sku;
  if(!data.price){const p=ld.offers?.price||ld.offers?.[0]?.price;if(p)data.price=String(p);}
  if(ld.offers?.availability){const a=ld.offers.availability.toLowerCase();if(a.includes('instock')||a.includes('in_stock'))data.inventory=data.inventory||99;else if(a.includes('outofstock')||a.includes('out_of_stock'))data.inventory=0;}
  return data;
}

function stripHtml(html) {
  return(html||'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION / CATALOG LINKS — all platforms
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeCollectionLinks(url, maxProducts = 100) {
  console.log('[SCRAPER] Collection:', url);
  const allLinks = new Set();
  let currentUrl = url;
  let page = 1;
  const maxPages = 15;

  while (allLinks.size < maxProducts && page <= maxPages) {
    try {
      console.log(`[SCRAPER] Page ${page}:`, currentUrl);
      const html = await fetchPage(currentUrl);
      const $ = cheerio.load(html);
      const base = new URL(url).origin;
      const platform = detectPlatform(html, url);

      // Shopify collection API
      if (platform === 'shopify' && page === 1) {
        try {
          const colHandle = url.match(/\/collections\/([^/?#]+)/)?.[1];
          if (colHandle) {
            let p=1;
            while(allLinks.size<maxProducts&&p<=20){
              const apiUrl=`${base}/collections/${colHandle}/products.json?limit=250&page=${p}`;
              const r=await axios.get(apiUrl,{timeout:10000,headers:{'User-Agent':'Mozilla/5.0'}});
              const prods=r.data?.products||[];
              if(!prods.length)break;
              prods.forEach(pr=>allLinks.add(`${base}/products/${pr.handle}`));
              if(prods.length<250)break;
              p++;
            }
            if(allLinks.size>0){console.log(`[SCRAPER] Shopify API: ${allLinks.size} links`);break;}
          }
        } catch {}
      }

      // Costway category pages
      if (platform === 'costway') {
        $('a[href*=".html"]').each((_,el)=>{
          let href=$(el).attr('href');
          if(!href)return;
          if(href.startsWith('/'))href=base+href;
          if(!href.startsWith('http')||href.includes('#'))return;
          if(/product|item|goods/.test(href)&&!/category|cart|account|search/.test(href))allLinks.add(href);
        });
      }

      // Acatalog
      if (platform === 'acatalog') {
        $('a[href*="/acatalog/"]').each((_,el)=>{
          let href=$(el).attr('href');
          if(!href)return;
          if(href.startsWith('/'))href=base+href;
          if(!href.startsWith('http'))return;
          const path=new URL(href).pathname;
          if(path.split('/').filter(Boolean).length>=3&&!/cart|checkout|login|register|wishlist|contact|delivery|returns|blog|trade|finance/.test(path))allLinks.add(href);
        });
      }

      // Generic product links
      const productPatterns=['a[href*="/products/"]','a[href*="/product/"]','a[href*="/item/"]','a[href*="/items/"]','a[href*="/listing/"]','a[href*="/detail/"]','a[href*="/p/"]','a[href*="/goods/"]','.product a[href]','.product-item a[href]','.product-card a[href]','article a[href]','li.product a[href]','[class*="product-grid"] a','[class*="catalog-item"] a','[class*="product-tile"] a'];
      productPatterns.forEach(sel=>{
        $(sel).each((_,el)=>{
          let href=$(el).attr('href');if(!href)return;
          if(href.startsWith('/'))href=base+href;
          if(!href.startsWith('http')||href.includes('#')||href.includes('javascript'))return;
          if(/cart|checkout|login|register|account|wishlist|tag\/|\/blog\/|page=\d/.test(href))return;
          allLinks.add(href);
        });
      });

      if(allLinks.size>=maxProducts)break;

      // Find next page
      let nextUrl=null;
      for(const s of ['a[rel="next"]','a.next','a[class*="next"]','.pagination a:last-child',`a[href*="page=${page+1}"]`,`a[href*="?page=${page+1}"]`,`a[href*="/page/${page+1}"]`]){
        const href=$(s).first().attr('href');
        if(href&&!href.includes('#')){nextUrl=href.startsWith('/')?base+href:href;break;}
      }
      if(!nextUrl||nextUrl===currentUrl)break;
      currentUrl=nextUrl; page++;
      await new Promise(r=>setTimeout(r,1000));
    } catch(e){console.error('[SCRAPER] Collection error:',e.message);break;}
  }

  const result=[...allLinks].slice(0,maxProducts);
  console.log(`[SCRAPER] Collection done: ${result.length} links`);
  return result;
}

module.exports = { scrapeProduct, scrapeCollectionLinks };
