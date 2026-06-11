const mongoose = require('mongoose');

const importedLineSchema = new mongoose.Schema({
  lineId: { type: String, required: true },
  title: { type: String, default: '' },
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' },
  supplierProductCode: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  unitCost: { type: String, default: '' },
  netUnitCost: { type: String, default: '' },
  grossUnitCost: { type: String, default: '' },
  originalUnitPrice: { type: String, default: '' },
  totalCost: { type: String, default: '' },
  netLineTotal: { type: String, default: '' },
  grossLineTotal: { type: String, default: '' },
  discountAmount: { type: String, default: '' },
  lineDiscountTotal: { type: String, default: '' },
  discountLabel: { type: String, default: '' },
  suggestedRetailPrice: { type: String, default: '' },
  weight: { type: String, default: '' },
  weightUnit: { type: String, default: 'g' },
  imageUrl: { type: String, default: '' },
  imageDescription: { type: String, default: '' },
  imageSearchQuery: { type: String, default: '' },
  sourceUrl: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  includeInPurchaseOrder: { type: Boolean, default: true },
  poLineType: { type: String, enum: ['stock', 'non_stock_charge', 'landing_item', 'excluded'], default: 'stock' },
  poTreatmentNote: { type: String, default: '' },
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

const poLineSchema = new mongoose.Schema({
  lineId: { type: String, default: '' },
  title: { type: String, default: '' },
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  unitCost: { type: String, default: '' },
  netUnitCost: { type: String, default: '' },
  grossUnitCost: { type: String, default: '' },
  originalUnitPrice: { type: String, default: '' },
  totalCost: { type: String, default: '' },
  netLineTotal: { type: String, default: '' },
  grossLineTotal: { type: String, default: '' },
  discountAmount: { type: String, default: '' },
  lineDiscountTotal: { type: String, default: '' },
  discountLabel: { type: String, default: '' },
  suggestedRetailPrice: { type: String, default: '' },
  weight: { type: String, default: '' },
  weightUnit: { type: String, default: 'g' },
  productId: { type: String, default: '' },
  variantId: { type: String, default: '' },
  productTitle: { type: String, default: '' },
  handle: { type: String, default: '' },
  image: { type: String, default: '' },
  matchStatus: { type: String, default: 'unmatched' },
  includeInPurchaseOrder: { type: Boolean, default: true },
  poLineType: { type: String, enum: ['stock', 'non_stock_charge', 'landing_item', 'excluded'], default: 'stock' },
  poTreatmentNote: { type: String, default: '' },
  note: { type: String, default: '' },
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  status: { type: String, enum: ['none', 'draft', 'formalised'], default: 'none' },
  poNumber: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  supplierUrl: { type: String, default: '' },
  currency: { type: String, default: 'GBP' },
  poLevelDiscount: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  invoiceDate: { type: String, default: '' },
  lines: { type: [poLineSchema], default: [] },
  excludedLines: { type: [poLineSchema], default: [] },
  nonStockChargesTotal: { type: String, default: '' },
  removedLinesTotal: { type: String, default: '' },
  subtotal: { type: String, default: '' },
  grossSubtotal: { type: String, default: '' },
  netProductSubtotal: { type: String, default: '' },
  lineDiscountTotal: { type: String, default: '' },
  productDiscountTotal: { type: String, default: '' },
  orderLevelDiscount: { type: String, default: '' },
  discountTotal: { type: String, default: '' },
  shippingTotal: { type: String, default: '' },
  taxTotal: { type: String, default: '' },
  calculatedTotal: { type: String, default: '' },
  total: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdAt: { type: Date },
  updatedAt: { type: Date },
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
  shippingTotal: { type: String, default: '' },
  taxTotal: { type: String, default: '' },
  discountTotal: { type: String, default: '' },
  poLevelDiscount: { type: String, default: '' },
  notes: { type: String, default: '' },
  originalFilename: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  lines: { type: [importedLineSchema], default: [] },
  draft: { type: mongoose.Schema.Types.Mixed, default: {} },
  purchaseOrder: { type: purchaseOrderSchema, default: () => ({ status: 'none' }) },
  createdShopifyProduct: { type: mongoose.Schema.Types.Mixed, default: null },
  errors: { type: [String], default: [] },
}, { timestamps: true, collection: 'product_creation_imports', suppressReservedKeysWarning: true });

productCreationImportSchema.index({ shopDomain: 1, sourceUrl: 1 });
productCreationImportSchema.index({ shopDomain: 1, createdAt: -1 });
productCreationImportSchema.index({ shopDomain: 1, 'lines.sku': 1 });
productCreationImportSchema.index({ shopDomain: 1, 'lines.barcode': 1 });
productCreationImportSchema.index({ shopDomain: 1, 'purchaseOrder.status': 1, createdAt: -1 });

const skuRuleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  name: { type: String, default: '' },
  vendorContains: { type: String, default: '' },
  vendorCode: { type: String, default: '' },
  productLineContains: { type: String, default: '' },
  lineCode: { type: String, default: '' },
  tagContains: { type: String, default: '' },
  metafieldNamespace: { type: String, default: 'core' },
  metafieldKey: { type: String, default: 'formula_version' },
  template: { type: String, default: '{vendorCode}-{lineCode}-{titleCode}' },
  overwriteExistingSku: { type: Boolean, default: false },
}, { _id: false });

const skuPrefixRulesSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  mode: { type: String, enum: ['vendor_first_two', 'custom', 'none'], default: 'vendor_first_two' },
  customPrefix: { type: String, default: '' },
  separator: { type: String, default: '-' },
  overwriteExistingSku: { type: Boolean, default: false },
}, { _id: false });

const conditionalRuleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  name: { type: String, default: '' },
  whenField: { type: String, default: 'title' },
  operator: { type: String, enum: ['contains', 'equals', 'starts_with', 'ends_with', 'exists'], default: 'contains' },
  value: { type: String, default: '' },
  actionType: { type: String, enum: ['add_tag', 'recommend_tag', 'set_product_type', 'set_vendor', 'set_metafield', 'set_theme_template', 'add_collection', 'title_prefix', 'title_suffix'], default: 'recommend_tag' },
  actionTarget: { type: String, default: '' },
  actionValue: { type: String, default: '' },
}, { _id: false });

const metafieldMappingRuleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  name: { type: String, default: '' },
  vendorContains: { type: String, default: '' },
  productTypeContains: { type: String, default: '' },
  tagContains: { type: String, default: '' },
  titleContains: { type: String, default: '' },
  target: { type: String, default: '' },
  mode: { type: String, enum: ['fixed', 'ai', 'copy_from_similar'], default: 'fixed' },
  value: { type: String, default: '' },
}, { _id: false });

const productCreationImportSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  handleRules: {
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    pattern: { type: String, default: '{vendor}-{title}-{format}-{location}' },
    format: { type: String, default: 'tub' },
    location: { type: String, default: 'uk' },
    maxLength: { type: Number, default: 180 },
    separator: { type: String, default: '-' },
    overwriteExistingHandle: { type: Boolean, default: false },
  },
  skuPrefixRules: { type: skuPrefixRulesSchema, default: () => ({}) },
  skuRules: { type: [skuRuleSchema], default: [] },
  conditionalRules: { type: [conditionalRuleSchema], default: [] },
  metafieldMappingRules: { type: [metafieldMappingRuleSchema], default: [] },
  defaultCurrency: { type: String, default: 'GBP' },
  vendorPresets: { type: [String], default: [] },
  imageRules: {
    saveSelectedImagesToFiles: { type: Boolean, default: false },
    generateSeoAltText: { type: Boolean, default: true },
    dedupeByCanonicalUrl: { type: Boolean, default: true },
  },
}, { timestamps: true, collection: 'product_creation_import_settings' });

const ProductCreationImport = mongoose.models.ProductCreationImport || mongoose.model('ProductCreationImport', productCreationImportSchema);
const ProductCreationImportSettings = mongoose.models.ProductCreationImportSettings || mongoose.model('ProductCreationImportSettings', productCreationImportSettingsSchema);

module.exports = ProductCreationImport;
module.exports.ProductCreationImportSettings = ProductCreationImportSettings;
