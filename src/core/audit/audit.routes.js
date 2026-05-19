const express = require('express');
const { asyncHandler } = require('../http/async-handler');
const { requireShopDomain, normaliseLimit } = require('../http/request-utils');
const { listAuditEvents } = require('./audit.service');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const events = await listAuditEvents({
    shopDomain,
    module: req.query.module,
    eventType: req.query.eventType,
    limit: normaliseLimit(req.query.limit, 100, 250)
  });
  res.json({ events });
}));

module.exports = router;
