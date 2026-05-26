const express = require('express');
const { asyncHandler } = require('../middleware/async-handler');
const { getShopFromRequest } = require('../utils/clean-shop-domain');
const { stableHash } = require('../utils/hash');
const { isDatabaseConnected } = require('../../config/database');
const SupportRequest = require('./support-request.model');

const memoryRequests = [];

module.exports = function supportRoutes() {
  const router = express.Router();

  router.post('/', asyncHandler(async (req, res) => {
    const shopDomain = getShopFromRequest(req);
    const payload = {
      shopDomain,
      name: String(req.body.name || '').slice(0, 120),
      emailHash: stableHash(req.body.email, 'support-email'),
      topic: String(req.body.topic || 'General').slice(0, 120),
      message: String(req.body.message || '').slice(0, 5000),
      status: 'open'
    };

    if (!payload.message) return res.status(400).json({ error: 'Message is required.' });

    if (isDatabaseConnected()) {
      await SupportRequest.create(payload);
    } else {
      memoryRequests.push({ ...payload, createdAt: new Date() });
    }

    res.status(201).json({ ok: true });
  }));

  return router;
};
