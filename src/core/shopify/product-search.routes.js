const express = require('express');
const { asyncHandler } = require('../http/async-handler');
const { requireShopDomain, normaliseLimit } = require('../http/request-utils');
const { searchProducts } = require('./shopify.service');

const router = express.Router();

router.get('/search', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const products = await searchProducts(shopDomain, req.query.q || req.query.query || '', normaliseLimit(req.query.limit, 20, 50));
  res.json({ products });
}));

module.exports = router;
