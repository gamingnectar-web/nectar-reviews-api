const ProductCreationImport = require('./productCreationImport.model');
const { extractProductFromUrl, extractBarcodeFromText } = require('./extractors/urlProductExtractor');
const { extractInvoiceProducts } = require('./extractors/invoiceExtractor');
const { matchInvoiceLinesToShopify, applyMatchesToImportDoc } = require('./services/productMatcher.service');
const { createShopifyProductFromDraft, assignImportLineToProduct } = require('./services/shopifyProduct.service');
const { normaliseDraftProduct } = require('./services/normaliseProduct.service');
const { enrichProductDraft, getProductImportMetadata, suggestProductProfile } = require('./services/productEnrichment.service');
const { suggestedRetailFromCost, toMoney, cleanText } = require('./utils/safe');
const { getProductImportSettings, saveProductImportSettings } = require('./services/productImportSettings.service');


function moneyNumber(value) {
  const clean = toMoney(value || '');
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function moneyString(value) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) > 0.0001 ? number.toFixed(2) : '';
}

function positiveMoney(value) {
  const number = Math.abs(moneyNumber(value));
  return number > 0 ? number.toFixed(2) : '';
}

function calculateNetLineTotal(line = {}) {
  const qty = Number(line.quantity || 1) || 1;
  const unit = moneyNumber(line.unitCost || 0);
  const total = moneyNumber(line.totalCost || '');
  if (total > 0 || String(line.totalCost || '').trim() === '0' || String(line.totalCost || '').trim() === '0.00') return total.toFixed(2);
  return (qty * unit).toFixed(2);
}

function calculateLineDiscountTotal(line = {}) {
  const qty = Number(line.quantity || 1) || 1;
  const explicit = Math.abs(moneyNumber(line.discountAmount || ''));
  if (explicit > 0) return explicit.toFixed(2);

  const originalUnit = moneyNumber(line.originalUnitPrice || '');
  if (originalUnit > 0) {
    const gross = originalUnit * qty;
    const net = moneyNumber(calculateNetLineTotal(line));
    const derived = gross - net;
    if (derived > 0.004) return derived.toFixed(2);
  }
  return '';
}

function calculateGrossLineTotal(line = {}) {
  const qty = Number(line.quantity || 1) || 1;
  const originalUnit = moneyNumber(line.originalUnitPrice || '');
  if (originalUnit > 0) return (originalUnit * qty).toFixed(2);
  const net = moneyNumber(calculateNetLineTotal(line));
  const discount = moneyNumber(calculateLineDiscountTotal(line));
  return (net + discount).toFixed(2);
}

function calculateGrossUnitCost(line = {}) {
  const qty = Number(line.quantity || 1) || 1;
  const originalUnit = moneyNumber(line.originalUnitPrice || '');
  if (originalUnit > 0) return originalUnit.toFixed(2);
  const gross = moneyNumber(calculateGrossLineTotal(line));
  return qty > 0 ? (gross / qty).toFixed(2) : gross.toFixed(2);
}

function calculateNetUnitCost(line = {}) {
  const qty = Number(line.quantity || 1) || 1;
  const unit = moneyNumber(line.unitCost || '');
  if (unit > 0 || String(line.unitCost || '').trim() === '0' || String(line.unitCost || '').trim() === '0.00') return unit.toFixed(2);
  const net = moneyNumber(calculateNetLineTotal(line));
  return qty > 0 ? (net / qty).toFixed(2) : net.toFixed(2);
}

function calculateLineTotal(line = {}) {
  return calculateNetLineTotal(line);
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
    saveImagesToFiles: false,
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

  const importSettings = await getProductImportSettings({ shopDomain });
  sourceDraft = { ...sourceDraft, saveImagesToFiles: sourceDraft?.saveImagesToFiles !== undefined ? sourceDraft.saveImagesToFiles : Boolean(importSettings?.imageRules?.saveSelectedImagesToFiles) };
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
    const quantity = Number(line.quantity || 1) || 1;
    const netUnitCost = calculateNetUnitCost(line);
    const grossUnitCost = calculateGrossUnitCost(line);
    const netLineTotal = calculateNetLineTotal(line);
    const grossLineTotal = calculateGrossLineTotal(line);
    const lineDiscountTotal = calculateLineDiscountTotal(line);
    return {
      lineId: line.lineId,
      title: line.title || match.productTitle || '',
      sku: line.sku || line.supplierProductCode || '',
      barcode: line.barcode || '',
      quantity,
      // unitCost remains the actually-paid/net unit cost for stock-margin reporting.
      unitCost: netUnitCost,
      netUnitCost,
      // grossUnitCost is the original/pre-discount unit cost that should be used when
      // creating a PO prompt with a separate discount so Shopify reconciles correctly.
      grossUnitCost,
      originalUnitPrice: toMoney(line.originalUnitPrice || grossUnitCost || ''),
      // totalCost remains the actually-paid/net line total for backward compatibility.
      totalCost: netLineTotal,
      netLineTotal,
      grossLineTotal,
      discountAmount: lineDiscountTotal,
      lineDiscountTotal,
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

  const grossSubtotal = sumMoney(lines.map((line) => line.grossLineTotal));
  const netProductSubtotal = sumMoney(lines.map((line) => line.netLineTotal || line.totalCost));
  const lineDiscountTotal = sumMoney(lines.map((line) => line.lineDiscountTotal || line.discountAmount));
  const extractedDiscount = moneyNumber(doc.poLevelDiscount || doc.discountTotal || '');
  const allocatedLineDiscount = moneyNumber(lineDiscountTotal);

  // If the invoice/order provided line-level discounts, those are allocated to the
  // products. Only keep any remainder as a separate order-level discount.
  const orderLevelDiscountNumber = Math.max(0, extractedDiscount - allocatedLineDiscount);
  const orderLevelDiscount = moneyString(orderLevelDiscountNumber);
  const discountTotal = moneyString(allocatedLineDiscount + orderLevelDiscountNumber) || '';
  const shippingTotal = doc.shippingTotal || '';
  const taxTotal = doc.taxTotal || '';
  const calculatedTotalNumber = moneyNumber(grossSubtotal) + moneyNumber(shippingTotal) + moneyNumber(taxTotal) - moneyNumber(discountTotal);
  const calculatedTotal = calculatedTotalNumber > 0 ? calculatedTotalNumber.toFixed(2) : netProductSubtotal;
  const total = doc.total || calculatedTotal;

  return {
    status: 'draft',
    poNumber: doc.purchaseOrder?.poNumber || `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(doc._id).slice(-5).toUpperCase()}`,
    supplierName: doc.supplierName || '',
    supplierUrl: doc.supplierUrl || '',
    currency: doc.currency || 'GBP',
    poLevelDiscount: orderLevelDiscount || doc.poLevelDiscount || '',
    invoiceNumber: doc.invoiceNumber || '',
    invoiceDate: doc.invoiceDate || '',
    lines,
    // Subtotal is now the gross product cost before discounts. This is deliberate:
    // prompt-based Shopify PO creation needs the product cost + separate discount to
    // reconcile totals such as 104.00 paid + 84.96 discount = 188.96 gross for 8 tubs.
    subtotal: grossSubtotal,
    grossSubtotal,
    netProductSubtotal,
    lineDiscountTotal,
    productDiscountTotal: lineDiscountTotal,
    orderLevelDiscount,
    discountTotal,
    shippingTotal,
    taxTotal,
    calculatedTotal,
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
  const poLines = Array.isArray(doc.purchaseOrder?.lines) ? doc.purchaseOrder.lines : [];
  const unmatched = poLines.filter((line) => !['assigned', 'created'].includes(line.matchStatus));
  if (unmatched.length) {
    const error = new Error(`Cannot formalise yet. ${unmatched.length} PO line(s) are still unmatched. Assign an existing Shopify product or create a draft product first.`);
    error.status = 400;
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

function formatPoMoney(currency, value) {
  const clean = toMoney(value || '');
  return clean ? `${currency || 'GBP'} ${clean}` : 'not set';
}

function buildPurchaseOrderPrompt({ doc, purchaseOrder }) {
  const po = purchaseOrder || doc.purchaseOrder || {};
  const currency = po.currency || doc.currency || 'GBP';
  const lines = Array.isArray(po.lines) ? po.lines : [];
  const lineText = lines.length ? lines.map((line, index) => {
    const productBits = [
      line.productTitle ? `Matched Shopify product: ${line.productTitle}` : '',
      line.handle ? `Shopify handle: ${line.handle}` : '',
      line.sku ? `SKU: ${line.sku}` : '',
      line.barcode ? `Barcode: ${line.barcode}` : '',
      line.productId ? `Shopify product ID: ${line.productId}` : '',
      line.variantId ? `Shopify variant ID: ${line.variantId}` : '',
    ].filter(Boolean).join('; ');
    const grossUnit = line.grossUnitCost || line.originalUnitPrice || line.unitCost;
    const netUnit = line.netUnitCost || line.unitCost;
    const grossLine = line.grossLineTotal || line.totalCost;
    const netLine = line.netLineTotal || line.totalCost;
    const discount = line.lineDiscountTotal || line.discountAmount;
    const costBits = [
      `Quantity: ${line.quantity || 1}`,
      `Gross/original unit cost to enter on the PO: ${formatPoMoney(currency, grossUnit)}`,
      `Paid/net unit cost after discount: ${formatPoMoney(currency, netUnit)}`,
      grossLine ? `Gross/original line total before discount: ${formatPoMoney(currency, grossLine)}` : '',
      discount ? `Product/line discount to apply: ${formatPoMoney(currency, discount)}` : '',
      netLine ? `Net line total actually paid: ${formatPoMoney(currency, netLine)}` : '',
      line.originalUnitPrice ? `Original/compare-at unit price detected: ${formatPoMoney(currency, line.originalUnitPrice)}` : '',
      line.discountLabel ? `Promotion/discount label: ${line.discountLabel}` : '',
    ].filter(Boolean).join('; ');
    return `${index + 1}. ${line.title || line.productTitle || 'Product'}\n   ${productBits || 'No Shopify product match recorded'}\n   ${costBits}`;
  }).join('\n') : 'No PO lines were found.';

  const unmatchedCount = lines.filter((line) => !['assigned', 'created'].includes(line.matchStatus)).length;
  const prompt = [
    'Can you create a purchase order draft in Shopify using the details below?',
    '',
    'Important instructions:',
    '- Use Shopify native Purchase Orders / inventory purchasing if available in this admin session.',
    '- Do not create a customer draft order or customer invoice.',
    '- Keep it as a draft purchase order unless I explicitly confirm receiving stock.',
    '- Use the matched Shopify products where product IDs, handles, SKUs or variant IDs are provided.',
    '- For product costs, use the GROSS/original unit cost when a line discount exists, then add the product/line discount so the PO total reconciles to the final paid total.',
    '- Do not double-count discounts. Product/line discounts are already allocated below. Only use an additional order-level discount if one is explicitly listed.',
    unmatchedCount ? `- ${unmatchedCount} line(s) may still need manual confirmation because they are not marked assigned/created.` : '- All lines are marked assigned or created in Nectar.',
    '',
    'Purchase order details:',
    `PO number: ${po.poNumber || 'not set'}`,
    `Supplier/vendor: ${po.supplierName || doc.supplierName || 'not set'}`,
    `Supplier URL: ${po.supplierUrl || doc.supplierUrl || 'not set'}`,
    `Currency: ${currency}`,
    `Invoice/order number: ${po.invoiceNumber || doc.invoiceNumber || 'not set'}`,
    `Invoice/order date: ${po.invoiceDate || doc.invoiceDate || 'not set'}`,
    '',
    'Products coming into stock:',
    lineText,
    '',
    'Order totals to reconcile:',
    `Gross product subtotal before discounts: ${formatPoMoney(currency, po.grossSubtotal || po.subtotal)}`,
    `Product/line discount total: ${formatPoMoney(currency, po.productDiscountTotal || po.lineDiscountTotal)}`,
    `Additional order-level discount: ${formatPoMoney(currency, po.orderLevelDiscount || po.poLevelDiscount)}`,
    `Total discount: ${formatPoMoney(currency, po.discountTotal)}`,
    `Net product subtotal after discounts: ${formatPoMoney(currency, po.netProductSubtotal)}`,
    `Shipping: ${formatPoMoney(currency, po.shippingTotal)}`,
    `Tax: ${formatPoMoney(currency, po.taxTotal)}`,
    `Final paid total: ${formatPoMoney(currency, po.total)}`,
    po.calculatedTotal && po.total && po.calculatedTotal !== po.total ? `Calculated check total: ${formatPoMoney(currency, po.calculatedTotal)}. The invoice final paid total should be treated as source of truth.` : '',
    '',
    po.notes ? `Notes:\n${po.notes}` : 'Notes: none',
    '',
    'Please ask me to confirm any missing supplier, cost, quantity, product match or receiving-location information before finalising.'
  ].filter((line) => line !== '').join('\n');
  return prompt;
}

async function createPurchaseOrderPrompt({ shopDomain, importId }) {
  const doc = await ProductCreationImport.findOne({ _id: importId, shopDomain }).lean();
  if (!doc) {
    const error = new Error('Import not found.');
    error.status = 404;
    throw error;
  }
  if (!doc.purchaseOrder || !['draft', 'formalised'].includes(doc.purchaseOrder.status)) {
    const error = new Error('Create a draft PO before generating a Shopify prompt.');
    error.status = 400;
    throw error;
  }
  const prompt = buildPurchaseOrderPrompt({ doc, purchaseOrder: doc.purchaseOrder });
  return { prompt, purchaseOrder: doc.purchaseOrder, importId: String(doc._id) };
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
  createPurchaseOrderPrompt,
};
