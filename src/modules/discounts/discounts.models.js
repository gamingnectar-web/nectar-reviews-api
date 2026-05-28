const mongoose = require('mongoose');
const discountRuleSchema = new mongoose.Schema({ shopDomain: { type: String, index: true }, name: String, type: String, value: Number, enabled: { type: Boolean, default: false }, config: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true });
module.exports = { DiscountRule: mongoose.models.DiscountRule || mongoose.model('DiscountRule', discountRuleSchema, 'discount_rules') };
