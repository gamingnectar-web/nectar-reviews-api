const express = require('express');
const { Shop } = require('../../models');
const { cleanText, clampNumber } = require('../../utils/validation');
const { DiscountIssue } = require('./discounts.models');
const { cleanDiscountConfig, getOrCreateDiscountProgram, issueDiscountCode, renderNames } = require('./discounts.service');

const router = express.Router();

function shopDomainFromReq(req) {
  return req.shopDomain;
}

async function updateShopModule(shopDomain, enabled) {
  await Shop.findOneAndUpdate(
    { shopDomain },
    { $set: { 'modules.discounts.enabled': Boolean(enabled) }, $setOnInsert: { shopDomain } },
    { upsert: true }
  );
}

router.get('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const program = await getOrCreateDiscountProgram(shopDomain);
    await updateShopModule(shopDomain, program.enabled);
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.patch('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const payload = cleanDiscountConfig(shopDomain, req.body || {});
    const program = await getOrCreateDiscountProgram(shopDomain);
    program.set(payload);
    await program.save();
    await updateShopModule(shopDomain, program.enabled);
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.get('/issues', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const area = cleanText(req.query.area || '', 40);
    const limit = clampNumber(req.query.limit, 1, 200, 50);
    const query = { shopDomain };
    if (area) query.area = area;
    const rows = await DiscountIssue.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ rows });
  } catch (error) {
    next(error);
  }
});

router.post('/issue', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const issue = await issueDiscountCode({
      shopDomain,
      templateId: cleanText(req.body.templateId || '', 100),
      area: cleanText(req.body.area || 'manual', 40),
      trigger: cleanText(req.body.trigger || 'manual', 80),
      sourceId: cleanText(req.body.sourceId || '', 180),
      customerRefHash: cleanText(req.body.customerRefHash || '', 180),
      email: req.body.email || '',
      override: req.body.override || {},
    });
    return res.status(201).json({ ok: true, issue });
  } catch (error) {
    next(error);
  }
});

router.get('/render-names', async (req, res, next) => {
  try {
    return res.json({ rows: renderNames(shopDomainFromReq(req)) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
