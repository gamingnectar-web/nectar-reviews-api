const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain } = require('../../core/http/request-utils');
const messaging = require('./messaging.service');

const router = express.Router();

router.post('/review-request', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const result = await messaging.sendReviewRequest({ ...req.body, shopDomain });
  res.status(201).json({ ok: true, result });
}));

router.get('/analytics', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json(await messaging.campaignAnalytics(shopDomain));
}));

module.exports = router;
