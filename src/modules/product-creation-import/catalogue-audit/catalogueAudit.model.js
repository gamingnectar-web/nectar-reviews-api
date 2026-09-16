const mongoose = require('mongoose');

const brandProfileSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  brandKey: { type: String, required: true, index: true },
  name: { type: String, required: true },
  canonicalVendor: { type: String, default: '' },
  website: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  aboutBrand: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
  seoTitle: { type: String, default: '' },
  seoDescription: { type: String, default: '' },
  productFamilies: { type: [String], default: [] },
  coreProductLines: { type: [mongoose.Schema.Types.Mixed], default: [] },
  alwaysApply: { type: [mongoose.Schema.Types.Mixed], default: [] },
  conditionalRules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  aliases: { type: [String], default: [] },
  productTypes: { type: [String], default: [] },
  collections: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  defaultTemplate: { type: String, default: '' },
  claims: { type: [String], default: [] },
  howToUse: { type: String, default: '' },
  storage: { type: String, default: '' },
  warnings: { type: String, default: '' },
  countryOfOrigin: { type: String, default: '' },
  sourceUrls: { type: [String], default: [] },
  source: { type: String, enum: ['shopify', 'supplier', 'mixed', 'manual'], default: 'manual' },
  confidence: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'approved'], default: 'draft' },
  lastAuditedAt: { type: Date, default: null },
  evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'product_brand_profiles' });

brandProfileSchema.index({ shopDomain: 1, brandKey: 1 }, { unique: true });

const auditProductSchema = new mongoose.Schema({
  supplierUrl: { type: String, default: '' },
  supplierTitle: { type: String, default: '' },
  supplierHandle: { type: String, default: '' },
  supplierImage: { type: String, default: '' },
  supplierVendor: { type: String, default: '' },
  shopifyProductId: { type: String, default: '' },
  shopifyTitle: { type: String, default: '' },
  shopifyHandle: { type: String, default: '' },
  status: {
    type: String,
    enum: ['missing', 'matched', 'possible_match', 'needs_update', 'ignored'],
    default: 'missing',
  },
  matchScore: { type: Number, default: 0 },
  missingFields: { type: [String], default: [] },
  weakFields: { type: [String], default: [] },
}, { _id: false });

const catalogueAuditSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  sourceUrl: { type: String, required: true },
  supplierHost: { type: String, default: '' },
  brandName: { type: String, default: '' },
  brandKey: { type: String, default: '' },
  status: { type: String, enum: ['running', 'complete', 'failed'], default: 'running', index: true },
  discoveredCount: { type: Number, default: 0 },
  matchedCount: { type: Number, default: 0 },
  missingCount: { type: Number, default: 0 },
  possibleMatchCount: { type: Number, default: 0 },
  needsUpdateCount: { type: Number, default: 0 },
  coveragePercent: { type: Number, default: 0 },
  brandProfileMissing: { type: Boolean, default: false },
  brandProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductBrandProfile', default: null },
  products: { type: [auditProductSchema], default: [] },
  missingBrandFields: { type: [String], default: [] },
  suggestedBrand: { type: mongoose.Schema.Types.Mixed, default: {} },
  discoveryMethod: { type: String, default: '' },
  error: { type: String, default: '' },
  completedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'product_catalogue_audits' });

catalogueAuditSchema.index({ shopDomain: 1, createdAt: -1 });

const ProductBrandProfile = mongoose.models.ProductBrandProfile ||
  mongoose.model('ProductBrandProfile', brandProfileSchema);
const ProductCatalogueAudit = mongoose.models.ProductCatalogueAudit ||
  mongoose.model('ProductCatalogueAudit', catalogueAuditSchema);

module.exports = { ProductBrandProfile, ProductCatalogueAudit };
