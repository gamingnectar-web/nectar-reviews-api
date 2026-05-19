const mongoose = require('mongoose');
const { modelFromConnection } = require('../../core/database');

const reviewRequestLinkSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  customerKey: { type: String, default: '', index: true },
  recipientHash: { type: String, default: '', index: true },
  orderKey: { type: String, default: '', index: true },
  itemId: { type: String, default: '', index: true },
  itemTitle: { type: String, default: '' },
  campaign: { type: String, default: 'review_request' },
  maxUses: { type: Number, default: 1 },
  useCount: { type: Number, default: 0 },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  metadata: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

reviewRequestLinkSchema.index({ shopDomain: 1, customerKey: 1, itemId: 1 });
reviewRequestLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = modelFromConnection('reviews', 'ReviewRequestLink', reviewRequestLinkSchema, 'review_request_links');
