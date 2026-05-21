const mongoose = require('mongoose');
const { getLoyaltyConnection } = require('../../config/db');

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
}, { _id: false });


const loyaltyEmailTemplateSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Reward ready' },
  primary: { type: Boolean, default: true },
  status: { type: String, enum: ['primary', 'draft', 'archived'], default: 'primary' },
  subject: { type: String, default: 'Your review reward is ready' },
  heading: { type: String, default: 'Your reward is ready' },
  body: { type: String, default: 'Thanks for leaving a review. Your {{ reward_type }} is now ready.' },
  accentColor: { type: String, default: '#111827' },
  buttonText: { type: String, default: 'Shop now' },
}, { _id: false });

const loyaltyTierSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  threshold: { type: Number, default: 0, min: 0 },
  multiplier: { type: Number, default: 1, min: 0 },
}, { _id: false });

const loyaltyRedemptionRewardSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Checkout discount' },
  type: { type: String, enum: ['discount', 'catalogue_item'], default: 'discount' },
  pointsCost: { type: Number, default: 500, min: 0 },
  discountValue: { type: Number, default: 5, min: 0 },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const loyaltyProgramSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  privacyMode: { type: String, default: 'hashed_customer_ref' },
  pointName: { type: String, default: 'Nectar Points' },
  emailTemplates: { type: [loyaltyEmailTemplateSchema], default: [] },
  tiers: { type: [loyaltyTierSchema], default: [] },
  redemptionRewards: { type: [loyaltyRedemptionRewardSchema], default: [] },
  rewardTemplates: { type: [loyaltyRewardTemplateSchema], default: [] },
  pointsRules: { type: [loyaltyPointsRuleSchema], default: [] },
}, { timestamps: true });

const loyaltyLedgerSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerRefHash: { type: String, required: true, index: true },
  eventType: { type: String, enum: ['points_award', 'discount_reward', 'manual_adjustment', 'redemption'], required: true },
  source: { type: String, default: 'review' },
  sourceReviewHash: { type: String, default: '', index: true },
  orderIdHash: { type: String, default: '' },
  itemId: { type: String, default: '' },
  points: { type: Number, default: 0 },
  discountType: { type: String, enum: ['percentage', 'fixed_amount', 'none'], default: 'none' },
  discountValue: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'available', 'cancelled', 'redeemed'], default: 'pending', index: true },
  availableAt: { type: Date, default: Date.now, index: true },
  awardedAt: { type: Date, default: null },
  redeemedAt: { type: Date, default: null },
  ruleId: { type: String, default: '' },
  ruleName: { type: String, default: '' },
  privateNote: { type: String, default: '' },
}, { timestamps: true });
loyaltyLedgerSchema.index({ shopDomain: 1, customerRefHash: 1, createdAt: -1 });
loyaltyLedgerSchema.index({ shopDomain: 1, customerRefHash: 1, sourceReviewHash: 1, ruleId: 1, eventType: 1 });

function modelFor(conn, name, schema, collection) {
  return conn.models[name] || conn.model(name, schema, collection);
}

function getLoyaltyModels() {
  const conn = getLoyaltyConnection();
  return {
    LoyaltyProgram: modelFor(conn, 'LoyaltyProgram', loyaltyProgramSchema, 'loyalty_programs'),
    LoyaltyLedger: modelFor(conn, 'LoyaltyLedger', loyaltyLedgerSchema, 'loyalty_ledger'),
  };
}

module.exports = { getLoyaltyModels };
