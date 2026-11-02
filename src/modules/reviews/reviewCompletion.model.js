'use strict';

const mongoose = require('mongoose');

const reviewCompletionProductSchema = new mongoose.Schema({
  productId: { type: String, default: '' },
  title: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const reviewCompletionStateSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  sourceJobId: { type: String, required: true, index: true, unique: true },
  orderId: { type: String, required: true, index: true },
  orderName: { type: String, default: '' },

  requestedProducts: { type: [reviewCompletionProductSchema], default: [] },
  requestedProductIds: { type: [String], default: [] },
  reviewedProductIds: { type: [String], default: [] },

  requestedCount: { type: Number, default: 0 },
  reviewedCount: { type: Number, default: 0 },
  completionStatus: {
    type: String,
    enum: ['none', 'partial', 'complete'],
    default: 'none',
    index: true,
  },

  firstReviewedAt: { type: Date, default: null },
  lastReviewedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },

  // V1 is traceability only. No post-review email/reward action is dispatched.
  postReviewActionStatus: {
    type: String,
    enum: ['not_configured', 'pending', 'sent', 'failed', 'disabled'],
    default: 'not_configured',
    index: true,
  },
  postReviewActionAt: { type: Date, default: null },
  lastReviewId: { type: String, default: '' },
  lastReconciledAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

reviewCompletionStateSchema.index({ shopDomain: 1, completionStatus: 1, updatedAt: -1 });
reviewCompletionStateSchema.index({ shopDomain: 1, orderId: 1 });

module.exports = mongoose.models.ReviewCompletionState
  || mongoose.model('ReviewCompletionState', reviewCompletionStateSchema, 'review_completion_states');
