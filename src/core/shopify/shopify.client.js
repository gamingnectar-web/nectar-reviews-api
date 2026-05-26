const { env } = require('../../config/env');
const { getShop } = require('./shop.service');

async function shopifyFetch(shopDomain, endpoint, options = {}) {
  const shop = await getShop(shopDomain);
  if (!shop?.accessToken) {
    const error = new Error('Shop is not installed or does not have an OAuth token.');
    error.status = 401;
    throw error;
  }

  const url = `https://${shop.shopDomain}/admin/api/${env.shopifyApiVersion}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shop.accessToken,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.errors || data?.error || `Shopify request failed with ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function shopifyGraphql(shopDomain, query, variables = {}) {
  return shopifyFetch(shopDomain, '/graphql.json', {
    method: 'POST',
    body: JSON.stringify({ query, variables })
  });
}

module.exports = { shopifyFetch, shopifyGraphql };
