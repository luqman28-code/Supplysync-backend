const { chromium } = require('playwright');

async function scrapeCollection(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  let productLinks = new Set();
  let hasNextPage = true;

  while (hasNextPage) {
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(href => href.includes('/products/'));
    });

    links.forEach(link => productLinks.add(link));

    // check next page
    const nextButton = await page.$('a[rel="next"], .next');

    if (nextButton) {
      await Promise.all([
        page.waitForNavigation(),
        nextButton.click()
      ]);
    } else {
      hasNextPage = false;
    }
  }

  await browser.close();

  return Array.from(productLinks);
}

module.exports = { scrapeCollection };