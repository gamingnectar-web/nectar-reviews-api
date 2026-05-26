const mongoose = require('mongoose');

const loyaltyLedgerSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, index: true },
    customerRefHash: { type: String, required: true, index: true },
    sourceType: { type: String, enum: ['review', 'order', 'manual', 'campaign'], default: 'manual' },
    sourceReviewHash: String,
    orderIdHash: String,
    points: { type: Number, required: true },
    reason: { type: String, default: '' },
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.models.LoyaltyLedger || mongoose.model('LoyaltyLedger', loyaltyLedgerSchema);
