const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const { requireShopDomain, normaliseLimit } = require('../../core/http/request-utils');
const { auditFromRequest } = require('../../core/audit/audit.service');
const loyalty = require('./loyalty.service');

const router = express.Router();

router.get('/overview', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json(await loyalty.overview(shopDomain));
}));

router.get('/settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json({ settings: await loyalty.getSettings(shopDomain) });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const before = await loyalty.getSettings(shopDomain);
  const settings = await loyalty.updateSettings(shopDomain, req.body.settings || req.body);
  await auditFromRequest(req, { shopDomain, module: 'loyalty', eventType: 'loyalty.settings.updated', entityType: 'loyalty_settings', entityKey: shopDomain, action: 'update', before: before.toObject ? before.toObject() : before, after: settings.toObject ? settings.toObject() : settings });
  res.json({ ok: true, settings });
}));

router.get('/rules', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json({ rules: await loyalty.listRules(shopDomain, req.query) });
}));

router.post('/rules', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const rule = await loyalty.createRule(shopDomain, req.body.rule || req.body);
  await auditFromRequest(req, { shopDomain, module: 'loyalty', eventType: 'loyalty.rule.created', entityType: 'loyalty_rule', entityKey: String(rule._id), action: 'create', after: rule.toObject ? rule.toObject() : rule, metadata: { ruleName: rule.name, ruleType: rule.ruleType, trigger: rule.trigger } });
  res.status(201).json({ ok: true, rule });
}));

router.put('/rules/:id', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const rule = await loyalty.updateRule(shopDomain, req.params.id, req.body.rule || req.body);
  await auditFromRequest(req, { shopDomain, module: 'loyalty', eventType: 'loyalty.rule.updated', entityType: 'loyalty_rule', entityKey: String(rule._id), action: 'update', after: rule.toObject ? rule.toObject() : rule, metadata: { ruleName: rule.name, ruleType: rule.ruleType, trigger: rule.trigger } });
  res.json({ ok: true, rule });
}));

router.delete('/rules/:id', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const rule = await loyalty.deleteRule(shopDomain, req.params.id);
  await auditFromRequest(req, { shopDomain, module: 'loyalty', eventType: 'loyalty.rule.deleted', entityType: 'loyalty_rule', entityKey: String(rule._id), action: 'delete', before: rule.toObject ? rule.toObject() : rule, metadata: { ruleName: rule.name, ruleType: rule.ruleType, trigger: rule.trigger } });
  res.json({ ok: true, rule });
}));

router.get('/accounts', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json({ accounts: await loyalty.listAccounts(shopDomain, normaliseLimit(req.query.limit, 100, 250)) });
}));

router.get('/accounts/:customerKey', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const account = await loyalty.getCustomerAccountByKey(shopDomain, req.params.customerKey);
  const transactions = await loyalty.listTransactions(shopDomain, { customerKey: req.params.customerKey, limit: normaliseLimit(req.query.limit, 50, 100) });
  res.json({ account: loyalty.publicAccount(account), transactions: transactions.map(loyalty.publicTransaction) });
}));

router.post('/accounts/:customerKey/adjust', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const account = await loyalty.awardPointsByCustomerKey(shopDomain, req.params.customerKey, req.body.points, req.body.reason || 'manual_adjustment');
  await auditFromRequest(req, { shopDomain, module: 'loyalty', eventType: 'loyalty.points.manual_adjustment', entityType: 'loyalty_account', entityKey: account?.customerRef || '', action: 'manual_adjustment', metadata: { points: req.body.points, reason: req.body.reason || 'manual_adjustment' } });
  res.status(201).json({ ok: true, account: loyalty.publicAccount(account) });
}));

router.get('/transactions', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const transactions = await loyalty.listTransactions(shopDomain, { ...req.query, limit: normaliseLimit(req.query.limit, 100, 250) });
  res.json({ transactions: transactions.map(loyalty.publicTransaction) });
}));

router.get('/redemptions', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  res.json({ redemptions: await loyalty.listRedemptions(shopDomain, normaliseLimit(req.query.limit, 100, 250)) });
}));

router.post('/process-pending', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const approved = await loyalty.processPendingApprovals({ shopDomain, limit: normaliseLimit(req.body.limit || req.query.limit, 100, 500) });
  await auditFromRequest(req, { shopDomain, module: 'loyalty', eventType: 'loyalty.pending.processed', entityType: 'loyalty_transaction', entityKey: shopDomain, action: 'process_pending', metadata: { count: approved.length } });
  res.json({ ok: true, approved: approved.map(loyalty.publicTransaction) });
}));

router.post('/preview-purchase', asyncHandler(async (req, res) => {
  const shopDomain = requireShopDomain(req);
  const rules = await loyalty.listRules(shopDomain, { ruleType: 'earn', trigger: 'order_paid', enabled: true });
  const points = await loyalty.calculatePurchasePoints(req.body.order || req.body, rules);
  res.json({ points, rules });
}));

module.exports = router;
