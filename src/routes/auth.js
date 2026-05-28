const express = require('express');
const crypto = require('crypto');
const { env } = require('../config/env');
const { Shop } = require('../models');
const { cleanShopDomain, isValidShopDomain } = require('../utils/validation');
const { shopifyAuthUrl } = require('../utils/shopify');
const { setAdminSessionCookie } = require('../utils/security');
const router = express.Router();

router.get('/shopify', (req, res) => {
  const shop = cleanShopDomain(req.query.shop || '');
  if (!isValidShopDomain(shop)) return res.status(400).send('Invalid shop');
  if (!env.shopifyApiKey || !env.shopifyApiSecret || !env.appUrl) return res.status(500).send('Shopify OAuth env vars missing');
  res.redirect(shopifyAuthUrl(shop));
});

router.get(['/callback','/shopify/callback'], async (req, res, next) => {
  try {
    const shop = cleanShopDomain(req.query.shop || '');
    const code = String(req.query.code || '');
    if (!isValidShopDomain(shop) || !code) return res.status(400).send('Invalid OAuth callback');
    const hmac = req.query.hmac;
    const query = { ...req.query }; delete query.hmac; delete query.signature;
    const message = Object.keys(query).sort().map(k => `${k}=${Array.isArray(query[k]) ? query[k].join(',') : query[k]}`).join('&');
    const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(message).digest('hex');
    if (hmac && digest !== hmac) return res.status(401).send('Invalid HMAC');
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.shopifyApiKey, client_secret: env.shopifyApiSecret, code }) });
    const json = await response.json();
    if (!response.ok || !json.access_token) throw new Error(JSON.stringify(json));
    await Shop.findOneAndUpdate({ shopDomain: shop }, { $set: { accessToken: json.access_token, accessTokenEncrypted: json.access_token, scopes: json.scope || env.shopifyScopes, uninstalledAt: null }, $setOnInsert: { installedAt: new Date() } }, { upsert: true, new: true });
    setAdminSessionCookie(res, shop);
    res.redirect(`/admin?shop=${encodeURIComponent(shop)}&installed=1`);
  } catch (error) { next(error); }
});
module.exports = router;
