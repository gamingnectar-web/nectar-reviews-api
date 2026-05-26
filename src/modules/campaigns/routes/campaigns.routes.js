const express = require('express');
const { asyncHandler } = require('../../../core/middleware/async-handler');
const { createCampaign, listCampaigns, updateCampaign } = require('../services/campaigns.service');

module.exports = function campaignsRoutes() {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json({ campaigns: await listCampaigns(req.shopDomain, { moduleKey: req.query.moduleKey }) });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const campaign = await createCampaign(req.shopDomain, req.body);
    res.status(201).json({ campaign });
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const campaign = await updateCampaign(req.shopDomain, req.params.id, req.body);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    res.json({ campaign });
  }));

  return router;
};
