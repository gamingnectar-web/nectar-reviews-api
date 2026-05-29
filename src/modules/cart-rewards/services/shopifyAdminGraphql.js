function getEnv() {
  try {
    return require('../../../config/env').env || {};
  } catch (_) {
    return {};
  }
}

function getShopModel() {
  try {
    return require('../../../models').Shop;
  } catch (_) {
    return null;
  }
}

function getDecryptSecret() {
  try {
    return require('../../../utils/crypto').decryptSecret;
  } catch (_) {
    return null;
  }
}

function normaliseShopDomain(shopDomain) {
  return String(shopDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

async function getShopifyAdminToken(shopDomain) {
  const env = getEnv();
  const domain = normaliseShopDomain(shopDomain || env.shopifyStoreUrl);
  const Shop = getShopModel();
  const decryptSecret = getDecryptSecret();

  if (Shop && decryptSecret && domain) {
    try {
      const shop = await Shop.findOne({ shopDomain: domain }).select('accessTokenEncrypted scopes').lean();
      if (shop?.accessTokenEncrypted) {
        const decrypted = decryptSecret(shop.accessTokenEncrypted);
        if (decrypted) {
          return {
            token: decrypted,
            source: 'shop-oauth',
            scopes: shop.scopes || ''
          };
        }
      }
    } catch (error) {
      // Fall back to env token below. This keeps dev stores working even while OAuth is being repaired.
      console.warn('[cart-rewards] Could not decrypt per-shop Shopify token:', error.message);
    }
  }

  const envToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || env.shopifyAccessToken;
  if (envToken) {
    return {
      token: envToken,
      source: 'environment',
      scopes: env.shopifyScopes || ''
    };
  }

  return {
    token: '',
    source: 'missing',
    scopes: ''
  };
}

async function shopifyAdminGraphql({ shopDomain, query, variables = {} }) {
  const env = getEnv();
  const domain = normaliseShopDomain(shopDomain || env.shopifyStoreUrl);
  const tokenDetails = await getShopifyAdminToken(domain);
  const version = process.env.SHOPIFY_API_VERSION || env.shopifyApiVersion || '2026-07';

  if (!domain || !tokenDetails.token) {
    const error = new Error('Shopify product access is not connected for this store. Re-open/install the app through Shopify OAuth, or set a temporary SHOPIFY_ADMIN_ACCESS_TOKEN for development.');
    error.status = 412;
    error.code = 'SHOPIFY_TOKEN_MISSING';
    throw error;
  }

  const response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': tokenDetails.token
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.errors) {
    const message = json.errors?.map((err) => err.message).filter(Boolean).join('; ') || `Shopify Admin GraphQL failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status || 502;
    error.shopifyErrors = json.errors;
    error.extensions = json.extensions;
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
  getShopifyAdminToken,
  shopifyAdminGraphql,
  makeShopifyAdminGraphql
};
