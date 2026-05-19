const mongoose = require('mongoose');
const { modelFromConnection } = require('../../core/database');

const loyaltyRuleSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  ruleType: { type: String, enum: ['earn', 'redeem'], required: true, index: true },
  trigger: {
    type: String,
    enum: ['order_paid', 'review_accepted', 'manual', 'customer_redeem'],
    default: 'order_paid',
    index: true
  },
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 500 },
  enabled: { type: Boolean, default: true, index: true },
  priority: { type: Number, default: 100 },
  conditions: { type: Object, default: {} },
  reward: { type: Object, default: {} },
  delay: {
    mode: { type: String, enum: ['immediate', 'after_order_paid', 'after_fulfillment', 'after_delivery', 'manual'], default: 'after_order_paid' },
    days: { type: Number, default: 14 }
  },
  limits: {
    maxUsesPerCustomer: { type: Number, default: 0 },
    maxPointsPerEvent: { type: Number, default: 0 }
  },
  createdBy: { type: String, default: 'system' }
}, { timestamps: true });

loyaltyRuleSchema.index({ shopDomain: 1, ruleType: 1, trigger: 1, enabled: 1, priority: 1 });

module.exports = modelFromConnection('loyalty', 'LoyaltyRule', loyaltyRuleSchema, 'loyalty_rules');
