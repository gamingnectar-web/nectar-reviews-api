const { DiscountRule } = require('./discounts.models');
async function listRules(shopDomain){ return DiscountRule.find({ shopDomain }).sort({ createdAt: -1 }).lean(); }
async function saveRule(shopDomain, body){ return DiscountRule.create({ shopDomain, ...body }); }
module.exports = { listRules, saveRule };
