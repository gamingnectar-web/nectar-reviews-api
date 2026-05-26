const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, index: true },
    name: { type: String, required: true },
    moduleKey: { type: String, enum: ['reviews', 'loyalty', 'discounts', 'cart-rewards', 'general'], default: 'general' },
    status: { type: String, enum: ['planned', 'active', 'paused', 'completed'], default: 'planned', index: true },
    objective: String,
    startsAt: Date,
    endsAt: Date,
    metrics: {
      revenue: { type: Number, default: 0 },
      orders: { type: Number, default: 0 },
      participants: { type: Number, default: 0 },
      rewardClaims: { type: Number, default: 0 }
    },
    notes: String
  },
  { timestamps: true }
);

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
