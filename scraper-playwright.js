const { chromium } = require('playwright');

async function scrapeProduct(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Wait for product content (adjust selector)
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const title = document.querySelector('h1')?.innerText || '';
    const price = document.querySelector('.price')?.innerText || '';
    
    const images = Array.from(document.querySelectorAll('img'))
      .map(img => img.src)
      .filter(src => src);

    const description = document.body.innerText.slice(0, 1000);

    return {
      title,
      price,
      images,
      description
    };
  });

  await browser.close();
  return data;
}

module.exports = { scrapeProduct };
