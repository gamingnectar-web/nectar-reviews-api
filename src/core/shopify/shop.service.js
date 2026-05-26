const { isDatabaseConnected } = require('../../config/database');
const Shop = require('./shop.model');
const { cleanShopDomain } = require('../utils/clean-shop-domain');

const memoryShops = new Map();

async function upsertShop({ shopDomain, accessToken, scopes }) {
  const clean = cleanShopDomain(shopDomain);
  if (!clean) throw new Error('Invalid shop domain');

  const payload = {
    shopDomain: clean,
    accessToken,
    scopes,
    status: 'installed',
    uninstalledAt: null,
    installedAt: new Date()
  };

  if (!isDatabaseConnected()) {
    memoryShops.set(clean, payload);
    return payload;
  }

  return Shop.findOneAndUpdate({ shopDomain: clean }, { $set: payload }, { upsert: true, new: true });
}

async function getShop(shopDomain) {
  const clean = cleanShopDomain(shopDomain);
  if (!clean) return null;

  if (!isDatabaseConnected()) return memoryShops.get(clean) || null;

  return Shop.findOne({ shopDomain: clean, status: 'installed' }).lean();
}

module.exports = { upsertShop, getShop };
