const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// =======================
// HEALTH CHECK
// =======================
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SupplySync Server Running'
  });
});

// =======================
// SCRAPER ROUTE (PLAYWRIGHT)
// =======================
app.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Import scraper safely
    const scraper = require('./scraper-playwright');

    const data = await scraper.scrapeProduct(url);

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error('[/scrape]', err.message);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// =======================
// SERVER START
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
