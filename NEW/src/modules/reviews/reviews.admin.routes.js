const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain, normaliseLimit } = require('../../core/http/request-utils');
const { auditFromRequest } = require('../../core/audit/audit.service');
const reviews = require('./reviews.service');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const result = await reviews.listAdminReviews({
    shopDomain,
    itemId: req.query.itemId,
    status: req.query.status,
    limit: normaliseLimit(req.query.limit, 100, 250),
    includeDeleted: req.query.includeDeleted === 'true'
  });
  res.json({ reviews: result });
}));

router.get('/analytics', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json(await reviews.analytics(shopDomain));
}));

router.get('/settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json({ settings: await reviews.getSettings(shopDomain) });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const before = await reviews.getSettings(shopDomain);
  const settings = await reviews.updateSettings(shopDomain, req.body.settings || req.body);
  await auditFromRequest(req, { shopDomain, module: 'reviews', eventType: 'reviews.settings.updated', entityType: 'review_settings', entityKey: shopDomain, action: 'update', before: before.toObject ? before.toObject() : before, after: settings.toObject ? settings.toObject() : settings });
  res.json({ ok: true, settings });
}));

router.post('/links', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const link = await reviews.createReviewRequestLink({ ...req.body, shopDomain });
  await auditFromRequest(req, { shopDomain, module: 'reviews', eventType: 'reviews.request_link.created', entityType: 'review_request_link', entityKey: String(link._id), action: 'create', metadata: { sourceType: 'review_request' } });
  res.status(201).json({ ok: true, link: { token: link.token, itemId: link.itemId, itemTitle: link.itemTitle, expiresAt: link.expiresAt, maxUses: link.maxUses } });
}));

router.post('/test', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const review = await reviews.createReview({
    ...req.body,
    shopDomain,
    itemId: req.body.itemId || 'test-product',
    rating: req.body.rating || 5,
    headline: req.body.headline || 'Test review',
    comment: req.body.comment || 'This is a test review.',
    status: req.body.status || 'accepted',
    source: 'admin',
    isTestReview: true,
    testMode: true,
    testLabel: req.body.testLabel || 'Admin test'
  });
  await auditFromRequest(req, { shopDomain, module: 'reviews', eventType: 'reviews.test.created', entityType: 'review', entityKey: String(review._id), action: 'create', metadata: { reviewStatus: review.status } });
  res.status(201).json({ ok: true, review });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const review = await reviews.updateReviewStatus(shopDomain, req.params.id, req.body.status);
  await auditFromRequest(req, { shopDomain, module: 'reviews', eventType: 'reviews.status.updated', entityType: 'review', entityKey: String(review._id), action: 'update_status', metadata: { toStatus: review.status } });
  res.json({ ok: true, review });
}));

router.patch('/:id/reply', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const review = await reviews.replyToReview(shopDomain, req.params.id, req.body.reply);
  await auditFromRequest(req, { shopDomain, module: 'reviews', eventType: 'reviews.reply.updated', entityType: 'review', entityKey: String(review._id), action: 'reply' });
  res.json({ ok: true, review });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const review = await reviews.softDeleteReview(shopDomain, req.params.id);
  await auditFromRequest(req, { shopDomain, module: 'reviews', eventType: 'reviews.deleted', entityType: 'review', entityKey: String(review._id), action: 'soft_delete' });
  res.json({ ok: true, review });
}));

module.exports = router;
