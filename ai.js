const axios = require('axios');
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function rewriteProduct(scraped, settings = {}) {
  const markup = parseFloat(settings.markupPercentage || process.env.MARKUP_PERCENTAGE || 30);
  let newPrice = null, compareAtPrice = null;
  if (scraped.price && parseFloat(scraped.price) > 0) {
    const base = parseFloat(scraped.price);
    newPrice = (Math.ceil(base * (1 + markup/100)) - 0.01).toFixed(2);
    compareAtPrice = (parseFloat(newPrice) * 1.15).toFixed(2);
  }

  // DESCRIPTION: EXACT COPY — no AI modification
  let fullDescription = '';
  if (scraped.descriptionHtml && scraped.descriptionHtml.trim().length > 20) {
    fullDescription += scraped.descriptionHtml;
  } else if (scraped.description) {
    fullDescription += `<p>${scraped.description}</p>`;
  }
  if (scraped.attributes && Object.keys(scraped.attributes).length > 0) {
    fullDescription += `\n<h3 style="margin-top:24px;margin-bottom:10px;font-size:16px;font-weight:600">Specifications</h3>
<table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>
${Object.entries(scraped.attributes).map(([k,v])=>`<tr><td style="padding:8px 12px;border:1px solid #dee2e6;background:#f8f9fa;font-weight:500;width:35%;vertical-align:top">${k}</td><td style="padding:8px 12px;border:1px solid #dee2e6;vertical-align:top">${v}</td></tr>`).join('\n')}
</tbody></table>`;
  }
  if (scraped.shippingInfo?.trim().length > 10) {
    fullDescription += `\n<div style="margin-top:24px"><h3 style="margin-bottom:8px;font-size:16px;font-weight:600">Delivery & Shipping</h3>${scraped.shippingInfo}</div>`;
  }
  if (scraped.returnsInfo?.trim().length > 10) {
    fullDescription += `\n<div style="margin-top:16px"><h3 style="margin-bottom:8px;font-size:16px;font-weight:600">Returns Policy</h3>${scraped.returnsInfo}</div>`;
  }

  let seoData = {
    seoTitle: (scraped.title||'').substring(0,60),
    seoDescription: (scraped.description||'').substring(0,155),
    tags: scraped.tags || scraped.categories || []
  };

  if (settings.rewriteContent !== false && GROQ_API_KEY) {
    try {
      const prompt = `eCommerce SEO. UK Shopify store. Product: ${scraped.title||''} | Brand: ${scraped.brand||''} | Price: £${newPrice||scraped.price||''} | Desc: ${(scraped.description||'').substring(0,300)}\nReturn ONLY JSON: {"seoTitle":"50-60 chars","seoDescription":"140-155 chars","tags":["15 tags"]}`;
      const r = await axios.post(GROQ_URL, {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400, temperature: 0.3
      }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 20000 });
      const clean = r.data.choices[0].message.content.trim().replace(/```json\n?|```\n?/g,'').trim();
      const parsed = JSON.parse(clean);
      if (parsed.seoTitle) seoData = parsed;
      console.log('[AI] SEO OK:', parsed.seoTitle);
    } catch (e) { console.error('[AI] failed:', e.message); }
  }

  return {
    title: scraped.title,
    descriptionHtml: fullDescription,
    vendor: scraped.vendor || scraped.brand || 'Unknown',
    productType: scraped.productType || scraped.categories?.[0] || '',
    seoTitle: seoData.seoTitle || scraped.title?.substring(0,60) || '',
    seoDescription: seoData.seoDescription || scraped.description?.substring(0,155) || '',
    tags: Array.isArray(seoData.tags) ? seoData.tags : (scraped.tags || []),
    price: newPrice || scraped.price || '0.00',
    compareAtPrice,
    shortDescription: scraped.description?.substring(0,300) || '',
    rewriteDone: true
  };
}

module.exports = { rewriteProduct };
