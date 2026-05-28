const { Shop } = require('../models');
const { env } = require('../config/env');
const { cleanShopDomain } = require('./validation');

async function shopifyFetch(path, { shopDomain, method = 'GET', body, headers = {} } = {}) {
  const shop = cleanShopDomain(shopDomain);
  if (!shop) throw new Error('shopDomain is required');
  const record = await Shop.findOne({ shopDomain: shop }).lean();
  const token = record?.accessToken || record?.accessTokenEncrypted || process.env.SHOPIFY_ACCESS_TOKEN || '';
  if (!token) throw new Error('No Shopify access token available for this shop. Reinstall OAuth.');
  const url = path.startsWith('http') ? path : `https://${shop}${path}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!response.ok) throw new Error(`Shopify ${response.status}: ${json?.errors || text}`);
  return json;
}

async function shopifyFetchOptional(path, options = {}) {
  try { return await shopifyFetch(path, options); } catch (error) { console.warn('Optional Shopify fetch skipped:', error.message); return null; }
}

function shopifyAuthUrl(shop) {
  const scopes = encodeURIComponent(env.shopifyScopes);
  const redirect = encodeURIComponent(`${env.appUrl}/auth/shopify/callback`);
  return `https://${shop}/admin/oauth/authorize?client_id=${env.shopifyApiKey}&scope=${scopes}&redirect_uri=${redirect}&state=nectar`;
}

module.exports = { shopifyFetch, shopifyFetchOptional, shopifyAuthUrl };
