const { sha256 } = require('../../utils/crypto');
const { cleanText, clampNumber } = require('../../utils/validation');
const { models } = require('./loyalty.models');
function customerHash(shopDomain, customerRef) { return sha256(`${shopDomain}:${customerRef}`); }
async function getProgram(shopDomain) { const { LoyaltyProgram } = models(); return LoyaltyProgram.findOneAndUpdate({ shopDomain }, { $setOnInsert: { shopDomain } }, { new: true, upsert: true }); }
async function updateProgram(shopDomain, patch) { const { LoyaltyProgram } = models(); return LoyaltyProgram.findOneAndUpdate({ shopDomain }, { $set: patch, $setOnInsert: { shopDomain } }, { new: true, upsert: true }); }
async function addLedgerEntry(shopDomain, body) { const { LoyaltyLedger } = models(); return LoyaltyLedger.create({ shopDomain, customerRefHash: customerHash(shopDomain, cleanText(body.customerRef, 240)), points: clampNumber(body.points, -100000, 100000, 0), ruleId: cleanText(body.ruleId, 120), ruleName: cleanText(body.ruleName || 'Manual adjustment', 120), status: cleanText(body.status || 'available', 30), metadata: body.metadata || {} }); }
async function getCustomerState(shopDomain, customerRef) { const { LoyaltyLedger } = models(); const customerRefHash = customerHash(shopDomain, customerRef); const rows = await LoyaltyLedger.find({ shopDomain, customerRefHash }).lean(); const balance = rows.filter(r => r.status === 'available').reduce((s, r) => s + Number(r.points || 0), 0); return { shopDomain, customerRefHash, balance, entries: rows.slice(-50) }; }
async function reserveRedemption(shopDomain, body) { const { LoyaltyRedemption } = models(); return LoyaltyRedemption.create({ shopDomain, customerRefHash: customerHash(shopDomain, cleanText(body.customerRef, 240)), points: clampNumber(body.points, 0, 100000, 0), metadata: body.metadata || {} }); }
module.exports = { getProgram, updateProgram, addLedgerEntry, getCustomerState, reserveRedemption };
