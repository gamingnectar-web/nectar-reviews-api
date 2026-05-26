const mongoose = require('mongoose');
const { getLoyaltyConnection } = require('../../config/db');

const loyaltyConditionSchema = new mongoose.Schema({
  type: { type: String, enum: ['always', 'verified_review', 'min_stars', 'tier', 'purchase_count', 'birthday', 'manual', 'customer_tag', 'product_tag', 'minimum_balance', 'checkout_beta', 'reward'], default: 'always' },
  operator: { type: String, default: 'is' },
  value: { type: String, default: '' },
}, { _id: false });

const loyaltyRewardTemplateSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Review thank-you discount' },
  enabled: { type: Boolean, default: false },
  trigger: { type: String, enum: ['review_submitted', 'review_approved', 'purchase_completed', 'birthday', 'manual_adjustment'], default: 'review_approved' },
  discountType: { type: String, enum: ['percentage', 'fixed_amount'], default: 'percentage' },
  discountValue: { type: Number, default: 10, min: 0 },
  delayDays: { type: Number, default: 0, min: 0, max: 365 },
  verifiedOnly: { type: Boolean, default: true },
  minStars: { type: Number, default: 1, min: 1, max: 5 },
  reusableTemplate: { type: Boolean, default: true },
  messageTemplate: { type: String, default: 'Thanks for your review — here is {{ discount_value }}% off your next order.' },
  emailSubject: { type: String, default: 'Your review reward is ready' },
  emailBody: { type: String, default: 'Thanks for leaving a review. Your {{ reward_type }} is now ready.' },
  conditions: { type: [loyaltyConditionSchema], default: [] },
}, { _id: false });

const loyaltyPointsRuleSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Review approved points' },
  enabled: { type: Boolean, default: false },
  trigger: { type: String, enum: ['review_submitted', 'review_approved', 'purchase_completed', 'birthday', 'manual_adjustment'], default: 'review_approved' },
  points: { type: Number, default: 100, min: 0 },
  delayDays: { type: Number, default: 28, min: 0, max: 365 },
  verifiedOnly: { type: Boolean, default: true },
  minStars: { type: Number, default: 1, min: 1, max: 5 },
  maxAwardsPerOrder: { type: Number, default: 1, min: 0, max: 50 },
  purchaseMultiplierEligible: { type: Boolean, default: true },
  conditions: { type: [loyaltyConditionSchema], default: [] },
}, { _id: false });

const loyaltyEmailModuleSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Content module' },
  type: { type: String, enum: ['reward_box', 'notice', 'offer', 'support', 'text', 'image_text', 'button'], default: 'notice' },
  title: { type: String, default: 'Extra section' },
  body: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  buttonText: { type: String, default: '' },
  buttonUrl: { type: String, default: '' },
  backgroundEnabled: { type: Boolean, default: true },
  backgroundColor: { type: String, default: '#f8fafc' },
  backgroundOpacity: { type: Number, default: 100, min: 0, max: 100 },
  borderEnabled: { type: Boolean, default: true },
  borderColor: { type: String, default: '#e5e7eb' },
  borderWidth: { type: Number, default: 1, min: 0, max: 12 },
  radius: { type: Number, default: 16, min: 0, max: 48 },
  padding: { type: Number, default: 16, min: 6, max: 60 },
  alignment: { type: String, enum: ['left', 'center'], default: 'left' },
  position: { type: String, enum: ['before_body', 'after_body', 'after_reward'], default: 'after_body' },
}, { _id: false });

const loyaltyEmailTemplateSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Reward ready' },
  primary: { type: Boolean, default: true },
  status: { type: String, enum: ['primary', 'draft', 'archived'], default: 'primary' },
  subject: { type: String, default: 'Your review reward is ready' },
  heading: { type: String, default: 'Your reward is ready' },
  subtitle: { type: String, default: 'A little thank-you from us.' },
  body: { type: String, default: 'Thanks for leaving a review. Your {{ reward_type }} is now ready.' },
  modules: { type: [loyaltyEmailModuleSchema], default: [] },
  accentColor: { type: String, default: '#111827' },
  buttonText: { type: String, default: 'Shop now' },
}, { _id: false });

const loyaltyTierSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  threshold: { type: Number, default: 0, min: 0 },
  multiplier: { type: Number, default: 1, min: 0 },
  perks: { type: String, default: '' },
  ruleIds: { type: [String], default: [] },
  rewardIds: { type: [String], default: [] },
  birthdayRewardEnabled: { type: Boolean, default: false },
}, { _id: false });

const loyaltyRedemptionRewardSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Checkout discount' },
  type: { type: String, enum: ['discount', 'catalogue_item', 'free_shipping'], default: 'discount' },
  pointsCost: { type: Number, default: 500, min: 0 },
  discountValue: { type: Number, default: 5, min: 0 },
  discountValueType: { type: String, enum: ['fixed_amount', 'percentage'], default: 'fixed_amount' },
  enabled: { type: Boolean, default: true },
  shopifyProductId: { type: String, default: '' },
  shopifyVariantId: { type: String, default: '' },
  productTitle: { type: String, default: '' },
  productImage: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  productPrice: { type: Number, default: 0 },
  redeemQuantity: { type: Number, default: 1, min: 1 },
  stockLimit: { type: Number, default: 0, min: 0 },
  minimumCartValue: { type: Number, default: 0, min: 0 },
  betaCheckoutEnabled: { type: Boolean, default: false },
  discountMode: { type: String, enum: ['draft_only', 'native_discount_code'], default: 'draft_only' },
}, { _id: false });

const loyaltyProgramSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  privacyMode: { type: String, default: 'hashed_customer_ref' },
  pointName: { type: String, default: 'Points' },
  emailTemplates: { type: [loyaltyEmailTemplateSchema], default: [] },
  emailModuleLibrary: { type: [loyaltyEmailModuleSchema], default: [] },
  tiers: { type: [loyaltyTierSchema], default: [] },
  redemptionRewards: { type: [loyaltyRedemptionRewardSchema], default: [] },
  rewardTemplates: { type: [loyaltyRewardTemplateSchema], default: [] },
  pointsRules: { type: [loyaltyPointsRuleSchema], default: [] },
  settings: {
    reuseCoreEmailProvider: { type: Boolean, default: true },
    pointsExpireAfterDays: { type: Number, default: 365, min: 0, max: 3650 },
    pendingMaturationEnabled: { type: Boolean, default: true },
    allowManualAdjustments: { type: Boolean, default: true },
    checkoutBeta: {
      enabled: { type: Boolean, default: false },
      betaLabel: { type: String, default: 'Checkout points redemption beta' },
      minimumPointsToShow: { type: Number, default: 1, min: 0 },
      maximumPointsPerCheckout: { type: Number, default: 5000, min: 0 },
      pointValueMinorUnits: { type: Number, default: 1, min: 0 },
      allowNativeDiscountCodes: { type: Boolean, default: false },
      requireLoggedInCustomer: { type: Boolean, default: true },
      allowPartialRedemption: { type: Boolean, default: true },
      betaNote: { type: String, default: 'Customers must be logged in before checkout redemption appears.' },
    },
  },
}, { timestamps: true });

const loyaltyLedgerSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerRefHash: { type: String, required: true, index: true },
  customerRefHint: { type: String, default: '' },
  eventType: { type: String, enum: ['points_award', 'discount_reward', 'manual_adjustment', 'redemption', 'checkout_redemption', 'points_reservation', 'points_expiry'], required: true },
  source: { type: String, default: 'review' },
  sourceReviewHash: { type: String, default: '', index: true },
  orderIdHash: { type: String, default: '' },
  itemId: { type: String, default: '' },
  points: { type: Number, default: 0 },
  discountType: { type: String, enum: ['percentage', 'fixed_amount', 'none'], default: 'none' },
  discountValue: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'available', 'reserved', 'issued', 'used', 'cancelled', 'redeemed', 'expired'], default: 'pending', index: true },
  availableAt: { type: Date, default: Date.now, index: true },
  awardedAt: { type: Date, default: null },
  redeemedAt: { type: Date, default: null },
  ruleId: { type: String, default: '' },
  ruleName: { type: String, default: '' },
  privateNote: { type: String, default: '' },
}, { timestamps: true });
loyaltyLedgerSchema.index({ shopDomain: 1, customerRefHash: 1, createdAt: -1 });
loyaltyLedgerSchema.index({ shopDomain: 1, customerRefHash: 1, sourceReviewHash: 1, ruleId: 1, eventType: 1 });

const loyaltyCustomerStateSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerRefHash: { type: String, required: true, index: true },
  customerRefHint: { type: String, default: '' },
  source: { type: String, enum: ['review', 'purchase', 'shopify_customer', 'manual', 'import'], default: 'manual' },
  optOut: { type: Boolean, default: false, index: true },
  optOutReason: { type: String, default: '' },
  purchaseCount: { type: Number, default: 0 },
  lastOrderAt: { type: Date, default: null },
  availablePoints: { type: Number, default: 0 },
  pendingPoints: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalRedeemed: { type: Number, default: 0 },
  currentTierId: { type: String, default: 'bronze' },
  currentTierName: { type: String, default: 'Bronze' },
  lastActivityAt: { type: Date, default: Date.now },
}, { timestamps: true });
loyaltyCustomerStateSchema.index({ shopDomain: 1, customerRefHash: 1 }, { unique: true });
loyaltyCustomerStateSchema.index({ shopDomain: 1, availablePoints: -1 });
loyaltyCustomerStateSchema.index({ shopDomain: 1, lastActivityAt: -1 });
loyaltyCustomerStateSchema.index({ shopDomain: 1, currentTierId: 1 });

const loyaltyRedemptionSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerRefHash: { type: String, required: true, index: true },
  rewardId: { type: String, required: true },
  rewardName: { type: String, default: '' },
  pointsCost: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'reserved', 'issued', 'applied', 'redeemed', 'expired', 'failed', 'cancelled'], default: 'draft', index: true },
  shopifyDiscountCode: { type: String, default: '' },
  checkoutSessionId: { type: String, default: '', index: true },
  checkoutTokenHash: { type: String, default: '', index: true },
  pointsReserved: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  currencyCode: { type: String, default: '' },
  expiresAt: { type: Date, default: null, index: true },
  issuedAt: { type: Date, default: null },
  appliedAt: { type: Date, default: null },
  privateNote: { type: String, default: '' },
}, { timestamps: true });

function modelFor(conn, name, schema, collection) {
  return conn.models[name] || conn.model(name, schema, collection);
}

loyaltyRedemptionSchema.index({ shopDomain: 1, customerRefHash: 1, createdAt: -1 });
loyaltyRedemptionSchema.index({ shopDomain: 1, checkoutTokenHash: 1 });

function getLoyaltyModels() {
  const conn = getLoyaltyConnection();
  return {
    LoyaltyProgram: modelFor(conn, 'LoyaltyProgram', loyaltyProgramSchema, 'loyalty_programs'),
    LoyaltyLedger: modelFor(conn, 'LoyaltyLedger', loyaltyLedgerSchema, 'loyalty_ledger'),
    LoyaltyCustomerState: modelFor(conn, 'LoyaltyCustomerState', loyaltyCustomerStateSchema, 'loyalty_customer_state'),
    LoyaltyRedemption: modelFor(conn, 'LoyaltyRedemption', loyaltyRedemptionSchema, 'loyalty_redemptions'),
  };
}

module.exports = { getLoyaltyModels };
