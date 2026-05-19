const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain } = require('../../core/http/request-utils');
const messaging = require('./messaging.service');

const router = express.Router();

router.post('/test-email', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const to = req.body.to || req.body.email;
  if (!to) return res.status(400).json({ error: 'Missing recipient email.' });
  const result = await messaging.testEmail(shopDomain, to);
  res.json({ ok: true, messageId: result.messageId });
}));

module.exports = router;
