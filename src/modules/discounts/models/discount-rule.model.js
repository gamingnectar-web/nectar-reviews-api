const mongoose = require('mongoose');

const discountRuleSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['draft', 'active', 'paused', 'expired'], default: 'draft', index: true },
    rewardType: { type: String, enum: ['percentage', 'fixed_amount', 'free_shipping', 'free_gift'], default: 'percentage' },
    value: { type: Number, default: 0 },
    codePrefix: { type: String, default: 'NECTAR' },
    appliesTo: {
      productIds: [String],
      collectionIds: [String],
      customerSegments: [String]
    },
    startsAt: Date,
    endsAt: Date,
    usageLimit: Number,
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.models.DiscountRule || mongoose.model('DiscountRule', discountRuleSchema);
