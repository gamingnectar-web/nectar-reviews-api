const ShopModules = require('./shop-modules.model');
const { config } = require('../config');
const { cleanShopDomain, getShopDomainFromRequest } = require('../http/request-utils');

const defaultEnabledModules = Object.entries(config.modules)
  .filter(([, enabled]) => enabled)
  .map(([key]) => key);

async function getOrCreateShopModules(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!cleanShop) return null;
  return ShopModules.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $setOnInsert: { shopDomain: cleanShop, enabledModules: defaultEnabledModules, moduleSettings: {} } },
    { new: true, upsert: true }
  );
}

async function isModuleEnabled(shopDomain, moduleKey) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!cleanShop) return Boolean(config.modules[moduleKey]);
  const record = await getOrCreateShopModules(cleanShop);
  return Boolean(record?.enabledModules?.includes(moduleKey));
}

function requireModule(moduleKey) {
  return async function moduleGate(req, res, next) {
    try {
      const shopDomain = getShopDomainFromRequest(req);
      if (!shopDomain) {
        return res.status(400).json({ error: 'Missing shopDomain' });
      }
      const enabled = await isModuleEnabled(shopDomain, moduleKey);
      if (!enabled) {
        return res.status(403).json({ error: `${moduleKey} module is not enabled for this shop.` });
      }
      req.moduleKey = moduleKey;
      req.shopDomain = shopDomain;
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function setShopModules(shopDomain, enabledModules, moduleSettings = undefined) {
  const cleanShop = cleanShopDomain(shopDomain);
  const update = { enabledModules: Array.from(new Set(enabledModules || [])) };
  if (moduleSettings !== undefined) update.moduleSettings = moduleSettings;
  return ShopModules.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $set: update, $setOnInsert: { shopDomain: cleanShop } },
    { new: true, upsert: true }
  );
}

module.exports = { defaultEnabledModules, getOrCreateShopModules, isModuleEnabled, requireModule, setShopModules };
