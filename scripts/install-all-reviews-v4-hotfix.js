const fs = require('fs');
const path = require('path');

function mustRead(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function patchLiquid() {
  const file = path.join(
    process.cwd(),
    'extensions',
    'review-widget-extension',
    'blocks',
    'all_reviews_seo_page.liquid'
  );

  let src = mustRead(file);

  const hotfixTag = "{{ 'nectar-all-reviews-page-hotfix.css' | asset_url | stylesheet_tag }}";
  const refinementTag = "{{ 'nectar-all-reviews-page-refinement.css' | asset_url | stylesheet_tag }}";
  const baseTag = "{{ 'nectar-all-reviews-page.css' | asset_url | stylesheet_tag }}";

  if (!src.includes('nectar-all-reviews-page-hotfix.css')) {
    if (src.includes(refinementTag)) {
      src = src.replace(refinementTag, `${refinementTag}\n${hotfixTag}`);
    } else if (src.includes(baseTag)) {
      src = src.replace(baseTag, `${baseTag}\n${hotfixTag}`);
    } else {
      throw new Error('Could not find All Reviews stylesheet include in Liquid block.');
    }
  }

  src = src.replace(/data-build="[^"]*"/, 'data-build="reviews-seo-20260827-4"');

  fs.writeFileSync(file, src);
  console.log('✓ Liquid block updated to reviews-seo-20260827-4');
}

function patchRenderer() {
  const file = path.join(
    process.cwd(),
    'extensions',
    'review-widget-extension',
    'assets',
    'nectar-all-reviews-page.js'
  );

  let src = mustRead(file);

  const cleanMarker = "const cleanText = (value) => String(value ?? '').trim();";

  if (!src.includes('const isRawProductId =')) {
    if (!src.includes(cleanMarker)) {
      throw new Error('Could not find cleanText marker in All Reviews JS.');
    }

    src = src.replace(
      cleanMarker,
      `${cleanMarker}
  const isRawProductId = (value) => {
    const text = cleanText(value);
    return /^\\d{6,}$/.test(text) || /^gid:\\/\\/shopify\\/(?:Product|Variant)\\/\\d+$/i.test(text);
  };
  const safeProductTitle = (value, fallback = 'Product review') => {
    const title = cleanText(value);
    return title && !isRawProductId(title) ? title : fallback;
  };`
    );
  }

  // Correct the v3 bug where the RegExp was accidentally emitted with a literal \\d.
  src = src
    .replace(/\/\^\\\\d\{6,\}\$\//g, '/^\\d{6,}$/')
    .replace(/\/\^\\\\d\{6,\}\$\//g, '/^\\d{6,}$/');

  // Recommendation title must never expose raw itemId/numeric ids.
  src = src.replace(
    "esc(item.productTitle || 'Recommended product')",
    "esc(safeProductTitle(item.productTitle, 'Recommended product'))"
  );

  // Review card title must never expose raw ids.
  src = src.replace(
    /esc\(review\.productTitle \|\| 'Customer review'\)/g,
    "esc(safeProductTitle(review.productTitle, 'Product review'))"
  );

  // Popular search IDs must be filtered out.
  src = src.replace(
    /\.filter\(\(label\) => label && !\/\^\\\\d\{6,\}\$\/\.test\(String\(label\)\)\)/g,
    ".filter((label) => label && !isRawProductId(label))"
  );
  src = src.replace(
    /\.filter\(\(label\) => label && !\/\^\\d\{6,\}\$\/\.test\(String\(label\)\)\)/g,
    ".filter((label) => label && !isRawProductId(label))"
  );

  // Ambient title.
  src = src.replace(
    /const safeTitle = esc\([^\n;]+;/,
    "const safeTitle = esc(safeProductTitle(review.productTitle, 'Customer review'));"
  );

  // Prefer Shopify-resolved product image.
  src = src.replace(
    /const image = mediaUrl\(review\);/g,
    "const image = review.productImage || mediaUrl(review);"
  );

  fs.writeFileSync(file, src);
  console.log('✓ Storefront JS now hides raw product IDs and prefers Shopify product images');
}

function patchPublicApi() {
  const file = path.join(process.cwd(), 'src', 'routes', 'public.js');
  let src = mustRead(file);

  if (!src.includes("const { env } = require('../config/env');")) {
    src = src.replace(
      "const express = require('express');",
      "const express = require('express');\nconst { env } = require('../config/env');"
    );
  }

  if (!src.includes('async function fetchSeoProductsGraphql(')) {
    const enrichMarker = 'async function enrichSeoReviewProducts(shopDomain, reviews = []) {';

    if (!src.includes(enrichMarker)) {
      throw new Error(
        'Existing SEO enrichment function not found. Apply the prior All Reviews refinement first.'
      );
    }

    const graphqlHelper = `
async function fetchSeoProductsGraphql(shopDomain, numericIds = []) {
  const ids = numericIds
    .map((id) => cleanText(id, 80))
    .filter(Boolean)
    .map((id) => \`gid://shopify/Product/\${id}\`);

  if (!ids.length) return new Map();

  const query = \`query NectarReviewProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
      }
    }
  }\`;

  const response = await shopifyFetchOptional(
    \`/admin/api/\${env.shopifyApiVersion}/graphql.json\`,
    {
      shopDomain,
      method: 'POST',
      body: JSON.stringify({
        query,
        variables: { ids },
      }),
    }
  ).catch(() => null);

  const map = new Map();

  (Array.isArray(response?.data?.nodes) ? response.data.nodes : []).forEach((product) => {
    if (!product?.id) return;

    const numericId = String(product.id).split('/').pop();
    if (!numericId) return;

    const image =
      product?.featuredMedia?.preview?.image?.url ||
      '';

    map.set(numericId, {
      productTitle: cleanText(product.title, 240),
      productHandle: cleanText(product.handle, 180),
      productImage: cleanText(image, 1000),
      productUrl: product.handle
        ? \`https://\${shopDomain}/products/\${encodeURIComponent(product.handle)}\`
        : '',
    });
  });

  return map;
}

`;

    src = src.replace(enrichMarker, graphqlHelper + enrichMarker);
  }

  const writesMarker = `  const writes = [];
  const enriched = rows.map((row) => {`;

  if (
    src.includes(writesMarker) &&
    !src.includes('const unresolvedIds = missingIds.filter((id) => !productMap.has(id));')
  ) {
    src = src.replace(
      writesMarker,
      `  const unresolvedIds = missingIds.filter((id) => !productMap.has(id));

  if (unresolvedIds.length) {
    for (let index = 0; index < unresolvedIds.length; index += 50) {
      const fallback = await fetchSeoProductsGraphql(
        shopDomain,
        unresolvedIds.slice(index, index + 50)
      );

      fallback.forEach((product, id) => {
        productMap.set(id, product);
      });
    }
  }

${writesMarker}`
    );
  }

  // Product recommendation title should never become an ID.
  src = src.replace(
    "productTitle: reviewHasUsefulProductTitle(review) ? review.productTitle : 'Product review',",
    "productTitle: reviewHasUsefulProductTitle(review) ? review.productTitle : 'Product review',"
  );

  fs.writeFileSync(file, src);
  console.log('✓ SEO API now falls back from Shopify REST to Shopify GraphQL');
}

patchLiquid();
patchRenderer();
patchPublicApi();

console.log('');
console.log('All Reviews v4 hotfix installed.');
