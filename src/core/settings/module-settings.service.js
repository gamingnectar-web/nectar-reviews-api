const { env } = require('../../config/env');
const { isDatabaseConnected } = require('../../config/database');
const ShopModuleSettings = require('./shop-module-settings.model');
const { cleanShopDomain } = require('../utils/clean-shop-domain');

const memorySettings = new Map();

const knownModuleKeys = ['reviews', 'loyalty', 'discounts', 'cart-rewards', 'campaigns', 'help'];

function getDefaultModuleMap() {
  return knownModuleKeys.reduce((acc, key) => {
    acc[key] = env.defaultEnabledModules.includes(key);
    return acc;
  }, {});
}

function normalizeModules(modules) {
  const defaults = getDefaultModuleMap();
  const incoming = modules instanceof Map ? Object.fromEntries(modules.entries()) : modules || {};
  return knownModuleKeys.reduce((acc, key) => {
    acc[key] = typeof incoming[key] === 'boolean' ? incoming[key] : defaults[key];
    return acc;
  }, {});
}

async function getModuleSettings(shop) {
  const shopDomain = cleanShopDomain(shop);
  if (!shopDomain) return { shopDomain: '', modules: getDefaultModuleMap(), source: 'defaults' };

  if (!isDatabaseConnected()) {
    const modules = memorySettings.get(shopDomain) || getDefaultModuleMap();
    return { shopDomain, modules: normalizeModules(modules), source: 'memory' };
  }

  let record = await ShopModuleSettings.findOne({ shopDomain });
  if (!record) {
    record = await ShopModuleSettings.create({ shopDomain, modules: getDefaultModuleMap() });
  }

  return { shopDomain, modules: normalizeModules(record.modules), source: 'database' };
}

async function updateModuleSettings(shop, modulesPatch) {
  const shopDomain = cleanShopDomain(shop);
  if (!shopDomain) {
    const error = new Error('Valid shopDomain is required.');
    error.status = 400;
    throw error;
  }

  const current = await getModuleSettings(shopDomain);
  const nextModules = normalizeModules({ ...current.modules, ...(modulesPatch || {}) });

  if (!isDatabaseConnected()) {
    memorySettings.set(shopDomain, nextModules);
    return { shopDomain, modules: nextModules, source: 'memory' };
  }

  const record = await ShopModuleSettings.findOneAndUpdate(
    { shopDomain },
    { $set: { modules: nextModules } },
    { new: true, upsert: true }
  );

  return { shopDomain, modules: normalizeModules(record.modules), source: 'database' };
}

async function isModuleEnabled(shop, moduleKey) {
  const settings = await getModuleSettings(shop);
  return Boolean(settings.modules[moduleKey]);
}

module.exports = {
  knownModuleKeys,
  getDefaultModuleMap,
  getModuleSettings,
  updateModuleSettings,
  isModuleEnabled
};
