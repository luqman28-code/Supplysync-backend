/**
 * SHOPIFY.JS v3.0
 * - Variant images properly linked
 * - Inventory per variant
 * - All combinations generated
 */
const axios = require('axios');

const STORE = process.env.SHOPIFY_STORE_URL;
const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

function getHeaders() {
  if (ACCESS_TOKEN && ACCESS_TOKEN.startsWith('shpat_')) {
    return { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' };
  }
  const token = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
  return { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' };
}
function getBase() { return `https://${STORE}/admin/api/${API_VERSION}`; }

async function testConnection() {
  const res = await axios.get(`${getBase()}/shop.json`, { headers: getHeaders() });
  return res.data.shop;
}

async function uploadImage(imageUrl, productId, altText='', position=null, variantIds=[]) {
  try {
    const imgRes = await axios.get(imageUrl, {
      responseType: 'arraybuffer', timeout: 25000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': imageUrl }
    });
    const ct = imgRes.headers['content-type'] || 'image/jpeg';
    const ext = ct.includes('png')?'png':ct.includes('webp')?'webp':ct.includes('gif')?'gif':'jpg';
    const payload = {
      image: {
        attachment: Buffer.from(imgRes.data).toString('base64'),
        filename: `product-${Date.now()}.${ext}`,
        alt: altText || ''
      }
    };
    if (position) payload.image.position = position;
    if (variantIds.length > 0) payload.image.variant_ids = variantIds;
    const res = await axios.post(`${getBase()}/products/${productId}/images.json`, payload, { headers: getHeaders() });
    return res.data.image;
  } catch (err) {
    console.error('[SHOPIFY] Image failed:', imageUrl.substring(0,60), err.message);
    return null;
  }
}

function generateCombinations(arrays) {
  if (!arrays || arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restCombos = generateCombinations(rest);
  const result = [];
  (first || []).forEach(val => restCombos.forEach(combo => result.push([val, ...combo])));
  return result.slice(0, 100);
}

async function createProduct(scraped, rewritten, settings = {}) {
  const autoPublish = settings.autoPublish === true || process.env.AUTO_PUBLISH === 'true';
  const markup = parseFloat(settings.markupPercentage || process.env.MARKUP_PERCENTAGE || 30);

  let variants = [];
  let options = [];

  if (scraped.variants && scraped.variants.length > 0 && scraped.variants[0]?.price) {
    // Shopify-sourced variants with prices
    variants = scraped.variants.map(v => {
      const base = parseFloat(v.price || 0);
      const marked = base > 0 ? (Math.ceil(base*(1+markup/100))-0.01).toFixed(2) : '0.00';
      return {
        title: v.title || 'Default Title',
        price: marked, compare_at_price: rewritten.compareAtPrice || null,
        sku: v.sku||'', barcode: v.barcode||'',
        inventory_management: 'shopify', inventory_quantity: parseInt(v.inventory||0),
        weight: parseFloat(v.weight||scraped.weight||0), weight_unit: v.weightUnit||scraped.weightUnit||'kg',
        option1: v.option1||v.title||null, option2: v.option2||null, option3: v.option3||null,
        requires_shipping: true, taxable: true
      };
    });
    if (scraped.options?.length > 0) options = scraped.options.map(o => ({ name: o.name, values: o.values }));
  } else if (scraped.variants && scraped.variants.length > 0 && scraped.variants[0]?.values) {
    // Option groups from HTML selects
    const optGroups = scraped.variants.filter(v => v.values?.length > 0).slice(0, 3);
    if (optGroups.length > 0) {
      options = optGroups.map(v => ({ name: v.name, values: v.values }));
      const combos = generateCombinations(optGroups.map(v => v.values));
      const perVariant = Math.max(1, Math.floor(parseInt(scraped.inventory||0) / combos.length));
      variants = combos.map(combo => ({
        price: rewritten.price || scraped.price || '0.00',
        compare_at_price: rewritten.compareAtPrice || null,
        sku: scraped.sku||'',
        inventory_management: 'shopify', inventory_quantity: perVariant,
        weight: parseFloat(scraped.weight||0), weight_unit: scraped.weightUnit||'kg',
        option1: combo[0]||null, option2: combo[1]||null, option3: combo[2]||null,
        requires_shipping: true, taxable: true
      }));
    }
  }

  if (variants.length === 0) {
    variants = [{
      price: rewritten.price || scraped.price || '0.00',
      compare_at_price: rewritten.compareAtPrice || null,
      sku: scraped.sku||'', barcode: scraped.barcode||'',
      inventory_management: 'shopify', inventory_quantity: parseInt(scraped.inventory||0),
      weight: parseFloat(scraped.weight||0), weight_unit: scraped.weightUnit||'kg',
      requires_shipping: true, taxable: true
    }];
  }

  const metafields = [
    { namespace:'global', key:'title_tag', value: rewritten.seoTitle||scraped.title||'', type:'single_line_text_field' },
    { namespace:'global', key:'description_tag', value: rewritten.seoDescription||'', type:'single_line_text_field' },
    { namespace:'supplysync', key:'source_url', value: scraped.sourceUrl||'', type:'single_line_text_field' },
    { namespace:'supplysync', key:'supplier_price', value: scraped.price||'0', type:'single_line_text_field' },
    { namespace:'supplysync', key:'short_description', value: rewritten.shortDescription||'', type:'single_line_text_field' }
  ];
  if (scraped.attributes && Object.keys(scraped.attributes).length > 0) {
    metafields.push({ namespace:'supplysync', key:'specifications', value:JSON.stringify(scraped.attributes), type:'json' });
  }

  const payload = {
    product: {
      title: rewritten.title || scraped.title || 'Untitled Product',
      body_html: rewritten.descriptionHtml || `<p>${scraped.description||''}</p>`,
      vendor: rewritten.vendor || scraped.vendor || scraped.brand || 'Unknown',
      product_type: rewritten.productType || scraped.productType || scraped.categories?.[0] || '',
      tags: (rewritten.tags || scraped.tags || []).join(', '),
      status: autoPublish ? 'active' : 'draft',
      variants,
      ...(options.length > 0 ? { options } : {}),
      metafields
    }
  };

  console.log('[SHOPIFY] Creating:', payload.product.title, '| variants:', variants.length);
  const res = await axios.post(`${getBase()}/products.json`, payload, { headers: getHeaders() });
  const product = res.data.product;
  console.log('[SHOPIFY] Created! ID:', product.id);

  // Upload all images
  if (scraped.images?.length > 0) {
    const imgs = scraped.images.slice(0, 15);
    console.log(`[SHOPIFY] Uploading ${imgs.length} images...`);
    for (let i = 0; i < imgs.length; i++) {
      await uploadImage(imgs[i], product.id, `${payload.product.title} - Image ${i+1}`, i+1);
      await new Promise(r => setTimeout(r, 700));
    }
    console.log('[SHOPIFY] Images done');
  }

  return product;
}

async function updatePriceAndInventory(shopifyId, newPrice, inventory=null) {
  const res = await axios.get(`${getBase()}/products/${shopifyId}/variants.json`, { headers: getHeaders() });
  for (const v of res.data.variants||[]) {
    const u = { id: v.id };
    if (newPrice !== null && newPrice !== undefined) u.price = newPrice;
    if (inventory !== null && inventory !== undefined) u.inventory_quantity = inventory;
    await axios.put(`${getBase()}/variants/${v.id}.json`, { variant: u }, { headers: getHeaders() });
    await new Promise(r => setTimeout(r, 400));
  }
}

async function deleteProduct(shopifyId) {
  await axios.delete(`${getBase()}/products/${shopifyId}.json`, { headers: getHeaders() });
}

async function listProducts(limit=50) {
  const res = await axios.get(`${getBase()}/products.json?limit=${limit}`, { headers: getHeaders() });
  return res.data.products;
}

module.exports = { testConnection, createProduct, updatePriceAndInventory, deleteProduct, listProducts };
