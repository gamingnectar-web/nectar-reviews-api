const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const messaging = require('./messaging.service');
const ReviewRequestLink = require('../reviews/review-request-link.model');
const { config } = require('../../core/config');

const router = express.Router();
const transparentGif = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

router.get('/open/:token.gif', asyncHandler(async (req, res) => {
  const link = await ReviewRequestLink.findOne({ token: req.params.token }).lean();
  if (link) {
    await messaging.logCampaignEvent({
      shopDomain: link.shopDomain,
      eventType: 'open',
      campaign: link.campaign,
      orderKey: link.orderKey,
      recipientHash: link.recipientHash,
      customerKey: link.customerKey,
      itemId: link.itemId,
      token: link.token,
      req
    });
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.end(transparentGif);
}));

router.get('/click/:token', asyncHandler(async (req, res) => {
  const link = await ReviewRequestLink.findOne({ token: req.params.token }).lean();
  if (!link) return res.redirect(`${config.appBaseUrl || ''}/review?error=invalid_link`);
  await messaging.logCampaignEvent({
    shopDomain: link.shopDomain,
    eventType: 'click',
    campaign: link.campaign,
    orderKey: link.orderKey,
    recipientHash: link.recipientHash,
    customerKey: link.customerKey,
    itemId: link.itemId,
    token: link.token,
    url: `/review?token=${encodeURIComponent(link.token)}`,
    req
  });
  res.redirect(`/review?token=${encodeURIComponent(link.token)}`);
}));

module.exports = router;
