const mongoose = require('mongoose');

const importedLineSchema = new mongoose.Schema({
  lineId: { type: String, required: true },
  title: { type: String, default: '' },
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' },
  supplierProductCode: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  unitCost: { type: String, default: '' },
  totalCost: { type: String, default: '' },
  suggestedRetailPrice: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  sourceUrl: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  match: {
    status: { type: String, enum: ['unmatched', 'suggested', 'assigned', 'created'], default: 'unmatched' },
    score: { type: Number, default: 0 },
    productId: { type: String, default: '' },
    variantId: { type: String, default: '' },
    productTitle: { type: String, default: '' },
    handle: { type: String, default: '' },
    image: { type: String, default: '' },
    reason: { type: String, default: '' }
  }
}, { _id: false });

const productCreationImportSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  type: { type: String, enum: ['invoice', 'url', 'manual'], required: true, index: true },
  status: { type: String, enum: ['draft', 'analysed', 'matched', 'partial', 'created', 'failed'], default: 'draft', index: true },
  sourceUrl: { type: String, default: '' },
  supplierUrl: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  invoiceDate: { type: String, default: '' },
  currency: { type: String, default: 'GBP' },
  total: { type: String, default: '' },
  notes: { type: String, default: '' },
  originalFilename: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  lines: { type: [importedLineSchema], default: [] },
  draft: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdShopifyProduct: { type: mongoose.Schema.Types.Mixed, default: null },
  errors: { type: [String], default: [] },
}, { timestamps: true, collection: 'product_creation_imports' });

productCreationImportSchema.index({ shopDomain: 1, sourceUrl: 1 });
productCreationImportSchema.index({ shopDomain: 1, createdAt: -1 });
productCreationImportSchema.index({ shopDomain: 1, 'lines.sku': 1 });
productCreationImportSchema.index({ shopDomain: 1, 'lines.barcode': 1 });

module.exports = mongoose.models.ProductCreationImport || mongoose.model('ProductCreationImport', productCreationImportSchema);
