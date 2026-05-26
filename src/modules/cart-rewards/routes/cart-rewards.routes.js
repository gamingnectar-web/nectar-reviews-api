const express = require('express');
const { asyncHandler } = require('../../../core/middleware/async-handler');
const { createCampaign, listCampaigns, updateCampaign, activeForCart } = require('../services/cart-rewards.service');

module.exports = function cartRewardsRoutes() {
  const router = express.Router();

  router.get('/campaigns', asyncHandler(async (req, res) => {
    res.json({ campaigns: await listCampaigns(req.shopDomain, { status: req.query.status }) });
  }));

  router.post('/campaigns', asyncHandler(async (req, res) => {
    const campaign = await createCampaign(req.shopDomain, req.body);
    res.status(201).json({ campaign });
  }));

  router.patch('/campaigns/:id', asyncHandler(async (req, res) => {
    const campaign = await updateCampaign(req.shopDomain, req.params.id, req.body);
    if (!campaign) return res.status(404).json({ error: 'Cart reward campaign not found.' });
    res.json({ campaign });
  }));

  router.get('/active', asyncHandler(async (req, res) => {
    res.json({ campaigns: await activeForCart(req.shopDomain) });
  }));

  return router;
};
