const express = require('express');
const { asyncHandler } = require('../../../core/middleware/async-handler');
const { createRule, listRules, updateRule, deleteRule } = require('../services/discounts.service');

module.exports = function discountsRoutes() {
  const router = express.Router();

  router.get('/rules', asyncHandler(async (req, res) => {
    res.json({ rules: await listRules(req.shopDomain) });
  }));

  router.post('/rules', asyncHandler(async (req, res) => {
    const rule = await createRule(req.shopDomain, req.body);
    res.status(201).json({ rule });
  }));

  router.patch('/rules/:id', asyncHandler(async (req, res) => {
    const rule = await updateRule(req.shopDomain, req.params.id, req.body);
    if (!rule) return res.status(404).json({ error: 'Discount rule not found.' });
    res.json({ rule });
  }));

  router.delete('/rules/:id', asyncHandler(async (req, res) => {
    const deleted = await deleteRule(req.shopDomain, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Discount rule not found.' });
    res.json({ ok: true });
  }));

  return router;
};
