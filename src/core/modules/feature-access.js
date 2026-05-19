const ShopModules = require('./shop-modules.model');
const { config } = require('../config');
const { cleanShopDomain, getShopDomainFromRequest } = require('../http/request-utils');

const defaultEnabledModules = Object.entries(config.modules)
  .filter(([, enabled]) => enabled)
  .map(([key]) => key)
  .filter((key) => key !== 'audit');

function mergeDefaults(enabledModules = []) {
  return Array.from(new Set([...(enabledModules || []), ...defaultEnabledModules]));
}

async function getOrCreateShopModules(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!cleanShop) return null;

  let record = await ShopModules.findOne({ shopDomain: cleanShop });
  if (!record) {
    record = await ShopModules.create({ shopDomain: cleanShop, enabledModules: defaultEnabledModules, moduleSettings: {} });
    return record;
  }

  // Backwards-compatibility: before the modular upgrade, merchants did not have to enable
  // features manually. Keep all bundled core modules available by default unless an env flag
  // explicitly disables a module globally.
  const merged = mergeDefaults(record.enabledModules || []);
  if (merged.length !== (record.enabledModules || []).length) {
    record.enabledModules = merged;
    await record.save();
  }
  return record;
}

async function isModuleEnabled(shopDomain, moduleKey) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!config.modules[moduleKey]) return false;
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
  const update = { enabledModules: mergeDefaults(enabledModules || []) };
  if (moduleSettings !== undefined) update.moduleSettings = moduleSettings;
  return ShopModules.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $set: update, $setOnInsert: { shopDomain: cleanShop } },
    { new: true, upsert: true }
  );
}

module.exports = { defaultEnabledModules, getOrCreateShopModules, isModuleEnabled, requireModule, setShopModules };
