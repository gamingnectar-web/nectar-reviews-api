const express = require('express');
const { asyncHandler } = require('../../../core/middleware/async-handler');
const { addLedgerEntry, listLedger, summary } = require('../services/loyalty.service');

module.exports = function loyaltyRoutes() {
  const router = express.Router();

  router.get('/summary', asyncHandler(async (req, res) => {
    res.json(await summary(req.shopDomain));
  }));

  router.get('/ledger', asyncHandler(async (req, res) => {
    res.json({ ledger: await listLedger(req.shopDomain, req.query) });
  }));

  router.post('/ledger', asyncHandler(async (req, res) => {
    const entry = await addLedgerEntry(req.shopDomain, req.body);
    res.status(201).json({ entry });
  }));

  return router;
};
