const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  itemId: { type: String, required: true, index: true },
  userId: { type: String, required: true, default: 'Guest' },
  email: { type: String, default: '' },
  isAnonymous: { type: Boolean, default: false },
  rating: { type: Number, required: true, min: 1, max: 5 },
  headline: { type: String, default: '' },
  comment: { type: String, default: '' },
  reply: { type: String, default: '' },
  replyVisibility: { type: String, enum: ['public', 'private'], default: 'public' },
  attributes: { type: Map, of: Number },
  productTags: { type: Array, default: [] },
  source: { type: String, enum: ['website', 'email', 'import'], default: 'website' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold', 'spam'], default: 'pending' },
  verifiedPurchase: { type: Boolean, default: false },
  verificationNote: { type: String, default: '' },
  orderId: { type: String, default: '' },
  reviewToken: { type: String, default: '', index: true },
  reviewTokenUsedAt: { type: Date, default: null },
  isTestReview: { type: Boolean, default: false },
  testMode: { type: Boolean, default: false },
  testLabel: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

reviewSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2419200 });
reviewSchema.index({ shopDomain: 1, createdAt: -1 });
reviewSchema.index({ shopDomain: 1, itemId: 1, status: 1 });
reviewSchema.index({ shopDomain: 1, reviewToken: 1 }, { sparse: true });

const settingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  betaMode: {
    enabled: { type: Boolean, default: false },
    email: { type: String, default: '' },
  },
  emailsSentTotal: { type: Number, default: 0 },
  trashRetentionDays: { type: Number, default: 28, min: 1, max: 28 },
  autoApproveEnabled: { type: Boolean, default: false },
  autoApproveType: { type: String, enum: ['verified', 'all'], default: 'verified' },
  autoApproveMinStars: { type: Number, default: 4 },
  attributeProfiles: { type: Array, default: [] },
  seo: {
    richSnippets: { type: Boolean, default: true },
  },
  widgetStyles: {
    widgetTitle: { type: String, default: 'Customer Reviews' },
    primaryColor: { type: String, default: '#000000' },
    starColor: { type: String, default: '#ffc700' },
    textSize: { type: Number, default: 15 },
    layoutStyle: { type: String, enum: ['clean', 'cards', 'compact', 'carousel'], default: 'clean' },
    previewState: { type: String, enum: ['reviews', 'empty'], default: 'reviews' },
    emptyMode: { type: String, enum: ['simple', 'boxed', 'hidden', 'stars_text'], default: 'simple' },
    emptyText: { type: String, default: 'No reviews yet. Be the first to write one.' },
    maxWidth: { type: Number, default: 1160 },
    reviewStarSize: { type: Number, default: 52 },
    reviewStarAlignment: { type: String, default: 'left' },
    headerAlignment: { type: String, default: 'left' },
    buttonStyle: { type: String, enum: ['solid', 'pill', 'outline'], default: 'solid' },
    buttonRadius: { type: Number, default: 8 },
    cardRadius: { type: Number, default: 14 },
    showSummary: { type: Boolean, default: true },
    showVerifiedLabel: { type: Boolean, default: true },
    sliderTrackColor: { type: String, default: '#e6ebf1' },
    sliderKnobColor: { type: String, default: '#111111' },
  },
  cardStyles: {
    starSize: { type: Number, default: 14 },
    showCount: { type: Boolean, default: true },
    badgeBackground: { type: String, default: '#111827' },
    badgeTextColor: { type: String, default: '#ffffff' },
    badgeStarColor: { type: String, default: '#ffc700' },
    badgeRadius: { type: Number, default: 999 },
  },
  carouselStyles: {
    layout: { type: String, enum: ['grid', 'infinite', 'masonry'], default: 'infinite' },
    autoplay: { type: Boolean, default: true },
    delay: { type: Number, default: 4000 },
    showArrows: { type: Boolean, default: false },
    limit: { type: Number, default: 10 },
  },
}, { timestamps: true });

const campaignEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  campaign: { type: String, default: 'review_request' },
  eventType: { type: String, enum: ['sent', 'open', 'click'], required: true, index: true },
  orderId: { type: String, default: '' },
  email: { type: String, default: '' },
  itemId: { type: String, default: '' },
  url: { type: String, default: '' },
  token: { type: String, default: '' },
  uniqueKey: { type: String, default: '', index: true },
  userAgent: { type: String, default: '' },
  ipHash: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
});
campaignEventSchema.index({ shopDomain: 1, eventType: 1, createdAt: -1 });
campaignEventSchema.index({ shopDomain: 1, token: 1, eventType: 1 });
campaignEventSchema.index({ shopDomain: 1, uniqueKey: 1, eventType: 1 });

const emailProviderSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  provider: { type: String, default: 'none' },
  smtpHost: { type: String, default: '' },
  smtpPort: { type: Number, default: 587 },
  secureMode: { type: String, enum: ['starttls', 'ssl', 'none'], default: 'starttls' },
  smtpUser: { type: String, default: '' },
  smtpPassEncrypted: { type: String, default: '' },
  fromName: { type: String, default: '' },
  fromEmail: { type: String, default: '' },
  replyToEmail: { type: String, default: '' },
  lastTestedAt: { type: Date },
  lastTestStatus: { type: String, default: '' },
  lastTestError: { type: String, default: '' },
}, { timestamps: true });


const loyaltyRewardTemplateSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Review thank-you discount' },
  enabled: { type: Boolean, default: false },
  trigger: { type: String, enum: ['review_submitted', 'review_approved'], default: 'review_approved' },
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
  trigger: { type: String, enum: ['review_submitted', 'review_approved'], default: 'review_approved' },
  points: { type: Number, default: 100, min: 0 },
  delayDays: { type: Number, default: 28, min: 0, max: 365 },
  verifiedOnly: { type: Boolean, default: true },
  minStars: { type: Number, default: 1, min: 1, max: 5 },
  maxAwardsPerOrder: { type: Number, default: 1, min: 0, max: 50 },
}, { _id: false });

const loyaltyProgramSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  privacyMode: { type: String, default: 'hashed_customer_ref' },
  rewardTemplates: { type: [loyaltyRewardTemplateSchema], default: [] },
  pointsRules: { type: [loyaltyPointsRuleSchema], default: [] },
}, { timestamps: true });

const loyaltyLedgerSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerRefHash: { type: String, required: true, index: true },
  eventType: { type: String, enum: ['points_award', 'discount_reward'], required: true },
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

const shopSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  accessTokenEncrypted: { type: String, default: '' },
  scopes: { type: String, default: '' },
  installSource: { type: String, default: 'oauth' },
  lastOAuthAt: { type: Date, default: null },
  installedAt: { type: Date, default: Date.now },
  uninstalledAt: { type: Date, default: null },
  plan: { type: String, default: 'development' },
  modules: {
    reviews: { enabled: { type: Boolean, default: true } },
    discounts: { enabled: { type: Boolean, default: false } },
    loyalty: { enabled: { type: Boolean, default: false } },
    referrals: { enabled: { type: Boolean, default: false } },
  },
}, { timestamps: true });

module.exports = {
  Review: mongoose.models.Review || mongoose.model('Review', reviewSchema, 'reviews'),
  Settings: mongoose.models.Settings || mongoose.model('Settings', settingsSchema, 'settings'),
  CampaignEvent: mongoose.models.CampaignEvent || mongoose.model('CampaignEvent', campaignEventSchema, 'campaign_events'),
  EmailProviderSettings: mongoose.models.EmailProviderSettings || mongoose.model('EmailProviderSettings', emailProviderSettingsSchema, 'email_provider_settings'),
  Shop: mongoose.models.Shop || mongoose.model('Shop', shopSchema, 'shops'),
  // Loyalty models intentionally live in src/modules/loyalty/loyalty.models.js
  // so they can bind to LOYALTY_DB_URI instead of the core reviews database.

};
