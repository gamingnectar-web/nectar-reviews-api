const crypto = require('crypto');
const express = require('express');
const { env } = require('../config/env');
const { Shop } = require('../models');
const { encryptSecret, base64UrlEncode, base64UrlDecode, timingSafeEqualString } = require('../utils/crypto');
const { cleanShopDomain, isValidShopDomain } = require('../utils/validation');
const { registerReviewWebhookSubscriptions } = require('../modules/reviews/reviewRequestAutomation');
const { setAdminSessionCookie } = require('../utils/security');

const router = express.Router();

function getCallbackUrl(req) {
  const base = env.appUrl || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/auth/callback`;
}

function sign(value) { return crypto.createHmac('sha256', env.shopifyApiSecret).update(value).digest('hex'); }

function createState(shopDomain) {
  const payload = JSON.stringify({ shop: shopDomain, ts: Date.now(), nonce: crypto.randomBytes(16).toString('hex') });
  const encoded = base64UrlEncode(Buffer.from(payload));
  return `${encoded}.${sign(encoded)}`;
}

function verifyState(state, expectedShop) {
  const [encoded, signature] = String(state || '').split('.');
  if (!encoded || !signature) return false;
  if (!timingSafeEqualString(sign(encoded), signature)) return false;
  let payload;
  try { payload = JSON.parse(base64UrlDecode(encoded)); } catch (_) { return false; }
  if (cleanShopDomain(payload.shop) !== expectedShop) return false;
  if (!payload.ts || Date.now() - Number(payload.ts) > 10 * 60 * 1000) return false;
  return true;
}

function verifyShopifyOAuthHmac(query) {
  const hmac = String(query.hmac || '');
  if (!hmac || !env.shopifyApiSecret) return false;
  const message = Object.keys(query).filter((key) => key !== 'hmac' && key !== 'signature').sort()
    .map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`).join('&');
  const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(message).digest('hex');
  return timingSafeEqualString(digest, hmac);
}

function assertOAuthConfigured(res) {
  if (!env.shopifyApiKey || !env.shopifyApiSecret || !env.appUrl) {
    res.status(500).send('Shopify OAuth is not configured. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET and APP_URL.');
    return false;
  }
  return true;
}

router.get('/shopify', (req, res) => {
  if (!assertOAuthConfigured(res)) return;
  const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain || env.shopifyStoreUrl);
  if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).send('Valid Shopify shop domain is required.');
  const installUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  installUrl.searchParams.set('client_id', env.shopifyApiKey);
  installUrl.searchParams.set('scope', env.shopifyScopes);
  installUrl.searchParams.set('redirect_uri', getCallbackUrl(req));
  installUrl.searchParams.set('state', createState(shopDomain));
  return res.redirect(installUrl.toString());
});

async function callbackHandler(req, res, next) {
  try {
    if (!assertOAuthConfigured(res)) return;
    const shopDomain = cleanShopDomain(req.query.shop);
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).send('Invalid shop in OAuth callback.');
    if (!code) return res.status(400).send('Missing OAuth code.');
    if (!verifyShopifyOAuthHmac(req.query)) return res.status(400).send('Invalid Shopify OAuth HMAC.');
    if (!verifyState(state, shopDomain)) return res.status(400).send('Invalid or expired OAuth state. Please install again.');

    const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.shopifyApiKey, client_secret: env.shopifyApiSecret, code }),
    });
    const tokenJson = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenJson.access_token) {
      console.error('Shopify token exchange failed:', { status: tokenResponse.status });
      return res.status(502).send('Shopify token exchange failed.');
    }

    await Shop.findOneAndUpdate({ shopDomain }, { $set: {
      shopDomain,
      accessTokenEncrypted: encryptSecret(tokenJson.access_token),
      scopes: tokenJson.scope || env.shopifyScopes,
      installSource: 'oauth', installedAt: new Date(), uninstalledAt: null, lastOAuthAt: new Date(),
      modules: { reviews: { enabled: true }, discounts: { enabled: false }, loyalty: { enabled: false }, referrals: { enabled: false } },
    } }, { upsert: true, new: true, setDefaultsOnInsert: true });

    registerReviewWebhookSubscriptions(shopDomain).catch((error) => console.warn('Review webhook registration skipped:', error.message));
    setAdminSessionCookie(res, shopDomain);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(`/admin?shop=${encodeURIComponent(shopDomain)}&installed=1`);
  } catch (error) { next(error); }
}

router.get('/callback', callbackHandler);
router.get('/shopify/callback', callbackHandler);
module.exports = router;
