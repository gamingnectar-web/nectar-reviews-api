const mongoose = require('mongoose');
const { getLoyaltyConnection } = require('../../config/db');
function models() {
  const conn = getLoyaltyConnection();
  const programSchema = new mongoose.Schema({ shopDomain: { type: String, required: true, unique: true }, enabled: { type: Boolean, default: false }, pointsName: { type: String, default: 'points' }, rules: { type: [mongoose.Schema.Types.Mixed], default: [] }, tiers: { type: [mongoose.Schema.Types.Mixed], default: [] }, checkoutBeta: { type: mongoose.Schema.Types.Mixed, default: { enabled: false } } }, { timestamps: true });
  const ledgerSchema = new mongoose.Schema({ shopDomain: { type: String, index: true }, customerRefHash: { type: String, index: true }, sourceReviewHash: String, orderIdHash: String, itemId: String, ruleId: String, ruleName: String, points: { type: Number, default: 0 }, status: { type: String, default: 'available' }, availableAt: { type: Date, default: Date.now }, metadata: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true });
  const redemptionSchema = new mongoose.Schema({ shopDomain: { type: String, index: true }, customerRefHash: { type: String, index: true }, points: Number, status: { type: String, default: 'reserved' }, metadata: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true });
  return {
    LoyaltyProgram: conn.models.LoyaltyProgram || conn.model('LoyaltyProgram', programSchema, 'loyalty_programs'),
    LoyaltyLedger: conn.models.LoyaltyLedger || conn.model('LoyaltyLedger', ledgerSchema, 'loyalty_ledger'),
    LoyaltyRedemption: conn.models.LoyaltyRedemption || conn.model('LoyaltyRedemption', redemptionSchema, 'loyalty_redemptions'),
  };
}
module.exports = { models };
