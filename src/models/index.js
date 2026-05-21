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
    emptyMode: { type: String, default: 'stars_text' },
    emptyText: { type: String, default: 'No reviews yet.' },
    maxWidth: { type: Number, default: 1160 },
    reviewStarSize: { type: Number, default: 52 },
    reviewStarAlignment: { type: String, default: 'center' },
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
  userAgent: { type: String, default: '' },
  ipHash: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
});
campaignEventSchema.index({ shopDomain: 1, eventType: 1, createdAt: -1 });
campaignEventSchema.index({ shopDomain: 1, token: 1, eventType: 1 });

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
};
