const axios = require("axios");
const { randomAgent } = require("./utils");

// 🔁 Request helper
async function request(url, method = "GET", data = null, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios({
        url,
        method,
        data,
        headers: {
          "User-Agent": randomAgent(),
          "Accept-Language": "en-US,en;q=0.9",
          "Content-Type": "application/json"
        },
        timeout: 20000
      });

      return res.data;

    } catch (err) {
      console.log(`Retry ${i + 1}: ${err.message}`);
      if (i === retries - 1) return null;
    }
  }
}

// 🛒 SHOPIFY (WITH PAGINATION)
async function extractShopify(baseUrl) {
  let products = [];
  let page = 1;

  try {
    while (true) {
      const url = `${baseUrl.replace(/\/$/, "")}/products.json?limit=250&page=${page}`;
      const data = await request(url);

      if (!data || !data.products || data.products.length === 0) break;

      const batch = data.products.map(p => ({
        title: p.title,
        price: p.variants?.[0]?.price,
        images: p.images?.map(i => i.src),
        variants: p.variants,
        source: "shopify"
      }));

      products.push(...batch);
      page++;

      if (data.products.length < 250) break;
    }

    return products;

  } catch {
    return [];
  }
}

// 🛒 WOOCOMMERCE (PAGINATION)
async function extractWoo(baseUrl) {
  let products = [];
  let page = 1;

  try {
    while (true) {
      const url = `${baseUrl.replace(/\/$/, "")}/wp-json/wc/v3/products?per_page=100&page=${page}`;
      const data = await request(url);

      if (!data || data.length === 0) break;

      const batch = data.map(p => ({
        title: p.name,
        price: p.price,
        images: p.images?.map(i => i.src),
        source: "woocommerce"
      }));

      products.push(...batch);
      page++;

      if (data.length < 100) break;
    }

    return products;

  } catch {
    return [];
  }
}

// 🧠 GRAPHQL EXTRACTOR (GENERIC)
async function extractGraphQL(baseUrl) {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/graphql`;

    const query = {
      query: `
        {
          products(first: 50) {
            edges {
              node {
                title
                variants(first: 1) {
                  edges {
                    node {
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `
    };

    const data = await request(url, "POST", query);

    if (!data || !data.data) return [];

    return data.data.products.edges.map(p => ({
      title: p.node.title,
      price: p.node.variants.edges[0]?.node.price,
      source: "graphql"
    }));

  } catch {
    return [];
  }
}

// 🧠 MAIN EXTRACTOR
async function extractFromAPI(baseUrl, platform) {
  try {
    if (platform === "shopify") {
      const data = await extractShopify(baseUrl);
      if (data.length) return data;
    }

    if (platform === "woocommerce") {
      const data = await extractWoo(baseUrl);
      if (data.length) return data;
    }

    // 🔥 Try GraphQL for ANY platform
    const gqlData = await extractGraphQL(baseUrl);
    if (gqlData.length) return gqlData;

    return [];

  } catch (error) {
    console.error("API PRO extractor error:", error.message);
    return [];
  }
}

module.exports = { extractFromAPI };