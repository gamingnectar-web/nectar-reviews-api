const express = require('express');
const nodemailer = require('nodemailer');
const { Shop, EmailProviderSettings, CampaignEvent } = require('../models');
const { getLoyaltyModels } = require('../modules/loyalty/loyalty.models');
const { requireAdminSession } = require('../utils/security');
const { cleanText, cleanEmail, clampNumber } = require('../utils/validation');
const { env } = require('../config/env');
const { decryptSecret } = require('../utils/crypto');
const { shopifyFetchOptional, buildInstallUrl } = require('../utils/shopify');
const {
  getOrCreateLoyaltyProgram,
  cleanLoyaltyConfig,
  cleanRewardTemplate,
  cleanPointsRule,
  normaliseCustomerRef,
  customerHintFromHash,
  createLedgerEntry,
  listCustomerStates,
  maturePendingPoints,
  recalculateCustomerState,
} = require('../modules/loyalty/loyalty.service');

const router = express.Router();
router.use(requireAdminSession);

function shopDomainFromReq(req) {
  return req.shopDomain;
}

function maskEmail(email = '') {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, 1)}***@${domain}`;
}

function safeCustomerResult(customer = {}) {
  const displayName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || customer.email || `Customer ${customer.id}`;
  return {
    id: String(customer.id || ''),
    displayName,
    maskedEmail: maskEmail(customer.email || ''),
    ordersCount: Number(customer.orders_count || 0),
    createdAt: customer.created_at || null,
  };
}

async function updateShopModule(shopDomain, enabled) {
  await Shop.findOneAndUpdate(
    { shopDomain },
    { $set: { 'modules.loyalty.enabled': Boolean(enabled) }, $setOnInsert: { shopDomain } },
    { upsert: true }
  );
}

router.get('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    await maturePendingPoints(shopDomain).catch((error) => console.warn('Loyalty pending maturation skipped:', error.message));
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    await updateShopModule(shopDomain, program.enabled);
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
    await updateShopModule(shopDomain, program.enabled);
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    await maturePendingPoints(shopDomain).catch(() => null);
    const [program, customers] = await Promise.all([
      getOrCreateLoyaltyProgram(shopDomain),
      listCustomerStates(shopDomain, { limit: 10 }),
    ]);
    const summary = customers.reduce((acc, row) => {
      acc.customers += 1;
      acc.availablePoints += Number(row.availablePoints || 0);
      acc.pendingPoints += Number(row.pendingPoints || 0);
      acc.totalEarned += Number(row.totalEarned || 0);
      return acc;
    }, { customers: 0, availablePoints: 0, pendingPoints: 0, totalEarned: 0 });
    return res.json({ program, summary, customers });
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
    program.pointsRules = [...(program.pointsRules || []), rule].slice(0, 30);
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

router.get('/customers/search', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const q = cleanText(req.query.q, 120);
    if (!q || q.length < 2) return res.json({ customers: [] });
    const query = q.includes('@') ? `email:${q}` : q;
    const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/customers/search.json?query=${encodeURIComponent(query)}&limit=10`, { shopDomain });
    if (!data?.customers) {
      return res.status(409).json({
        error: 'Shopify customer search is not connected for this shop. Reinstall with read_customers scope if needed.',
        installUrl: buildInstallUrl(shopDomain),
      });
    }
    return res.json({ customers: data.customers.map(safeCustomerResult) });
  } catch (error) {
    if (error.code === 'SHOPIFY_REINSTALL_REQUIRED' || error.status === 403) {
      return res.status(409).json({ error: 'Customer search needs Shopify read_customers permission. Reinstall the app to grant the scope.', installUrl: buildInstallUrl(shopDomainFromReq(req)) });
    }
    next(error);
  }
});

router.post('/customers/resolve', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const customerRef = cleanText(req.body.customerRef || req.body.customerId, 180);
    if (!customerRef) return res.status(400).json({ error: 'Customer reference is required.' });
    const customerRefHash = normaliseCustomerRef({ shopDomain, customerId: customerRef });
    if (!customerRefHash) return res.status(400).json({ error: 'Could not create a private customer reference.' });
    const state = await recalculateCustomerState(shopDomain, customerRefHash);
    return res.json({ customerRefHash, customerRefHint: customerHintFromHash(customerRefHash), state });
  } catch (error) {
    next(error);
  }
});

router.get('/customers', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    await maturePendingPoints(shopDomain).catch(() => null);
    const limit = clampNumber(req.query.limit, 1, 200, 50);
    const search = cleanText(req.query.search, 80);
    const rows = await listCustomerStates(shopDomain, { limit, search });
    return res.json({ rows });
  } catch (error) {
    next(error);
  }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    await maturePendingPoints(shopDomain).catch(() => null);
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

router.post('/ledger/manual-adjust', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    if (program.settings?.allowManualAdjustments === false) return res.status(403).json({ error: 'Manual adjustments are disabled for this loyalty programme.' });
    const customerRef = cleanText(req.body.customerRef, 180);
    const points = clampNumber(req.body.points, -1000000, 1000000, 0);
    if (!customerRef || !points) return res.status(400).json({ error: 'Customer reference and points change are required.' });
    const customerRefHash = normaliseCustomerRef({ shopDomain, customerId: customerRef });
    if (!customerRefHash) return res.status(400).json({ error: 'Could not create a private customer reference.' });
    const row = await createLedgerEntry({
      shopDomain,
      customerRefHash,
      customerRefHint: customerHintFromHash(customerRefHash),
      eventType: 'manual_adjustment',
      source: 'admin',
      points,
      status: ['pending', 'available', 'cancelled'].includes(req.body.status) ? req.body.status : 'available',
      availableAt: req.body.status === 'pending' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date(),
      awardedAt: req.body.status === 'pending' ? null : new Date(),
      ruleId: 'manual_adjustment',
      ruleName: points >= 0 ? 'Manual points added' : 'Manual points removed',
      privateNote: cleanText(req.body.reason || 'Manual adjustment', 300),
    });
    return res.status(201).json({ ok: true, row });
  } catch (error) {
    next(error);
  }
});

router.post('/ledger/process-pending', async (req, res, next) => {
  try {
    const result = await maturePendingPoints(shopDomainFromReq(req));
    return res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/redemptions', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const customerRef = cleanText(req.body.customerRef, 180);
    const rewardId = cleanText(req.body.rewardId, 80);
    if (!customerRef || !rewardId) return res.status(400).json({ error: 'Customer reference and reward are required.' });
    const customerRefHash = normaliseCustomerRef({ shopDomain, customerId: customerRef });
    const { LoyaltyRedemption } = getLoyaltyModels();
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    const reward = (program.redemptionRewards || []).find((item) => item.id === rewardId && item.enabled !== false);
    if (!reward) return res.status(404).json({ error: 'Reward not found.' });
    const row = await createLedgerEntry({
      shopDomain,
      customerRefHash,
      customerRefHint: customerHintFromHash(customerRefHash),
      eventType: 'redemption',
      source: 'admin',
      points: -Math.abs(Number(reward.pointsCost || 0)),
      status: 'available',
      availableAt: new Date(),
      awardedAt: new Date(),
      ruleId: reward.id,
      ruleName: `Redeemed: ${reward.name}`,
      privateNote: 'Redemption placeholder. Shopify discount/code issuing is the next integration step.',
    });
    const redemption = await LoyaltyRedemption.create({
      shopDomain,
      customerRefHash,
      rewardId: reward.id,
      rewardName: reward.name,
      pointsCost: reward.pointsCost,
      status: 'draft',
      privateNote: 'Draft redemption; no Shopify discount code has been issued yet.',
    });
    return res.status(201).json({ ok: true, row, redemption });
  } catch (error) {
    next(error);
  }
});

router.post('/test-email', async (req, res, next) => {
  const shopDomain = shopDomainFromReq(req);
  try {
    const to = cleanEmail(req.body.to);
    if (!to) return res.status(400).json({ error: 'A valid recipient email is required.' });
    const settings = await EmailProviderSettings.findOne({ shopDomain });
    if (!settings || !settings.enabled || !settings.smtpPassEncrypted) {
      return res.status(400).json({ error: 'Email provider is not configured for this shop.' });
    }
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort || 587),
      secure: settings.secureMode === 'ssl' || Number(settings.smtpPort) === 465,
      requireTLS: settings.secureMode === 'starttls',
      auth: { user: settings.smtpUser, pass: decryptSecret(settings.smtpPassEncrypted) },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    const token = `loyalty-test-${Date.now()}`;
    const trackingPixel = `${env.appUrl || ''}/api/campaign/open?shopDomain=${encodeURIComponent(shopDomain)}&campaign=loyalty_test_reward&email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
    let html = String(req.body.html || '').slice(0, 200000);
    if (!html) html = '<p>Your loyalty reward is ready.</p>';
    if (!html.includes('/api/campaign/open')) html += `<img src="${trackingPixel}" width="1" height="1" alt="" style="display:none;opacity:0;width:1px;height:1px;">`;
    const fromName = settings.fromName || 'Store Rewards';
    const fromEmail = settings.fromEmail || settings.smtpUser;
    await transporter.sendMail({
      from: `${fromName.replace(/"/g, '')} <${fromEmail}>`,
      to,
      replyTo: settings.replyToEmail || fromEmail,
      subject: cleanText(req.body.subject || 'Your reward is ready', 160),
      html,
    });
    await CampaignEvent.create({ shopDomain, campaign: 'loyalty_test_reward', eventType: 'sent', email: to, token, userAgent: cleanText(req.headers['user-agent'], 500) });
    return res.json({ ok: true, message: 'Loyalty test email sent.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
