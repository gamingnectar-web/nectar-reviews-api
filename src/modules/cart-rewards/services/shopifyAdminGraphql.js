function getEnv() {
  try {
    return require('../../../config/env').env || {};
  } catch (_) {
    return {};
  }
}

function normaliseShopDomain(shopDomain) {
  return String(shopDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

async function shopifyAdminGraphql({ shopDomain, query, variables = {} }) {
  const env = getEnv();
  const domain = normaliseShopDomain(shopDomain || env.shopifyStoreUrl);
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || env.shopifyAccessToken;
  const version = process.env.SHOPIFY_API_VERSION || env.shopifyApiVersion || '2026-07';

  if (!domain || !token) {
    return null;
  }

  const response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.errors) {
    const message = json.errors?.[0]?.message || `Shopify Admin GraphQL failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.shopifyErrors = json.errors;
    throw error;
  }

  return json.data || json;
}

function makeShopifyAdminGraphql(req) {
  return async function run(query, variables = {}) {
    return shopifyAdminGraphql({
      shopDomain: req.shopDomain,
      query,
      variables
    });
  };
}

module.exports = {
  normaliseShopDomain,
  shopifyAdminGraphql,
  makeShopifyAdminGraphql
};
