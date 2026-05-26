const { isDatabaseConnected } = require('../../../config/database');
const DiscountRule = require('../models/discount-rule.model');

const memoryRules = [];

function cleanRule(shopDomain, input) {
  if (!input.name) {
    const error = new Error('Discount rule name is required.');
    error.status = 400;
    throw error;
  }

  return {
    shopDomain,
    name: String(input.name).slice(0, 160),
    status: input.status || 'draft',
    rewardType: input.rewardType || 'percentage',
    value: Number(input.value || 0),
    codePrefix: String(input.codePrefix || 'NECTAR').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24),
    appliesTo: {
      productIds: Array.isArray(input.productIds) ? input.productIds : input.appliesTo?.productIds || [],
      collectionIds: Array.isArray(input.collectionIds) ? input.collectionIds : input.appliesTo?.collectionIds || [],
      customerSegments: Array.isArray(input.customerSegments) ? input.customerSegments : input.appliesTo?.customerSegments || []
    },
    startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
    endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
    usageLimit: input.usageLimit ? Number(input.usageLimit) : undefined,
    metadata: input.metadata || {}
  };
}

async function createRule(shopDomain, input) {
  const rule = cleanRule(shopDomain, input);
  if (!isDatabaseConnected()) {
    const record = { ...rule, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date(), updatedAt: new Date() };
    memoryRules.unshift(record);
    return record;
  }
  return DiscountRule.create(rule);
}

async function listRules(shopDomain) {
  if (!isDatabaseConnected()) return memoryRules.filter((rule) => rule.shopDomain === shopDomain);
  return DiscountRule.find({ shopDomain }).sort({ createdAt: -1 }).limit(250).lean();
}

async function updateRule(shopDomain, id, patch) {
  if (!isDatabaseConnected()) {
    const rule = memoryRules.find((item) => item.shopDomain === shopDomain && item.id === id);
    if (!rule) return null;
    Object.assign(rule, cleanRule(shopDomain, { ...rule, ...patch }), { updatedAt: new Date() });
    return rule;
  }
  return DiscountRule.findOneAndUpdate({ _id: id, shopDomain }, { $set: patch }, { new: true }).lean();
}

async function deleteRule(shopDomain, id) {
  if (!isDatabaseConnected()) {
    const index = memoryRules.findIndex((item) => item.shopDomain === shopDomain && item.id === id);
    if (index === -1) return false;
    memoryRules.splice(index, 1);
    return true;
  }
  const result = await DiscountRule.deleteOne({ _id: id, shopDomain });
  return result.deletedCount > 0;
}

module.exports = { createRule, listRules, updateRule, deleteRule };
