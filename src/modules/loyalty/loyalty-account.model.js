const mongoose = require('mongoose');
const { modelFromConnection } = require('../../core/database');

const loyaltyAccountSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerKey: { type: String, required: true, index: true },
  customerRef: { type: String, default: '', index: true },
  approvedPoints: { type: Number, default: 0 },
  pendingPoints: { type: Number, default: 0 },
  lifetimeEarned: { type: Number, default: 0 },
  lifetimeSpent: { type: Number, default: 0 },
  lifetimeReversed: { type: Number, default: 0 },
  tier: { type: String, default: 'standard' },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' }
}, { timestamps: true });

loyaltyAccountSchema.index({ shopDomain: 1, customerKey: 1 }, { unique: true });
loyaltyAccountSchema.index({ shopDomain: 1, updatedAt: -1 });

module.exports = modelFromConnection('loyalty', 'LoyaltyAccount', loyaltyAccountSchema, 'loyalty_accounts');
