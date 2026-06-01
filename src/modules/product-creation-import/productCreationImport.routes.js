const express = require('express');
const { cleanUrl, cleanText } = require('./utils/safe');
const {
  analyseInvoiceAndSave,
  assignLine,
  createDraftProduct,
  createPurchaseOrderDraft,
  updatePurchaseOrderLineTreatment,
  formalisePurchaseOrderDraft,
  createPurchaseOrderPrompt,
  getProductImportSettings,
  saveProductImportSettings,
  getImportHistory,
  listPurchaseOrderDrafts,
  suggestBarcodeForDraft,
  getProductImportMetadata,
  matchImportLines,
  saveManualDraft,
  scanUrlAndSave,
  suggestProductProfile,
} = require('./productCreationImport.service');
const {
  createBatch,
  listBatches,
  getBatch,
  updateBatchDefaults,
  addBatchItems,
  scanBatch,
  enrichBatch,
  updateBatchItem,
  setBatchItemApproval,
  createShopifyDraftsForBatch,
} = require('./services/productImportBatch.service');
const { healthCheckShopify, searchShopifyProducts } = require('./services/shopifyProduct.service');

const router = express.Router();

function shopDomainFromReq(req) {
  return req.shopDomain || req.query.shopDomain || req.body?.shopDomain || req.headers['x-shop-domain'] || req.headers['x-shopify-shop-domain'] || '';
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.get('/health', asyncRoute(async (req, res) => {
  const shopDomain = shopDomainFromReq(req);
  const shopify = await healthCheckShopify(shopDomain);
  res.json({ ok: true, module: 'PRODUCT CREATION & PRODUCT IMPORT', shopify, invoiceVision: Boolean(process.env.OPENAI_API_KEY), batchImport: true });
}));

router.get('/metadata', asyncRoute(async (req, res) => {
  const metadata = await getProductImportMetadata({ shopDomain: shopDomainFromReq(req) });
  res.json(metadata);
}));

router.get('/settings', asyncRoute(async (req, res) => {
  const settings = await getProductImportSettings({ shopDomain: shopDomainFromReq(req) });
  res.json({ settings });
}));

router.post('/settings', asyncRoute(async (req, res) => {
  const settings = await saveProductImportSettings({ shopDomain: shopDomainFromReq(req), settings: req.body?.settings || {} });
  res.json({ settings });
}));

router.post('/profile/suggest', asyncRoute(async (req, res) => {
  const suggestion = await suggestProductProfile({ shopDomain: shopDomainFromReq(req), draft: req.body?.draft || {} });
  res.json({ suggestion });
}));

// Batch product import workspace. This keeps the existing single URL / invoice / manual flows intact,
// but adds a parent batch that can contain any number of supplier/product URLs and shared defaults.
router.get('/batches', asyncRoute(async (req, res) => {
  const result = await listBatches({ shopDomain: shopDomainFromReq(req), limit: req.query.limit || 30 });
  res.json(result);
}));

router.post('/batches', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await createBatch({
    shopDomain: shopDomainFromReq(req),
    name: body.name || '',
    defaults: body.defaults || {},
    links: body.links || body.urls || body.linkText || '',
    manualItems: Array.isArray(body.manualItems) ? body.manualItems : [],
  });
  res.json(result);
}));

router.get('/batches/:batchId', asyncRoute(async (req, res) => {
  const result = await getBatch({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId });
  res.json(result);
}));

router.patch('/batches/:batchId/defaults', asyncRoute(async (req, res) => {
  const result = await updateBatchDefaults({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId, defaults: req.body?.defaults || {} });
  res.json(result);
}));

router.post('/batches/:batchId/items', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await addBatchItems({
    shopDomain: shopDomainFromReq(req),
    batchId: req.params.batchId,
    links: body.links || body.urls || body.linkText || '',
    manualItems: Array.isArray(body.manualItems) ? body.manualItems : [],
  });
  res.json(result);
}));

router.post('/batches/:batchId/scan', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await scanBatch({
    shopDomain: shopDomainFromReq(req),
    batchId: req.params.batchId,
    itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
    limit: body.limit || 20,
    processAll: Boolean(body.processAll),
    useAi: body.useAi !== false,
  });
  res.json(result);
}));

router.post('/batches/:batchId/enrich', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await enrichBatch({
    shopDomain: shopDomainFromReq(req),
    batchId: req.params.batchId,
    itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
    useAi: body.useAi !== false,
  });
  res.json(result);
}));

router.patch('/batches/:batchId/items/:itemId', asyncRoute(async (req, res) => {
  const result = await updateBatchItem({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId, itemId: req.params.itemId, patch: req.body || {} });
  res.json(result);
}));

router.post('/batches/:batchId/items/:itemId/approval', asyncRoute(async (req, res) => {
  const result = await setBatchItemApproval({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId, itemId: req.params.itemId, approvalStatus: req.body?.approvalStatus || 'approved' });
  res.json(result);
}));

router.post('/batches/:batchId/create-shopify-drafts', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await createShopifyDraftsForBatch({
    shopDomain: shopDomainFromReq(req),
    batchId: req.params.batchId,
    itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
    approvedOnly: body.approvedOnly !== false,
  });
  res.json(result);
}));

router.post('/barcode/suggest', asyncRoute(async (req, res) => {
  const suggestion = await suggestBarcodeForDraft({ shopDomain: shopDomainFromReq(req), draft: req.body?.draft || {} });
  res.json(suggestion);
}));

router.post('/url/scan', asyncRoute(async (req, res) => {
  const shopDomain = shopDomainFromReq(req);
  const url = cleanUrl(req.body?.url || '');
  if (!url) return res.status(400).json({ error: 'A valid public product URL is required.' });
  const result = await scanUrlAndSave({ shopDomain, url });
  res.json(result);
}));

router.post('/invoice/analyse', asyncRoute(async (req, res) => {
  const shopDomain = shopDomainFromReq(req);
  const body = req.body || {};
  const imageDataUrl = String(body.imageDataUrl || '');
  if (imageDataUrl.length > 4_500_000) return res.status(413).json({ error: 'Invoice image is too large after compression. Please crop it or upload a smaller screenshot.' });
  const result = await analyseInvoiceAndSave({
    shopDomain,
    imageDataUrl,
    mimeType: cleanText(body.mimeType || '', 120),
    filename: cleanText(body.filename || '', 220),
    notes: cleanText(body.notes || '', 12000),
    supplierUrl: cleanUrl(body.supplierUrl || ''),
    supplierName: cleanText(body.supplierName || '', 180),
    currency: cleanText(body.currency || '', 10),
    discountTotal: cleanText(body.discountTotal || '', 40),
    shippingTotal: cleanText(body.shippingTotal || '', 40),
    taxTotal: cleanText(body.taxTotal || '', 40),
    total: cleanText(body.total || '', 40),
    autoMatch: body.autoMatch !== false,
  });
  res.json(result);
}));

router.get('/products/search', asyncRoute(async (req, res) => {
  const shopDomain = shopDomainFromReq(req);
  const products = await searchShopifyProducts({ shopDomain, q: req.query.q || '', first: req.query.first || 10 });
  res.json({ products });
}));

router.post('/match', asyncRoute(async (req, res) => {
  const result = await matchImportLines({ shopDomain: shopDomainFromReq(req), importId: req.body?.importId || '', lines: Array.isArray(req.body?.lines) ? req.body.lines : [] });
  res.json(result);
}));

router.post('/drafts', asyncRoute(async (req, res) => {
  const result = await saveManualDraft({ shopDomain: shopDomainFromReq(req), draft: req.body?.draft || {} });
  res.json(result);
}));

router.post('/shopify/create', asyncRoute(async (req, res) => {
  const result = await createDraftProduct({ shopDomain: shopDomainFromReq(req), draft: req.body?.draft, importId: req.body?.importId || '', lineId: req.body?.lineId || '' });
  res.json(result);
}));

router.post('/shopify/assign', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!body.importId || !body.lineId || !body.productId) return res.status(400).json({ error: 'importId, lineId and productId are required.' });
  const result = await assignLine({ shopDomain: shopDomainFromReq(req), importId: body.importId, lineId: body.lineId, productId: body.productId, variantId: body.variantId || '', productTitle: body.productTitle || '', handle: body.handle || '', image: body.image || '' });
  res.json(result);
}));

router.post('/purchase-order/draft', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!body.importId) return res.status(400).json({ error: 'importId is required.' });
  const result = await createPurchaseOrderDraft({ shopDomain: shopDomainFromReq(req), importId: body.importId, lines: Array.isArray(body.lines) ? body.lines : [], purchaseOrder: body.purchaseOrder || {} });
  res.json(result);
}));

router.post('/purchase-order/line-treatment', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!body.importId || !body.lineId) return res.status(400).json({ error: 'importId and lineId are required.' });
  const result = await updatePurchaseOrderLineTreatment({
    shopDomain: shopDomainFromReq(req),
    importId: body.importId,
    lineId: body.lineId,
    poLineType: body.poLineType || 'stock',
    includeInPurchaseOrder: body.includeInPurchaseOrder,
    poTreatmentNote: body.poTreatmentNote || '',
  });
  res.json(result);
}));

router.post('/purchase-order/formalise', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!body.importId) return res.status(400).json({ error: 'importId is required.' });
  const result = await formalisePurchaseOrderDraft({ shopDomain: shopDomainFromReq(req), importId: body.importId, purchaseOrder: body.purchaseOrder || {} });
  res.json(result);
}));

router.post('/purchase-order/prompt', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!body.importId) return res.status(400).json({ error: 'importId is required.' });
  const result = await createPurchaseOrderPrompt({ shopDomain: shopDomainFromReq(req), importId: body.importId });
  res.json(result);
}));

router.get('/purchase-orders', asyncRoute(async (req, res) => {
  const result = await listPurchaseOrderDrafts({ shopDomain: shopDomainFromReq(req), limit: req.query.limit || 40 });
  res.json(result);
}));

router.get('/history', asyncRoute(async (req, res) => {
  const result = await getImportHistory({ shopDomain: shopDomainFromReq(req), limit: req.query.limit || 25 });
  res.json(result);
}));

module.exports = router;
