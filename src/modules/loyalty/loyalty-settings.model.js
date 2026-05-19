const mongoose = require('mongoose');

const loyaltySettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  pointsName: { type: String, default: 'Nectar Drops' },
  pointsIcon: { type: String, default: '🍯' },
  landingPage: {
    enabled: { type: Boolean, default: true },
    slug: { type: String, default: 'nectar-drops' },
    heroTitle: { type: String, default: 'Earn Nectar Drops every time you shop' },
    heroText: { type: String, default: 'Collect points from purchases and reviews, then redeem them for money off future orders.' }
  },
  approvalDefaults: {
    orderDelayMode: { type: String, enum: ['immediate', 'after_order_paid', 'after_fulfillment', 'after_delivery', 'manual'], default: 'after_order_paid' },
    orderDelayDays: { type: Number, default: 14 },
    reviewDelayMode: { type: String, enum: ['immediate', 'after_order_paid', 'after_fulfillment', 'after_delivery', 'manual'], default: 'immediate' },
    reviewDelayDays: { type: Number, default: 0 }
  },
  refundHandling: {
    cancelPendingPoints: { type: Boolean, default: true },
    reverseApprovedPoints: { type: Boolean, default: true },
    allowNegativeBalance: { type: Boolean, default: false }
  },
  privacy: {
    storeRawCustomerData: { type: Boolean, default: false },
    showOnlyCustomerRefsInAdmin: { type: Boolean, default: true }
  }
}, { timestamps: true });

module.exports = mongoose.models.LoyaltySettings || mongoose.model('LoyaltySettings', loyaltySettingsSchema, 'loyalty_settings');
