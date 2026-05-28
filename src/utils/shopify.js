const { env } = require('../config/env');
const { Shop } = require('../models');
const { decryptSecret } = require('./crypto');

function getShopifyStoreUrl(shopDomain) {
  return String(shopDomain || env.shopifyStoreUrl || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function missingShopifyAccessError(shopDomain) {
  const err = new Error('This shop has not completed Shopify OAuth install, so no per-shop Admin API token is available yet.');
  err.code = 'SHOPIFY_ACCESS_MISSING';
  err.shopDomain = shopDomain || '';
  return err;
}

async function getShopRecord(shopDomain) {
  const normalizedShop = getShopifyStoreUrl(shopDomain);
  if (!normalizedShop) return null;
  return Shop.findOne({ shopDomain: normalizedShop }).lean();
}

async function getAccessTokenForShop(shopDomain, explicitToken) {
  if (explicitToken) return explicitToken;

  const normalizedShop = getShopifyStoreUrl(shopDomain);
  if (!normalizedShop) return '';

  try {
    const shop = await getShopRecord(normalizedShop);
    if (shop?.accessTokenEncrypted) return decryptSecret(shop.accessTokenEncrypted);
  } catch (error) {
    console.warn('Shop access token lookup skipped:', error.message);
  }

  // Development-only escape hatch. Public/multi-merchant installs should use OAuth tokens stored per shop.
  return env.shopifyAccessToken || '';
}

function buildInstallUrl(shopDomain) {
  const normalizedShop = getShopifyStoreUrl(shopDomain);
  if (!normalizedShop) return '';
  const base = env.appUrl || '';
  const path = `${base.replace(/\/$/, '')}/auth/shopify?shop=${encodeURIComponent(normalizedShop)}`;
  return base ? path : `/auth/shopify?shop=${encodeURIComponent(normalizedShop)}`;
}

async function shopifyFetch(pathname, options = {}) {
  const shopDomain = getShopifyStoreUrl(options.shopDomain);
  const accessToken = await getAccessTokenForShop(shopDomain, options.accessToken);

  if (!shopDomain) {
    const err = new Error('Missing Shopify shop domain.');
    err.code = 'SHOPIFY_SHOP_MISSING';
    throw err;
  }
  if (!accessToken) throw missingShopifyAccessError(shopDomain);

  const fetchOptions = { ...options };
  delete fetchOptions.shopDomain;
  delete fetchOptions.accessToken;

  const response = await fetch(`https://${shopDomain}${pathname}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.errors || data.error || response.statusText || 'Shopify request failed';
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    err.status = response.status;
    if (response.status === 401 || response.status === 403) err.code = 'SHOPIFY_REINSTALL_REQUIRED';
    throw err;
  }

  return data;
}

async function shopifyFetchOptional(pathname, options = {}) {
  try {
    return await shopifyFetch(pathname, options);
  } catch (error) {
    if (['SHOPIFY_ACCESS_MISSING', 'SHOPIFY_SHOP_MISSING', 'SHOPIFY_REINSTALL_REQUIRED'].includes(error.code)) return null;
    throw error;
  }
}

module.exports = {
  shopifyFetch,
  shopifyFetchOptional,
  getShopifyStoreUrl,
  getAccessTokenForShop,
  getShopRecord,
  buildInstallUrl,
};
