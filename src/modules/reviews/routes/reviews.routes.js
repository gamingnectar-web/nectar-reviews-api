const express = require('express');
const { asyncHandler } = require('../../../core/middleware/async-handler');
const {
  publicReview,
  createReview,
  listReviews,
  reviewSummary,
  updateReview,
  importReviews,
  createSignedReviewToken,
  consumeSignedReviewToken
} = require('../services/reviews.service');

function createReviewsRouter() {
  const router = express.Router();

  router.get('/stats/summary', asyncHandler(async (req, res) => {
    res.json(await reviewSummary(req.shopDomain));
  }));

  router.get('/admin/all', asyncHandler(async (req, res) => {
    const reviews = await listReviews(req.shopDomain, {
      status: req.query.status,
      itemId: req.query.itemId,
      limit: req.query.limit || 100
    });
    res.json({ reviews });
  }));

  router.patch('/admin/:id', asyncHandler(async (req, res) => {
    const review = await updateReview(req.shopDomain, req.params.id, req.body);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    res.json({ review });
  }));

  router.post('/bulk', asyncHandler(async (req, res) => {
    const results = await importReviews(req.shopDomain, req.body.reviews || []);
    res.status(207).json({ results });
  }));

  router.post('/tokens', asyncHandler(async (req, res) => {
    const token = await createSignedReviewToken(req.shopDomain, req.body);
    res.status(201).json(token);
  }));

  router.post('/with-token', asyncHandler(async (req, res) => {
    const review = await consumeSignedReviewToken(req.shopDomain, req.body.token, req.body.review || req.body);
    res.status(201).json({ review: publicReview(review) });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const review = await createReview(req.shopDomain, req.body, {
      source: req.body.testMode ? 'test' : 'storefront',
      status: req.body.testMode ? 'test' : 'pending',
      verifiedPurchase: false,
      verificationSource: 'none'
    });
    res.status(201).json({ review: publicReview(review) });
  }));

  router.get('/:itemId', asyncHandler(async (req, res) => {
    const reviews = await listReviews(req.shopDomain, { itemId: req.params.itemId, status: 'approved' });
    res.json({ reviews: reviews.map(publicReview) });
  }));

  return router;
}

function createReviewsLegacyRouter() {
  const router = express.Router();

  router.get('/widget/config', asyncHandler(async (req, res) => {
    const summary = await reviewSummary(req.shopDomain);
    res.json({
      shopDomain: req.shopDomain,
      theme: {
        accent: '#f5b301',
        stars: '#f5b301',
        layout: 'premium-card'
      },
      summary
    });
  }));

  router.get('/global-reviews', asyncHandler(async (req, res) => {
    const reviews = await listReviews(req.shopDomain, { status: 'approved', limit: req.query.limit || 100 });
    res.json({ reviews: reviews.map(publicReview) });
  }));

  router.get('/magic-link/order', asyncHandler(async (req, res) => {
    res.json({
      ok: true,
      message: 'Use POST /api/reviews/tokens to create a one-use signed review token, then POST /api/reviews/with-token to submit it.'
    });
  }));

  return router;
}

module.exports = { createReviewsRouter, createReviewsLegacyRouter };
