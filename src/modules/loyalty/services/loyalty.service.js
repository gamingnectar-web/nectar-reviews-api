const { isDatabaseConnected } = require('../../../config/database');
const { stableHash } = require('../../../core/utils/hash');
const LoyaltyLedger = require('../models/loyalty-ledger.model');

const memoryLedger = [];

function buildEntry(shopDomain, input) {
  const customerRef = input.customerRef || input.customerId || input.email;
  if (!customerRef) {
    const error = new Error('customerRef, customerId or email is required.');
    error.status = 400;
    throw error;
  }

  const points = Number(input.points);
  if (!Number.isFinite(points) || points === 0) {
    const error = new Error('points must be a non-zero number.');
    error.status = 400;
    throw error;
  }

  return {
    shopDomain,
    customerRefHash: stableHash(customerRef, 'loyalty-customer'),
    sourceType: input.sourceType || 'manual',
    sourceReviewHash: stableHash(input.sourceReviewId || input.reviewId, 'loyalty-review'),
    orderIdHash: stableHash(input.orderId, 'loyalty-order'),
    points,
    reason: String(input.reason || '').slice(0, 240),
    metadata: input.metadata || {}
  };
}

async function addLedgerEntry(shopDomain, input) {
  const entry = buildEntry(shopDomain, input);
  if (!isDatabaseConnected()) {
    const record = { ...entry, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date() };
    memoryLedger.unshift(record);
    return record;
  }
  return LoyaltyLedger.create(entry);
}

async function listLedger(shopDomain, query = {}) {
  const customerHash = query.customerRef || query.customerId || query.email
    ? stableHash(query.customerRef || query.customerId || query.email, 'loyalty-customer')
    : '';

  if (!isDatabaseConnected()) {
    return memoryLedger.filter((entry) => entry.shopDomain === shopDomain && (!customerHash || entry.customerRefHash === customerHash));
  }

  const filters = { shopDomain };
  if (customerHash) filters.customerRefHash = customerHash;
  return LoyaltyLedger.find(filters).sort({ createdAt: -1 }).limit(250).lean();
}

async function summary(shopDomain) {
  const ledger = await listLedger(shopDomain, {});
  const totalPoints = ledger.reduce((sum, entry) => sum + Number(entry.points || 0), 0);
  const customerCount = new Set(ledger.map((entry) => entry.customerRefHash)).size;
  return { totalPoints, customerCount, entryCount: ledger.length };
}

module.exports = { addLedgerEntry, listLedger, summary };
