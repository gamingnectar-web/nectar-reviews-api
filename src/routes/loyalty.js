const express = require('express');
const { Shop } = require('../models');
const { getLoyaltyModels } = require('../modules/loyalty/loyalty.models');
const { requireAdminSession } = require('../utils/security');
const { cleanText, clampNumber } = require('../utils/validation');
const { getOrCreateLoyaltyProgram, cleanLoyaltyConfig, cleanRewardTemplate, cleanPointsRule } = require('../modules/loyalty/loyalty.service');

const router = express.Router();
router.use(requireAdminSession);

function shopDomainFromReq(req) {
  return req.shopDomain;
}

router.get('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    await Shop.findOneAndUpdate(
      { shopDomain },
      { $set: { 'modules.loyalty.enabled': Boolean(program.enabled) }, $setOnInsert: { shopDomain } },
      { upsert: true }
    );
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.patch('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const update = cleanLoyaltyConfig(shopDomain, req.body || {});
    const { LoyaltyProgram } = getLoyaltyModels();
    const program = await LoyaltyProgram.findOneAndUpdate(
      { shopDomain },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await Shop.findOneAndUpdate(
      { shopDomain },
      { $set: { 'modules.loyalty.enabled': Boolean(program.enabled) }, $setOnInsert: { shopDomain } },
      { upsert: true }
    );
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.post('/reward-templates', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const template = cleanRewardTemplate(req.body || {});
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.rewardTemplates = [...(program.rewardTemplates || []), template].slice(0, 20);
    await program.save();
    return res.status(201).json({ ok: true, template, program });
  } catch (error) {
    next(error);
  }
});

router.post('/points-rules', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const rule = cleanPointsRule(req.body || {});
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.pointsRules = [...(program.pointsRules || []), rule].slice(0, 20);
    await program.save();
    return res.status(201).json({ ok: true, rule, program });
  } catch (error) {
    next(error);
  }
});

router.delete('/reward-templates/:id', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const id = cleanText(req.params.id, 80);
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.rewardTemplates = (program.rewardTemplates || []).filter((template) => template.id !== id);
    await program.save();
    return res.json({ ok: true, program });
  } catch (error) {
    next(error);
  }
});

router.delete('/points-rules/:id', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const id = cleanText(req.params.id, 80);
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.pointsRules = (program.pointsRules || []).filter((rule) => rule.id !== id);
    await program.save();
    return res.json({ ok: true, program });
  } catch (error) {
    next(error);
  }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const limit = clampNumber(req.query.limit, 1, 100, 25);
    const { LoyaltyLedger } = getLoyaltyModels();
    const rows = await LoyaltyLedger.find({ shopDomain })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
