const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  accessToken: { type: String, default: '' },
  accessTokenEncrypted: { type: String, default: '' },
  scopes: { type: String, default: '' },
  installedAt: { type: Date, default: Date.now },
  uninstalledAt: { type: Date, default: null },
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  brandName: { type: String, default: 'Nectar Reviews' },
  widgetEnabled: { type: Boolean, default: true },
  schemaEnabled: { type: Boolean, default: false },
  trashRetentionDays: { type: Number, default: 28 },
  migrationMode: { type: mongoose.Schema.Types.Mixed, default: {} },
  reviewRequest: { type: mongoose.Schema.Types.Mixed, default: {} },
  emailSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const reviewSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  itemId: { type: String, required: true, index: true },
  reviewScope: { type: String, enum: ['product', 'site'], default: 'product', index: true },
  productHandle: { type: String, default: '', index: true },
  productTitle: { type: String, default: '' },
  productUrl: { type: String, default: '' },
  externalProductId: { type: String, default: '', index: true },
  userId: { type: String, default: 'Customer' },
  email: { type: String, default: '' },
  orderId: { type: String, default: '' },
  rating: { type: Number, min: 1, max: 5, required: true },
  headline: { type: String, default: '' },
  comment: { type: String, default: '' },
  media: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sourceUrl: { type: String, default: '' },
  duplicateHash: { type: String, default: '', index: true },
  importedAt: { type: Date, default: null },
  source: { type: String, enum: ['website', 'email', 'import', 'admin', 'shop'], default: 'website' },
  sourcePlatform: { type: String, default: '', index: true },
  sourceLabel: { type: String, default: '' },
  externalReviewId: { type: String, default: '', index: true },
  importBatchId: { type: String, default: '', index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold', 'spam', 'test', 'skipped'], default: 'pending', index: true },
  verifiedPurchase: { type: Boolean, default: false },
  verificationNote: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });
reviewSchema.index({ shopDomain: 1, itemId: 1, status: 1 });
reviewSchema.index({ shopDomain: 1, reviewScope: 1, status: 1 });
reviewSchema.index({ shopDomain: 1, sourcePlatform: 1, externalReviewId: 1 });
reviewSchema.index({ shopDomain: 1, duplicateHash: 1 });

const reviewTokenSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  orderId: { type: String, default: '' },
  email: { type: String, default: '' },
  itemIds: { type: [String], default: [] },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

const supportRequestSchema = new mongoose.Schema({
  shopDomain: { type: String, index: true },
  email: String,
  orderId: String,
  orderDate: String,
  message: String,
  status: { type: String, default: 'open' },
}, { timestamps: true });

const campaignEventSchema = new mongoose.Schema({
  shopDomain: { type: String, index: true },
  campaignId: String,
  token: String,
  eventType: String,
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
campaignEventSchema.index({ shopDomain: 1, campaignId: 1, token: 1, eventType: 1 }, { unique: false });

const moduleStatusSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  moduleKey: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  live: { type: Boolean, default: false },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
moduleStatusSchema.index({ shopDomain: 1, moduleKey: 1 }, { unique: true });

module.exports = {
  Shop: mongoose.models.Shop || mongoose.model('Shop', shopSchema, 'shops'),
  Settings: mongoose.models.Settings || mongoose.model('Settings', settingsSchema, 'settings'),
  Review: mongoose.models.Review || mongoose.model('Review', reviewSchema, 'reviews'),
  ReviewToken: mongoose.models.ReviewToken || mongoose.model('ReviewToken', reviewTokenSchema, 'review_tokens'),
  SupportRequest: mongoose.models.SupportRequest || mongoose.model('SupportRequest', supportRequestSchema, 'support_requests'),
  CampaignEvent: mongoose.models.CampaignEvent || mongoose.model('CampaignEvent', campaignEventSchema, 'campaign_events'),
  ModuleStatus: mongoose.models.ModuleStatus || mongoose.model('ModuleStatus', moduleStatusSchema, 'module_statuses'),
};
