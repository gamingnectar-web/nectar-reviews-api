const { env } = require('../config/env');

function getShopifyStoreUrl(shopDomain) {
  return String(shopDomain || env.shopifyStoreUrl || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

async function shopifyFetch(pathname, options = {}) {
  const shopDomain = getShopifyStoreUrl(options.shopDomain);
  const accessToken = options.accessToken || env.shopifyAccessToken;

  if (!shopDomain) {
    throw new Error('Missing Shopify shop domain.');
  }
  if (!accessToken) {
    throw new Error('Missing SHOPIFY_ACCESS_TOKEN / per-shop access token.');
  }

  const response = await fetch(`https://${shopDomain}${pathname}`, {
    ...options,
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
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return data;
}

module.exports = { shopifyFetch, getShopifyStoreUrl };
