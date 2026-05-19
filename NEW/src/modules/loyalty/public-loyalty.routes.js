const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain, cleanShopDomain } = require('../../core/http/request-utils');
const { verifyAppProxySignature } = require('../../core/shopify/shopify.service');
const { config } = require('../../core/config');
const { createCustomerKey, getCustomerIdFromAppProxyRequest } = require('../../core/security/customer-identity.service');
const { auditFromRequest } = require('../../core/audit/audit.service');
const loyalty = require('./loyalty.service');

const router = express.Router();

function requireLoggedInCustomer(req, res, next) {
  const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain || req.body?.shop || req.body?.shopDomain || '');
  const customerId = getCustomerIdFromAppProxyRequest(req);

  if (!config.security.allowInsecureCustomerLookup && !verifyAppProxySignature(req.query)) {
    return res.status(401).json({ error: 'Valid Shopify app proxy signature required.' });
  }
  if (!customerId) {
    return res.status(401).json({ error: 'Customer must be logged in to view Nectar Drops.' });
  }

  req.shopDomain = shopDomain;
  req.customerKey = createCustomerKey(shopDomain, customerId);
  next();
}

router.get('/balance', requireLoggedInCustomer, asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const data = await loyalty.publicBalance(shopDomain, req.customerKey, 20);
  res.json(data);
}));

router.post('/redeem', requireLoggedInCustomer, asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const result = await loyalty.redeemPointsByCustomerKey(shopDomain, req.customerKey, req.body.ruleId);
  await auditFromRequest(req, { shopDomain, module: 'loyalty', eventType: 'loyalty.redemption.requested', entityType: 'loyalty_redemption', entityKey: result.redemption.id, action: 'redeem', metadata: { points: result.redemption.pointsSpent, redemptionStatus: result.redemption.status } });
  res.status(201).json({ ok: true, ...result });
}));

module.exports = router;
