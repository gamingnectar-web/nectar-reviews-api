const crypto = require('crypto');
const { env } = require('../config/env');
const { Review, Settings } = require('../models');
const { cleanText, cleanEmail, clampNumber } = require('../utils/validation');
const { shopifyFetchOptional } = require('../utils/shopify');
const {
  ReviewMigrationBatch,
  ReviewMigrationStagedReview,
  ReviewStorefrontScan,
} = require('../models/reviewMigrationModels');

const SITE_REVIEW_ITEM_ID = '__site__';
const PRODUCT_ID_RE = /(?:gid:\/\/shopify\/Product\/)?(\d{5,})/;

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCsv(text, { maxRows = 10000 } = {}) {
  const input = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => String(cell || '').trim() !== '')) rows.push(row);
      row = [];
      field = '';
      if (rows.length > maxRows + 1) throw new Error(`CSV row limit exceeded. Max ${maxRows} rows.`);
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => String(cell || '').trim() !== '')) rows.push(row);
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows.shift().map((item, index) => {
    const header = cleanText(item, 120);
    return header || `Column ${index + 1}`;
  });

  return {
    headers,
    rows: rows.map((cells) => {
      const out = {};
      headers.forEach((header, index) => {
        out[header] = cells[index] === undefined ? '' : cells[index];
      });
      return out;
    }),
  };
}

function headerKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\ufeff/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function pick(row, aliases) {
  const map = new Map();
  Object.keys(row || {}).forEach((key) => map.set(headerKey(key), row[key]));
  for (const alias of aliases) {
    const key = headerKey(alias);
    if (map.has(key)) return map.get(key);
  }
  return '';
}

function parseBool(value) {
  const str = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'verified', 'verified buyer', 'published', 'approved'].includes(str);
}

function splitUrls(value) {
  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => cleanText(item, 2000))
    .filter((item) => /^https?:\/\//i.test(item))
    .slice(0, 20)
    .map((url) => ({ url }));
}

function productIdCandidates(value) {
  const raw = cleanText(value, 240);
  const set = new Set();
  if (!raw) return [];
  set.add(raw);
  const match = raw.match(PRODUCT_ID_RE);
  if (match) {
    set.add(match[1]);
    set.add(`gid://shopify/Product/${match[1]}`);
  }
  return Array.from(set);
}

function handleFromUrl(value) {
  const raw = cleanText(value, 1000);
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://placeholder.local${raw.startsWith('/') ? '' : '/'}${raw}`);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('products');
    return idx >= 0 ? cleanText(parts[idx + 1], 180) : '';
  } catch (_) {
    const match = raw.match(/\/products\/([^/?#]+)/i);
    return match ? cleanText(match[1], 180) : '';
  }
}

function normalizeReviewRow(row, sourcePlatform = 'generic', options = {}) {
  const externalReviewId = cleanText(pick(row, [
    'Review ID', 'Review Id', 'review_id', 'id', 'External Review ID', 'External ID', 'Yotpo Review ID', 'Shop Review ID',
  ]), 180);
  const reviewType = cleanText(pick(row, [
    'Review Type', 'type', 'review_type', 'Review Source Type', 'Kind', 'Scope',
  ]), 80).toLowerCase();
  const rawStatus = cleanText(pick(row, [
    'Review Status', 'Status', 'Published', 'Publication Status', 'State', 'review_status', 'published',
  ]), 80).toLowerCase();
  const score = clampNumber(pick(row, [
    'Review Score', 'Score', 'Rating', 'Stars', 'review_score', 'rating', 'star_rating',
  ]), 1, 5, 0);
  const title = cleanText(pick(row, [
    'Review Title', 'Title', 'Headline', 'review_title', 'headline', 'Subject',
  ]), 180);
  const content = cleanText(pick(row, [
    'Review Content', 'Content', 'Body', 'Comment', 'Review', 'review_content', 'body', 'comment', 'Description',
  ]), 5000);
  const reviewer = cleanText(pick(row, [
    'Reviewer Display Name', 'Reviewer Name', 'Name', 'Customer Name', 'User Name', 'Author', 'Display Name',
  ]), 160) || 'Imported customer';
  const email = cleanEmail(pick(row, [
    'Reviewer Email', 'Customer Email', 'Email', 'email', 'reviewer_email',
  ]));
  const createdAt = safeDate(pick(row, [
    'Review Creation Date', 'Created At', 'Created', 'Date', 'Submitted At', 'review_creation_date', 'created_at',
  ]));
  const productId = cleanText(pick(row, [
    'Product ID', 'Product Id', 'External Product ID', 'Product External ID', 'product_id', 'external_product_id', 'SKU', 'Product SKU', 'sku',
  ]), 240);
  const productTitle = cleanText(pick(row, [
    'Product Name', 'Product Title', 'Product', 'Title of Product', 'product_title', 'product_name',
  ]), 240);
  const productUrl = cleanText(pick(row, [
    'Product URL', 'Product Url', 'URL', 'Product Link', 'product_url', 'link',
  ]), 1000);
  const productHandle = cleanText(pick(row, ['Product Handle', 'Handle', 'product_handle']), 180) || handleFromUrl(productUrl);
  const orderId = cleanText(pick(row, ['Order ID', 'Order Id', 'order_id', 'Order Name', 'Order']), 120);
  const verified = parseBool(pick(row, [
    'Verified Buyer', 'Verified Purchase', 'Verified', 'Buyer Verified', 'verified_buyer', 'is_verified_buyer',
  ]));
  const media = splitUrls(pick(row, [
    'Published Media Urls', 'Published Media URLs', 'Media URLs', 'Photo URLs', 'Image URLs', 'Images', 'Videos', 'media_urls', 'pictures',
  ]));

  const productRef = productId || productHandle || productUrl || productTitle;
  const siteSentinel = /site|shop|store/i.test(reviewType)
    || /yotpo_site_reviews/i.test(productId)
    || /site review|shop review|store review/i.test(productTitle);
  const reviewScope = siteSentinel || (!productRef && sourcePlatform === 'shop_app') ? 'site' : 'product';
  const itemId = reviewScope === 'site' ? SITE_REVIEW_ITEM_ID : (productIdCandidates(productId)[0] || productHandle || productTitle || '');

  const publishedLike = rawStatus ? /(published|approved|active|live|accepted)/i.test(rawStatus) || parseBool(rawStatus) : true;
  const importOnlyPublished = options.importOnlyPublished !== false;
  const skipped = importOnlyPublished && rawStatus && !publishedLike;

  const duplicateHash = hashValue([
    sourcePlatform,
    externalReviewId,
    email,
    score,
    title.toLowerCase(),
    content.toLowerCase(),
    createdAt ? createdAt.toISOString().slice(0, 10) : '',
    itemId,
  ].join('|'));

  return {
    externalReviewId,
    reviewScope,
    itemId,
    rating: score,
    headline: title,
    comment: content,
    userId: reviewer,
    email,
    orderId,
    productTitle,
    productUrl,
    productHandle,
    externalProductId: productId,
    verifiedPurchase: Boolean(verified && options.importVerifiedWhenAvailable !== false),
    verificationNote: verified ? `Verified buyer imported from ${sourcePlatform}` : `Imported from ${sourcePlatform}`,
    source: 'import',
    sourcePlatform,
    sourceLabel: sourcePlatform === 'shop_app' ? 'Shop review import' : `${sourcePlatform} import`,
    status: skipped ? 'skipped' : (publishedLike ? 'accepted' : 'pending'),
    rawStatus,
    media,
    createdAt: createdAt || new Date(),
    duplicateHash,
    skipReason: skipped ? `Skipped because source status is ${rawStatus || 'not published'}` : '',
  };
}

async function loadShopifyProductIndex(shopDomain) {
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&fields=id,title,handle,variants,image`, { shopDomain });
  const products = data?.products || [];
  const byId = new Map();
  const byHandle = new Map();
  const byTitle = new Map();
  const bySku = new Map();

  products.forEach((product) => {
    const canonical = {
      id: String(product.id || ''),
      gid: product.id ? `gid://shopify/Product/${product.id}` : '',
      title: product.title || 'Product',
      handle: product.handle || '',
      image: product.image?.src || '',
    };
    if (canonical.id) byId.set(canonical.id, canonical);
    if (canonical.gid) byId.set(canonical.gid, canonical);
    if (canonical.handle) byHandle.set(canonical.handle.toLowerCase(), canonical);
    if (canonical.title) byTitle.set(canonical.title.toLowerCase(), canonical);
    (product.variants || []).forEach((variant) => {
      if (variant.sku) bySku.set(String(variant.sku).toLowerCase(), canonical);
      if (variant.id) byId.set(String(variant.id), canonical);
    });
  });

  return { products: products.map((product) => ({ id: String(product.id), title: product.title, handle: product.handle })), byId, byHandle, byTitle, bySku, unavailable: !data };
}

function scoreCandidate(normalized, product) {
  if (!product) return { confidence: 0, reasons: [] };
  const reasons = [];
  let confidence = 0;
  const idCandidates = productIdCandidates(normalized.externalProductId || normalized.itemId);
  if (idCandidates.includes(product.id) || idCandidates.includes(product.gid)) {
    confidence = Math.max(confidence, 100);
    reasons.push('Product ID match');
  }
  if (normalized.productHandle && product.handle && normalized.productHandle.toLowerCase() === product.handle.toLowerCase()) {
    confidence = Math.max(confidence, 95);
    reasons.push('Handle match');
  }
  if (normalized.externalProductId && String(normalized.externalProductId).toLowerCase() === String(product.handle).toLowerCase()) {
    confidence = Math.max(confidence, 90);
    reasons.push('External product reference matches handle');
  }
  if (normalized.productTitle && product.title && normalized.productTitle.toLowerCase() === product.title.toLowerCase()) {
    confidence = Math.max(confidence, 85);
    reasons.push('Title match');
  }
  return { confidence, reasons };
}

function matchProduct(normalized, index) {
  if (normalized.reviewScope === 'site') return { status: 'site_review', confidence: 100, selectedProduct: null, productCandidates: [] };
  const idCandidates = productIdCandidates(normalized.externalProductId || normalized.itemId);
  const possible = [];
  idCandidates.forEach((id) => {
    const product = index.byId.get(id);
    if (product) possible.push(product);
  });
  if (normalized.productHandle) {
    const product = index.byHandle.get(normalized.productHandle.toLowerCase());
    if (product) possible.push(product);
  }
  if (normalized.productTitle) {
    const product = index.byTitle.get(normalized.productTitle.toLowerCase());
    if (product) possible.push(product);
  }
  if (normalized.externalProductId) {
    const skuProduct = index.bySku.get(String(normalized.externalProductId).toLowerCase());
    if (skuProduct) possible.push(skuProduct);
  }

  const deduped = Array.from(new Map(possible.map((product) => [product.id, product])).values())
    .map((product) => ({ ...product, ...scoreCandidate(normalized, product) }))
    .sort((a, b) => b.confidence - a.confidence);

  if (deduped[0]?.confidence >= 85) {
    return { status: 'matched', confidence: deduped[0].confidence, selectedProduct: deduped[0], productCandidates: deduped.slice(0, 5) };
  }
  return { status: 'needs_mapping', confidence: deduped[0]?.confidence || 0, selectedProduct: null, productCandidates: deduped.slice(0, 5) };
}

async function previewCsvMigration({ shopDomain, sourcePlatform, csvText, fileName = '', options = {} }) {
  const parsed = parseCsv(csvText, { maxRows: Number(options.maxRows || 10000) });
  const index = await loadShopifyProductIndex(shopDomain);
  const batch = await ReviewMigrationBatch.create({
    shopDomain,
    sourcePlatform,
    mode: 'csv',
    status: 'preview',
    fileName: cleanText(fileName, 240),
    csvHeaders: parsed.headers,
    options,
    summary: { totalRows: parsed.rows.length },
    errors: index.unavailable ? [{ type: 'shopify_products_unavailable', message: 'Could not fetch Shopify products. Product mapping may require manual review.' }] : [],
  });

  const stagedDocs = [];
  const summary = {
    totalRows: parsed.rows.length,
    productReviews: 0,
    siteReviews: 0,
    matched: 0,
    needsMapping: 0,
    skipped: 0,
    duplicates: 0,
    imported: 0,
    failed: 0,
  };

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i];
    const normalized = normalizeReviewRow(row, sourcePlatform, options);
    const rowHash = hashValue(JSON.stringify(row));
    let match = matchProduct(normalized, index);
    let status = match.status;
    let issue = '';

    if (!normalized.rating || !normalized.comment) {
      status = 'skipped';
      issue = 'Missing rating or review content.';
    }
    if (normalized.skipReason) {
      status = 'skipped';
      issue = normalized.skipReason;
    }

    if (normalized.externalReviewId) {
      const existing = await Review.findOne({ shopDomain, sourcePlatform, externalReviewId: normalized.externalReviewId }).select('_id').lean();
      if (existing) {
        status = 'duplicate';
        issue = 'A review with this source review ID already exists.';
      }
    } else {
      const existing = await Review.findOne({ shopDomain, duplicateHash: normalized.duplicateHash }).select('_id').lean();
      if (existing) {
        status = 'duplicate';
        issue = 'A likely duplicate review already exists.';
      }
    }

    if (normalized.reviewScope === 'site') summary.siteReviews += 1;
    else summary.productReviews += 1;
    if (status === 'matched') summary.matched += 1;
    if (status === 'needs_mapping') summary.needsMapping += 1;
    if (status === 'site_review') summary.matched += 1;
    if (status === 'skipped') summary.skipped += 1;
    if (status === 'duplicate') summary.duplicates += 1;

    stagedDocs.push({
      shopDomain,
      batchId: batch._id,
      sourcePlatform,
      rowIndex: i + 1,
      rowHash,
      externalReviewId: normalized.externalReviewId,
      reviewScope: normalized.reviewScope,
      status,
      issue,
      confidence: match.confidence,
      sourceRow: row,
      normalized,
      productCandidates: match.productCandidates,
      selectedProduct: match.selectedProduct,
    });
  }

  if (stagedDocs.length) await ReviewMigrationStagedReview.insertMany(stagedDocs, { ordered: false });
  batch.summary = summary;
  await batch.save();

  const sampleRows = await ReviewMigrationStagedReview.find({ batchId: batch._id })
    .sort({ rowIndex: 1 })
    .limit(50)
    .lean();

  return { batch: batch.toObject(), rows: sampleRows, productIndexAvailable: !index.unavailable };
}

function selectedProductFromOverride(override) {
  if (!override) return null;
  const id = cleanText(override.id || override.productId || override.gid || '', 180);
  if (!id) return null;
  const numeric = id.match(/\d{5,}/)?.[0] || id;
  return {
    id: numeric,
    gid: id.startsWith('gid://') ? id : `gid://shopify/Product/${numeric}`,
    title: cleanText(override.title || 'Mapped product', 240),
    handle: cleanText(override.handle || '', 180),
  };
}

async function importMigrationBatch({ shopDomain, batchId, mappingOverrides = {}, importStatus = 'accepted' }) {
  const batch = await ReviewMigrationBatch.findOne({ _id: batchId, shopDomain });
  if (!batch) throw new Error('Migration batch not found.');
  if (['importing', 'imported'].includes(batch.status)) throw new Error(`Batch is already ${batch.status}.`);

  batch.status = 'importing';
  batch.importStartedAt = new Date();
  await batch.save();

  const rows = await ReviewMigrationStagedReview.find({ shopDomain, batchId: batch._id }).sort({ rowIndex: 1 });
  const summary = { ...batch.summary.toObject?.() || batch.summary };
  summary.imported = 0;
  summary.failed = 0;
  summary.duplicates = Number(summary.duplicates || 0);

  for (const row of rows) {
    if (['skipped', 'duplicate', 'imported', 'failed'].includes(row.status)) continue;
    const normalized = row.normalized || {};
    const override = mappingOverrides[String(row.rowIndex)] || mappingOverrides[String(row._id)] || null;
    const selectedProduct = row.reviewScope === 'site' ? null : (selectedProductFromOverride(override) || row.selectedProduct);

    if (row.reviewScope !== 'site' && !selectedProduct?.id && !selectedProduct?.gid) {
      row.status = 'needs_mapping';
      row.issue = 'Product mapping required before import.';
      await row.save();
      continue;
    }

    const externalReviewId = cleanText(normalized.externalReviewId, 180);
    let duplicate = null;
    if (externalReviewId) {
      duplicate = await Review.findOne({ shopDomain, sourcePlatform: normalized.sourcePlatform, externalReviewId }).select('_id').lean();
    }
    if (!duplicate && normalized.duplicateHash) {
      duplicate = await Review.findOne({ shopDomain, duplicateHash: normalized.duplicateHash }).select('_id').lean();
    }
    if (duplicate) {
      row.status = 'duplicate';
      row.issue = 'Skipped at import because duplicate was found.';
      summary.duplicates += 1;
      await row.save();
      continue;
    }

    try {
      const created = await Review.create({
        shopDomain,
        itemId: row.reviewScope === 'site' ? SITE_REVIEW_ITEM_ID : (selectedProduct.gid || `gid://shopify/Product/${selectedProduct.id}`),
        reviewScope: row.reviewScope,
        userId: cleanText(normalized.userId || 'Imported customer', 120),
        email: cleanEmail(normalized.email),
        rating: clampNumber(normalized.rating, 1, 5, 5),
        headline: cleanText(normalized.headline, 180),
        comment: cleanText(normalized.comment, 5000),
        productTitle: row.reviewScope === 'site' ? '' : cleanText(selectedProduct.title || normalized.productTitle, 240),
        productHandle: row.reviewScope === 'site' ? '' : cleanText(selectedProduct.handle || normalized.productHandle, 180),
        productUrl: cleanText(normalized.productUrl, 1000),
        externalProductId: cleanText(normalized.externalProductId, 240),
        source: 'import',
        sourcePlatform: cleanText(normalized.sourcePlatform || batch.sourcePlatform, 80),
        sourceLabel: cleanText(normalized.sourceLabel || `${batch.sourcePlatform} import`, 120),
        externalReviewId,
        importBatchId: String(batch._id),
        status: ['pending', 'accepted', 'rejected', 'hold', 'spam'].includes(importStatus) ? importStatus : cleanText(normalized.status, 20) || 'accepted',
        verifiedPurchase: Boolean(normalized.verifiedPurchase),
        verificationNote: cleanText(normalized.verificationNote, 300),
        orderId: cleanText(normalized.orderId, 120),
        media: Array.isArray(normalized.media) ? normalized.media : [],
        duplicateHash: cleanText(normalized.duplicateHash, 100),
        createdAt: safeDate(normalized.createdAt) || new Date(),
      });
      row.status = 'imported';
      row.importedReviewId = created._id;
      row.issue = '';
      summary.imported += 1;
      await row.save();
    } catch (error) {
      row.status = 'failed';
      row.issue = error.message || 'Failed to import review.';
      summary.failed += 1;
      await row.save();
    }
  }

  batch.summary = summary;
  batch.status = summary.failed > 0 ? 'partial' : 'imported';
  batch.importedAt = new Date();
  await batch.save();

  return { batch: batch.toObject(), summary };
}

async function migrationOverview(shopDomain) {
  const [settings, batches, scans, counts] = await Promise.all([
    Settings.findOne({ shopDomain }).select('migrationMode').lean(),
    ReviewMigrationBatch.find({ shopDomain }).sort({ createdAt: -1 }).limit(10).lean(),
    ReviewStorefrontScan.find({ shopDomain }).sort({ createdAt: -1 }).limit(5).lean(),
    Review.aggregate([
      { $match: { shopDomain, isDeleted: { $ne: true } } },
      { $group: { _id: { scope: { $ifNull: ['$reviewScope', 'product'] }, sourcePlatform: '$sourcePlatform' }, count: { $sum: 1 } } },
    ]),
  ]);
  return { settings: settings?.migrationMode || {}, batches, scans, counts };
}

function extractAggregateRating(html) {
  const matches = [];
  const jsonLdBlocks = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  jsonLdBlocks.forEach((block) => {
    const jsonText = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(jsonText.trim());
      const nodes = Array.isArray(parsed) ? parsed : (Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]);
      nodes.forEach((node) => {
        const rating = node?.aggregateRating;
        if (rating) {
          matches.push({
            type: 'json_ld_aggregate_rating',
            ratingValue: rating.ratingValue || rating.rating || '',
            reviewCount: rating.reviewCount || rating.ratingCount || '',
            rawType: node['@type'] || '',
          });
        }
        const review = node?.review;
        if (review) {
          matches.push({ type: 'json_ld_review', count: Array.isArray(review) ? review.length : 1, rawType: node['@type'] || '' });
        }
      });
    } catch (_) {}
  });
  return matches;
}

function detectReviewSignals(html) {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const aggregate = extractAggregateRating(source);
  const yotpoAppKey = source.match(/(?:appkey|app_key|data-appkey|data-yotpo-app-key)["'\s:=]+([A-Za-z0-9_-]{10,})/i)?.[1] || '';
  return {
    yotpoDetected: /yotpo|yotpo-main-widget|staticw2\.yotpo\.com|yotpo-widget/i.test(source),
    yotpoAppKey,
    shopSignalsDetected: /shopify-product-reviews|shop-app|shop app|shop_review|shop-review|shopify-review/i.test(lower),
    schemaReviewsDetected: aggregate.some((item) => item.type === 'json_ld_review'),
    aggregateRatings: aggregate.filter((item) => item.type === 'json_ld_aggregate_rating'),
    potentialPublicReviews: aggregate.reduce((sum, item) => sum + Number(item.reviewCount || item.count || 0), 0),
  };
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NectarReviewsMigrationScanner/1.0' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function runStorefrontScan(shopDomain, options = {}) {
  const scan = await ReviewStorefrontScan.create({ shopDomain, status: 'running', options });
  const limit = Math.max(1, Math.min(20, Number(options.limit || 8)));
  const base = `https://${shopDomain}`;
  const discoveries = [];
  const errors = [];
  const summary = {
    productsChecked: 0,
    pagesChecked: 0,
    yotpoDetected: false,
    shopSignalsDetected: false,
    schemaReviewsDetected: false,
    aggregateRatingsDetected: 0,
    potentialPublicReviews: 0,
    importableRows: 0,
  };

  try {
    const homeHtml = await fetchText(base).catch((error) => {
      errors.push({ url: base, message: error.message });
      return '';
    });
    if (homeHtml) {
      summary.pagesChecked += 1;
      const signals = detectReviewSignals(homeHtml);
      discoveries.push({ url: base, pageType: 'home', signals });
      summary.yotpoDetected = summary.yotpoDetected || signals.yotpoDetected;
      summary.shopSignalsDetected = summary.shopSignalsDetected || signals.shopSignalsDetected;
      summary.schemaReviewsDetected = summary.schemaReviewsDetected || signals.schemaReviewsDetected;
      summary.aggregateRatingsDetected += signals.aggregateRatings.length;
      summary.potentialPublicReviews += signals.potentialPublicReviews;
    }

    let products = [];
    const productData = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=${limit}&fields=id,title,handle`, { shopDomain }).catch(() => null);
    if (productData?.products?.length) {
      products = productData.products.map((product) => ({ title: product.title, handle: product.handle, id: String(product.id) })).slice(0, limit);
    } else {
      const publicJson = await fetchText(`${base}/products.json?limit=${limit}`).catch((error) => {
        errors.push({ url: `${base}/products.json`, message: error.message });
        return '';
      });
      if (publicJson) {
        try {
          const parsed = JSON.parse(publicJson);
          products = (parsed.products || []).map((product) => ({ title: product.title, handle: product.handle, id: String(product.id || '') })).slice(0, limit);
        } catch (error) {
          errors.push({ url: `${base}/products.json`, message: `Could not parse product JSON: ${error.message}` });
        }
      }
    }

    for (const product of products) {
      if (!product.handle) continue;
      const url = `${base}/products/${encodeURIComponent(product.handle)}`;
      const html = await fetchText(url).catch((error) => {
        errors.push({ url, message: error.message });
        return '';
      });
      summary.productsChecked += 1;
      if (!html) continue;
      summary.pagesChecked += 1;
      const signals = detectReviewSignals(html);
      discoveries.push({ url, pageType: 'product', product, signals });
      summary.yotpoDetected = summary.yotpoDetected || signals.yotpoDetected;
      summary.shopSignalsDetected = summary.shopSignalsDetected || signals.shopSignalsDetected;
      summary.schemaReviewsDetected = summary.schemaReviewsDetected || signals.schemaReviewsDetected;
      summary.aggregateRatingsDetected += signals.aggregateRatings.length;
      summary.potentialPublicReviews += signals.potentialPublicReviews;
    }

    scan.status = 'completed';
    scan.summary = summary;
    scan.discoveries = discoveries;
    scan.errors = errors;
    scan.completedAt = new Date();
    await scan.save();
    return scan.toObject();
  } catch (error) {
    scan.status = 'failed';
    scan.errors = [...errors, { message: error.message || 'Scan failed.' }];
    scan.completedAt = new Date();
    await scan.save();
    throw error;
  }
}

module.exports = {
  SITE_REVIEW_ITEM_ID,
  parseCsv,
  normalizeReviewRow,
  previewCsvMigration,
  importMigrationBatch,
  migrationOverview,
  runStorefrontScan,
};
