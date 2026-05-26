const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, index: true },
    itemId: { type: String, required: true, index: true },
    variantId: String,
    orderIdHash: { type: String, index: true },
    customerEmailHash: { type: String, index: true },
    customerRefHash: { type: String, index: true },
    authorName: { type: String, default: 'Customer' },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, default: '' },
    body: { type: String, required: true },
    images: [{ url: String, alt: String }],
    source: {
      type: String,
      enum: ['storefront', 'signed-link', 'merchant-import', 'manual-admin', 'test'],
      default: 'storefront'
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'spam', 'test'],
      default: 'pending',
      index: true
    },
    verifiedPurchase: { type: Boolean, default: false },
    verificationSource: {
      type: String,
      enum: ['none', 'signed-token', 'merchant-import', 'manual-admin'],
      default: 'none'
    },
    verificationNote: String,
    importedAt: Date,
    adminNotes: String
  },
  { timestamps: true }
);

reviewSchema.index(
  { shopDomain: 1, itemId: 1, customerEmailHash: 1, orderIdHash: 1 },
  { unique: true, sparse: true, name: 'prevent_duplicate_order_product_review' }
);

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
