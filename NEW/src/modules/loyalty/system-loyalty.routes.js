const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { config } = require('../../core/config');
const loyalty = require('./loyalty.service');

const router = express.Router();

function requireCron(req, res, next) {
  const expected = config.security.cronSecret;
  if (!expected) return res.status(503).json({ error: 'CRON_SECRET is not configured.' });
  const provided = req.get('x-nectar-cron-token') || req.query.token || '';
  if (provided !== expected) return res.status(401).json({ error: 'Cron authentication required.' });
  next();
}

router.post('/process-pending', requireCron, asyncHandler(async (req, res) => {
  const approved = await loyalty.processPendingApprovals({ shopDomain: req.body.shopDomain || req.query.shopDomain, limit: req.body.limit || req.query.limit });
  res.json({ ok: true, approvedCount: approved.length });
}));

module.exports = router;
