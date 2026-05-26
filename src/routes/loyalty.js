const express = require('express');
const crypto = require('crypto');
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
  upsertCustomerStateFromShopifyCustomer,
  listCustomerStates,
  maturePendingPoints,
  recalculateCustomerState,
} = require('../modules/loyalty/loyalty.service');
const { issueDiscountCode: issueSharedDiscountCode } = require('../modules/discounts/discounts.service');

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
  const tags = String(customer.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
  return {
    id: String(customer.id || ''),
    displayName,
    maskedEmail: maskEmail(customer.email || ''),
    ordersCount: Number(customer.orders_count || 0),
    optOut: tags.map((tag) => tag.toUpperCase()).includes('NO_LOY'),
    createdAt: customer.created_at || null,
  };
}

async function safeCustomerResultWithState(shopDomain, customer = {}) {
  const result = safeCustomerResult(customer);
  const customerRefHash = normaliseCustomerRef({ shopDomain, customerId: result.id });
  const { LoyaltyCustomerState } = getLoyaltyModels();
  const state = customerRefHash ? await LoyaltyCustomerState.findOne({ shopDomain, customerRefHash }).lean() : null;
  return {
    ...result,
    customerRefHash,
    customerRefHint: state?.customerRefHint || customerHintFromHash(customerRefHash),
    loyaltyState: state ? {
      availablePoints: Number(state.availablePoints || 0),
      pendingPoints: Number(state.pendingPoints || 0),
      totalEarned: Number(state.totalEarned || 0),
      totalRedeemed: Number(state.totalRedeemed || 0),
      currentTierName: state.currentTierName || 'Bronze',
      optOut: Boolean(state.optOut),
    } : null,
  };
}


function makeLoyaltyDiscountCode() {
  return `LOYALTY-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

async function createShopifyDiscountCode({ shopDomain, title, reward, code }) {
  const valueType = reward.discountValueType === 'percentage' ? 'percentage' : 'fixed_amount';
  const value = valueType === 'percentage'
    ? `-${Math.min(100, Math.abs(Number(reward.discountValue || 0))).toFixed(2)}`
    : `-${Math.abs(Number(reward.discountValue || 0)).toFixed(2)}`;
  const priceRule = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/price_rules.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({
      price_rule: {
        title,
        target_type: reward.type === 'free_shipping' ? 'shipping_line' : 'line_item',
        target_selection: 'all',
        allocation_method: reward.type === 'free_shipping' ? 'each' : 'across',
        value_type: valueType,
        value,
        customer_selection: 'all',
        once_per_customer: true,
        usage_limit: 1,
        starts_at: new Date().toISOString(),
        prerequisite_subtotal_range: Number(reward.minimumCartValue || 0) > 0 ? { greater_than_or_equal_to: String(Number(reward.minimumCartValue || 0).toFixed(2)) } : undefined,
      },
    }),
  });
  const priceRuleId = priceRule?.price_rule?.id;
  if (!priceRuleId) throw new Error('Shopify discount price rule was not created.');
  const discount = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/price_rules/${priceRuleId}/discount_codes.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ discount_code: { code } }),
  });
  if (!discount?.discount_code?.id) throw new Error('Shopify discount code was not created.');
  return { code, priceRuleId, discountCodeId: discount.discount_code.id };
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

router.post('/customers/sync', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const limit = clampNumber(req.body.limit || req.query.limit, 1, 250, 100);
    const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/customers.json?limit=${limit}&fields=id,tags,orders_count,created_at,updated_at,last_order_created_at`, { shopDomain });
    if (!data?.customers) {
      return res.status(409).json({
        error: 'Shopify customer sync is not connected. Reinstall with read_customers scope if needed.',
        installUrl: buildInstallUrl(shopDomain),
      });
    }
    let createdOrUpdated = 0;
    let optedOut = 0;
    let withPurchases = 0;
    for (const customer of data.customers) {
      const row = await upsertCustomerStateFromShopifyCustomer(shopDomain, customer);
      if (row) createdOrUpdated += 1;
      if (row?.optOut) optedOut += 1;
      if (Number(row?.purchaseCount || 0) > 0) withPurchases += 1;
    }
    return res.json({ ok: true, createdOrUpdated, optedOut, withPurchases, note: 'No customer name, email or phone was stored in the loyalty database.' });
  } catch (error) {
    if (error.code === 'SHOPIFY_REINSTALL_REQUIRED' || error.status === 403) {
      return res.status(409).json({ error: 'Customer sync needs Shopify read_customers permission. Reinstall the app to grant the scope.', installUrl: buildInstallUrl(shopDomainFromReq(req)) });
    }
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
    const customers = [];
    for (const customer of data.customers) customers.push(await safeCustomerResultWithState(shopDomain, customer));
    return res.json({ customers });
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


router.get('/customers/profile', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    await maturePendingPoints(shopDomain).catch(() => null);
    const customerRef = cleanText(req.query.customerRef || req.query.customerId || '', 180);
    const customerRefHashInput = cleanText(req.query.customerRefHash || '', 180);
    const customerRefHash = customerRefHashInput || normaliseCustomerRef({ shopDomain, customerId: customerRef });
    if (!customerRefHash) return res.status(400).json({ error: 'Customer reference is required.' });
    const { LoyaltyLedger, LoyaltyRedemption, LoyaltyCustomerState } = getLoyaltyModels();
    const state = await recalculateCustomerState(shopDomain, customerRefHash);
    const [ledger, redemptions] = await Promise.all([
      LoyaltyLedger.find({ shopDomain, customerRefHash }).sort({ createdAt: -1 }).limit(80).lean(),
      LoyaltyRedemption.find({ shopDomain, customerRefHash }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    let liveCustomer = null;
    if (customerRef && /^\d+$/.test(customerRef)) {
      const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/customers/${encodeURIComponent(customerRef)}.json`, { shopDomain }).catch(() => null);
      if (data?.customer) liveCustomer = safeCustomerResult(data.customer);
    }
    return res.json({ state, ledger, redemptions, liveCustomer, note: 'Customer identity is shown live from Shopify when available. Loyalty DB stores only the private hash.' });
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
    const customerRefHashInput = cleanText(req.body.customerRefHash, 180);
    const points = clampNumber(req.body.points, -1000000, 1000000, 0);
    if ((!customerRef && !customerRefHashInput) || !points) return res.status(400).json({ error: 'Customer reference and points change are required.' });
    const customerRefHash = customerRefHashInput || normaliseCustomerRef({ shopDomain, customerId: customerRef });
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


router.get('/redemptions', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const limit = clampNumber(req.query.limit, 1, 100, 30);
    const { LoyaltyRedemption } = getLoyaltyModels();
    const rows = await LoyaltyRedemption.find({ shopDomain }).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ rows });
  } catch (error) {
    next(error);
  }
});

router.post('/checkout/process-expired', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const { LoyaltyRedemption, LoyaltyLedger } = getLoyaltyModels();
    const expired = await LoyaltyRedemption.find({ shopDomain, status: { $in: ['reserved', 'issued'] }, expiresAt: { $lte: new Date() } }).lean();
    if (!expired.length) return res.json({ ok: true, expired: 0 });
    await LoyaltyRedemption.updateMany({ _id: { $in: expired.map((row) => row._id) } }, { $set: { status: 'expired' } });
    for (const row of expired) {
      await LoyaltyLedger.updateMany({ shopDomain, customerRefHash: row.customerRefHash, ruleId: row.rewardId, eventType: 'checkout_redemption', status: { $in: ['reserved', 'issued'] } }, { $set: { status: 'expired' } });
      await recalculateCustomerState(shopDomain, row.customerRefHash).catch(() => null);
    }
    return res.json({ ok: true, expired: expired.length });
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
    const currentState = await recalculateCustomerState(shopDomain, customerRefHash);
    if (Number(currentState.availablePoints || 0) < Number(reward.pointsCost || 0)) {
      return res.status(400).json({ error: `Not enough ${program.pointName || 'Points'} for this reward.` });
    }
    let discountCode = '';
    let privateNote = 'Reward redeemed from admin. No Shopify discount code was issued.';
    if (reward.type === 'discount' && reward.discountMode === 'native_discount_code') {
      const issued = await issueSharedDiscountCode({
        shopDomain,
        templateId: 'loyalty_checkout_default',
        area: 'loyalty',
        trigger: 'loyalty_redemption',
        customerRefHash,
        sourceId: reward.id,
        override: {
          code: makeLoyaltyDiscountCode(),
          method: 'native_shopify_code',
          discountType: reward.discountValueType || 'fixed_amount',
          discountValue: Number(reward.discountValue || 0),
          minimumSubtotal: Number(reward.minimumCartValue || 0),
          privateNote: 'Issued by loyalty redemption via shared Discounts module.',
        },
      });
      discountCode = issued.code;
      privateNote = 'Native Shopify discount code issued through shared Discounts module.';
    }
    const row = await createLedgerEntry({
      shopDomain,
      customerRefHash,
      customerRefHint: customerHintFromHash(customerRefHash),
      eventType: 'redemption',
      source: 'admin',
      points: -Math.abs(Number(reward.pointsCost || 0)),
      status: discountCode ? 'issued' : 'redeemed',
      availableAt: new Date(),
      awardedAt: new Date(),
      redeemedAt: new Date(),
      ruleId: reward.id,
      ruleName: `Redeemed: ${reward.name}`,
      privateNote,
    });
    const redemption = await LoyaltyRedemption.create({
      shopDomain,
      customerRefHash,
      rewardId: reward.id,
      rewardName: reward.name,
      pointsCost: reward.pointsCost,
      status: discountCode ? 'issued' : 'draft',
      shopifyDiscountCode: discountCode,
      issuedAt: discountCode ? new Date() : null,
      privateNote,
    });
    return res.status(201).json({ ok: true, row, redemption, discountCode });
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
