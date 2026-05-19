const express = require('express');
const { asyncHandler } = require('../http/async-handler');
const { cleanShopDomain } = require('../http/request-utils');
const { config } = require('../config');
const {
  buildInstallUrl,
  verifyOAuthHmac,
  validateOAuthState,
  exchangeCodeForToken,
  saveInstallation,
  getShopifyAdminAccessToken
} = require('./shopify.service');

const router = express.Router();

router.get('/install', asyncHandler(async (req, res) => {
  const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain);
  if (!shopDomain) return res.status(400).send('Missing shop parameter.');
  if (!config.shopify.apiKey || !config.shopify.apiSecret) {
    return res.status(500).send('Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET.');
  }
  const installUrl = await buildInstallUrl(shopDomain);
  res.redirect(installUrl);
}));

router.get('/callback', asyncHandler(async (req, res) => {
  const shopDomain = cleanShopDomain(req.query.shop);
  const { code, state } = req.query;
  if (!shopDomain || !code || !state) return res.status(400).send('Missing OAuth callback fields.');
  if (!verifyOAuthHmac(req.query)) return res.status(400).send('Invalid Shopify OAuth HMAC.');
  const validState = await validateOAuthState(shopDomain, state);
  if (!validState) return res.status(400).send('Invalid or expired OAuth state.');
  const tokenResponse = await exchangeCodeForToken(shopDomain, code);
  await saveInstallation(shopDomain, tokenResponse);
  res.redirect(`/admin?shopDomain=${encodeURIComponent(shopDomain)}`);
}));

router.get('/status', asyncHandler(async (req, res) => {
  const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain);
  const token = await getShopifyAdminAccessToken(shopDomain);
  res.json({ shopDomain, installed: Boolean(token) });
}));

module.exports = router;
