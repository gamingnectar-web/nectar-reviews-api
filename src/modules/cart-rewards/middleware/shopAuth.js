const { makeShopifyAdminGraphql, normaliseShopDomain } = require('../services/shopifyAdminGraphql');

/**
 * Store-scoped middleware for Cart Rewards.
 *
 * It deliberately does not read customer IDs, emails, tags, or profiles.
 * It only resolves the shop domain and prepares an optional Admin GraphQL helper
 * so reward product inventory can be checked from the merchant's live catalogue.
 */
function requireShop(req, res, next) {
  const shopDomain = normaliseShopDomain(
    req.shopDomain ||
    req.headers['x-shop-domain'] ||
    req.query.shopDomain ||
    req.query.shop ||
    req.body?.shopDomain
  );

  if (!shopDomain) {
    return res.status(401).json({ error: 'Missing shop domain.' });
  }

  req.shopDomain = shopDomain;
  if (!req.shopifyAdminGraphql) {
    req.shopifyAdminGraphql = makeShopifyAdminGraphql(req);
  }

  return next();
}

module.exports = {
  requireShop
};
