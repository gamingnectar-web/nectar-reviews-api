const ProductImportBatch = require('../productImportBatch.model');
const { extractProductFromUrl } = require('../extractors/urlProductExtractor');
const { extractProductsFromPhotos } = require('../extractors/photoProductExtractor');
const { normaliseDraftProduct } = require('./normaliseProduct.service');
const { enrichProductDraft, getProductImportMetadata } = require('./productEnrichment.service');
const { applyCatalogueRules, completeness } = require('./productCompleteness.service');
const { createShopifyProductFromDraft } = require('./shopifyProduct.service');
const { scoreAndSelectProductImages } = require('./imageCandidateScoring.service');
const { refineImagePlanWithAi } = require('./productMediaClassifier.service');
const { extractNutritionAndProductProfile } = require('./nutritionProfileExtractor.service');
const { applyProfileToDraft, profileToMetafields, mergeMetafields } = require('./metafieldSchemaRegistry.service');
const { cleanText, cleanUrl, makeLineId, parseTags, normaliseMetafields, slugify } = require('../utils/safe');

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
  const sourceType = cleanText(manual.sourceType || (sourceUrl ? 'url' : 'manual'), 40);
  const title = cleanText(manual.title || manual.name || '', 220);
  return {
    itemId: manual.itemId || makeLineId(index),
    sourceType: ['url', 'manual', 'invoice_line', 'photo'].includes(sourceType) ? sourceType : (sourceUrl ? 'url' : 'manual'),
    sourceUrl,
    sourceWebsite: cleanUrl(manual.sourceWebsite || manual.website || defaults.supplierUrl || ''),
    sourceImageDataUrl: String(manual.sourceImageDataUrl || '').slice(0, 1_500_000),
    originalInput: cleanText(url.originalInput || manual.originalInput || sourceUrl || title, 1000),
    title,
    vendor: cleanText(manual.vendor || defaults.vendor || defaults.brand || '', 120),
    productType: cleanText(manual.productType || defaults.productType || '', 120),
    productCategory: cleanText(manual.productCategory || defaults.productCategory || '', 180),
    templateSuffix: cleanText(manual.themeTemplate || defaults.themeTemplate || '', 80).replace(/^product\./i, ''),
    status: 'queued',
    approvalStatus: 'pending',
    confidence: 0,
    draft: title ? normaliseDraftProduct({ ...defaults, ...manual, source: sourceUrl ? 'url' : (sourceType === 'photo' ? 'photo' : 'manual'), sourceUrl, title }) : {},
    extractedData: {},
    aiEnrichment: {},
    nutrition: {},
    imageCandidates: [],
    selectedImages: [],
    rejectedImages: [],
    supplementLabelImages: [],
    visualEvidence: manual.visualEvidence || {},
    requiredChecks: Array.isArray(manual.requiredChecks) ? manual.requiredChecks : [],
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
  // Values deliberately selected before a batch are source-of-truth. Supplier
  // pages and AI may suggest, but they cannot silently rewrite these fields.
  if (normalisedDefaults.vendor || normalisedDefaults.brand) next.vendor = normalisedDefaults.vendor || normalisedDefaults.brand;
  if (normalisedDefaults.productType) next.productType = normalisedDefaults.productType;
  if (normalisedDefaults.productCategory) next.productCategory = normalisedDefaults.productCategory;
  if (normalisedDefaults.themeTemplate) next.themeTemplate = normalisedDefaults.themeTemplate;
  if (normalisedDefaults.handleFormat) next.handleFormat = normalisedDefaults.handleFormat;
  if (normalisedDefaults.handleLocation) next.handleLocation = normalisedDefaults.handleLocation;
  if (normalisedDefaults.collections.length) next.collections = normalisedDefaults.collections;
  // These are suggestions only. They should never be copied into draft.tags
  // unless the merchant explicitly approves them in the review editor.
  next.recommendedTags = Array.from(new Set([...(normalisedDefaults.recommendedTags || []), ...(draft.recommendedTags || [])])).slice(0, 40);
  next.tags = Array.from(new Set(parseTags(draft.tags || []).filter((tag) => !/^url-import$|^product-import$|^invoice-import$/i.test(tag)))).slice(0, 40);
  return normaliseDraftProduct(next);
}

function normaliseLocationForSeo(value = '') {
  const raw = cleanText(value || '', 80);
  if (!raw) return 'UK Stock';
  if (/^uk$/i.test(raw)) return 'UK Stock';
  if (/stock/i.test(raw)) return raw.replace(/\buk\b/i, 'UK');
  return `${raw.replace(/\buk\b/i, 'UK')} Stock`;
}

function normaliseLocationForHandle(value = '') {
  const raw = cleanText(value || '', 80);
  if (!raw) return 'uk';
  if (/^uk\s*stock$/i.test(raw)) return 'uk';
  return raw;
}

function stripVendor(title = '', vendor = '') {
  let next = cleanText(title || '', 220);
  const vendorText = cleanText(vendor || '', 120);
  if (!vendorText) return next;
  const escaped = vendorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  next = next.replace(new RegExp(`^${escaped}\\s*[-–—:|•]*\\s*`, 'i'), '').trim();
  if (/^g\s*fuel/i.test(vendorText)) next = next.replace(/^g\s*fuel\s*[-–—:|•]*\s*/i, '').trim();
  return next || cleanText(title || '', 220);
}

function inferFormat(draft = {}, defaults = {}) {
  const explicit = cleanText(defaults.handleFormat || draft.handleFormat || '', 120);
  const text = [draft.title, draft.productType, draft.descriptionHtml].filter(Boolean).join(' ').toLowerCase();
  if (/collector|collectible/.test(text) && /box/.test(text)) return 'Collector Box';
  return explicit || draft.productType || 'Product';
}

function stripFormatTokenFromName(productName = '', format = '') {
  let next = cleanText(productName, 180);
  const fmt = cleanText(format, 120).toLowerCase();
  if (!next || !fmt) return next;
  if (/collector/.test(fmt)) {
    next = next
      .replace(/\bcollector'?s?\s*box\b/ig, '')
      .replace(/\bcollectible\s*box\b/ig, '')
      .replace(/\bbundle\b/ig, '')
      .replace(/[-–—:|•]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  if (/energy\s*drink\s*powder\s*tub|powder\s*tub|\btub\b/.test(fmt)) {
    next = next
      .replace(/\b(energy\s*formula|energy\s*drink|powder\s*tub|drink\s*powder\s*tub|tub|40\s*servings?|30\s*servings?)\b/ig, '')
      .replace(/[-–—:|•]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return next || cleanText(productName, 180);
}


function completeSentence(value = '') {
  const text = cleanText(value || '', 155).replace(/[,:;\s]+$/, '');
  return text ? (/[.!?)]$/.test(text) ? text : `${text}.`) : '';
}

function applyMerchantSeoPattern(draft = {}, defaults = {}) {
  const normalisedDefaults = cleanDefaults(defaults);
  const vendor = cleanText(draft.vendor || normalisedDefaults.vendor || normalisedDefaults.brand || '', 120);
  const productName = stripVendor(draft.title || '', vendor);
  const format = inferFormat(draft, normalisedDefaults);
  const seoLocation = normaliseLocationForSeo(draft.handleLocation || normalisedDefaults.handleLocation || 'uk');
  const handleLocation = normaliseLocationForHandle(draft.handleLocation || normalisedDefaults.handleLocation || 'uk');
  const rawProductName = productName || stripVendor(draft.name || draft.handle || '', vendor) || draft.title || 'Product';
  const safeProductName = stripFormatTokenFromName(rawProductName, format);
  const title = cleanText([vendor, safeProductName, format, seoLocation].filter(Boolean).join(' - '), 120);
  const handle = slugify([vendor, safeProductName, format, handleLocation].filter(Boolean).join('-'));
  const flavour = cleanText((draft.metafields || []).find((mf) => mf.namespace === 'core' && mf.key === 'product_flavour')?.value || '', 100);
  const profile = cleanText((draft.metafields || []).find((mf) => mf.namespace === 'core' && mf.key === 'flavour_profile')?.value || '', 120);
  const lead = [vendor, safeProductName || productName, format].filter(Boolean).join(' ');
  const flavourLine = flavour && !new RegExp(`\\b${flavour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lead)
    ? `Flavour: ${flavour}.`
    : (profile ? completeSentence(profile) : '');
  const description = completeSentence([
    `Buy ${lead} from Gaming Nectar with ${seoLocation}`,
    flavourLine,
    'Fast UK dispatch available.'
  ].filter(Boolean).join('. '));
  return normaliseDraftProduct({
    ...draft,
    vendor,
    handle,
    seo: { title, description },
  });
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
  const requiredChecks = Array.isArray(item.requiredChecks) ? item.requiredChecks : [];
  const hasOpenRequiredCheck = requiredChecks.some((check) => check?.required !== false && !String(item.nutrition?.[check.key] || draft.enrichment?.photoImportChecks?.[check.key] || '').trim());
  const nutrition = item.nutrition || {};
  if (!draft.title || /^imported product$/i.test(draft.title)) blockers.push('Product title needs review.');
  if (!draft.images?.length) blockers.push('No selected product images.');
  if (!draft.productType) blockers.push('Product type missing.');
  if (!draft.vendor) blockers.push('Vendor/brand missing.');
  if (hasOpenRequiredCheck) blockers.push('Required product-line/formula check still needs confirming.');
  if (item.sourceType === 'photo' && !draft.sourceUrl && !item.sourceUrl) warnings.push('Photo import needs a verified source/product URL before final trust.');

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

async function createBatch({ shopDomain, name = '', defaults = {}, links = [], manualItems = [], photoItems = [] }) {
  const clean = cleanDefaults(defaults);
  const urlItems = parseLinks(links);
  const manual = Array.isArray(manualItems) ? manualItems : [];
  const photos = Array.isArray(photoItems) ? photoItems.map((item) => ({ ...item, sourceType: 'photo' })) : [];
  const seen = new Set();
  const items = [...urlItems.map((url, index) => buildBatchItem({ url, index, defaults: clean })), ...manual.map((item, index) => buildBatchItem({ manual: item, index: index + urlItems.length, defaults: clean })), ...photos.map((item, index) => buildBatchItem({ manual: item, index: index + urlItems.length + manual.length, defaults: clean }))]
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

async function addBatchItems({ shopDomain, batchId, links = [], manualItems = [], photoItems = [] }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const defaults = cleanDefaults(batch.defaults || {});
  const existing = new Set((batch.items || []).map((item) => item.sourceUrl || item.title || item.originalInput).filter(Boolean));
  const urlItems = parseLinks(links);
  const manual = Array.isArray(manualItems) ? manualItems : [];
  const photos = Array.isArray(photoItems) ? photoItems.map((item) => ({ ...item, sourceType: 'photo' })) : [];
  const newItems = [...urlItems.map((url, index) => buildBatchItem({ url, index: batch.items.length + index, defaults })), ...manual.map((item, index) => buildBatchItem({ manual: item, index: batch.items.length + urlItems.length + index, defaults })), ...photos.map((item, index) => buildBatchItem({ manual: item, index: batch.items.length + urlItems.length + manual.length + index, defaults }))]
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

function byPageImageOrder(images = []) {
  return [...(images || [])].sort((a, b) => (a.originalIndex ?? 9999) - (b.originalIndex ?? 9999));
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
    draft = mergeDefaultsIntoDraft(item.draft || { title: item.title, source: item.sourceType === 'photo' ? 'photo' : 'manual' }, defaults);
    if (item.sourceType === 'photo') {
      draft.enrichment = { ...(draft.enrichment || {}), visualEvidence: item.visualEvidence || {}, requiredChecks: item.requiredChecks || [] };
    }
  }

  draft = applyMerchantSeoPattern(applyLockedBatchDefaults(draft, defaults), defaults);
  const baseImagePlan = scoreAndSelectProductImages({ images: draft.images || [], title: draft.title, sourceUrl: draft.sourceUrl || item.sourceUrl, maxSelected: 8 });
  const imagePlan = await refineImagePlanWithAi({ imagePlan: baseImagePlan, title: draft.title, sourceUrl: draft.sourceUrl || item.sourceUrl, useAi });
  const aiProfileDraft = {
    ...draft,
    images: imagePlan.candidates.slice(0, 10).map((image) => ({ src: image.src, alt: image.alt, role: image.role || '', reason: image.roleReason || image.reason || '' })),
  };

  const profile = await extractNutritionAndProductProfile({ draft: aiProfileDraft, useAi });
  const supplementImages = imagePlan.supplementLabelImages || [];
  if (!profile.ingredientsLabelImage && !profile.supplementLabelImage && supplementImages[0]?.src) profile.ingredientsLabelImage = supplementImages[0].src;
  draft.images = byPageImageOrder(imagePlan.selected).map((image) => ({ src: image.src, alt: image.alt || draft.title, role: image.role || '', reason: image.roleReason || image.reason || '', originalIndex: image.originalIndex ?? 0 }));
  draft = applyProfileToDraft(draft, profile);
  draft.metafields = mergeMetafields(draft.metafields || [], supplementLabelMetafields(supplementImages));
  draft = await enrichProductDraft({ shopDomain, draft });
  const metadata = await getProductImportMetadata({ shopDomain }).catch(() => ({}));
  const commercial = draft.suggestions || draft.enrichment?.suggestions || {};
  draft.fieldInference={...(draft.fieldInference||{})};
  if (!draft.price && commercial.price?.value) { draft.price = commercial.price.value; draft.fieldInference.price=true; }
  if (!draft.compareAtPrice && commercial.compareAtPrice?.value) { draft.compareAtPrice = commercial.compareAtPrice.value; draft.compareAtPriceMode = 'value'; draft.fieldInference.compareAtPrice=true; }
  if (!draft.weight && commercial.weight?.value) { draft.weight = commercial.weight.value; draft.weightUnit = commercial.weight.weightUnit || 'g'; draft.fieldInference.weight=true; }
  if (!draft.harmonizedSystemCode && commercial.harmonizedSystemCode?.value) { draft.harmonizedSystemCode = commercial.harmonizedSystemCode.value; draft.fieldInference.harmonizedSystemCode=true; }
  draft = normaliseDraftProduct(applyCatalogueRules({ draft, metadata }));
  draft = applyMerchantSeoPattern(applyLockedBatchDefaults(draft, defaults), defaults);
  draft = applyProfileToDraft(draft, profile);
  draft.metafields = mergeMetafields(draft.metafields || [], supplementLabelMetafields(supplementImages));
  draft.images = byPageImageOrder(imagePlan.selected).map((image) => ({ src: image.src, alt: image.alt || draft.title, role: image.role || '', reason: image.roleReason || image.reason || '', originalIndex: image.originalIndex ?? 0 }));
  draft = applyMerchantSeoPattern(applyLockedBatchDefaults(draft, defaults), defaults);

  item.title = draft.title;
  item.vendor = draft.vendor;
  item.productType = draft.productType;
  item.productCategory = draft.productCategory;
  item.templateSuffix = draft.themeTemplate || '';
  item.draft = draft;
  item.nutrition = profile;
  item.aiEnrichment = draft.enrichment || {};
  item.suggestions = draft.suggestions || draft.enrichment?.suggestions || {};
  item.metafieldPlan = normaliseMetafields(mergeMetafields(profileToMetafields(profile), draft.metafields || [], supplementLabelMetafields(supplementImages)));
  item.imageCandidates = byPageImageOrder(imagePlan.candidates);
  item.selectedImages = byPageImageOrder(imagePlan.selected);
  item.rejectedImages = byPageImageOrder(imagePlan.rejected);
  item.supplementLabelImages = byPageImageOrder(supplementImages);
  item.completeness = completeness({ draft, item, metadata });
  item.validation = validateDraft(draft, item);
  if (!item.completeness.ready) { item.validation.status = 'blocked'; item.validation.blockers = item.completeness.blockers; item.validation.issues = Array.from(new Set([...(item.validation.issues || []), ...item.completeness.blockers])); }
  item.status = item.validation.status === 'ready' ? 'analysed' : 'needs_review';
  item.scannedAt = new Date();
  item.updatedAt = new Date();
  return item;
}

async function analyseProductPhotos({ shopDomain, photos = [], brand = '', sourceWebsite = '', notes = '', defaults = {} }) {
  const clean = cleanDefaults(defaults || {});
  const result = await extractProductsFromPhotos({ photos, brand: brand || clean.vendor || clean.brand || clean.supplierName, sourceWebsite: sourceWebsite || clean.supplierUrl, notes, defaults: clean });
  const items = (result.items || []).map((item, index) => buildBatchItem({ manual: item, index, defaults: clean }));
  return { ...result, items };
}

async function scanBatch({ shopDomain, batchId, itemIds = [], limit = 20, processAll = false, useAi = true }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const wanted = new Set(asArray(itemIds));
  const candidates = batch.items.filter((item) => {
    if (item.status === 'created' || item.status === 'creating') return false;
    if (wanted.size) return wanted.has(item.itemId);
    if (processAll) return ['queued', 'failed', 'needs_review', 'analysed', 'approved'].includes(item.status) || item.approvalStatus !== 'approved';
    return ['queued', 'failed', 'needs_review'].includes(item.status);
  });
  const selected = processAll ? candidates : candidates.slice(0, Math.max(1, Number(limit) || 20));
  batch.status = 'analysing';
  selected.forEach((item) => {
    item.status = 'scanning';
    item.error = '';
    item.updatedAt = new Date();
  });
  refreshBatchSummary(batch);
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
  const metadata = await getProductImportMetadata({ shopDomain }).catch(() => ({}));
  if (patch.draft) {
    const existingDraft = item.draft || {};
    const mergedDraft = {
      ...existingDraft,
      ...patch.draft,
      seo: { ...(existingDraft.seo || {}), ...(patch.draft.seo || {}) },
    };
    const draft = normaliseDraftProduct(applyCatalogueRules({ draft: mergedDraft, metadata }));
    item.draft = draft;
    if (draft.sourceUrl) item.sourceUrl = draft.sourceUrl;
    if (Array.isArray(patch.draft.metafields)) item.metafieldPlan = normaliseMetafields(patch.draft.metafields);
    item.title = draft.title;
    item.vendor = draft.vendor;
    item.productType = draft.productType;
    item.productCategory = draft.productCategory;
    item.templateSuffix = draft.themeTemplate || '';
    item.suggestions = draft.suggestions || item.suggestions || {};
    item.validation = validateDraft(draft, item);
  }
  if (patch.nutrition) {
    item.nutrition = { ...(item.nutrition || {}), ...patch.nutrition };
    if (Array.isArray(item.requiredChecks) && item.requiredChecks.length) {
      item.requiredChecks = item.requiredChecks.map((check) => ({ ...check, confirmedValue: item.nutrition?.[check.key] || '' }));
    }
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
  if (patch.visualEvidence) item.visualEvidence = { ...(item.visualEvidence || {}), ...patch.visualEvidence };
  if (Array.isArray(patch.requiredChecks)) item.requiredChecks = patch.requiredChecks;
  if (patch.status) item.status = cleanText(patch.status, 40);
  item.completeness = completeness({ draft: item.draft || {}, item, metadata });
  item.validation = validateDraft(item.draft || {}, item);
  if (!item.completeness.ready) { item.validation.status = 'blocked'; item.validation.blockers = item.completeness.blockers; item.validation.issues = Array.from(new Set([...(item.validation.issues || []), ...item.completeness.blockers])); }
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
  if (approvalStatus === 'approved' && !item.completeness?.total) { const metadata = await getProductImportMetadata({ shopDomain }).catch(() => ({})); item.completeness = completeness({ draft: item.draft || {}, item, metadata }); }
  if (approvalStatus === 'approved' && item.completeness && item.completeness.ready === false) { const error = new Error(`Product is not complete: ${(item.completeness.blockers || []).slice(0, 4).join(' · ')}`); error.status = 400; throw error; }
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
  analyseProductPhotos,
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
