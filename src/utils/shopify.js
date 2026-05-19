const { env } = require('../config/env');
const { Shop } = require('../models');
const { decryptSecret } = require('./crypto');

function getShopifyStoreUrl(shopDomain) {
  return String(shopDomain || env.shopifyStoreUrl || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function missingShopifyAccessError() {
  const err = new Error('Missing Shopify Admin API credentials. Add SHOPIFY_ACCESS_TOKEN/SHOPIFY_ADMIN_ACCESS_TOKEN, store a per-shop access token, or keep the legacy SHOPIFY_API_KEY + SHOPIFY_API_SECRET fallback configured.');
  err.code = 'SHOPIFY_ACCESS_MISSING';
  return err;
}

function buildLegacyBasicAuthHeader() {
  if (!env.shopifyApiKey || !env.shopifyApiSecret) return '';
  return `Basic ${Buffer.from(`${env.shopifyApiKey}:${env.shopifyApiSecret}`).toString('base64')}`;
}

async function getAccessTokenForShop(shopDomain, explicitToken) {
  if (explicitToken) return explicitToken;

  const normalizedShop = getShopifyStoreUrl(shopDomain);
  if (!normalizedShop) return env.shopifyAccessToken || '';

  try {
    const shop = await Shop.findOne({ shopDomain: normalizedShop }).lean();
    if (shop?.accessTokenEncrypted) {
      return decryptSecret(shop.accessTokenEncrypted);
    }
  } catch (error) {
    // Do not make dashboard/product widgets fail because optional per-shop token lookup failed.
    console.warn('Shop access token lookup skipped:', error.message);
  }

  // Single-store/dev compatibility: this keeps the old working format alive while OAuth/per-shop tokens are added later.
  return env.shopifyAccessToken || '';
}

async function shopifyFetch(pathname, options = {}) {
  const shopDomain = getShopifyStoreUrl(options.shopDomain);
  const accessToken = await getAccessTokenForShop(shopDomain, options.accessToken);
  const legacyBasicAuth = accessToken ? '' : buildLegacyBasicAuthHeader();

  if (!shopDomain) {
    const err = new Error('Missing Shopify shop domain.');
    err.code = 'SHOPIFY_SHOP_MISSING';
    throw err;
  }
  if (!accessToken && !legacyBasicAuth) {
    throw missingShopifyAccessError();
  }

  const fetchOptions = { ...options };
  delete fetchOptions.shopDomain;
  delete fetchOptions.accessToken;

  const response = await fetch(`https://${shopDomain}${pathname}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { 'X-Shopify-Access-Token': accessToken } : { Authorization: legacyBasicAuth }),
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
    throw err;
  }

  return data;
}

async function shopifyFetchOptional(pathname, options = {}) {
  try {
    return await shopifyFetch(pathname, options);
  } catch (error) {
    if (error.code === 'SHOPIFY_ACCESS_MISSING' || error.code === 'SHOPIFY_SHOP_MISSING') {
      return null;
    }
    throw error;
  }
}

module.exports = { shopifyFetch, shopifyFetchOptional, getShopifyStoreUrl };
