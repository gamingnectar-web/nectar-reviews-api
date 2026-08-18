const mongoose = require('mongoose');

const imageCandidateSchema = new mongoose.Schema({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  score: { type: Number, default: 0 },
  reason: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  rejected: { type: Boolean, default: false },
  rejectReason: { type: String, default: '' },
  canonicalKey: { type: String, default: '' },
  source: { type: String, default: '' },
  originalIndex: { type: Number, default: 0 },
  role: { type: String, default: '' },
  roleConfidence: { type: Number, default: 0 },
  roleReason: { type: String, default: '' },
}, { _id: false });

const batchItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  sourceType: { type: String, enum: ['url', 'manual', 'invoice_line', 'photo'], default: 'url' },
  sourceUrl: { type: String, default: '' },
  sourceWebsite: { type: String, default: '' },
  sourceImageDataUrl: { type: String, default: '' },
  originalInput: { type: String, default: '' },
  title: { type: String, default: '' },
  vendor: { type: String, default: '' },
  productType: { type: String, default: '' },
  productCategory: { type: String, default: '' },
  templateSuffix: { type: String, default: '' },
  status: { type: String, enum: ['queued', 'scanning', 'analysed', 'needs_review', 'approved', 'creating', 'created', 'failed', 'skipped'], default: 'queued' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  confidence: { type: Number, default: 0 },
  draft: { type: mongoose.Schema.Types.Mixed, default: {} },
  extractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  aiEnrichment: { type: mongoose.Schema.Types.Mixed, default: {} },
  nutrition: { type: mongoose.Schema.Types.Mixed, default: {} },
  metafieldPlan: { type: [mongoose.Schema.Types.Mixed], default: [] },
  imageCandidates: { type: [imageCandidateSchema], default: [] },
  selectedImages: { type: [imageCandidateSchema], default: [] },
  rejectedImages: { type: [imageCandidateSchema], default: [] },
  supplementLabelImages: { type: [imageCandidateSchema], default: [] },
  suggestions: { type: mongoose.Schema.Types.Mixed, default: {} },
  visualEvidence: { type: mongoose.Schema.Types.Mixed, default: {} },
  requiredChecks: { type: [mongoose.Schema.Types.Mixed], default: [] },
  validation: {
    status: { type: String, enum: ['unchecked', 'ready', 'warning', 'blocked'], default: 'unchecked' },
    issues: { type: [String], default: [] },
  },
  shopifyProduct: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: String, default: '' },
  scannedAt: { type: Date },
  approvedAt: { type: Date },
  createdAt: { type: Date },
  updatedAt: { type: Date },
}, { _id: false });

const batchDefaultsSchema = new mongoose.Schema({
  supplierName: { type: String, default: '' },
  supplierUrl: { type: String, default: '' },
  brand: { type: String, default: '' },
  vendor: { type: String, default: '' },
  productType: { type: String, default: '' },
  productCategory: { type: String, default: '' },
  themeTemplate: { type: String, default: '' },
  collections: { type: [String], default: [] },
  recommendedTags: { type: [String], default: [] },
  currency: { type: String, default: 'GBP' },
  handleFormat: { type: String, default: '' },
  handleLocation: { type: String, default: '' },
}, { _id: false });

const productImportBatchSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  name: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  supplierUrl: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'queued', 'analysing', 'needs_review', 'partial', 'approved', 'creating', 'created', 'failed'], default: 'draft', index: true },
  defaults: { type: batchDefaultsSchema, default: () => ({}) },
  items: { type: [batchItemSchema], default: [] },
  summary: {
    total: { type: Number, default: 0 },
    queued: { type: Number, default: 0 },
    analysed: { type: Number, default: 0 },
    needsReview: { type: Number, default: 0 },
    approved: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  errors: { type: [String], default: [] },
}, { timestamps: true, collection: 'product_import_batches', suppressReservedKeysWarning: true });

productImportBatchSchema.index({ shopDomain: 1, createdAt: -1 });
productImportBatchSchema.index({ shopDomain: 1, status: 1, createdAt: -1 });
productImportBatchSchema.index({ shopDomain: 1, 'items.sourceUrl': 1 });
productImportBatchSchema.index({ shopDomain: 1, 'items.status': 1 });

const ProductImportBatch = mongoose.models.ProductImportBatch || mongoose.model('ProductImportBatch', productImportBatchSchema);

module.exports = ProductImportBatch;
