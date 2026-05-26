function cleanShopDomain(input) {
  if (!input) return '';

  let value = String(input).trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!value.endsWith('.myshopify.com')) {
    value = value.replace(/\.myshopify\.com$/, '') + '.myshopify.com';
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    return '';
  }

  return value;
}

function getShopFromRequest(req) {
  return cleanShopDomain(
    req.query.shop ||
      req.query.shopDomain ||
      req.body?.shop ||
      req.body?.shopDomain ||
      req.headers['x-shopify-shop-domain'] ||
      req.headers['x-nectar-shop']
  );
}

module.exports = { cleanShopDomain, getShopFromRequest };
