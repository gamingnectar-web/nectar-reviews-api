const mongoose = require('mongoose');

const discountConditionSchema = new mongoose.Schema({
  type: { type: String, enum: ['always', 'review_count', 'verified_review', 'min_stars', 'loyalty_tier', 'loyalty_balance', 'cart_value', 'customer_tag', 'product_tag', 'manual'], default: 'always' },
  operator: { type: String, default: 'is' },
  value: { type: String, default: '' },
}, { _id: false });

const discountTemplateSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Reward discount' },
  enabled: { type: Boolean, default: true },
  area: { type: String, enum: ['reviews', 'loyalty', 'cart_rewards', 'referrals', 'manual', 'general'], default: 'general' },
  trigger: { type: String, enum: ['manual', 'review_submitted', 'review_approved', 'review_milestone', 'loyalty_redemption', 'checkout_redemption', 'cart_reward_claimed', 'referral_completed'], default: 'manual' },
  milestoneCount: { type: Number, default: 0, min: 0 },
  codePrefix: { type: String, default: 'NECTAR' },
  method: { type: String, enum: ['draft_only', 'native_shopify_code'], default: 'draft_only' },
  discountType: { type: String, enum: ['percentage', 'fixed_amount', 'free_shipping'], default: 'percentage' },
  discountValue: { type: Number, default: 10, min: 0 },
  appliesTo: { type: String, enum: ['all_products', 'specific_products', 'specific_collections', 'shipping'], default: 'all_products' },
  productIds: { type: [String], default: [] },
  collectionIds: { type: [String], default: [] },
  minimumSubtotal: { type: Number, default: 0, min: 0 },
  usageLimit: { type: Number, default: 1, min: 0 },
  oncePerCustomer: { type: Boolean, default: true },
  customerSelection: { type: String, enum: ['all', 'specific_customers'], default: 'all' },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, default: null },
  emailSubject: { type: String, default: 'Your discount is ready' },
  emailBody: { type: String, default: 'Thanks — your reward code is {{ code }}.' },
  conditions: { type: [discountConditionSchema], default: [] },
}, { _id: false });

const discountProgramSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  defaultMethod: { type: String, enum: ['draft_only', 'native_shopify_code'], default: 'draft_only' },
  defaultExpiryDays: { type: Number, default: 30, min: 0, max: 730 },
  templates: { type: [discountTemplateSchema], default: [] },
  settings: {
    allowReviewMilestones: { type: Boolean, default: true },
    allowLoyaltyRedemptions: { type: Boolean, default: true },
    allowCartRewards: { type: Boolean, default: true },
    requireShopifyDiscountScope: { type: Boolean, default: true },
  },
}, { timestamps: true });

const discountIssueSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  templateId: { type: String, default: '', index: true },
  templateName: { type: String, default: '' },
  area: { type: String, default: 'general', index: true },
  trigger: { type: String, default: 'manual', index: true },
  code: { type: String, default: '', index: true },
  method: { type: String, enum: ['draft_only', 'native_shopify_code'], default: 'draft_only' },
  discountType: { type: String, enum: ['percentage', 'fixed_amount', 'free_shipping'], default: 'percentage' },
  discountValue: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'issued', 'failed', 'used', 'cancelled', 'expired'], default: 'draft', index: true },
  sourceId: { type: String, default: '', index: true },
  customerRefHash: { type: String, default: '', index: true },
  email: { type: String, default: '' },
  priceRuleId: { type: String, default: '' },
  discountCodeId: { type: String, default: '' },
  errorMessage: { type: String, default: '' },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null, index: true },
  issuedAt: { type: Date, default: null },
  usedAt: { type: Date, default: null },
  privateNote: { type: String, default: '' },
}, { timestamps: true });

discountIssueSchema.index({ shopDomain: 1, code: 1 }, { unique: true, sparse: true });
discountIssueSchema.index({ shopDomain: 1, area: 1, createdAt: -1 });

module.exports = {
  DiscountProgram: mongoose.models.DiscountProgram || mongoose.model('DiscountProgram', discountProgramSchema, 'discount_programs'),
  DiscountIssue: mongoose.models.DiscountIssue || mongoose.model('DiscountIssue', discountIssueSchema, 'discount_issues'),
};
