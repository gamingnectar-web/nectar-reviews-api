const crypto = require('crypto');
const { URLSearchParams } = require('url');
const { config } = require('../config');
const { cleanShopDomain } = require('../http/request-utils');
const { createToken } = require('../security/credentials.service');
const ShopifyInstallation = require('./shopify-installation.model');
const ShopifyOAuthState = require('./shopify-oauth-state.model');

function getShopifyStoreUrl() {
  return cleanShopDomain(config.shopify.storeUrl);
}

function getCallbackUrl() {
  const base = config.appBaseUrl;
  if (!base) throw new Error('APP_BASE_URL is required for Shopify OAuth.');
  return `${base}/auth/shopify/callback`;
}

async function getShopifyAdminAccessToken(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain || getShopifyStoreUrl());
  if (cleanShop) {
    const installation = await ShopifyInstallation.findOne({ shopDomain: cleanShop, isActive: { $ne: false } }).lean();
    if (installation?.accessToken) return installation.accessToken;
  }
  return config.shopify.adminAccessToken || '';
}

async function shopifyFetch(pathname, options = {}) {
  const requestedShop = cleanShopDomain(options.shopDomain || options.shop || getShopifyStoreUrl());
  const accessToken = await getShopifyAdminAccessToken(requestedShop);
  if (!requestedShop || !accessToken) {
    throw new Error('Missing Shopify Admin API credentials. Install the app or set SHOPIFY_ADMIN_API_ACCESS_TOKEN for development.');
  }

  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = `https://${requestedShop}/admin/api/${config.shopify.apiVersion}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data?.errors ? JSON.stringify(data.errors) : `Shopify API failed with ${response.status}`);
    error.statusCode = response.status;
    error.shopify = data;
    throw error;
  }
  return data;
}

async function shopifyGraphql(shopDomain, query, variables = {}) {
  const data = await shopifyFetch('/graphql.json', {
    method: 'POST',
    shopDomain,
    body: { query, variables }
  });
  if (Array.isArray(data.errors) && data.errors.length) {
    const error = new Error(data.errors.map((entry) => entry.message).join('; '));
    error.shopify = data;
    throw error;
  }
  return data.data;
}

function safeTimingEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  try { return crypto.timingSafeEqual(left, right); } catch (_) { return false; }
}

function verifyOAuthHmac(query) {
  if (!config.shopify.apiSecret) return false;
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(',') : rest[key]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', config.shopify.apiSecret).update(message).digest('hex');
  return safeTimingEqual(digest, hmac);
}

function verifyAppProxySignature(query) {
  if (!config.shopify.apiSecret) return false;
  const params = { ...(query || {}) };
  const receivedSignature = params.signature;
  delete params.signature;
  if (!receivedSignature) return false;
  const message = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      if (Array.isArray(value)) return `${key}=${value.join(',')}`;
      return `${key}=${value}`;
    })
    .join('');
  const digest = crypto.createHmac('sha256', config.shopify.apiSecret).update(message).digest('hex');
  return safeTimingEqual(digest, receivedSignature);
}

function verifyWebhookHmac(rawBody, receivedHmac) {
  if (!config.shopify.apiSecret || !rawBody || !receivedHmac) return false;
  const digest = crypto.createHmac('sha256', config.shopify.apiSecret).update(rawBody).digest('base64');
  return safeTimingEqual(digest, receivedHmac);
}

async function createOAuthState(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  const state = createToken(16);
  await ShopifyOAuthState.create({
    shopDomain: cleanShop,
    state,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });
  return state;
}

async function validateOAuthState(shopDomain, state) {
  const cleanShop = cleanShopDomain(shopDomain);
  const record = await ShopifyOAuthState.findOne({ shopDomain: cleanShop, state });
  if (!record) return false;
  await ShopifyOAuthState.deleteOne({ _id: record._id });
  return true;
}

async function buildInstallUrl(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  const state = await createOAuthState(cleanShop);
  const params = new URLSearchParams({
    client_id: config.shopify.apiKey,
    scope: config.shopify.scopes,
    redirect_uri: getCallbackUrl(),
    state
  });
  return `https://${cleanShop}/admin/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(shopDomain, code) {
  const cleanShop = cleanShopDomain(shopDomain);
  const response = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.shopify.apiKey,
      client_secret: config.shopify.apiSecret,
      code
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Could not exchange Shopify OAuth code for access token.');
  }
  return data;
}

async function saveInstallation(shopDomain, tokenResponse) {
  const cleanShop = cleanShopDomain(shopDomain);
  return ShopifyInstallation.findOneAndUpdate(
    { shopDomain: cleanShop },
    {
      $set: {
        shopDomain: cleanShop,
        accessToken: tokenResponse.access_token,
        scope: tokenResponse.scope || config.shopify.scopes,
        updatedAt: new Date(),
        isActive: true
      },
      $setOnInsert: { installedAt: new Date() }
    },
    { new: true, upsert: true }
  );
}

async function searchProducts(shopDomain, query, limit = 20) {
  const search = String(query || '').trim();
  const graphql = `query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes { id title handle status featuredImage { url altText } variants(first: 1) { nodes { id price sku } } }
    }
  }`;
  const data = await shopifyGraphql(shopDomain, graphql, { query: search ? `title:*${search}*` : '', first: Math.min(Number(limit) || 20, 50) });
  return data?.products?.nodes || [];
}

module.exports = {
  getShopifyStoreUrl,
  getShopifyAdminAccessToken,
  shopifyFetch,
  shopifyGraphql,
  verifyOAuthHmac,
  verifyAppProxySignature,
  verifyWebhookHmac,
  buildInstallUrl,
  exchangeCodeForToken,
  saveInstallation,
  validateOAuthState,
  searchProducts
};
