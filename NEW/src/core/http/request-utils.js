function cleanShopDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function getShopDomainFromRequest(req) {
  return cleanShopDomain(
    req.query.shopDomain ||
    req.query.shop ||
    req.body?.shopDomain ||
    req.body?.shop ||
    req.headers['x-shopify-shop-domain'] ||
    ''
  );
}

function requireShopDomain(req) {
  const shopDomain = getShopDomainFromRequest(req);
  if (!shopDomain) {
    const error = new Error('Missing shopDomain');
    error.statusCode = 400;
    throw error;
  }
  return shopDomain;
}

function normaliseLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

module.exports = { cleanShopDomain, getShopDomainFromRequest, requireShopDomain, normaliseLimit };
