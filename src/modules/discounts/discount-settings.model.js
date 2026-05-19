const mongoose = require('mongoose');
const { modelFromConnection } = require('../../core/database');

const discountSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  reviewReward: {
    enabled: { type: Boolean, default: false },
    type: { type: String, enum: ['percentage', 'fixed_amount'], default: 'percentage' },
    value: { type: Number, default: 10 },
    oncePerCustomer: { type: Boolean, default: true },
    usageLimit: { type: Number, default: 1 },
    expiresAfterDays: { type: Number, default: 30 },
    prefix: { type: String, default: 'THANKYOU' },
    sendEmail: { type: Boolean, default: false }
  },
  freeGift: {
    enabled: { type: Boolean, default: false },
    minimumSpend: { type: Number, default: 0 },
    giftVariantIds: { type: [String], default: [] }
  }
}, { timestamps: true });

module.exports = modelFromConnection('discounts', 'DiscountSettings', discountSettingsSchema, 'discount_settings');
