const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain } = require('../../core/http/request-utils');
const { auditFromRequest } = require('../../core/audit/audit.service');
const discounts = require('./discounts.service');

const router = express.Router();

router.get('/settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json({ settings: await discounts.getSettings(shopDomain) });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const before = await discounts.getSettings(shopDomain);
  const settings = await discounts.updateSettings(shopDomain, req.body.settings || req.body);
  await auditFromRequest(req, { shopDomain, module: 'discounts', eventType: 'discount.settings.updated', entityType: 'discount_settings', entityKey: shopDomain, action: 'update', before: before.toObject ? before.toObject() : before, after: settings.toObject ? settings.toObject() : settings });
  res.json({ ok: true, settings });
}));

router.get('/review-rewards', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json({ rewards: await discounts.listReviewRewards(shopDomain, req.query.limit) });
}));

router.post('/manual-code', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const settings = await discounts.getSettings(shopDomain);
  const result = await discounts.createShopifyDiscountCode(shopDomain, settings, { customerKey: req.body.customerKey || '', id: `manual-${Date.now()}` });
  await auditFromRequest(req, { shopDomain, module: 'discounts', eventType: 'discount.manual_code.created', entityType: 'review_reward', entityKey: String(result.reward?._id || ''), action: 'create', metadata: { discountValue: result.reward?.discountValue, discountType: result.reward?.discountType } });
  res.status(201).json({ ok: true, reward: result.reward, discountCode: result.discountCode });
}));

module.exports = router;
