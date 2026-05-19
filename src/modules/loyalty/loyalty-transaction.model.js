const mongoose = require('mongoose');

const loyaltyTransactionSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerKey: { type: String, required: true, index: true },
  customerRef: { type: String, default: '', index: true },
  ruleId: { type: String, default: '', index: true },
  ruleName: { type: String, default: '' },
  ruleType: { type: String, enum: ['earn', 'redeem', 'system'], default: 'earn', index: true },
  trigger: { type: String, default: '', index: true },
  type: { type: String, enum: ['earn', 'spend', 'approve', 'reversal', 'expiry', 'manual_adjustment'], required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'cancelled', 'reversed', 'expired'], default: 'pending', index: true },
  points: { type: Number, required: true },
  sourceType: { type: String, enum: ['order', 'review', 'redemption', 'refund', 'fulfillment', 'admin', 'system'], default: 'system', index: true },
  sourceRefHash: { type: String, default: '', index: true },
  dedupeKey: { type: String, default: '', index: true },
  parentTransactionId: { type: String, default: '', index: true },
  delayMode: { type: String, default: '' },
  eligibleAt: { type: Date, default: null, index: true },
  approvedAt: { type: Date, default: null },
  reversedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  reason: { type: String, default: '', maxlength: 250 },
  metadata: { type: Object, default: {} }
}, { timestamps: true });

loyaltyTransactionSchema.index({ shopDomain: 1, dedupeKey: 1 }, { unique: true, sparse: true });
loyaltyTransactionSchema.index({ shopDomain: 1, status: 1, eligibleAt: 1 });
loyaltyTransactionSchema.index({ shopDomain: 1, customerKey: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ shopDomain: 1, sourceRefHash: 1, status: 1 });

module.exports = mongoose.models.LoyaltyTransaction || mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema, 'loyalty_transactions');
