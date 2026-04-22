/**
 * db.js — Database Module
 * Primary: MongoDB (via Mongoose)
 * Fallback: In-memory store (for development/when MongoDB not available)
 */

let mongoose = null;
let usingMongo = false;

// In-memory store (fallback)
const memStore = {
  products: [],
  logs: [],
  stores: []
};

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('⚠️  [DB] No MONGODB_URI — using in-memory store');
    return;
  }

  try {
    mongoose = require('mongoose');
    await mongoose.connect(uri, {
      useNewUrlParser:    true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    usingMongo = true;
    console.log('✅ [DB] MongoDB connected');
  } catch (e) {
    console.log(`⚠️  [DB] MongoDB failed (${e.message}) — using in-memory store`);
  }
}

// ─── Product Operations ───────────────────────────────────────
async function saveProduct(productData) {
  if (usingMongo) {
    const Product = require('./models/Product');
    try {
      const existing = await Product.findOne({ 'meta.url': productData._meta?.url });
      if (existing) {
        await Product.updateOne({ _id: existing._id }, { $set: { ...productData, updatedAt: new Date() } });
        return existing._id;
      }
      const doc = new Product({ ...productData, createdAt: new Date(), updatedAt: new Date() });
      await doc.save();
      return doc._id;
    } catch (e) {
      console.error('[DB] Save error:', e.message);
    }
  } else {
    const existing = memStore.products.find(p => p._meta?.url === productData._meta?.url);
    if (existing) {
      Object.assign(existing, productData, { updatedAt: new Date() });
      return existing.id;
    }
    const id = `mem_${Date.now()}`;
    memStore.products.push({ id, ...productData, createdAt: new Date() });
    return id;
  }
}

async function saveMany(products) {
  const ids = [];
  for (const p of products) {
    const id = await saveProduct(p);
    ids.push(id);
  }
  return ids;
}

async function getProducts(filter = {}) {
  if (usingMongo) {
    const Product = require('./models/Product');
    return await Product.find(filter).sort({ createdAt: -1 }).lean();
  }
  let products = [...memStore.products];
  if (filter.store) products = products.filter(p => p._meta?.url?.includes(filter.store));
  return products;
}

async function getProduct(id) {
  if (usingMongo) {
    const Product = require('./models/Product');
    return await Product.findById(id).lean();
  }
  return memStore.products.find(p => p.id === id);
}

async function deleteProduct(id) {
  if (usingMongo) {
    const Product = require('./models/Product');
    await Product.findByIdAndDelete(id);
    return true;
  }
  const idx = memStore.products.findIndex(p => p.id === id);
  if (idx !== -1) { memStore.products.splice(idx, 1); return true; }
  return false;
}

// ─── Log Operations ───────────────────────────────────────────
async function saveLog(logData) {
  const entry = { ...logData, timestamp: new Date() };
  if (usingMongo) {
    // Simple log collection
    try {
      const db = mongoose.connection.db;
      await db.collection('logs').insertOne(entry);
    } catch {}
  } else {
    memStore.logs.unshift(entry);
    if (memStore.logs.length > 500) memStore.logs = memStore.logs.slice(0, 500);
  }
}

async function getLogs(limit = 100) {
  if (usingMongo) {
    try {
      const db = mongoose.connection.db;
      return await db.collection('logs').find({}).sort({ timestamp: -1 }).limit(limit).toArray();
    } catch { return []; }
  }
  return memStore.logs.slice(0, limit);
}

// ─── Store Operations ─────────────────────────────────────────
async function saveStore(storeData) {
  if (usingMongo) {
    try {
      const db = mongoose.connection.db;
      await db.collection('stores').updateOne(
        { domain: storeData.domain },
        { $set: { ...storeData, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch {}
  } else {
    const existing = memStore.stores.find(s => s.domain === storeData.domain);
    if (existing) {
      Object.assign(existing, storeData, { updatedAt: new Date() });
    } else {
      memStore.stores.push({ ...storeData, createdAt: new Date() });
    }
  }
}

async function getStats() {
  if (usingMongo) {
    const Product = require('./models/Product');
    return {
      totalProducts: await Product.countDocuments(),
      stores:        (await mongoose.connection.db.collection('stores').find({}).toArray()).length,
      logs:          await mongoose.connection.db.collection('logs').countDocuments()
    };
  }
  return {
    totalProducts: memStore.products.length,
    stores:        memStore.stores.length,
    logs:          memStore.logs.length
  };
}

module.exports = {
  connect,
  saveProduct,
  saveMany,
  getProducts,
  getProduct,
  deleteProduct,
  saveLog,
  getLogs,
  getStats,
  isUsingMongo: () => usingMongo
};
