const express = require('express');
const crypto = require('crypto');
const { env } = require('../../config/env');
const { asyncHandler } = require('../middleware/async-handler');
const { cleanShopDomain } = require('../utils/clean-shop-domain');
const { upsertShop } = require('../shopify/shop.service');

function buildHmacParams(query) {
  return Object.keys(query)
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`)
    .join('&');
}

function verifyShopifyHmac(query) {
  if (!env.shopifyApiSecret || !query.hmac) return false;
  const message = buildHmacParams(query);
  const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(message).digest('hex');
  const supplied = String(query.hmac);
  if (digest.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(supplied));
}

module.exports = function shopifyAuthRoutes() {
  const router = express.Router();

  router.get('/shopify', (req, res) => {
    const shop = cleanShopDomain(req.query.shop);
    if (!shop) return res.status(400).send('Valid shop parameter is required.');
    if (!env.shopifyApiKey) return res.status(500).send('SHOPIFY_API_KEY is missing.');

    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('shopify_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: env.nodeEnv === 'production' });

    const redirectUri = `${env.appUrl}/auth/callback`;
    const installUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    installUrl.searchParams.set('client_id', env.shopifyApiKey);
    installUrl.searchParams.set('scope', env.shopifyScopes);
    installUrl.searchParams.set('redirect_uri', redirectUri);
    installUrl.searchParams.set('state', state);

    res.redirect(installUrl.toString());
  });

  const callback = asyncHandler(async (req, res) => {
    const shop = cleanShopDomain(req.query.shop);
    const code = req.query.code;
    const state = req.query.state;

    if (!shop || !code) return res.status(400).send('Missing shop or code.');
    if (!verifyShopifyHmac(req.query)) return res.status(401).send('Invalid Shopify HMAC.');
    if (req.cookies.shopify_oauth_state && state !== req.cookies.shopify_oauth_state) {
      return res.status(401).send('Invalid OAuth state.');
    }

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.shopifyApiKey,
        client_secret: env.shopifyApiSecret,
        code
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(400).json({ error: 'Unable to complete Shopify OAuth.', details: tokenData });
    }

    await upsertShop({ shopDomain: shop, accessToken: tokenData.access_token, scopes: tokenData.scope || env.shopifyScopes });

    res.redirect(`${env.appUrl}/admin/?shop=${encodeURIComponent(shop)}`);
  });

  router.get('/callback', callback);
  router.get('/shopify/callback', callback);

  return router;
};
