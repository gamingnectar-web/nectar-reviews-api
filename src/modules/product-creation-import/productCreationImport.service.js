const ProductCreationImport = require('./productCreationImport.model');
const { extractProductFromUrl, extractBarcodeFromText } = require('./extractors/urlProductExtractor');
const { extractInvoiceProducts } = require('./extractors/invoiceExtractor');
const { matchInvoiceLinesToShopify, applyMatchesToImportDoc } = require('./services/productMatcher.service');
const { createShopifyProductFromDraft, assignImportLineToProduct } = require('./services/shopifyProduct.service');
const { normaliseDraftProduct } = require('./services/normaliseProduct.service');
const { enrichProductDraft, getProductImportMetadata, suggestProductProfile } = require('./services/productEnrichment.service');
const { suggestedRetailFromCost, toMoney, cleanText } = require('./utils/safe');
const { getProductImportSettings, saveProductImportSettings } = require('./services/productImportSettings.service');

function calculateLineTotal(line = {}) {
  const qty = Number(line.quantity || 1) || 1;
  const unit = Number(toMoney(line.unitCost || 0)) || 0;
  const total = Number(toMoney(line.totalCost || ''));
  if (Number.isFinite(total) && total > 0) return total.toFixed(2);
  return (qty * unit).toFixed(2);
}

function sumMoney(values = []) {
  const total = values.reduce((sum, value) => sum + (Number(toMoney(value)) || 0), 0);
  return total ? total.toFixed(2) : '';
}

async function scanUrlAndSave({ shopDomain, url }) {
  const extracted = await extractProductFromUrl(url);
  const draft = await enrichProductDraft({ shopDomain, draft: extracted });
  const doc = await ProductCreationImport.create({ shopDomain, type: 'url', status: 'analysed', sourceUrl: draft.sourceUrl, confidence: draft.confidence, draft });
  return { import: doc, draft };
}

async function analyseInvoiceAndSave({ shopDomain, imageDataUrl, mimeType, filename, notes, supplierUrl, supplierName = '', currency = '', discountTotal = '', shippingTotal = '', taxTotal = '', total = '', autoMatch = true }) {
  const extracted = await extractInvoiceProducts({ imageDataUrl, mimeType, filename, notes, supplierUrl });
  const doc = await ProductCreationImport.create({
    shopDomain,
    type: 'invoice',
    status: 'analysed',
    supplierUrl: extracted.supplierUrl || supplierUrl,
    supplierName: cleanText(supplierName || extracted.supplierName || '', 180),
    invoiceNumber: extracted.invoiceNumber,
    invoiceDate: extracted.invoiceDate,
    currency: cleanText(currency || extracted.currency || 'GBP', 10).toUpperCase(),
    total: toMoney(total || extracted.total),
    shippingTotal: toMoney(shippingTotal || extracted.shippingTotal),
    taxTotal: toMoney(taxTotal || extracted.taxTotal),
    discountTotal: toMoney(discountTotal || extracted.discountTotal),
    notes,
    originalFilename: filename || '',
    mimeType: mimeType || '',
    confidence: extracted.confidence,
    lines: extracted.lines,
    errors: extracted.warning ? [extracted.warning] : [],
  });

  if (autoMatch && doc.lines.length) {
    const matches = await matchInvoiceLinesToShopify({ shopDomain, lines: doc.lines });
    applyMatchesToImportDoc(doc, matches);
    await doc.save();
    return { import: doc, extracted, matches, warning: extracted.warning };
  }
  return { import: doc, extracted, matches: [], warning: extracted.warning };
}

async function matchImportLines({ shopDomain, importId, lines }) {
  let sourceLines = Array.isArray(lines) ? lines : [];
  let doc = null;
  if (importId) {
    doc = await ProductCreationImport.findOne({ _id: importId, shopDomain });
    if (!doc) {
      const error = new Error('Import not found.');
      error.status = 404;
      throw error;
    }
    sourceLines = sourceLines.length ? sourceLines : doc.lines;
  }
  const matches = await matchInvoiceLinesToShopify({ shopDomain, lines: sourceLines });
  if (doc) {
    applyMatchesToImportDoc(doc, matches);
    await doc.save();
    return { import: doc, matches };
  }
  return { matches };
}

async function saveManualDraft({ shopDomain, draft }) {
  const normalised = await enrichProductDraft({ shopDomain, draft: { ...draft, source: draft?.source || 'manual' } });
  const doc = await ProductCreationImport.create({ shopDomain, type: 'manual', status: 'draft', sourceUrl: normalised.sourceUrl, draft: normalised, confidence: 1 });
  return { import: doc, draft: normalised };
}

function lineToDraft(line, importDoc) {
  return normaliseDraftProduct({
    source: 'invoice',
    sourceUrl: line.sourceUrl || importDoc.supplierUrl || '',
    title: line.title || line.sku || line.supplierProductCode || 'Imported product',
    description: `Created from supplier invoice${importDoc.invoiceNumber ? ` ${importDoc.invoiceNumber}` : ''}.${line.discountLabel ? ` Promotion: ${line.discountLabel}.` : ''}${line.imageDescription ? ` Image note: ${line.imageDescription}.` : ''}`,
    vendor: importDoc.supplierName || '',
    productType: '',
    tags: ['invoice-import', importDoc.supplierName ? `supplier-${importDoc.supplierName}` : ''].filter(Boolean),
    price: line.suggestedRetailPrice || suggestedRetailFromCost(line.unitCost),
    cost: line.unitCost,
    compareAtPrice: line.originalUnitPrice || '',
    sku: line.sku || line.supplierProductCode,
    barcode: line.barcode,
    weight: line.weight || '',
    weightUnit: line.weightUnit || 'g',
    quantity: line.quantity || 1,
    images: line.imageUrl ? [{ src: line.imageUrl, alt: line.title }] : [],
    seo: { title: line.title, description: line.title },
  });
}

async function createDraftProduct({ shopDomain, draft, importId, lineId }) {
  let sourceDraft = draft;
  let doc = null;

  if (importId) {
    doc = await ProductCreationImport.findOne({ _id: importId, shopDomain });
    if (!doc) {
      const error = new Error('Import not found.');
      error.status = 404;
      throw error;
    }
    if (!sourceDraft && lineId) {
      const line = doc.lines.find((item) => item.lineId === lineId);
      if (!line) {
        const error = new Error('Import line not found.');
        error.status = 404;
        throw error;
      }
      sourceDraft = lineToDraft(line, doc);
    }
    if (!sourceDraft) sourceDraft = doc.draft;
  }

  sourceDraft = await enrichProductDraft({ shopDomain, draft: sourceDraft });
  const created = await createShopifyProductFromDraft({ shopDomain, draft: sourceDraft });

  if (doc) {
    if (lineId) {
      const line = doc.lines.find((item) => item.lineId === lineId);
      if (line) {
        line.match = { status: 'created', score: 1, productId: created.id, variantId: created.variantId || '', productTitle: created.title, handle: created.handle, image: created.image || '', reason: 'Created as new Shopify draft product.' };
      }
      doc.status = doc.lines.every((item) => ['assigned', 'created'].includes(item.match?.status)) ? 'created' : 'partial';
    } else {
      doc.createdShopifyProduct = created;
      doc.status = 'created';
    }
    await doc.save();
  }

  return { product: created, import: doc };
}

async function assignLine({ shopDomain, importId, lineId, productId, variantId, productTitle, handle, image }) {
  const doc = await ProductCreationImport.findOne({ _id: importId, shopDomain });
  if (!doc) {
    const error = new Error('Import not found.');
    error.status = 404;
    throw error;
  }
  const updated = await assignImportLineToProduct({ importDoc: doc, lineId, productId, variantId, productTitle, handle, image });
  return { import: updated };
}

function buildPurchaseOrderDraft(doc, overrideLines = []) {
  const lines = (overrideLines.length ? overrideLines : doc.lines).map((line) => {
    const match = line.match || {};
    return {
      lineId: line.lineId,
      title: line.title || match.productTitle || '',
      sku: line.sku || line.supplierProductCode || '',
      barcode: line.barcode || '',
      quantity: Number(line.quantity || 1) || 1,
      unitCost: toMoney(line.unitCost || ''),
      originalUnitPrice: toMoney(line.originalUnitPrice || ''),
      totalCost: calculateLineTotal(line),
      discountAmount: toMoney(line.discountAmount || ''),
      discountLabel: cleanText(line.discountLabel || '', 220),
      suggestedRetailPrice: toMoney(line.suggestedRetailPrice || ''),
      weight: line.weight || '',
      weightUnit: line.weightUnit || 'g',
      productId: match.productId || '',
      variantId: match.variantId || '',
      productTitle: match.productTitle || '',
      handle: match.handle || '',
      image: match.image || line.imageUrl || '',
      matchStatus: match.status || 'unmatched',
      note: match.reason || '',
    };
  });
  const subtotal = sumMoney(lines.map((line) => line.totalCost));
  // PO-level discount is the source of truth for purchase-order totals. Line discounts are
  // retained on each row as context, but are not auto-subtracted because invoice/order line
  // totals are usually already final paid totals and subtracting both would double-discount.
  const discountTotal = doc.poLevelDiscount || doc.discountTotal || '';
  const shippingTotal = doc.shippingTotal || '';
  const taxTotal = doc.taxTotal || '';
  const totalNumber = [subtotal, shippingTotal, taxTotal].reduce((sum, value) => sum + (Number(toMoney(value)) || 0), 0) - (Number(toMoney(discountTotal)) || 0);
  const total = doc.total || (totalNumber > 0 ? totalNumber.toFixed(2) : subtotal);
  return {
    status: 'draft',
    poNumber: doc.purchaseOrder?.poNumber || `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(doc._id).slice(-5).toUpperCase()}`,
    supplierName: doc.supplierName || '',
    supplierUrl: doc.supplierUrl || '',
    currency: doc.currency || 'GBP',
    poLevelDiscount: doc.poLevelDiscount || doc.discountTotal || '',
    invoiceNumber: doc.invoiceNumber || '',
    invoiceDate: doc.invoiceDate || '',
    lines,
    subtotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    total,
    notes: doc.purchaseOrder?.notes || '',
    createdAt: doc.purchaseOrder?.createdAt || new Date(),
    updatedAt: new Date(),
  };
}

async function createPurchaseOrderDraft({ shopDomain, importId, lines = [], purchaseOrder = {} }) {
  const doc = await ProductCreationImport.findOne({ _id: importId, shopDomain });
  if (!doc) {
    const error = new Error('Import not found.');
    error.status = 404;
    throw error;
  }
  if (purchaseOrder.supplierName !== undefined) doc.supplierName = cleanText(purchaseOrder.supplierName || '', 180);
  if (purchaseOrder.supplierUrl !== undefined) doc.supplierUrl = cleanText(purchaseOrder.supplierUrl || '', 500);
  if (purchaseOrder.currency !== undefined) doc.currency = cleanText(purchaseOrder.currency || 'GBP', 10).toUpperCase();
  if (purchaseOrder.discountTotal !== undefined) doc.discountTotal = toMoney(purchaseOrder.discountTotal || '');
  if (purchaseOrder.poLevelDiscount !== undefined) doc.poLevelDiscount = toMoney(purchaseOrder.poLevelDiscount || '');
  if (purchaseOrder.shippingTotal !== undefined) doc.shippingTotal = toMoney(purchaseOrder.shippingTotal || '');
  if (purchaseOrder.taxTotal !== undefined) doc.taxTotal = toMoney(purchaseOrder.taxTotal || '');
  if (purchaseOrder.total !== undefined) doc.total = toMoney(purchaseOrder.total || '');

  const mergedLines = Array.isArray(lines) && lines.length ? doc.lines.map((line) => {
    const edited = lines.find((candidate) => candidate.lineId === line.lineId);
    return edited ? { ...line.toObject?.() || line, ...edited } : line;
  }) : [];
  doc.purchaseOrder = buildPurchaseOrderDraft(doc, mergedLines);
  await doc.save();
  return { import: doc, purchaseOrder: doc.purchaseOrder };
}

async function formalisePurchaseOrderDraft({ shopDomain, importId, purchaseOrder = {} }) {
  const doc = await ProductCreationImport.findOne({ _id: importId, shopDomain });
  if (!doc) {
    const error = new Error('Import not found.');
    error.status = 404;
    throw error;
  }
  doc.purchaseOrder = {
    ...doc.purchaseOrder,
    ...purchaseOrder,
    status: 'formalised',
    updatedAt: new Date(),
  };
  await doc.save();
  return { import: doc, purchaseOrder: doc.purchaseOrder };
}


async function suggestBarcodeForDraft({ shopDomain, draft = {} }) {
  const title = cleanText(draft.title || '', 220);
  const sourceUrl = draft.sourceUrl || draft.url || '';
  if (sourceUrl) {
    try {
      const extracted = await extractProductFromUrl(sourceUrl);
      if (extracted.barcode) return { barcode: extracted.barcode, source: 'source page/schema' };
      const text = [extracted.title, extracted.descriptionHtml, extracted.sourceUrl].join(' ');
      const barcode = extractBarcodeFromText(text);
      if (barcode) return { barcode, source: 'source page text' };
    } catch (_) {}
  }

  const providerUrl = process.env.BARCODE_LOOKUP_API_URL || '';
  if (providerUrl && title) {
    try {
      const url = new URL(providerUrl);
      url.searchParams.set('q', title);
      if (draft.vendor) url.searchParams.set('vendor', draft.vendor);
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const json = await response.json().catch(() => ({}));
      const barcode = cleanText(json.barcode || json.gtin || json.ean || json.upc || '', 40).replace(/\D/g, '');
      if (barcode) return { barcode, source: 'configured barcode lookup provider' };
    } catch (error) {
      return { barcode: '', source: 'configured barcode lookup provider', message: `Barcode provider failed: ${error.message || 'unknown error'}` };
    }
  }
  return { barcode: '', message: 'No barcode found on the source page. Add BARCODE_LOOKUP_API_URL if you want web-wide barcode lookup from a dedicated provider.' };
}

async function listPurchaseOrderDrafts({ shopDomain, limit = 40 }) {
  const items = await ProductCreationImport.find({ shopDomain, 'purchaseOrder.status': { $in: ['draft', 'formalised'] } })
    .sort({ 'purchaseOrder.updatedAt': -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 40, 100))
    .lean();
  return { items };
}

async function getImportHistory({ shopDomain, limit = 25 }) {
  const items = await ProductCreationImport.find({ shopDomain }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 25, 100)).lean();
  return { items };
}

module.exports = {
  scanUrlAndSave,
  analyseInvoiceAndSave,
  matchImportLines,
  saveManualDraft,
  createDraftProduct,
  assignLine,
  getProductImportSettings,
  saveProductImportSettings,
  getImportHistory,
  listPurchaseOrderDrafts,
  suggestBarcodeForDraft,
  getProductImportMetadata,
  suggestProductProfile,
  createPurchaseOrderDraft,
  formalisePurchaseOrderDraft,
};
