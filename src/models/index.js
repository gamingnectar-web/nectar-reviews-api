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
  reviewScope: { type: String, enum: ['product', 'site'], default: 'product', index: true },
  productTitle: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  productUrl: { type: String, default: '' },
  externalProductId: { type: String, default: '' },
  source: { type: String, enum: ['website', 'email', 'import'], default: 'website' },
  sourcePlatform: { type: String, default: '' },
  sourceLabel: { type: String, default: '' },
  externalReviewId: { type: String, default: '', index: true },
  importBatchId: { type: String, default: '', index: true },
  media: { type: [mongoose.Schema.Types.Mixed], default: [] },
  duplicateHash: { type: String, default: '', index: true },
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
reviewSchema.index({ shopDomain: 1, reviewScope: 1, status: 1, createdAt: -1 });
reviewSchema.index({ shopDomain: 1, sourcePlatform: 1, externalReviewId: 1 });
reviewSchema.index({ shopDomain: 1, duplicateHash: 1 });
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
    widgetBackground: { type: String, default: 'none' },
    reviewCardBackground: { type: String, default: '#ffffff' },
  },
  cardStyles: {
    starSize: { type: Number, default: 14 },
    showCount: { type: Boolean, default: true },
    badgeBackground: { type: String, default: '#111827' },
    badgeTextColor: { type: String, default: '#ffffff' },
    badgeStarColor: { type: String, default: '#ffc700' },
    badgeRadius: { type: Number, default: 999 },
    badgeLayout: { type: String, default: 'pill' },
    badgePosition: { type: String, default: 'below' },
    badgePadding: { type: String, default: '6px 12px' },
    badgeLabel: { type: String, default: '4.8 (12)' },
  },
  carouselStyles: {
    layout: { type: String, enum: ['grid', 'infinite', 'masonry'], default: 'infinite' },
    autoplay: { type: Boolean, default: true },
    delay: { type: Number, default: 4000 },
    showArrows: { type: Boolean, default: false },
    limit: { type: Number, default: 10 },
  },
  migrationMode: {
    enabled: { type: Boolean, default: false },
    sourcePlatform: { type: String, default: 'yotpo' },
    yotpoStillLive: { type: Boolean, default: true },
    nectarWidgetsEnabled: { type: Boolean, default: false },
    nectarEmailsEnabled: { type: Boolean, default: false },
    duplicateSchemaProtection: { type: Boolean, default: true },
    importOnlyPublished: { type: Boolean, default: true },
    importVerifiedWhenAvailable: { type: Boolean, default: true },
    lastCheckedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  reviewWidgetLibrary: { type: [mongoose.Schema.Types.Mixed], default: [] },
  testCentre: {
    shopifyFlowConfirmed: { type: Boolean, default: false },
    flowConfirmedAt: { type: Date, default: null },
    flowConfirmedBy: { type: String, default: '' },
    lastScenario: { type: String, default: 'reviews' },
  },
  supportSettings: {
    supportEmail: { type: String, default: '' },
    supportFromName: { type: String, default: 'Customer Support' },
    supportHeading: { type: String, default: 'Need help with your order?' },
    supportText: { type: String, default: 'If something did not go to plan, tell customer service before leaving a review.' },
    supportButtonText: { type: String, default: 'Contact customer service' },
    missingOrderKeywords: { type: [String], default: ['missing', 'not arrived', 'not received', 'lost', 'missing item', 'wrong item', 'damaged'] },
  },
  fontOverrides: {
    reviews: { type: [mongoose.Schema.Types.Mixed], default: [] },
    loyalty: { type: [mongoose.Schema.Types.Mixed], default: [] },
    cartRewards: { type: [mongoose.Schema.Types.Mixed], default: [] },
    general: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  reviewAutomation: {
    enabled: { type: Boolean, default: true },
    mode: { type: String, enum: ['native', 'flow', 'manual'], default: 'native' },
    nativeEnabled: { type: Boolean, default: true },
    flowEnabled: { type: Boolean, default: false },
    trigger: { type: String, enum: ['orders/fulfilled', 'fulfillments/create', 'manual'], default: 'orders/fulfilled' },
    deliveryTagRequired: { type: Boolean, default: true },
    deliveryTag: { type: String, default: 'delivered' },
    deliveryAnchor: { type: String, enum: ['fulfilled_at', 'delivered_tag'], default: 'delivered_tag' },
    delayDays: { type: Number, default: 14, min: 0, max: 365 },
    sendWindowHour: { type: Number, default: 10, min: 0, max: 23 },
    sendWindowTimezone: { type: String, default: 'store' },
    campaign: { type: String, default: 'native_review_request' },
    subject: { type: String, default: 'How was your recent order?' },
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
  subject: { type: String, default: '' },
  templateName: { type: String, default: '' },
  layoutName: { type: String, default: '' },
  moduleNames: { type: [String], default: [] },
  htmlHash: { type: String, default: '' },
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


const emailProviderProfileSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  name: { type: String, default: 'Email provider' },
  enabled: { type: Boolean, default: true },
  provider: { type: String, default: 'smtp' },
  smtpHost: { type: String, default: '' },
  smtpPort: { type: Number, default: 587 },
  secureMode: { type: String, enum: ['starttls', 'ssl', 'none'], default: 'starttls' },
  smtpUser: { type: String, default: '' },
  smtpPassEncrypted: { type: String, default: '' },
  fromName: { type: String, default: '' },
  fromEmail: { type: String, default: '' },
  replyToEmail: { type: String, default: '' },
  primaryFor: { type: [String], default: [] },
  lastUsedAt: { type: Date },
  lastTestedAt: { type: Date },
  lastTestStatus: { type: String, default: '' },
  lastTestError: { type: String, default: '' },
}, { timestamps: true });
emailProviderProfileSchema.index({ shopDomain: 1, name: 1 });


const emailTemplateSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  name: { type: String, required: true, default: 'Review request template' },
  area: { type: String, enum: ['reviews', 'loyalty', 'cartRewards', 'general'], default: 'reviews', index: true },
  kind: { type: String, enum: ['review_request', 'manual_reminder', 'general'], default: 'review_request', index: true },
  enabled: { type: Boolean, default: true, index: true },
  isPrimary: { type: Boolean, default: false, index: true },
  subject: { type: String, default: 'How was your recent order?' },
  previewText: { type: String, default: '' },
  design: { type: mongoose.Schema.Types.Mixed, default: {} },
  sections: { type: [mongoose.Schema.Types.Mixed], default: [] },
  html: { type: String, default: '' },
  notes: { type: String, default: '' },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true });
emailTemplateSchema.index({ shopDomain: 1, area: 1, kind: 1, isPrimary: 1 });
emailTemplateSchema.index({ shopDomain: 1, area: 1, kind: 1, updatedAt: -1 });


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


const e2eTestRunSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  scenario: { type: String, default: 'reviews', index: true },
  status: { type: String, enum: ['validated', 'blocked', 'running', 'awaiting_customer', 'completed', 'failed'], default: 'validated', index: true },
  recipientEmail: { type: String, default: '' },
  fakeOrderId: { type: String, default: '', index: true },
  fakeCustomerName: { type: String, default: '' },
  reviewToken: { type: String, default: '' },
  reviewUrl: { type: String, default: '' },
  discountCode: { type: String, default: '' },
  prerequisites: { type: [mongoose.Schema.Types.Mixed], default: [] },
  steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
  artifacts: { type: mongoose.Schema.Types.Mixed, default: {} },
  blockedReason: { type: String, default: '' },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true });
e2eTestRunSchema.index({ shopDomain: 1, createdAt: -1 });
e2eTestRunSchema.index({ shopDomain: 1, scenario: 1, createdAt: -1 });



const supportRequestSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  orderId: { type: String, default: '', index: true },
  email: { type: String, default: '', index: true },
  customerName: { type: String, default: '' },
  orderDate: { type: Date, default: null },
  subject: { type: String, default: '' },
  message: { type: String, default: '' },
  products: { type: [mongoose.Schema.Types.Mixed], default: [] },
  affectedProducts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  issueType: { type: String, default: '' },
  reviewToken: { type: String, default: '', index: true },
  status: { type: String, enum: ['received', 'emailed', 'email_failed'], default: 'received', index: true },
  notificationError: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  ipHash: { type: String, default: '' },
}, { timestamps: true });
supportRequestSchema.index({ shopDomain: 1, createdAt: -1 });

const reviewRequestProductSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  productId: { type: String, default: '' },
  variantId: { type: String, default: '' },
  title: { type: String, default: 'Purchased product' },
  handle: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const reviewRequestJobSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  source: { type: String, default: 'native_scheduler', index: true },
  orderId: { type: String, required: true, index: true },
  orderName: { type: String, default: '' },
  customerEmail: { type: String, default: '', index: true },
  customerName: { type: String, default: 'Customer' },
  products: { type: [reviewRequestProductSchema], default: [] },
  delayDays: { type: Number, default: 14 },
  fulfilledAt: { type: Date, default: Date.now },
  deliveredAt: { type: Date, default: null },
  orderTags: { type: [String], default: [] },
  deliveryRequired: { type: Boolean, default: true },
  requiredDeliveryTag: { type: String, default: 'delivered' },
  scheduledAt: { type: Date, default: Date.now, index: true },
  sentAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ['awaiting_delivery', 'scheduled', 'sending', 'sent', 'blocked', 'failed', 'cancelled', 'skipped'], default: 'scheduled', index: true },
  blockedReason: { type: String, default: '' },
  errorMessage: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
  lastAttemptAt: { type: Date, default: null },
  reviewToken: { type: String, default: '', index: true },
  reviewUrl: { type: String, default: '' },
  webhookId: { type: String, default: '', index: true },
  campaign: { type: String, default: 'native_review_request' },
  testMode: { type: Boolean, default: false, index: true },
}, { timestamps: true });
reviewRequestJobSchema.index({ shopDomain: 1, orderId: 1, customerEmail: 1 }, { unique: true });
reviewRequestJobSchema.index({ shopDomain: 1, status: 1, scheduledAt: 1 });

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
    reviews: {
      enabled: { type: Boolean, default: true },
      webhookInstalledAt: { type: Date, default: null },
      webhookManualConfirmedAt: { type: Date, default: null },
      webhookSource: { type: String, default: '' },
      webhookMode: { type: String, default: '' },
      webhookTopics: { type: [String], default: [] },
      webhookAddresses: { type: [String], default: [] },
      webhookAddress: { type: String, default: '' },
      webhookTopic: { type: String, default: '' },
      webhookVerificationStatus: { type: String, default: '' },
      webhookVerificationCheckedAt: { type: Date, default: null },
      webhookRegistrationResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
      webhookInspectionResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
      manualSetupFinalised: { type: Boolean, default: false },
      manualSetupFinalisedAt: { type: Date, default: null },
      lastWebhookReceivedAt: { type: Date, default: null },
      lastWebhookTopic: { type: String, default: '' },
      lastWebhookId: { type: String, default: '' },
      lastWebhookOrderId: { type: String, default: '' },
      lastWebhookOrderName: { type: String, default: '' },
      lastOrdersFulfilledWebhookAt: { type: Date, default: null },
      lastOrdersUpdatedWebhookAt: { type: Date, default: null },
      webhookReceiptCount: { type: Number, default: 0 },
      ordersFulfilledReceiptCount: { type: Number, default: 0 },
      ordersUpdatedReceiptCount: { type: Number, default: 0 },
    },
    discounts: { enabled: { type: Boolean, default: false } },
    loyalty: { enabled: { type: Boolean, default: false } },
    referrals: { enabled: { type: Boolean, default: false } },
    productCreationImport: { enabled: { type: Boolean, default: true } },
  },
}, { timestamps: true });

module.exports = {
  Review: mongoose.models.Review || mongoose.model('Review', reviewSchema, 'reviews'),
  Settings: mongoose.models.Settings || mongoose.model('Settings', settingsSchema, 'settings'),
  CampaignEvent: mongoose.models.CampaignEvent || mongoose.model('CampaignEvent', campaignEventSchema, 'campaign_events'),
  EmailProviderSettings: mongoose.models.EmailProviderSettings || mongoose.model('EmailProviderSettings', emailProviderSettingsSchema, 'email_provider_settings'),
  EmailProviderProfile: mongoose.models.EmailProviderProfile || mongoose.model('EmailProviderProfile', emailProviderProfileSchema, 'email_provider_profiles'),
  EmailTemplate: mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', emailTemplateSchema, 'email_templates'),
  Shop: mongoose.models.Shop || mongoose.model('Shop', shopSchema, 'shops'),
  E2ETestRun: mongoose.models.E2ETestRun || mongoose.model('E2ETestRun', e2eTestRunSchema, 'e2e_test_runs'),
  ReviewRequestJob: mongoose.models.ReviewRequestJob || mongoose.model('ReviewRequestJob', reviewRequestJobSchema, 'review_request_jobs'),
  SupportRequest: mongoose.models.SupportRequest || mongoose.model('SupportRequest', supportRequestSchema, 'support_requests'),
  // Loyalty models intentionally live in src/modules/loyalty/loyalty.models.js
  // so they can bind to LOYALTY_DB_URI instead of the core reviews database.

};
