const { getShopFromRequest } = require('../utils/clean-shop-domain');
const { isModuleEnabled } = require('../settings/module-settings.service');

function requireShop(req, res, next) {
  const shopDomain = getShopFromRequest(req);
  if (!shopDomain) {
    return res.status(400).json({ error: 'Valid shop or shopDomain is required.' });
  }
  req.shopDomain = shopDomain;
  return next();
}

function requireShopModule(moduleKey) {
  return async function shopModuleMiddleware(req, res, next) {
    try {
      const shopDomain = getShopFromRequest(req);
      if (!shopDomain) {
        return res.status(400).json({ error: 'Valid shop or shopDomain is required.' });
      }

      const enabled = await isModuleEnabled(shopDomain, moduleKey);
      if (!enabled) {
        return res.status(403).json({
          error: `The ${moduleKey} module is disabled for this shop.`,
          moduleKey
        });
      }

      req.shopDomain = shopDomain;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requireShop, requireShopModule };
