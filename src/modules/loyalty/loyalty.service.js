const mongoose = require('mongoose');
const LoyaltySettings = require('./loyalty-settings.model');
const LoyaltyRule = require('./loyalty-rule.model');
const LoyaltyAccount = require('./loyalty-account.model');
const LoyaltyTransaction = require('./loyalty-transaction.model');
const LoyaltyRedemption = require('./loyalty-redemption.model');
const { cleanShopDomain } = require('../../core/http/request-utils');
const { config } = require('../../core/config');
const { isModuleEnabled } = require('../../core/modules/feature-access');
const { shopifyGraphql } = require('../../core/shopify/shopify.service');
const { buildDiscountCode } = require('../discounts/discounts.service');
const { createScopedHash, publicCustomerRef, getCustomerKeyFromOrder, getCustomerIdFromOrder } = require('../../core/security/customer-identity.service');
const { hashValue } = require('../../core/security/credentials.service');
const { recordAuditEvent } = require('../../core/audit/audit.service');

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundPoints(value, roundMode = 'floor') {
  if (roundMode === 'ceil') return Math.ceil(value);
  if (roundMode === 'round') return Math.round(value);
  return Math.floor(value);
}

function getOrderAmount(order, conditions = {}) {
  if (conditions.useTotalPrice) return cleanNumber(order.total_price || order.current_total_price);
  return cleanNumber(order.subtotal_price || order.current_subtotal_price || order.total_line_items_price || 0);
}

function lineItems(order) {
  return Array.isArray(order.line_items) ? order.line_items : [];
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function orderMatchesConditions(order, conditions = {}) {
  const amount = getOrderAmount(order, conditions);
  if (conditions.minimumSpend && amount < cleanNumber(conditions.minimumSpend)) return false;
  if (conditions.maximumSpend && amount > cleanNumber(conditions.maximumSpend)) return false;

  const items = lineItems(order);
  const productIds = asStringArray(conditions.productIds || conditions.includeProductIds);
  const variantIds = asStringArray(conditions.variantIds || conditions.includeVariantIds);
  const skus = asStringArray(conditions.skus || conditions.includeSkus);
  const tags = asStringArray(conditions.tags || conditions.includeTags).map((tag) => tag.toLowerCase());
  const excludedProductIds = asStringArray(conditions.excludedProductIds);

  if (excludedProductIds.length && items.some((item) => excludedProductIds.includes(String(item.product_id || item.productId || '')))) return false;
  if (productIds.length && !items.some((item) => productIds.includes(String(item.product_id || item.productId || '')))) return false;
  if (variantIds.length && !items.some((item) => variantIds.includes(String(item.variant_id || item.variantId || '')))) return false;
  if (skus.length && !items.some((item) => skus.includes(String(item.sku || '')))) return false;
  if (tags.length) {
    const matched = items.some((item) => {
      const itemTags = asStringArray(item.product_tags || item.tags).map((tag) => tag.toLowerCase());
      return itemTags.some((tag) => tags.includes(tag));
    });
    if (!matched) return false;
  }
  if (conditions.minimumQuantity) {
    const quantity = items.reduce((sum, item) => sum + cleanNumber(item.quantity || 0), 0);
    if (quantity < cleanNumber(conditions.minimumQuantity)) return false;
  }
  return true;
}

function reviewMatchesConditions(review, conditions = {}) {
  const rating = cleanNumber(review.rating || 0);
  if (conditions.minimumRating && rating < cleanNumber(conditions.minimumRating)) return false;
  if (conditions.mediaRequired && !(Array.isArray(review.media) && review.media.length > 0)) return false;
  if (conditions.verifiedPurchaseRequired && !review.verifiedPurchase) return false;
  return true;
}

function pointsFromOrderRule(order, rule) {
  const reward = rule.reward || {};
  const conditions = rule.conditions || {};
  const amount = getOrderAmount(order, conditions);
  const mode = reward.mode || 'points_per_currency';
  let points = 0;
  if (mode === 'fixed_points') points = cleanNumber(reward.points);
  if (mode === 'points_per_currency') points = amount * cleanNumber(reward.pointsPerCurrency, 0);
  if (mode === 'points_per_item') {
    const quantity = lineItems(order).reduce((sum, item) => sum + cleanNumber(item.quantity || 0), 0);
    points = quantity * cleanNumber(reward.pointsPerItem, 0);
  }
  if (mode === 'multiplier') {
    const baseRate = cleanNumber(reward.basePointsPerCurrency, 1);
    points = amount * baseRate * cleanNumber(reward.multiplier, 1);
  }
  points = roundPoints(points, reward.roundMode || 'floor');
  if (rule.limits?.maxPointsPerEvent) points = Math.min(points, cleanNumber(rule.limits.maxPointsPerEvent));
  return Math.max(0, points);
}

function pointsFromReviewRule(review, rule) {
  const reward = rule.reward || {};
  const points = cleanNumber(reward.points || reward.fixedPoints || 0);
  return Math.max(0, points);
}

function delayForRule(rule, fallback = {}) {
  const delay = rule.delay || {};
  return {
    mode: delay.mode || fallback.mode || 'after_order_paid',
    days: cleanNumber(delay.days, cleanNumber(fallback.days, config.loyalty.defaultApprovalDays))
  };
}

function eligibleDate(delay) {
  if (delay.mode === 'immediate') return new Date();
  if (delay.mode === 'after_order_paid') return new Date(Date.now() + delay.days * 24 * 60 * 60 * 1000);
  if (delay.mode === 'manual') return null;
  return null;
}

function safeRulePatch(input = {}) {
  const output = {};
  if ('ruleType' in input) output.ruleType = String(input.ruleType);
  if ('trigger' in input) output.trigger = String(input.trigger);
  if ('name' in input) output.name = String(input.name || '').slice(0, 120);
  if ('description' in input) output.description = String(input.description || '').slice(0, 500);
  if ('enabled' in input) output.enabled = Boolean(input.enabled);
  if ('priority' in input) output.priority = cleanNumber(input.priority, 100);
  if ('conditions' in input) output.conditions = input.conditions && typeof input.conditions === 'object' ? input.conditions : {};
  if ('reward' in input) output.reward = input.reward && typeof input.reward === 'object' ? input.reward : {};
  if ('delay' in input) output.delay = input.delay && typeof input.delay === 'object' ? input.delay : {};
  if ('limits' in input) output.limits = input.limits && typeof input.limits === 'object' ? input.limits : {};
  return output;
}

function publicTransaction(tx) {
  return {
    id: String(tx._id),
    customerRef: tx.customerRef,
    ruleName: tx.ruleName,
    type: tx.type,
    status: tx.status,
    points: tx.points,
    sourceType: tx.sourceType,
    eligibleAt: tx.eligibleAt,
    approvedAt: tx.approvedAt,
    reason: tx.reason,
    createdAt: tx.createdAt
  };
}

function publicAccount(account) {
  return {
    customerRef: account?.customerRef || '',
    approvedPoints: account?.approvedPoints || 0,
    pendingPoints: account?.pendingPoints || 0,
    lifetimeEarned: account?.lifetimeEarned || 0,
    lifetimeSpent: account?.lifetimeSpent || 0,
    tier: account?.tier || 'standard',
    status: account?.status || 'active',
    updatedAt: account?.updatedAt || null
  };
}

async function getSettings(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  return LoyaltySettings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $setOnInsert: { shopDomain: cleanShop } },
    { new: true, upsert: true }
  );
}

async function updateSettings(shopDomain, patch) {
  const cleanShop = cleanShopDomain(shopDomain);
  const allowed = {};
  for (const key of ['enabled', 'pointsName', 'pointsIcon', 'landingPage', 'approvalDefaults', 'refundHandling', 'privacy']) {
    if (patch && key in patch) allowed[key] = patch[key];
  }
  return LoyaltySettings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $set: { ...allowed, shopDomain: cleanShop } },
    { new: true, upsert: true, runValidators: true }
  );
}

function defaultRules(shopDomain) {
  return [
    {
      shopDomain,
      ruleType: 'earn',
      trigger: 'order_paid',
      name: 'Earn Drops on purchases',
      description: 'Base earning rule: customers earn Drops for every currency unit spent.',
      enabled: true,
      priority: 100,
      conditions: { minimumSpend: 0, useTotalPrice: false },
      reward: { mode: 'points_per_currency', pointsPerCurrency: 5, roundMode: 'floor' },
      delay: { mode: 'after_order_paid', days: config.loyalty.defaultApprovalDays },
      limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 0 },
      createdBy: 'system'
    },
    {
      shopDomain,
      ruleType: 'earn',
      trigger: 'review_accepted',
      name: 'Approved review bonus',
      description: 'Award Drops after a text review is approved.',
      enabled: true,
      priority: 200,
      conditions: { minimumRating: 1, mediaRequired: false, verifiedPurchaseRequired: false },
      reward: { mode: 'fixed_points', points: 25 },
      delay: { mode: 'immediate', days: 0 },
      limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 0 },
      createdBy: 'system'
    },
    {
      shopDomain,
      ruleType: 'earn',
      trigger: 'review_accepted',
      name: 'Photo review bonus',
      description: 'Award extra Drops after a review with media is approved.',
      enabled: true,
      priority: 210,
      conditions: { minimumRating: 1, mediaRequired: true, verifiedPurchaseRequired: false },
      reward: { mode: 'fixed_points', points: 50 },
      delay: { mode: 'immediate', days: 0 },
      limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 0 },
      createdBy: 'system'
    },
    {
      shopDomain,
      ruleType: 'redeem',
      trigger: 'customer_redeem',
      name: '£5 off voucher',
      description: 'Customers can redeem Drops for a one-use discount code.',
      enabled: true,
      priority: 100,
      conditions: { minimumSpend: 0 },
      reward: { discountType: 'fixed_amount', pointsCost: 500, amount: 5, currency: 'GBP', codePrefix: 'DROPS', expiresAfterDays: 30 },
      delay: { mode: 'immediate', days: 0 },
      limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 0 },
      createdBy: 'system'
    }
  ];
}

async function ensureDefaultRules(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  const count = await LoyaltyRule.countDocuments({ shopDomain: cleanShop });
  if (count > 0) return;
  await LoyaltyRule.insertMany(defaultRules(cleanShop));
}

async function listRules(shopDomain, filters = {}) {
  const cleanShop = cleanShopDomain(shopDomain);
  await ensureDefaultRules(cleanShop);
  const query = { shopDomain: cleanShop };
  if (filters.ruleType) query.ruleType = String(filters.ruleType);
  if (filters.trigger) query.trigger = String(filters.trigger);
  if (filters.enabled !== undefined) query.enabled = filters.enabled === true || filters.enabled === 'true';
  return LoyaltyRule.find(query).sort({ ruleType: 1, priority: 1, createdAt: 1 }).lean();
}

async function createRule(shopDomain, body = {}) {
  const cleanShop = cleanShopDomain(shopDomain);
  const patch = safeRulePatch(body);
  if (!patch.name) throw Object.assign(new Error('Rule name is required.'), { statusCode: 400 });
  if (!['earn', 'redeem'].includes(patch.ruleType)) throw Object.assign(new Error('ruleType must be earn or redeem.'), { statusCode: 400 });
  const rule = await LoyaltyRule.create({ shopDomain: cleanShop, ...patch, createdBy: 'merchant_admin' });
  await recordAuditEvent({ shopDomain: cleanShop, actorType: 'merchant_admin', module: 'loyalty', eventType: 'loyalty.rule.created', entityType: 'loyalty_rule', entityKey: String(rule._id), action: 'create', after: rule.toObject(), metadata: { ruleName: rule.name, ruleType: rule.ruleType, trigger: rule.trigger } });
  return rule;
}

async function updateRule(shopDomain, ruleId, body = {}) {
  const cleanShop = cleanShopDomain(shopDomain);
  const before = await LoyaltyRule.findOne({ _id: ruleId, shopDomain: cleanShop });
  if (!before) throw Object.assign(new Error('Loyalty rule not found.'), { statusCode: 404 });
  const patch = safeRulePatch(body);
  Object.assign(before, patch);
  await before.save();
  await recordAuditEvent({ shopDomain: cleanShop, actorType: 'merchant_admin', module: 'loyalty', eventType: 'loyalty.rule.updated', entityType: 'loyalty_rule', entityKey: String(before._id), action: 'update', before: before.toObject(), after: { ...before.toObject(), ...patch }, metadata: { ruleName: before.name, ruleType: before.ruleType, trigger: before.trigger } });
  return before;
}

async function deleteRule(shopDomain, ruleId) {
  const cleanShop = cleanShopDomain(shopDomain);
  const rule = await LoyaltyRule.findOneAndDelete({ _id: ruleId, shopDomain: cleanShop });
  if (!rule) throw Object.assign(new Error('Loyalty rule not found.'), { statusCode: 404 });
  await recordAuditEvent({ shopDomain: cleanShop, actorType: 'merchant_admin', module: 'loyalty', eventType: 'loyalty.rule.deleted', entityType: 'loyalty_rule', entityKey: String(rule._id), action: 'delete', before: rule.toObject(), metadata: { ruleName: rule.name, ruleType: rule.ruleType, trigger: rule.trigger } });
  return rule;
}

async function getOrCreateAccount(shopDomain, customerKey) {
  const cleanShop = cleanShopDomain(shopDomain);
  const key = String(customerKey || '');
  if (!key) return null;
  return LoyaltyAccount.findOneAndUpdate(
    { shopDomain: cleanShop, customerKey: key },
    { $setOnInsert: { shopDomain: cleanShop, customerKey: key, customerRef: publicCustomerRef(key) } },
    { new: true, upsert: true }
  );
}

async function createEarnTransaction({ shopDomain, customerKey, rule, points, sourceType, sourceRefHash, delay, reason, metadata = {} }) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!points || points <= 0) return null;
  const customerRef = publicCustomerRef(customerKey);
  const dedupeKey = hashValue(`${cleanShop}:${customerKey}:${String(rule._id)}:${sourceType}:${sourceRefHash}`, config.security.customerIdSecret || 'development-only');
  const existing = await LoyaltyTransaction.findOne({ shopDomain: cleanShop, dedupeKey });
  if (existing) return existing;

  const status = delay.mode === 'immediate' ? 'approved' : 'pending';
  const eligibleAt = status === 'approved' ? new Date() : eligibleDate(delay);
  let doc;
  try {
    doc = await LoyaltyTransaction.create({
      shopDomain: cleanShop,
      customerKey,
      customerRef,
      ruleId: String(rule._id),
      ruleName: rule.name,
      ruleType: rule.ruleType,
      trigger: rule.trigger,
      type: 'earn',
      status,
      points,
      sourceType,
      sourceRefHash,
      dedupeKey,
      delayMode: delay.mode,
      eligibleAt,
      approvedAt: status === 'approved' ? new Date() : null,
      reason: reason || rule.name,
      metadata: {
        ruleName: rule.name,
        trigger: rule.trigger,
        delayMode: delay.mode,
        delayDays: delay.days,
        sourceType,
        ...metadata
      }
    });
  } catch (error) {
    if (error.code === 11000) return LoyaltyTransaction.findOne({ shopDomain: cleanShop, dedupeKey });
    throw error;
  }

  const inc = status === 'approved'
    ? { approvedPoints: points, lifetimeEarned: points }
    : { pendingPoints: points };
  await LoyaltyAccount.findOneAndUpdate(
    { shopDomain: cleanShop, customerKey },
    { $setOnInsert: { shopDomain: cleanShop, customerKey, customerRef }, $inc: inc },
    { upsert: true, new: true }
  );
  await recordAuditEvent({ shopDomain: cleanShop, actorType: 'system', module: 'loyalty', eventType: status === 'approved' ? 'loyalty.points.approved' : 'loyalty.points.pending', entityType: 'loyalty_transaction', entityKey: String(doc._id), action: status, metadata: { points, ruleName: rule.name, sourceType } });
  return doc;
}

async function awardPurchasePoints(shopDomain, order) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!(await isModuleEnabled(cleanShop, 'loyalty'))) return [];
  const settings = await getSettings(cleanShop);
  if (!settings.enabled) return [];
  await ensureDefaultRules(cleanShop);
  const customerId = getCustomerIdFromOrder(order);
  const customerKey = getCustomerKeyFromOrder(cleanShop, order);
  if (!customerId || !customerKey) return [];

  const rules = await LoyaltyRule.find({ shopDomain: cleanShop, ruleType: 'earn', trigger: 'order_paid', enabled: true }).sort({ priority: 1 }).lean();
  const sourceRefHash = createScopedHash(cleanShop, order.id || order.admin_graphql_api_id || order.name || '', 'order');
  const created = [];
  for (const rule of rules) {
    if (!orderMatchesConditions(order, rule.conditions)) continue;
    const points = pointsFromOrderRule(order, rule);
    const delay = delayForRule(rule, settings.approvalDefaults?.orderDelayMode ? { mode: settings.approvalDefaults.orderDelayMode, days: settings.approvalDefaults.orderDelayDays } : {});
    const tx = await createEarnTransaction({ shopDomain: cleanShop, customerKey, rule, points, sourceType: 'order', sourceRefHash, delay, reason: 'purchase', metadata: { sourceType: 'order' } });
    if (tx) created.push(tx);
  }
  return created;
}

async function maybeRewardAcceptedReview({ shopDomain, review }) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!(await isModuleEnabled(cleanShop, 'loyalty'))) return [];
  const settings = await getSettings(cleanShop);
  if (!settings.enabled) return [];
  const customerKey = String(review?.customerKey || '');
  if (!customerKey) return [];
  await ensureDefaultRules(cleanShop);
  const rules = await LoyaltyRule.find({ shopDomain: cleanShop, ruleType: 'earn', trigger: 'review_accepted', enabled: true }).sort({ priority: 1 }).lean();
  const sourceRefHash = createScopedHash(cleanShop, review._id || review.id || '', 'review');
  const created = [];
  for (const rule of rules) {
    if (!reviewMatchesConditions(review, rule.conditions)) continue;
    const points = pointsFromReviewRule(review, rule);
    const delay = delayForRule(rule, settings.approvalDefaults?.reviewDelayMode ? { mode: settings.approvalDefaults.reviewDelayMode, days: settings.approvalDefaults.reviewDelayDays } : { mode: 'immediate', days: 0 });
    const tx = await createEarnTransaction({ shopDomain: cleanShop, customerKey, rule, points, sourceType: 'review', sourceRefHash, delay, reason: 'review_accepted', metadata: { sourceType: 'review' } });
    if (tx) created.push(tx);
  }
  return created;
}

async function processPendingApprovals({ shopDomain, limit = config.loyalty.pendingBatchSize } = {}) {
  const query = { status: 'pending', eligibleAt: { $lte: new Date(), $ne: null } };
  if (shopDomain) query.shopDomain = cleanShopDomain(shopDomain);
  const transactions = await LoyaltyTransaction.find(query).sort({ eligibleAt: 1 }).limit(Math.min(Number(limit) || 100, 500));
  const approved = [];
  for (const tx of transactions) {
    const updated = await LoyaltyTransaction.findOneAndUpdate(
      { _id: tx._id, status: 'pending' },
      { $set: { status: 'approved', approvedAt: new Date() } },
      { new: true }
    );
    if (!updated) continue;
    await LoyaltyAccount.findOneAndUpdate(
      { shopDomain: updated.shopDomain, customerKey: updated.customerKey },
      { $inc: { pendingPoints: -Math.abs(updated.points), approvedPoints: Math.abs(updated.points), lifetimeEarned: Math.abs(updated.points) } },
      { upsert: false }
    );
    await recordAuditEvent({ shopDomain: updated.shopDomain, actorType: 'system', module: 'loyalty', eventType: 'loyalty.points.approved', entityType: 'loyalty_transaction', entityKey: String(updated._id), action: 'approve', metadata: { points: updated.points, ruleName: updated.ruleName, sourceType: updated.sourceType } });
    approved.push(updated);
  }
  return approved;
}

async function processFulfillment(shopDomain, fulfillment) {
  const cleanShop = cleanShopDomain(shopDomain);
  const orderId = fulfillment.order_id || fulfillment.order?.id || fulfillment.admin_graphql_api_id || '';
  if (!orderId) return [];
  const orderHash = createScopedHash(cleanShop, orderId, 'order');
  const txs = await LoyaltyTransaction.find({ shopDomain: cleanShop, sourceRefHash: orderHash, status: 'pending', delayMode: { $in: ['after_fulfillment', 'after_delivery'] }, eligibleAt: null });
  const updated = [];
  for (const tx of txs) {
    const days = cleanNumber(tx.metadata?.delayDays, config.loyalty.defaultApprovalDays);
    tx.eligibleAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await tx.save();
    updated.push(tx);
  }
  return updated;
}

async function reverseTransactionsForSource(shopDomain, sourceRefHash, reason = 'reversal') {
  const cleanShop = cleanShopDomain(shopDomain);
  const settings = await getSettings(cleanShop);
  const txs = await LoyaltyTransaction.find({ shopDomain: cleanShop, sourceRefHash, status: { $in: ['pending', 'approved'] }, type: 'earn' });
  const reversed = [];
  for (const tx of txs) {
    if (tx.status === 'pending' && settings.refundHandling?.cancelPendingPoints) {
      tx.status = 'cancelled';
      tx.reversedAt = new Date();
      tx.reason = reason;
      await tx.save();
      await LoyaltyAccount.findOneAndUpdate({ shopDomain: cleanShop, customerKey: tx.customerKey }, { $inc: { pendingPoints: -Math.abs(tx.points) } });
      reversed.push(tx);
    }
    if (tx.status === 'approved' && settings.refundHandling?.reverseApprovedPoints) {
      tx.status = 'reversed';
      tx.reversedAt = new Date();
      tx.reason = reason;
      await tx.save();
      const reversal = await LoyaltyTransaction.create({
        shopDomain: cleanShop,
        customerKey: tx.customerKey,
        customerRef: tx.customerRef,
        ruleId: tx.ruleId,
        ruleName: tx.ruleName,
        ruleType: 'system',
        trigger: 'refund',
        type: 'reversal',
        status: 'approved',
        points: -Math.abs(tx.points),
        sourceType: 'refund',
        sourceRefHash,
        parentTransactionId: String(tx._id),
        approvedAt: new Date(),
        reason,
        metadata: { sourceType: 'refund', ruleName: tx.ruleName }
      });
      await LoyaltyAccount.findOneAndUpdate(
        { shopDomain: cleanShop, customerKey: tx.customerKey },
        { $inc: { approvedPoints: -Math.abs(tx.points), lifetimeReversed: Math.abs(tx.points) } }
      );
      reversed.push(reversal);
    }
  }
  if (reversed.length) await recordAuditEvent({ shopDomain: cleanShop, actorType: 'system', module: 'loyalty', eventType: 'loyalty.points.reversed', entityType: 'loyalty_transaction', entityKey: sourceRefHash, action: 'reverse', metadata: { count: reversed.length, reason } });
  return reversed;
}

async function reverseForOrder(shopDomain, order) {
  const sourceRefHash = createScopedHash(shopDomain, order.id || order.admin_graphql_api_id || order.order_id || '', 'order');
  if (!sourceRefHash) return [];
  return reverseTransactionsForSource(shopDomain, sourceRefHash, 'order_cancelled_or_refunded');
}

function redemptionDiscountInput(code, rule) {
  const reward = rule.reward || {};
  const discountType = reward.discountType || 'fixed_amount';
  if (!['fixed_amount', 'percentage'].includes(discountType)) {
    throw Object.assign(new Error(`${discountType} redemptions are wireframed but not active yet. Use fixed_amount or percentage first.`), { statusCode: 400 });
  }
  const value = discountType === 'percentage'
    ? { percentage: Math.abs(cleanNumber(reward.percentage || reward.amount || 10)) / 100 }
    : { discountAmount: { amount: String(Math.abs(cleanNumber(reward.amount || reward.currencyValue || 5))), appliesOnEachItem: false } };
  const input = {
    title: `Nectar Drops redemption ${code}`,
    code,
    startsAt: new Date().toISOString(),
    customerSelection: { all: true },
    customerGets: { items: { all: true }, value },
    appliesOncePerCustomer: true,
    usageLimit: 1
  };
  if (reward.expiresAfterDays) input.endsAt = new Date(Date.now() + cleanNumber(reward.expiresAfterDays, 30) * 24 * 60 * 60 * 1000).toISOString();
  if (rule.conditions?.minimumSpend) {
    input.minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: String(cleanNumber(rule.conditions.minimumSpend)) } };
  }
  return input;
}

async function createRedemptionDiscount(shopDomain, rule) {
  const code = buildDiscountCode(rule.reward?.codePrefix || 'DROPS');
  const mutation = `mutation CreateLoyaltyDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field code message }
    }
  }`;
  const data = await shopifyGraphql(shopDomain, mutation, { basicCodeDiscount: redemptionDiscountInput(code, rule) });
  const payload = data?.discountCodeBasicCreate;
  const errors = payload?.userErrors || [];
  if (errors.length) throw new Error(errors.map((entry) => entry.message).join('; '));
  return { code, discountId: payload?.codeDiscountNode?.id || '' };
}

async function redeemPointsByCustomerKey(shopDomain, customerKey, ruleId) {
  const cleanShop = cleanShopDomain(shopDomain);
  const settings = await getSettings(cleanShop);
  if (!settings.enabled) throw Object.assign(new Error('Loyalty is disabled.'), { statusCode: 403 });
  const rule = await LoyaltyRule.findOne({ _id: ruleId, shopDomain: cleanShop, ruleType: 'redeem', enabled: true });
  if (!rule) throw Object.assign(new Error('Redemption rule not found.'), { statusCode: 404 });
  const pointsCost = cleanNumber(rule.reward?.pointsCost || rule.reward?.points || 0);
  if (pointsCost <= 0) throw Object.assign(new Error('Redemption rule has no points cost.'), { statusCode: 400 });
  const account = await getOrCreateAccount(cleanShop, customerKey);
  if (!account || account.approvedPoints < pointsCost) throw Object.assign(new Error('Customer does not have enough approved points.'), { statusCode: 400 });

  const discount = await createRedemptionDiscount(cleanShop, rule);
  const codeHash = createScopedHash(cleanShop, discount.code, 'discount_code');
  const preview = `${discount.code.slice(0, Math.min(6, discount.code.length))}…${discount.code.slice(-4)}`;
  const discountType = rule.reward?.discountType || 'fixed_amount';
  const currencyValue = discountType === 'percentage' ? cleanNumber(rule.reward?.percentage || rule.reward?.amount || 0) : cleanNumber(rule.reward?.amount || rule.reward?.currencyValue || 0);

  const redemption = await LoyaltyRedemption.create({
    shopDomain: cleanShop,
    customerKey,
    customerRef: publicCustomerRef(customerKey),
    ruleId: String(rule._id),
    ruleName: rule.name,
    pointsSpent: pointsCost,
    currencyValue,
    discountType,
    discountCodeHash: codeHash,
    discountCodePreview: preview,
    discountId: discount.discountId,
    expiresAt: rule.reward?.expiresAfterDays ? new Date(Date.now() + cleanNumber(rule.reward.expiresAfterDays, 30) * 24 * 60 * 60 * 1000) : null
  });

  await LoyaltyTransaction.create({
    shopDomain: cleanShop,
    customerKey,
    customerRef: publicCustomerRef(customerKey),
    ruleId: String(rule._id),
    ruleName: rule.name,
    ruleType: 'redeem',
    trigger: 'customer_redeem',
    type: 'spend',
    status: 'approved',
    points: -Math.abs(pointsCost),
    sourceType: 'redemption',
    sourceRefHash: createScopedHash(cleanShop, redemption._id, 'redemption'),
    approvedAt: new Date(),
    reason: `Redeemed for ${rule.name}`,
    metadata: { ruleName: rule.name, redemptionStatus: 'issued' }
  });

  await LoyaltyAccount.findOneAndUpdate(
    { shopDomain: cleanShop, customerKey },
    { $inc: { approvedPoints: -Math.abs(pointsCost), lifetimeSpent: Math.abs(pointsCost) } }
  );
  await recordAuditEvent({ shopDomain: cleanShop, actorType: 'customer', actorKey: createScopedHash(cleanShop, customerKey, 'actor'), module: 'loyalty', eventType: 'loyalty.redemption.issued', entityType: 'loyalty_redemption', entityKey: String(redemption._id), action: 'issue', metadata: { points: pointsCost, ruleName: rule.name, redemptionStatus: 'issued' } });

  return {
    redemption: {
      id: String(redemption._id),
      customerRef: redemption.customerRef,
      pointsSpent: redemption.pointsSpent,
      currencyValue: redemption.currencyValue,
      discountType: redemption.discountType,
      discountCodePreview: redemption.discountCodePreview,
      status: redemption.status,
      expiresAt: redemption.expiresAt
    },
    discountCode: discount.code
  };
}

async function getCustomerAccountByKey(shopDomain, customerKey) {
  return LoyaltyAccount.findOne({ shopDomain: cleanShopDomain(shopDomain), customerKey: String(customerKey || '') }).lean();
}

async function listAccounts(shopDomain, limit = 100) {
  return LoyaltyAccount.find({ shopDomain: cleanShopDomain(shopDomain) })
    .select('shopDomain customerRef approvedPoints pendingPoints lifetimeEarned lifetimeSpent lifetimeReversed tier status updatedAt createdAt')
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 100, 250))
    .lean();
}

async function listTransactions(shopDomain, filters = {}) {
  const query = { shopDomain: cleanShopDomain(shopDomain) };
  if (filters.customerKey) query.customerKey = String(filters.customerKey);
  if (filters.status) query.status = String(filters.status);
  if (filters.type) query.type = String(filters.type);
  return LoyaltyTransaction.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(filters.limit) || 100, 250)).lean();
}

async function listRedemptions(shopDomain, limit = 100) {
  return LoyaltyRedemption.find({ shopDomain: cleanShopDomain(shopDomain) })
    .select('shopDomain customerRef ruleName pointsSpent currencyValue discountType discountCodePreview status expiresAt createdAt')
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 250))
    .lean();
}

async function overview(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  await ensureDefaultRules(cleanShop);
  const [settings, rules, accounts, pending, approved, spent, redemptions] = await Promise.all([
    getSettings(cleanShop),
    LoyaltyRule.countDocuments({ shopDomain: cleanShop }),
    LoyaltyAccount.countDocuments({ shopDomain: cleanShop }),
    LoyaltyTransaction.aggregate([{ $match: { shopDomain: cleanShop, status: 'pending' } }, { $group: { _id: null, points: { $sum: '$points' }, count: { $sum: 1 } } }]),
    LoyaltyTransaction.aggregate([{ $match: { shopDomain: cleanShop, status: 'approved', type: 'earn' } }, { $group: { _id: null, points: { $sum: '$points' }, count: { $sum: 1 } } }]),
    LoyaltyTransaction.aggregate([{ $match: { shopDomain: cleanShop, status: 'approved', type: 'spend' } }, { $group: { _id: null, points: { $sum: '$points' }, count: { $sum: 1 } } }]),
    LoyaltyRedemption.countDocuments({ shopDomain: cleanShop })
  ]);
  return {
    settings,
    counts: {
      rules,
      accounts,
      pendingTransactions: pending[0]?.count || 0,
      approvedEarnTransactions: approved[0]?.count || 0,
      redemptions
    },
    points: {
      pending: pending[0]?.points || 0,
      earned: approved[0]?.points || 0,
      spent: Math.abs(spent[0]?.points || 0)
    }
  };
}

async function publicBalance(shopDomain, customerKey, limit = 20) {
  const cleanShop = cleanShopDomain(shopDomain);
  const [settings, account, transactions, redeemRules] = await Promise.all([
    getSettings(cleanShop),
    getCustomerAccountByKey(cleanShop, customerKey),
    listTransactions(cleanShop, { customerKey, limit }),
    listRules(cleanShop, { ruleType: 'redeem', enabled: true })
  ]);
  return {
    pointsName: settings.pointsName,
    pointsIcon: settings.pointsIcon,
    landingPage: settings.landingPage,
    account: publicAccount(account),
    transactions: transactions.map(publicTransaction),
    redeemRules: redeemRules.map((rule) => ({
      id: String(rule._id),
      name: rule.name,
      description: rule.description,
      pointsCost: cleanNumber(rule.reward?.pointsCost || rule.reward?.points || 0),
      discountType: rule.reward?.discountType || 'fixed_amount',
      amount: rule.reward?.amount || rule.reward?.percentage || rule.reward?.currencyValue || 0,
      expiresAfterDays: rule.reward?.expiresAfterDays || 30,
      minimumSpend: rule.conditions?.minimumSpend || 0
    }))
  };
}

// Compatibility helpers for older admin/test endpoints.
async function awardPointsByCustomerKey(shopDomain, customerKey, points, reason = 'manual_adjustment') {
  const cleanShop = cleanShopDomain(shopDomain);
  const key = String(customerKey || '');
  const amount = cleanNumber(points);
  if (!key || !amount) return null;
  await getOrCreateAccount(cleanShop, key);
  const tx = await LoyaltyTransaction.create({ shopDomain: cleanShop, customerKey: key, customerRef: publicCustomerRef(key), ruleType: 'system', trigger: 'manual', type: 'manual_adjustment', status: 'approved', points: amount, sourceType: 'admin', sourceRefHash: createScopedHash(cleanShop, `${key}:${Date.now()}`, 'manual'), approvedAt: new Date(), reason });
  const inc = amount >= 0 ? { approvedPoints: amount, lifetimeEarned: amount } : { approvedPoints: amount, lifetimeSpent: Math.abs(amount) };
  const account = await LoyaltyAccount.findOneAndUpdate({ shopDomain: cleanShop, customerKey: key }, { $inc: inc }, { new: true });
  await recordAuditEvent({ shopDomain: cleanShop, actorType: 'merchant_admin', module: 'loyalty', eventType: 'loyalty.points.manual_adjustment', entityType: 'loyalty_transaction', entityKey: String(tx._id), action: 'manual_adjustment', metadata: { points: amount, reason } });
  return account;
}

async function calculatePurchasePoints(order, settingsOrRules) {
  if (Array.isArray(settingsOrRules)) {
    return settingsOrRules.filter((rule) => orderMatchesConditions(order, rule.conditions)).reduce((sum, rule) => sum + pointsFromOrderRule(order, rule), 0);
  }
  const settings = settingsOrRules || {};
  const rate = cleanNumber(settings.earning?.pointsPerCurrencyUnit, 5);
  return roundPoints(getOrderAmount(order) * rate, settings.earning?.roundMode || 'floor');
}

module.exports = {
  getSettings,
  updateSettings,
  ensureDefaultRules,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  awardPurchasePoints,
  maybeRewardAcceptedReview,
  processPendingApprovals,
  processFulfillment,
  reverseForOrder,
  reverseTransactionsForSource,
  redeemPointsByCustomerKey,
  getCustomerAccountByKey,
  listAccounts,
  listTransactions,
  listRedemptions,
  overview,
  publicBalance,
  publicAccount,
  publicTransaction,
  awardPointsByCustomerKey,
  calculatePurchasePoints
};
