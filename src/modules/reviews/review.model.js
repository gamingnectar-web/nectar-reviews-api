const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  itemId: { type: String, required: true, index: true },
  itemTitle: { type: String, default: '' },
  userId: { type: String, default: '' },
  customerKey: { type: String, default: '', index: true },
  customerName: { type: String, default: '' },
  email: { type: String, default: '' },
  isAnonymous: { type: Boolean, default: false },
  rating: { type: Number, required: true, min: 1, max: 5 },
  headline: { type: String, default: '' },
  comment: { type: String, default: '' },
  reply: { type: String, default: '' },
  attributes: { type: Map, of: Number },
  productTags: { type: Array, default: [] },
  media: { type: Array, default: [] },
  source: { type: String, enum: ['website', 'email', 'import', 'admin'], default: 'website' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold', 'spam'], default: 'pending' },
  verifiedPurchase: { type: Boolean, default: false },
  verificationNote: { type: String, default: '' },
  orderId: { type: String, default: '' },
  orderKey: { type: String, default: '', index: true },
  requestToken: { type: String, default: '', index: true },
  isTestReview: { type: Boolean, default: false },
  testMode: { type: Boolean, default: false },
  testLabel: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

reviewSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2419200 });
reviewSchema.index({ shopDomain: 1, createdAt: -1 });
reviewSchema.index({ shopDomain: 1, itemId: 1, status: 1 });
reviewSchema.index({ shopDomain: 1, requestToken: 1 });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema, 'reviews');
