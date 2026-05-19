const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain } = require('../../core/http/request-utils');
const messaging = require('./messaging.service');

const router = express.Router();

router.get('/email-settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const settings = await messaging.getEmailSettings(shopDomain);
  res.json({ settings: messaging.publicEmailSettings(settings) });
}));

router.put('/email-settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const settings = await messaging.updateEmailSettings(shopDomain, req.body.settings || req.body);
  res.json({ ok: true, settings: messaging.publicEmailSettings(settings) });
}));

module.exports = router;
