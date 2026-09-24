const crypto = require('crypto');
const ProductImportBatch = require('../productImportBatch.model');
const { normaliseDraftProduct } = require('../services/normaliseProduct.service');
const { cleanText, cleanUrl } = require('../utils/safe');

const XZERO_ROOT = 'https://x-zero.co.uk';
const XZERO_SUPPLIER_NAME = 'X-Zero';
const XZERO_PROFILE = 'x-zero-shopify-json';

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GamingNectar Product Importer/1.0',
      },
    });
    if (!response.ok) throw new Error(`X-Zero catalogue returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchXZeroCatalogue({ maxProducts = 500 } = {}) {
  const products = [];
  for (let page = 1; page <= 10 && products.length < maxProducts; page += 1) {
    const data = await fetchJson(`${XZERO_ROOT}/products.json?limit=250&page=${page}`);
    const rows = Array.isArray(data?.products) ? data.products : [];
    if (!rows.length) break;
    for (const product of rows) {
      products.push(product);
      if (products.length >= maxProducts) break;
    }
    if (rows.length < 250) break;
  }
  return products;
}

function firstVariant(product = {}) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return variants.find((variant) => variant.available !== false) || variants[0] || {};
}

function productImages(product = {}) {
  const rows = Array.isArray(product.images) ? product.images : [];
  return rows
    .map((image, index) => ({
      src: cleanUrl(image?.src || ''),
      alt: cleanText(image?.alt || product.title || '', 180),
      originalIndex: index,
      source: 'x-zero-shopify-json',
    }))
    .filter((image) => image.src)
    .slice(0, 50);
}

function sourceTags(product = {}) {
  if (Array.isArray(product.tags)) return product.tags.map((tag) => cleanText(tag, 80)).filter(Boolean);
  return String(product.tags || '')
    .split(',')
    .map((tag) => cleanText(tag, 80))
    .filter(Boolean);
}

function mapProductToItem(product, index = 0) {
  const variant = firstVariant(product);
  const handle = cleanText(product.handle || '', 180);
  const sourceUrl = `${XZERO_ROOT}/products/${encodeURIComponent(handle)}`;
  const images = productImages(product);
  const tags = sourceTags(product);
  const rawForFingerprint = {
    id: product.id,
    title: product.title,
    handle: product.handle,
    body_html: product.body_html,
    vendor: product.vendor,
    product_type: product.product_type,
    tags,
    variants: product.variants,
    images: product.images,
    updated_at: product.updated_at,
  };

  const draft = normaliseDraftProduct({
    source: 'url',
    sourceUrl,
    title: product.title || 'Imported product',
    handle,
    descriptionHtml: product.body_html || '',
    vendor: product.vendor || XZERO_SUPPLIER_NAME,
    productType: product.product_type || '',
    price: variant.price || '',
    compareAtPrice: variant.compare_at_price || '',
    sku: variant.sku || '',
    barcode: variant.barcode || '',
    weight: variant.grams || '',
    weightUnit: 'g',
    images,
    // Source tags are suggestions only. They are not silently applied to Shopify.
    tags: [],
    recommendedTags: tags,
  });

  return {
    itemId: `xzero-${String(product.id || handle || index)}`,
    sourceType: 'url',
    sourceUrl,
    sourceWebsite: XZERO_ROOT,
    originalInput: sourceUrl,
    title: cleanText(product.title || '', 220),
    vendor: cleanText(product.vendor || XZERO_SUPPLIER_NAME, 120),
    productType: cleanText(product.product_type || '', 120),
    productCategory: '',
    templateSuffix: '',
    status: 'analysed',
    approvalStatus: 'pending',
    confidence: 0.98,
    draft,
    extractedData: {
      source: 'x-zero-shopify-json',
      sourceProductId: String(product.id || ''),
      sourceHandle: handle,
      sourceFingerprint: hash(rawForFingerprint),
      sourceUpdatedAt: product.updated_at || null,
      sourcePublishedAt: product.published_at || null,
      sourceCreatedAt: product.created_at || null,
      sourceTags: tags,
      sourceOptions: product.options || [],
      sourceVariants: product.variants || [],
      sourceImages: product.images || [],
      rawProduct: product,
    },
    aiEnrichment: {},
    nutrition: {},
    metafieldPlan: [],
    imageCandidates: images.map((image, imageIndex) => ({
      ...image,
      score: 1,
      reason: 'Supplied by X-Zero product feed',
      selected: true,
      rejected: false,
      rejectReason: '',
      canonicalKey: image.src.split('?')[0].toLowerCase(),
      role: imageIndex === 0 ? 'primary_product' : 'product_gallery',
      roleConfidence: 0.95,
      roleReason: 'Original supplier catalogue image',
    })),
    selectedImages: images.map((image, imageIndex) => ({
      ...image,
      score: 1,
      reason: 'Supplied by X-Zero product feed',
      selected: true,
      rejected: false,
      rejectReason: '',
      canonicalKey: image.src.split('?')[0].toLowerCase(),
      role: imageIndex === 0 ? 'primary_product' : 'product_gallery',
      roleConfidence: 0.95,
      roleReason: 'Original supplier catalogue image',
    })),
    rejectedImages: [],
    supplementLabelImages: [],
    suggestions: {
      sourceTags: tags,
      sourceVariantCount: Array.isArray(product.variants) ? product.variants.length : 0,
    },
    visualEvidence: {},
    requiredChecks: [],
    completeness: {},
    validation: {
      status: draft.title && draft.images?.length ? 'warning' : 'blocked',
      issues: [
        ...(draft.images?.length ? [] : ['No supplier image found.']),
        ...(draft.productType ? [] : ['Product type needs review.']),
        'Review product category, SEO, metafields and variant structure before creating the Shopify draft.',
      ],
    },
    shopifyProduct: null,
    error: '',
    scannedAt: new Date(),
    updatedAt: new Date(),
  };
}

function refreshSummary(batch) {
  const items = batch.items || [];
  batch.summary = {
    total: items.length,
    queued: items.filter((item) => item.status === 'queued').length,
    analysed: items.filter((item) => item.status === 'analysed').length,
    needsReview: items.filter((item) => item.status === 'needs_review' || item.approvalStatus === 'pending').length,
    approved: items.filter((item) => item.approvalStatus === 'approved').length,
    created: items.filter((item) => item.status === 'created').length,
    failed: items.filter((item) => item.status === 'failed').length,
  };
  if (batch.summary.created === batch.summary.total && batch.summary.total) batch.status = 'created';
  else if (batch.summary.approved === batch.summary.total && batch.summary.total) batch.status = 'approved';
  else batch.status = 'needs_review';
}

function shouldPreserveMerchantDraft(existing = {}) {
  return Boolean(
    existing?.draft?.lastMerchantEditAt ||
    existing?.approvalStatus === 'approved' ||
    existing?.status === 'created' ||
    existing?.shopifyProduct?.id
  );
}

async function syncXZeroCatalogue({ shopDomain, maxProducts = 500 } = {}) {
  if (!shopDomain) {
    const error = new Error('shopDomain is required.');
    error.status = 400;
    throw error;
  }

  const products = await fetchXZeroCatalogue({ maxProducts });
  if (!products.length) throw new Error('X-Zero returned no products.');

  const incoming = products.map(mapProductToItem);
  let batch = await ProductImportBatch.findOne({
    shopDomain,
    'automation.supplierProfile': XZERO_PROFILE,
  }).sort({ createdAt: -1 });

  const now = new Date();
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  let removed = 0;

  if (!batch) {
    batch = new ProductImportBatch({
      shopDomain,
      name: 'X-Zero catalogue',
      supplierName: XZERO_SUPPLIER_NAME,
      supplierUrl: XZERO_ROOT,
      status: 'needs_review',
      defaults: {
        supplierName: XZERO_SUPPLIER_NAME,
        supplierUrl: XZERO_ROOT,
        brand: XZERO_SUPPLIER_NAME,
        vendor: XZERO_SUPPLIER_NAME,
        currency: 'GBP',
        collections: [],
        recommendedTags: [],
      },
      items: incoming,
      automation: {
        siteImport: true,
        supplierProfile: XZERO_PROFILE,
        useAi: false,
        autoApproveReady: false,
        autoCreateDrafts: false,
        batchSize: 12,
        discoveryMethod: 'shopify-products-json',
        discoveredCount: incoming.length,
      },
      errors: [],
    });
    added = incoming.length;
  } else {
    const existingById = new Map((batch.items || []).map((item) => [item.itemId, item]));
    const incomingIds = new Set(incoming.map((item) => item.itemId));
    const merged = [];

    for (const fresh of incoming) {
      const old = existingById.get(fresh.itemId);
      if (!old) {
        merged.push(fresh);
        added += 1;
        continue;
      }

      const oldObj = old.toObject ? old.toObject() : old;
      const oldFingerprint = oldObj?.extractedData?.sourceFingerprint || '';
      const newFingerprint = fresh?.extractedData?.sourceFingerprint || '';
      if (oldFingerprint === newFingerprint) unchanged += 1;
      else changed += 1;

      if (shouldPreserveMerchantDraft(oldObj)) {
        merged.push({
          ...fresh,
          ...oldObj,
          sourceUrl: fresh.sourceUrl,
          sourceWebsite: fresh.sourceWebsite,
          title: oldObj.title || fresh.title,
          vendor: oldObj.vendor || fresh.vendor,
          productType: oldObj.productType || fresh.productType,
          extractedData: fresh.extractedData,
          imageCandidates: oldObj.imageCandidates?.length ? oldObj.imageCandidates : fresh.imageCandidates,
          selectedImages: oldObj.selectedImages?.length ? oldObj.selectedImages : fresh.selectedImages,
          updatedAt: now,
        });
      } else {
        merged.push({ ...fresh, updatedAt: now });
      }
    }

    for (const old of batch.items || []) {
      if (incomingIds.has(old.itemId)) continue;
      const oldObj = old.toObject ? old.toObject() : old;
      removed += 1;
      merged.push({
        ...oldObj,
        status: oldObj.status === 'created' ? 'created' : 'skipped',
        error: oldObj.status === 'created' ? oldObj.error || '' : 'No longer present in the current X-Zero catalogue.',
        updatedAt: now,
      });
    }

    batch.items = merged;
    batch.supplierName = XZERO_SUPPLIER_NAME;
    batch.supplierUrl = XZERO_ROOT;
    batch.automation.siteImport = true;
    batch.automation.supplierProfile = XZERO_PROFILE;
    batch.automation.discoveryMethod = 'shopify-products-json';
    batch.automation.discoveredCount = incoming.length;
    batch.markModified('items');
    batch.markModified('automation');
  }

  refreshSummary(batch);
  await batch.save();

  return {
    batch,
    sync: {
      fetched: products.length,
      added,
      changed,
      unchanged,
      removed,
      syncedAt: now.toISOString(),
      source: XZERO_ROOT,
    },
  };
}

async function getXZeroBatch({ shopDomain } = {}) {
  const batch = await ProductImportBatch.findOne({
    shopDomain,
    'automation.supplierProfile': XZERO_PROFILE,
  }).sort({ createdAt: -1 });
  return { batch };
}

async function previewXZeroCatalogue({ maxProducts = 500 } = {}) {
  const products = await fetchXZeroCatalogue({ maxProducts });
  return {
    source: XZERO_ROOT,
    count: products.length,
    sample: products.slice(0, 12).map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.product_type,
      variantCount: Array.isArray(product.variants) ? product.variants.length : 0,
      image: product.images?.[0]?.src || '',
      sourceUrl: `${XZERO_ROOT}/products/${product.handle}`,
    })),
  };
}

module.exports = {
  XZERO_ROOT,
  fetchXZeroCatalogue,
  previewXZeroCatalogue,
  syncXZeroCatalogue,
  getXZeroBatch,
};
