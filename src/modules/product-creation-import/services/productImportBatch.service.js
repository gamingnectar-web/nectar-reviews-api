const ProductImportBatch = require('../productImportBatch.model');
const { extractProductFromUrl } = require('../extractors/urlProductExtractor');
const { normaliseDraftProduct } = require('./normaliseProduct.service');
const { enrichProductDraft } = require('./productEnrichment.service');
const { createShopifyProductFromDraft } = require('./shopifyProduct.service');
const { scoreAndSelectProductImages } = require('./imageCandidateScoring.service');
const { refineImagePlanWithAi } = require('./productMediaClassifier.service');
const { extractNutritionAndProductProfile } = require('./nutritionProfileExtractor.service');
const { applyProfileToDraft, profileToMetafields, mergeMetafields } = require('./metafieldSchemaRegistry.service');
const { cleanText, cleanUrl, makeLineId, parseTags, normaliseMetafields } = require('../utils/safe');

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/\n|,|\s(?=https?:\/\/)/i).map((item) => item.trim()).filter(Boolean);
  return [];
}

function parseLinks(value) {
  return asArray(value)
    .flatMap((item) => String(item || '').split(/\n/))
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ originalInput: item, sourceUrl: cleanUrl(item) }))
    .filter((item) => item.sourceUrl);
}

function cleanDefaults(defaults = {}) {
  return {
    supplierName: cleanText(defaults.supplierName || '', 180),
    supplierUrl: cleanUrl(defaults.supplierUrl || ''),
    brand: cleanText(defaults.brand || '', 120),
    vendor: cleanText(defaults.vendor || defaults.brand || '', 120),
    productType: cleanText(defaults.productType || '', 120),
    productCategory: cleanText(defaults.productCategory || '', 180),
    themeTemplate: cleanText(defaults.themeTemplate || defaults.templateSuffix || '', 80).replace(/^product\./i, ''),
    collections: Array.from(new Set(parseTags(defaults.collections || []))).slice(0, 40),
    recommendedTags: Array.from(new Set(parseTags(defaults.recommendedTags || []))).slice(0, 40),
    currency: cleanText(defaults.currency || 'GBP', 10).toUpperCase(),
    handleFormat: cleanText(defaults.handleFormat || defaults.format || '', 80),
    handleLocation: cleanText(defaults.handleLocation || defaults.location || '', 80),
  };
}

function buildBatchItem({ url = {}, manual = {}, index = 0, defaults = {} }) {
  const sourceUrl = cleanUrl(url.sourceUrl || manual.sourceUrl || manual.url || '');
  const title = cleanText(manual.title || manual.name || '', 220);
  return {
    itemId: manual.itemId || makeLineId(index),
    sourceType: sourceUrl ? 'url' : 'manual',
    sourceUrl,
    originalInput: cleanText(url.originalInput || manual.originalInput || sourceUrl || title, 1000),
    title,
    vendor: cleanText(manual.vendor || defaults.vendor || defaults.brand || '', 120),
    productType: cleanText(manual.productType || defaults.productType || '', 120),
    productCategory: cleanText(manual.productCategory || defaults.productCategory || '', 180),
    templateSuffix: cleanText(manual.themeTemplate || defaults.themeTemplate || '', 80).replace(/^product\./i, ''),
    status: 'queued',
    approvalStatus: 'pending',
    confidence: 0,
    draft: title ? normaliseDraftProduct({ ...defaults, ...manual, source: sourceUrl ? 'url' : 'manual', sourceUrl, title }) : {},
    extractedData: {},
    aiEnrichment: {},
    nutrition: {},
    imageCandidates: [],
    selectedImages: [],
    rejectedImages: [],
    supplementLabelImages: [],
    validation: { status: 'unchecked', issues: [] },
    error: '',
    updatedAt: new Date(),
  };
}

function refreshBatchSummary(batch) {
  const items = batch.items || [];
  const summary = {
    total: items.length,
    queued: items.filter((item) => item.status === 'queued').length,
    analysed: items.filter((item) => item.status === 'analysed').length,
    needsReview: items.filter((item) => item.status === 'needs_review' || item.approvalStatus === 'pending').length,
    approved: items.filter((item) => item.approvalStatus === 'approved').length,
    created: items.filter((item) => item.status === 'created').length,
    failed: items.filter((item) => item.status === 'failed').length,
  };
  batch.summary = summary;
  if (!items.length) batch.status = 'draft';
  else if (summary.created === summary.total) batch.status = 'created';
  else if (summary.failed && summary.failed + summary.created === summary.total) batch.status = 'failed';
  else if (summary.approved && summary.approved === summary.total) batch.status = 'approved';
  else if (summary.analysed || summary.approved || summary.failed) batch.status = 'needs_review';
  else batch.status = 'queued';
  return batch;
}

function mergeDefaultsIntoDraft(draft = {}, defaults = {}) {
  const normalisedDefaults = cleanDefaults(defaults);
  return normaliseDraftProduct({
    ...draft,
    vendor: draft.vendor || normalisedDefaults.vendor || normalisedDefaults.brand || '',
    productType: draft.productType || normalisedDefaults.productType || '',
    productCategory: draft.productCategory || normalisedDefaults.productCategory || '',
    themeTemplate: draft.themeTemplate || normalisedDefaults.themeTemplate || '',
    collections: Array.from(new Set([...(draft.collections || []), ...(normalisedDefaults.collections || [])])),
    recommendedTags: Array.from(new Set([...(draft.recommendedTags || []), ...(normalisedDefaults.recommendedTags || [])])),
    handleFormat: draft.handleFormat || normalisedDefaults.handleFormat || '',
    handleLocation: draft.handleLocation || normalisedDefaults.handleLocation || '',
  });
}

function applyLockedBatchDefaults(draft = {}, defaults = {}) {
  const normalisedDefaults = cleanDefaults(defaults);
  const next = { ...draft };
  // Values deliberately selected before a batch should win over supplier page guesses.
  if (normalisedDefaults.vendor || normalisedDefaults.brand) next.vendor = normalisedDefaults.vendor || normalisedDefaults.brand;
  if (normalisedDefaults.productType) next.productType = normalisedDefaults.productType;
  if (normalisedDefaults.productCategory) next.productCategory = normalisedDefaults.productCategory;
  if (normalisedDefaults.themeTemplate) next.themeTemplate = normalisedDefaults.themeTemplate;
  if (normalisedDefaults.handleFormat) next.handleFormat = normalisedDefaults.handleFormat;
  if (normalisedDefaults.handleLocation) next.handleLocation = normalisedDefaults.handleLocation;
  next.collections = Array.from(new Set([...(draft.collections || []), ...(normalisedDefaults.collections || [])])).slice(0, 40);
  next.recommendedTags = Array.from(new Set([...(draft.recommendedTags || []), ...(normalisedDefaults.recommendedTags || [])])).slice(0, 40);
  return normaliseDraftProduct(next);
}

function supplementLabelMetafields(images = []) {
  const first = (images || []).find((image) => image?.src);
  if (!first) return [];
  return [{
    namespace: 'custom',
    key: 'ingredients_label',
    type: 'single_line_text_field',
    label: 'Ingredients Label',
    value: first.src,
    source: 'supplement-label-image',
    confidence: Number(first.roleConfidence || 0.8),
  }];
}

function plainTextFromHtml(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function looksTruncated(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  const words = text.split(/\s+/);
  const lastWord = words[words.length - 1] || '';
  return (text.length > 135 && !/[.!?)]$/.test(text)) || (text.length > 45 && lastWord.length <= 2 && !/[.!?)]$/.test(text));
}

function validateDraft(draft = {}, item = {}) {
  const blockers = [];
  const warnings = [];
  const nutrition = item.nutrition || {};
  if (!draft.title || /^imported product$/i.test(draft.title)) blockers.push('Product title needs review.');
  if (!draft.images?.length) blockers.push('No selected product images.');
  if (!draft.productType) blockers.push('Product type missing.');
  if (!draft.vendor) blockers.push('Vendor/brand missing.');

  if (!plainTextFromHtml(draft.descriptionHtml)) warnings.push('Product description is missing or empty.');
  if (!draft.productCategory) warnings.push('Shopify product category missing.');
  if (!draft.price) warnings.push('Price missing.');
  if (!draft.handle) warnings.push('URL handle missing.');
  if (!draft.seo?.title || !draft.seo?.description) warnings.push('SEO title/description missing.');
  if (looksTruncated(draft.seo?.description)) warnings.push('SEO description looks truncated or unfinished.');
  if (!draft.metafields?.length && !item.metafieldPlan?.length) warnings.push('No standardised profile/nutrition metafields extracted.');
  if (nutrition.caffeineMgPerServing === undefined || nutrition.caffeineMgPerServing === null || nutrition.caffeineMgPerServing === '') warnings.push('Caffeine value is unknown; confirm caffeine-free vs missing data.');

  const issues = [...blockers, ...warnings];
  const status = blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'ready');
  return { status, issues, blockers, warnings, itemId: item.itemId };
}

async function createBatch({ shopDomain, name = '', defaults = {}, links = [], manualItems = [] }) {
  const clean = cleanDefaults(defaults);
  const urlItems = parseLinks(links);
  const manual = Array.isArray(manualItems) ? manualItems : [];
  const seen = new Set();
  const items = [...urlItems.map((url, index) => buildBatchItem({ url, index, defaults: clean })), ...manual.map((item, index) => buildBatchItem({ manual: item, index: index + urlItems.length, defaults: clean }))]
    .filter((item) => {
      const key = item.sourceUrl || item.title || item.originalInput;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const batch = await ProductImportBatch.create({
    shopDomain,
    name: cleanText(name || `${clean.vendor || clean.brand || clean.supplierName || 'Product'} import batch`, 180),
    supplierName: clean.supplierName,
    supplierUrl: clean.supplierUrl,
    defaults: clean,
    status: items.length ? 'queued' : 'draft',
    items,
  });
  refreshBatchSummary(batch);
  await batch.save();
  return { batch };
}

async function listBatches({ shopDomain, limit = 30 }) {
  const batches = await ProductImportBatch.find({ shopDomain }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 100)).lean();
  return { batches };
}

async function getBatch({ shopDomain, batchId }) {
  const batch = await ProductImportBatch.findOne({ _id: batchId, shopDomain });
  if (!batch) {
    const error = new Error('Product import batch not found.');
    error.status = 404;
    throw error;
  }
  return { batch };
}

async function updateBatchDefaults({ shopDomain, batchId, defaults = {} }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  batch.defaults = { ...(batch.defaults?.toObject?.() || batch.defaults || {}), ...cleanDefaults(defaults) };
  batch.supplierName = batch.defaults.supplierName || batch.supplierName;
  batch.supplierUrl = batch.defaults.supplierUrl || batch.supplierUrl;
  refreshBatchSummary(batch);
  await batch.save();
  return { batch };
}

async function addBatchItems({ shopDomain, batchId, links = [], manualItems = [] }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const defaults = cleanDefaults(batch.defaults || {});
  const existing = new Set((batch.items || []).map((item) => item.sourceUrl || item.title || item.originalInput).filter(Boolean));
  const urlItems = parseLinks(links);
  const manual = Array.isArray(manualItems) ? manualItems : [];
  const newItems = [...urlItems.map((url, index) => buildBatchItem({ url, index: batch.items.length + index, defaults })), ...manual.map((item, index) => buildBatchItem({ manual: item, index: batch.items.length + urlItems.length + index, defaults }))]
    .filter((item) => {
      const key = item.sourceUrl || item.title || item.originalInput;
      if (!key || existing.has(key)) return false;
      existing.add(key);
      return true;
    });
  batch.items.push(...newItems);
  refreshBatchSummary(batch);
  await batch.save();
  return { batch, added: newItems.length };
}

async function enrichItem({ shopDomain, item, defaults, useAi = true }) {
  item.status = 'scanning';
  item.error = '';
  item.updatedAt = new Date();

  let draft;
  if (item.sourceUrl) {
    const extracted = await extractProductFromUrl(item.sourceUrl);
    draft = mergeDefaultsIntoDraft(extracted, defaults);
    item.extractedData = extracted.rawExtract || {};
    item.confidence = Number(extracted.confidence || 0);
  } else {
    draft = mergeDefaultsIntoDraft(item.draft || { title: item.title, source: 'manual' }, defaults);
  }

  draft = applyLockedBatchDefaults(draft, defaults);
  const baseImagePlan = scoreAndSelectProductImages({ images: draft.images || [], title: draft.title, sourceUrl: draft.sourceUrl || item.sourceUrl, maxSelected: 8 });
  const imagePlan = await refineImagePlanWithAi({ imagePlan: baseImagePlan, title: draft.title, sourceUrl: draft.sourceUrl || item.sourceUrl, useAi });
  const aiProfileDraft = {
    ...draft,
    images: imagePlan.candidates.slice(0, 10).map((image) => ({ src: image.src, alt: image.alt, role: image.role || '', reason: image.roleReason || image.reason || '' })),
  };

  const profile = await extractNutritionAndProductProfile({ draft: aiProfileDraft, useAi });
  const supplementImages = imagePlan.supplementLabelImages || [];
  if (!profile.ingredientsLabelImage && !profile.supplementLabelImage && supplementImages[0]?.src) profile.ingredientsLabelImage = supplementImages[0].src;
  draft.images = imagePlan.selected.map((image) => ({ src: image.src, alt: image.alt || draft.title, role: image.role || '', reason: image.roleReason || image.reason || '' }));
  draft = applyProfileToDraft(draft, profile);
  draft.metafields = mergeMetafields(draft.metafields || [], supplementLabelMetafields(supplementImages));
  draft = await enrichProductDraft({ shopDomain, draft });
  draft = applyLockedBatchDefaults(draft, defaults);
  draft = applyProfileToDraft(draft, profile);
  draft.metafields = mergeMetafields(draft.metafields || [], supplementLabelMetafields(supplementImages));
  draft.images = imagePlan.selected.map((image) => ({ src: image.src, alt: image.alt || draft.title, role: image.role || '', reason: image.roleReason || image.reason || '' }));

  item.title = draft.title;
  item.vendor = draft.vendor;
  item.productType = draft.productType;
  item.productCategory = draft.productCategory;
  item.templateSuffix = draft.themeTemplate || '';
  item.draft = draft;
  item.nutrition = profile;
  item.aiEnrichment = draft.enrichment || {};
  item.metafieldPlan = normaliseMetafields(mergeMetafields(profileToMetafields(profile), draft.metafields || [], supplementLabelMetafields(supplementImages)));
  item.imageCandidates = imagePlan.candidates;
  item.selectedImages = imagePlan.selected;
  item.rejectedImages = imagePlan.rejected;
  item.supplementLabelImages = supplementImages;
  item.validation = validateDraft(draft, item);
  item.status = item.validation.status === 'ready' ? 'analysed' : 'needs_review';
  item.scannedAt = new Date();
  item.updatedAt = new Date();
  return item;
}

async function scanBatch({ shopDomain, batchId, itemIds = [], limit = 20, processAll = false, useAi = true }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const wanted = new Set(asArray(itemIds));
  const candidates = batch.items.filter((item) => {
    if (wanted.size) return wanted.has(item.itemId);
    return ['queued', 'failed', 'needs_review'].includes(item.status) && item.status !== 'created';
  });
  const selected = processAll ? candidates : candidates.slice(0, Math.max(1, Number(limit) || 20));
  batch.status = 'analysing';
  await batch.save();

  const results = [];
  for (const item of selected) {
    try {
      await enrichItem({ shopDomain, item, defaults: batch.defaults || {}, useAi });
      results.push({ itemId: item.itemId, status: item.status });
    } catch (error) {
      item.status = 'failed';
      item.error = cleanText(error.message || 'Product scan failed.', 1000);
      item.updatedAt = new Date();
      results.push({ itemId: item.itemId, status: 'failed', error: item.error });
    }
  }
  refreshBatchSummary(batch);
  await batch.save();
  return { batch, results, processed: selected.length, remaining: Math.max(0, candidates.length - selected.length) };
}

async function enrichBatch({ shopDomain, batchId, itemIds = [], useAi = true }) {
  return scanBatch({ shopDomain, batchId, itemIds, processAll: Boolean(itemIds?.length), useAi });
}

async function updateBatchItem({ shopDomain, batchId, itemId, patch = {} }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const item = batch.items.find((candidate) => candidate.itemId === itemId);
  if (!item) {
    const error = new Error('Batch item not found.');
    error.status = 404;
    throw error;
  }
  if (patch.draft) {
    const existingDraft = item.draft || {};
    const mergedDraft = {
      ...existingDraft,
      ...patch.draft,
      seo: { ...(existingDraft.seo || {}), ...(patch.draft.seo || {}) },
    };
    const draft = normaliseDraftProduct(mergedDraft);
    item.draft = draft;
    if (Array.isArray(patch.draft.metafields)) item.metafieldPlan = normaliseMetafields(patch.draft.metafields);
    item.title = draft.title;
    item.vendor = draft.vendor;
    item.productType = draft.productType;
    item.productCategory = draft.productCategory;
    item.templateSuffix = draft.themeTemplate || '';
    item.validation = validateDraft(draft, item);
  }
  if (patch.nutrition) {
    item.nutrition = { ...(item.nutrition || {}), ...patch.nutrition };
    const profileMetafields = profileToMetafields(item.nutrition);
    item.draft = applyProfileToDraft(item.draft || {}, item.nutrition);
    item.metafieldPlan = normaliseMetafields([...(item.metafieldPlan || []), ...profileMetafields, ...(item.draft?.metafields || [])]);
    item.draft = normaliseDraftProduct({ ...(item.draft || {}), metafields: item.metafieldPlan });
    item.validation = validateDraft(item.draft, item);
  }
  if (Array.isArray(patch.metafieldPlan)) {
    item.metafieldPlan = normaliseMetafields(patch.metafieldPlan);
    item.draft = normaliseDraftProduct({ ...(item.draft || {}), metafields: item.metafieldPlan });
    item.validation = validateDraft(item.draft, item);
  }
  if (Array.isArray(patch.selectedImages)) {
    item.selectedImages = patch.selectedImages;
    item.draft = normaliseDraftProduct({ ...(item.draft || {}), images: patch.selectedImages });
    item.validation = validateDraft(item.draft, item);
  }
  if (Array.isArray(patch.supplementLabelImages)) {
    item.supplementLabelImages = patch.supplementLabelImages;
    const supplementMetas = supplementLabelMetafields(item.supplementLabelImages || []);
    item.metafieldPlan = normaliseMetafields(mergeMetafields(item.metafieldPlan || [], supplementMetas));
    item.draft = normaliseDraftProduct({ ...(item.draft || {}), metafields: item.metafieldPlan });
    item.validation = validateDraft(item.draft, item);
  }
  if (patch.status) item.status = cleanText(patch.status, 40);
  item.updatedAt = new Date();
  refreshBatchSummary(batch);
  await batch.save();
  return { batch, item };
}

async function setBatchItemApproval({ shopDomain, batchId, itemId, approvalStatus = 'approved' }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const item = batch.items.find((candidate) => candidate.itemId === itemId);
  if (!item) {
    const error = new Error('Batch item not found.');
    error.status = 404;
    throw error;
  }
  const allowed = ['pending', 'approved', 'rejected'];
  item.approvalStatus = allowed.includes(approvalStatus) ? approvalStatus : 'pending';
  if (item.approvalStatus === 'approved') {
    item.approvedAt = new Date();
    if (!['created', 'creating'].includes(item.status)) item.status = 'approved';
  }
  if (item.approvalStatus === 'rejected') item.status = 'skipped';
  item.updatedAt = new Date();
  refreshBatchSummary(batch);
  await batch.save();
  return { batch, item };
}

async function createShopifyDraftsForBatch({ shopDomain, batchId, itemIds = [], approvedOnly = true }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const wanted = new Set(asArray(itemIds));
  const items = batch.items.filter((item) => {
    if (wanted.size && !wanted.has(item.itemId)) return false;
    if (item.status === 'created') return false;
    return approvedOnly ? item.approvalStatus === 'approved' : Boolean(item.draft?.title);
  });
  batch.status = 'creating';
  await batch.save();

  const results = [];
  for (const item of items) {
    try {
      item.status = 'creating';
      item.updatedAt = new Date();
      const product = await createShopifyProductFromDraft({ shopDomain, draft: item.draft });
      item.shopifyProduct = product;
      item.status = 'created';
      item.createdAt = new Date();
      item.error = '';
      results.push({ itemId: item.itemId, status: 'created', product });
    } catch (error) {
      item.status = 'failed';
      item.error = cleanText(error.message || 'Shopify draft creation failed.', 1000);
      results.push({ itemId: item.itemId, status: 'failed', error: item.error });
    }
  }
  refreshBatchSummary(batch);
  await batch.save();
  return { batch, results, created: results.filter((item) => item.status === 'created').length, failed: results.filter((item) => item.status === 'failed').length };
}

module.exports = {
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
};
