const mongoose = require('mongoose');

const reviewTokenSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    itemId: { type: String, required: true },
    variantId: String,
    orderIdHash: String,
    customerEmailHash: String,
    customerRefHash: String,
    expiresAt: Date,
    usedAt: Date,
    createdBy: { type: String, default: 'system' }
  },
  { timestamps: true }
);

module.exports = mongoose.models.ReviewToken || mongoose.model('ReviewToken', reviewTokenSchema);
