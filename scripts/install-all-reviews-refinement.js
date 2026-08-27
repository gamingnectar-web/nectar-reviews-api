const fs = require('fs');
const path = require('path');

function patchLiquid() {
  const file = path.join(process.cwd(), 'extensions', 'review-widget-extension', 'blocks', 'all_reviews_seo_page.liquid');
  if (!fs.existsSync(file)) throw new Error('All Reviews Liquid block not found.');
  let src = fs.readFileSync(file, 'utf8');
  const cssTag = "{{ 'nectar-all-reviews-page-refinement.css' | asset_url | stylesheet_tag }}";
  if (!src.includes('nectar-all-reviews-page-refinement.css')) {
    const target = "{{ 'nectar-all-reviews-page.css' | asset_url | stylesheet_tag }}";
    if (!src.includes(target)) throw new Error('Base All Reviews stylesheet tag not found.');
    src = src.replace(target, `${target}\n${cssTag}`);
  }
  src = src.replace(/data-build="[^"]*"/, 'data-build="reviews-seo-20260827-3"');
  fs.writeFileSync(file, src);
  console.log('✓ Loaded storefront refinement CSS and bumped All Reviews build marker.');
}

function patchPublicRoute() {
  const file = path.join(process.cwd(), 'src', 'routes', 'public.js');
  if (!fs.existsSync(file)) throw new Error('src/routes/public.js not found.');
  let src = fs.readFileSync(file, 'utf8');

  if (!src.includes("const { env } = require('../config/env');")) {
    src = src.replace(
      "const express = require('express');",
      "const express = require('express');\nconst { env } = require('../config/env');"
    );
  }

  const publicMarker = "function normaliseReviewForPublic(review) {";
  if (!src.includes('async function enrichSeoReviewProducts(')) {
    if (!src.includes(publicMarker)) throw new Error('normaliseReviewForPublic marker not found.');
    const helper = `
function seoProductNumericId(value) {
  const raw = cleanText(value, 180);
  if (!raw) return '';
  const gid = raw.match(/^gid:\\/\\/shopify\\/Product\\/(\\d+)$/i);
  if (gid) return gid[1];
  if (/^\\d{6,}$/.test(raw)) return raw;
  const candidates = raw.match(/\\d{6,}/g) || [];
  return candidates[0] || '';
}

function reviewHasUsefulProductTitle(review = {}) {
  const title = cleanText(review.productTitle, 240);
  return Boolean(title && !/^\\d{6,}$/.test(title) && !/^gid:\\/\\/shopify\\//i.test(title));
}

async function enrichSeoReviewProducts(shopDomain, reviews = []) {
  const rows = Array.isArray(reviews) ? reviews.map((row) => ({ ...row })) : [];
  const missingIds = Array.from(new Set(rows
    .filter((row) => !reviewHasUsefulProductTitle(row) || !row.productHandle || !row.productImage)
    .map((row) => seoProductNumericId(row.itemId))
    .filter(Boolean)
  )).slice(0, 200);

  if (!missingIds.length) return rows;

  const productMap = new Map();
  for (let index = 0; index < missingIds.length; index += 50) {
    const ids = missingIds.slice(index, index + 50);
    const endpoint = \`/admin/api/\${env.shopifyApiVersion}/products.json?ids=\${encodeURIComponent(ids.join(','))}&limit=50&fields=id,title,handle,image,images\`;
    const data = await shopifyFetchOptional(endpoint, { shopDomain }).catch(() => null);
    (Array.isArray(data?.products) ? data.products : []).forEach((product) => {
      const image = product?.image?.src || product?.images?.[0]?.src || '';
      productMap.set(String(product.id), {
        productTitle: cleanText(product.title, 240),
        productHandle: cleanText(product.handle, 180),
        productImage: cleanText(image, 1000),
        productUrl: product.handle ? \`https://\${shopDomain}/products/\${encodeURIComponent(product.handle)}\` : '',
      });
    });
  }

  const writes = [];
  const enriched = rows.map((row) => {
    const id = seoProductNumericId(row.itemId);
    const product = productMap.get(id);
    if (!product) return row;
    const next = {
      ...row,
      productTitle: reviewHasUsefulProductTitle(row) ? row.productTitle : product.productTitle,
      productHandle: row.productHandle || product.productHandle,
      productUrl: row.productUrl || product.productUrl,
      productImage: row.productImage || product.productImage,
    };
    if (row._id && (next.productTitle !== row.productTitle || next.productHandle !== row.productHandle || next.productUrl !== row.productUrl || next.productImage !== row.productImage)) {
      writes.push({
        updateOne: {
          filter: { _id: row._id, shopDomain },
          update: { $set: {
            productTitle: next.productTitle || '',
            productHandle: next.productHandle || '',
            productUrl: next.productUrl || '',
            productImage: next.productImage || '',
          } }
        }
      });
    }
    return next;
  });

  if (writes.length) Review.bulkWrite(writes, { ordered: false }).catch((error) => console.warn('SEO product metadata backfill skipped:', error.message));
  return enriched;
}

`;
    src = src.replace(publicMarker, helper + publicMarker);
  }

  // Expose productImage in public normalized review
  if (!src.includes("productImage: plain.productImage || ''")) {
    src = src.replace(
      "productUrl: plain.productUrl || '',",
      "productUrl: plain.productUrl || '',\n    productImage: plain.productImage || '',"
    );
  }

  // Ensure schema has a property by relying on strict:false? Mongoose strict default true, so add model field separately in model patch below.
  const baseRowsLine = "const baseRows = await Review.find(match).sort({ createdAt: -1 }).limit(500).lean();";
  if (src.includes(baseRowsLine)) {
    src = src.replace(
      baseRowsLine,
      "const rawBaseRows = await Review.find(match).sort({ createdAt: -1 }).limit(500).lean();\n    const baseRows = await enrichSeoReviewProducts(shopDomain, rawBaseRows);"
    );
  } else if (!src.includes('const baseRows = await enrichSeoReviewProducts(shopDomain, rawBaseRows);')) {
    throw new Error('SEO baseRows marker not found; refusing unsafe route patch.');
  }

  // Never allow numeric IDs to become recommendation titles.
  src = src.replace(
    "productTitle: review.productTitle || productKey,",
    "productTitle: reviewHasUsefulProductTitle(review) ? review.productTitle : 'Product review',"
  );

  fs.writeFileSync(file, src);
  console.log('✓ Added Shopify title/handle/image enrichment to SEO review results.');
}

function patchModel() {
  const file = path.join(process.cwd(), 'src', 'models', 'index.js');
  if (!fs.existsSync(file)) throw new Error('src/models/index.js not found.');
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes("productImage: { type: String, default: '' }")) {
    src = src.replace(
      "productUrl: { type: String, default: '' },",
      "productUrl: { type: String, default: '' },\n  productImage: { type: String, default: '' },"
    );
  }
  fs.writeFileSync(file, src);
  console.log('✓ Added productImage to stored review metadata.');
}

patchLiquid();
patchPublicRoute();
patchModel();
