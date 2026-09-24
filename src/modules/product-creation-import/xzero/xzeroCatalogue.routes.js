const express = require('express');
const {
  previewXZeroCatalogue,
  syncXZeroCatalogue,
  getXZeroBatch,
} = require('./xzeroCatalogue.service');

const router = express.Router();

function shopDomainFromReq(req) {
  return req.shopDomain || req.query.shopDomain || req.body?.shopDomain || req.headers['x-shop-domain'] || req.headers['x-shopify-shop-domain'] || '';
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.get('/preview', asyncRoute(async (req, res) => {
  const result = await previewXZeroCatalogue({ maxProducts: Math.min(Number(req.query.maxProducts) || 500, 500) });
  res.setHeader('Cache-Control', 'no-store');
  res.json(result);
}));

router.get('/batch', asyncRoute(async (req, res) => {
  const result = await getXZeroBatch({ shopDomain: shopDomainFromReq(req) });
  res.setHeader('Cache-Control', 'no-store');
  res.json(result);
}));

router.post('/sync', asyncRoute(async (req, res) => {
  const result = await syncXZeroCatalogue({
    shopDomain: shopDomainFromReq(req),
    maxProducts: Math.min(Number(req.body?.maxProducts) || 500, 500),
  });
  res.json(result);
}));

module.exports = router;
