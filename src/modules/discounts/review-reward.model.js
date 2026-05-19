const mongoose = require('mongoose');
const { modelFromConnection } = require('../../core/database');

const reviewRewardSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  reviewId: { type: String, required: true, index: true },
  customerKey: { type: String, default: '', index: true },
  customerRef: { type: String, default: '' },
  discountCodeHash: { type: String, required: true },
  discountCodePreview: { type: String, default: '' },
  discountId: { type: String, default: '' },
  discountType: { type: String, enum: ['percentage', 'fixed_amount'], default: 'percentage' },
  discountValue: { type: Number, default: 0 },
  sentAt: { type: Date, default: null },
  status: { type: String, enum: ['issued', 'sent', 'expired', 'cancelled'], default: 'issued' },
  metadata: { type: Object, default: {} }
}, { timestamps: true });

reviewRewardSchema.index({ shopDomain: 1, reviewId: 1 }, { unique: true });
reviewRewardSchema.index({ shopDomain: 1, discountCodeHash: 1 }, { unique: true });

module.exports = modelFromConnection('discounts', 'ReviewReward', reviewRewardSchema, 'review_rewards');
