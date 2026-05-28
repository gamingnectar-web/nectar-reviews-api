const mongoose = require('mongoose');

const sourcePlatforms = [
  'yotpo',
  'shop_app',
  'shopify_native',
  'judgeme',
  'weebly',
  'square',
  'generic',
  'manual',
];

const migrationBatchSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  sourcePlatform: { type: String, enum: sourcePlatforms, default: 'generic', index: true },
  mode: { type: String, enum: ['csv', 'api', 'storefront_scan', 'manual'], default: 'csv', index: true },
  status: {
    type: String,
    enum: ['preview', 'ready', 'importing', 'imported', 'partial', 'failed', 'cancelled'],
    default: 'preview',
    index: true,
  },
  fileName: { type: String, default: '' },
  csvHeaders: { type: [String], default: [] },
  options: { type: mongoose.Schema.Types.Mixed, default: {} },
  summary: {
    totalRows: { type: Number, default: 0 },
    productReviews: { type: Number, default: 0 },
    siteReviews: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    needsMapping: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  importStartedAt: { type: Date, default: null },
  importedAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, suppressReservedKeysWarning: true });

migrationBatchSchema.index({ shopDomain: 1, createdAt: -1 });

const stagedReviewSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'ReviewMigrationBatch' },
  sourcePlatform: { type: String, enum: sourcePlatforms, default: 'generic', index: true },
  rowIndex: { type: Number, required: true },
  rowHash: { type: String, default: '', index: true },
  externalReviewId: { type: String, default: '', index: true },
  reviewScope: { type: String, enum: ['product', 'site'], default: 'product', index: true },
  status: {
    type: String,
    enum: ['matched', 'needs_mapping', 'site_review', 'skipped', 'duplicate', 'imported', 'failed'],
    default: 'needs_mapping',
    index: true,
  },
  issue: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  sourceRow: { type: mongoose.Schema.Types.Mixed, default: {} },
  normalized: { type: mongoose.Schema.Types.Mixed, default: {} },
  productCandidates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  selectedProduct: { type: mongoose.Schema.Types.Mixed, default: null },
  importedReviewId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
}, { timestamps: true });

stagedReviewSchema.index({ shopDomain: 1, batchId: 1, rowIndex: 1 }, { unique: true });
stagedReviewSchema.index({ shopDomain: 1, sourcePlatform: 1, externalReviewId: 1 });
stagedReviewSchema.index({ shopDomain: 1, batchId: 1, status: 1 });

const storefrontScanSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running', index: true },
  source: { type: String, default: 'storefront_scan' },
  options: { type: mongoose.Schema.Types.Mixed, default: {} },
  summary: {
    productsChecked: { type: Number, default: 0 },
    pagesChecked: { type: Number, default: 0 },
    yotpoDetected: { type: Boolean, default: false },
    shopSignalsDetected: { type: Boolean, default: false },
    schemaReviewsDetected: { type: Boolean, default: false },
    aggregateRatingsDetected: { type: Number, default: 0 },
    potentialPublicReviews: { type: Number, default: 0 },
    importableRows: { type: Number, default: 0 },
  },
  discoveries: { type: [mongoose.Schema.Types.Mixed], default: [] },
  errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
  completedAt: { type: Date, default: null },
}, { timestamps: true, suppressReservedKeysWarning: true });

storefrontScanSchema.index({ shopDomain: 1, createdAt: -1 });

module.exports = {
  ReviewMigrationBatch: mongoose.models.ReviewMigrationBatch || mongoose.model('ReviewMigrationBatch', migrationBatchSchema, 'review_migration_batches'),
  ReviewMigrationStagedReview: mongoose.models.ReviewMigrationStagedReview || mongoose.model('ReviewMigrationStagedReview', stagedReviewSchema, 'review_migration_staged_reviews'),
  ReviewStorefrontScan: mongoose.models.ReviewStorefrontScan || mongoose.model('ReviewStorefrontScan', storefrontScanSchema, 'review_storefront_scans'),
};
