const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain, normaliseLimit } = require('../../core/http/request-utils');
const reviews = require('./reviews.service');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const result = await reviews.listPublicReviews({
    shopDomain,
    itemId: req.query.itemId,
    limit: normaliseLimit(req.query.limit, 20, 100),
    includeTest: req.query.includeTest === 'true'
  });
  res.json({ reviews: result });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const summary = await reviews.getReviewSummary(shopDomain, req.query.itemId, req.query.includeTest === 'true');
  res.json(summary);
}));

router.get('/settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const settings = await reviews.getSettings(shopDomain);
  res.json({ settings });
}));

router.get('/request/:token', asyncHandler(async (req, res) => {
  const link = await reviews.getRequestLink(req.params.token);
  res.json({
    valid: true,
    link: {
      shopDomain: link.shopDomain,
      itemId: link.itemId,
      itemTitle: link.itemTitle,
      expiresAt: link.expiresAt
    }
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const review = await reviews.createReview(req.body);
  res.status(201).json({ ok: true, review: reviews.publicReview(review) });
}));

module.exports = router;
