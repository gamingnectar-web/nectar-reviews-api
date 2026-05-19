const mongoose = require('mongoose');
const { modelFromConnection } = require('../../core/database');

const loyaltyRedemptionSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerKey: { type: String, required: true, index: true },
  customerRef: { type: String, default: '', index: true },
  ruleId: { type: String, default: '', index: true },
  ruleName: { type: String, default: '' },
  pointsSpent: { type: Number, required: true },
  currencyValue: { type: Number, default: 0 },
  discountType: { type: String, enum: ['fixed_amount', 'percentage', 'free_shipping', 'free_product'], default: 'fixed_amount' },
  discountCodeHash: { type: String, required: true },
  discountCodePreview: { type: String, default: '' },
  discountId: { type: String, default: '' },
  status: { type: String, enum: ['issued', 'used', 'expired', 'cancelled'], default: 'issued', index: true },
  expiresAt: { type: Date, default: null, index: true },
  metadata: { type: Object, default: {} }
}, { timestamps: true });

loyaltyRedemptionSchema.index({ shopDomain: 1, customerKey: 1, createdAt: -1 });
loyaltyRedemptionSchema.index({ shopDomain: 1, discountCodeHash: 1 }, { unique: true });

module.exports = modelFromConnection('loyalty', 'LoyaltyRedemption', loyaltyRedemptionSchema, 'loyalty_redemptions');
