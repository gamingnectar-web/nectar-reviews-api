const fs = require('fs');
const path = require('path');

const publicFile = path.join(process.cwd(), 'src', 'routes', 'public.js');
const jsFile = path.join(process.cwd(), 'extensions', 'review-widget-extension', 'assets', 'nectar-all-reviews-page.js');
const liquidFile = path.join(process.cwd(), 'extensions', 'review-widget-extension', 'blocks', 'all_reviews_seo_page.liquid');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function patchPublicApi() {
  let src = read(publicFile);

  if (!src.includes('async function searchSeoProductsFromReviewText(')) {
    const marker = 'async function enrichSeoReviewProducts(shopDomain, reviews = []) {';
    if (!src.includes(marker)) throw new Error('SEO enrichment helper missing. Apply the previous refinement first.');

    const helpers = `
const SEO_STOP_WORDS = new Set([
  'about','after','again','also','been','being','best','but','could','customer','did','does',
  'drink','drinking','everything','flavour','flavor','from','great','have','honestly','into',
  'just','like','love','make','makes','more','much','only','people','price','really','review',
  'says','said','smooth','still','super','taste','tastes','than','that','their','there','these',
  'they','this','those','very','what','when','with','would','your'
]);

function seoWords(value) {
  return cleanText(value, 3000)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\\s+/)
    .filter((word) => word.length >= 3 && !SEO_STOP_WORDS.has(word));
}

function seoReviewSearchTerms(review = {}) {
  const headlineWords = seoWords(review.headline);
  const commentWords = seoWords(review.comment);
  const tagWords = (review.productTags || []).flatMap(seoWords);

  const ordered = [...headlineWords, ...tagWords, ...commentWords];
  return Array.from(new Set(ordered))
    .filter((word) => word.length >= 4)
    .slice(0, 12);
}

function seoCandidateScore(review = {}, product = {}) {
  const reviewBlob = new Set([
    ...seoWords(review.headline),
    ...seoWords(review.comment),
    ...(review.productTags || []).flatMap(seoWords),
  ]);

  const titleWords = seoWords(product.title);
  const tagWords = (product.tags || []).flatMap(seoWords);
  const handleWords = seoWords(String(product.handle || '').replace(/-/g, ' '));

  let titleMatches = 0;
  let score = 0;

  titleWords.forEach((word) => {
    if (reviewBlob.has(word)) {
      titleMatches += 1;
      score += word.length >= 7 ? 6 : 4;
    }
  });

  tagWords.forEach((word) => {
    if (reviewBlob.has(word)) score += 1.5;
  });

  handleWords.forEach((word) => {
    if (reviewBlob.has(word)) score += 1;
  });

  if (titleMatches >= 2) score += 10;
  if (titleMatches >= Math.min(3, titleWords.length) && titleWords.length > 1) score += 6;

  return { score, titleMatches };
}

async function shopifyProductSearch(shopDomain, queryText) {
  const query = \`query NectarReviewProductSearch($query: String!) {
    products(first: 20, query: $query, sortKey: RELEVANCE) {
      nodes {
        id
        title
        handle
        tags
        featuredMedia {
          preview {
            image { url }
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
      body: JSON.stringify({ query, variables: { query: queryText } }),
    }
  ).catch(() => null);

  return Array.isArray(response?.data?.products?.nodes)
    ? response.data.products.nodes
    : [];
}

async function searchSeoProductsFromReviewText(shopDomain, review = {}) {
  const terms = seoReviewSearchTerms(review);
  if (!terms.length) return null;

  const searches = [];

  // Start with short combinations. Shopify search works much better with meaningful
  // phrases than with a whole review paragraph.
  if (terms.length >= 2) searches.push(terms.slice(0, 2).join(' '));
  if (terms.length >= 3) searches.push(terms.slice(0, 3).join(' '));
  terms.slice(0, 6).forEach((term) => searches.push(term));

  const seenQueries = new Set();
  const candidates = new Map();

  for (const queryText of searches) {
    const query = cleanText(queryText, 120);
    if (!query || seenQueries.has(query)) continue;
    seenQueries.add(query);

    const products = await shopifyProductSearch(shopDomain, query);

    products.forEach((product) => {
      if (!product?.id || !product?.title) return;
      candidates.set(product.id, product);
    });

    // Avoid unnecessary Shopify calls once there is a strong match.
    const rankedNow = Array.from(candidates.values())
      .map((product) => ({ product, ...seoCandidateScore(review, product) }))
      .sort((a, b) => b.score - a.score);

    if (rankedNow[0]?.titleMatches >= 2 && rankedNow[0]?.score >= 18) break;
  }

  const ranked = Array.from(candidates.values())
    .map((product) => ({ product, ...seoCandidateScore(review, product) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];

  // Conservative confidence gate: never invent a product mapping merely because
  // one generic word happens to overlap.
  if (!best || best.titleMatches < 2 || best.score < 16) return null;
  if (second && best.score - second.score < 3 && second.titleMatches >= best.titleMatches) return null;

  const image = best.product?.featuredMedia?.preview?.image?.url || '';
  const numericId = String(best.product.id || '').split('/').pop();

  return {
    productId: numericId || '',
    productTitle: cleanText(best.product.title, 240),
    productHandle: cleanText(best.product.handle, 180),
    productImage: cleanText(image, 1000),
    productUrl: best.product.handle
      ? \`https://\${shopDomain}/products/\${encodeURIComponent(best.product.handle)}\`
      : '',
    resolutionMethod: 'review_text_catalogue_match',
    resolutionScore: Number(best.score.toFixed(2)),
  };
}

async function resolveSeoReviewProduct(shopDomain, review = {}, directProductMap = new Map()) {
  const currentId = seoProductNumericId(review.itemId);

  if (currentId && directProductMap.has(currentId)) {
    return {
      ...directProductMap.get(currentId),
      resolutionMethod: 'shopify_id',
      resolutionScore: 100,
    };
  }

  return searchSeoProductsFromReviewText(shopDomain, review);
}

`;
    src = src.replace(marker, helpers + marker);
  }

  // Replace the body of enriched mapping to use the resolver when IDs don't resolve.
  const oldBlockStart = `  const writes = [];
  const enriched = rows.map((row) => {`;

  if (src.includes(oldBlockStart) && !src.includes('const enriched = [];\\n  for (const row of rows)')) {
    const start = src.indexOf(oldBlockStart);
    const endMarker = `  if (writes.length) Review.bulkWrite(writes, { ordered: false }).catch((error) => console.warn('SEO product metadata backfill skipped:', error.message));
  return enriched;`;
    const end = src.indexOf(endMarker, start);

    if (end < 0) throw new Error('Could not safely locate SEO enrichment map block.');

    const replacement = `  const writes = [];
  const enriched = [];

  for (const row of rows) {
    const resolved = await resolveSeoReviewProduct(shopDomain, row, productMap);

    if (!resolved) {
      enriched.push({
        ...row,
        productTitle: reviewHasUsefulProductTitle(row) ? row.productTitle : '',
        productResolution: 'unresolved',
      });
      continue;
    }

    const next = {
      ...row,
      productTitle: reviewHasUsefulProductTitle(row) ? row.productTitle : resolved.productTitle,
      productHandle: row.productHandle || resolved.productHandle,
      productUrl: row.productUrl || resolved.productUrl,
      productImage: row.productImage || resolved.productImage,
      resolvedProductId: resolved.productId || '',
      productResolution: resolved.resolutionMethod || 'shopify',
      productResolutionScore: resolved.resolutionScore || 0,
    };

    enriched.push(next);

    if (
      row._id &&
      (
        next.productTitle !== row.productTitle ||
        next.productHandle !== row.productHandle ||
        next.productUrl !== row.productUrl ||
        next.productImage !== row.productImage
      )
    ) {
      writes.push({
        updateOne: {
          filter: { _id: row._id, shopDomain },
          update: {
            $set: {
              productTitle: next.productTitle || '',
              productHandle: next.productHandle || '',
              productUrl: next.productUrl || '',
              productImage: next.productImage || '',
              externalProductId: next.resolvedProductId || row.externalProductId || '',
            }
          }
        }
      });
    }
  }

  if (writes.length) {
    Review.bulkWrite(writes, { ordered: false })
      .catch((error) => console.warn('SEO product metadata backfill skipped:', error.message));
  }

  return enriched;`;

    src = src.slice(0, start) + replacement + src.slice(end + endMarker.length);
  }

  // Only build recommendation cards from actual resolved products.
  src = src.replace(
    "baseRows.filter((review) => (review.reviewScope || 'product') === 'product' && review.itemId !== '__site__').forEach((review) => {",
    "baseRows.filter((review) => (review.reviewScope || 'product') === 'product' && review.itemId !== '__site__' && reviewHasUsefulProductTitle(review)).forEach((review) => {"
  );

  // Expose useful product-resolution fields publicly, but never expose internal raw fallback title.
  if (!src.includes("productResolution: plain.productResolution || ''")) {
    src = src.replace(
      "productImage: plain.productImage || '',",
      "productImage: plain.productImage || '',\n    productResolution: plain.productResolution || '',"
    );
  }

  fs.writeFileSync(publicFile, src);
  console.log('✓ Added catalogue-search resolver and suppressed unresolved recommendations.');
}

function patchRenderer() {
  let src = read(jsFile);

  if (!src.includes('const safeProductTitle =')) {
    const marker = "const cleanText = (value) => String(value ?? '').trim();";
    if (!src.includes(marker)) throw new Error('cleanText marker missing from storefront JS.');

    src = src.replace(marker, `${marker}
  const isRawProductId = (value) => {
    const text = cleanText(value);
    return /^\\d{6,}$/.test(text) || /^gid:\\/\\/shopify\\/(?:Product|Variant)\\/\\d+$/i.test(text);
  };
  const safeProductTitle = (value, fallback = '') => {
    const title = cleanText(value);
    return title && !isRawProductId(title) ? title : fallback;
  };`);
  }

  // Hard-stop raw IDs in any visible title.
  src = src.replace(
    /esc\(item\.productTitle \|\| 'Recommended product'\)/g,
    "esc(safeProductTitle(item.productTitle, 'Recommended product'))"
  );
  src = src.replace(
    /esc\(review\.productTitle \|\| 'Customer review'\)/g,
    "esc(safeProductTitle(review.productTitle, 'Customer review'))"
  );

  // Product image. If unresolved, render no fake initial tile at all.
  const oldMedia = `<div class="nectar-seo-review__media">\${image ? \`<img src="\${esc(image)}" alt="" loading="lazy">\` : esc(initials(review))}</div>`;
  const newMedia = `\${image ? \`<div class="nectar-seo-review__media"><img src="\${esc(image)}" alt="\${esc(safeProductTitle(review.productTitle, 'Product'))}" loading="lazy"></div>\` : ''}`;

  if (src.includes(oldMedia)) {
    src = src.replace(oldMedia, newMedia);
  }

  // Add class when there is no image so CSS can collapse the media column.
  src = src.replace(
    '<article class="nectar-seo-review">',
    '<article class="nectar-seo-review ${image ? \\'has-product-image\\' : \\'no-product-image\\'}">'
  );

  // Popular searches must only contain human-readable labels.
  src = src.replace(
    ".filter((label) => label && !/^\\\\d{6,}$/.test(String(label)))",
    ".filter((label) => label && !isRawProductId(label))"
  );
  src = src.replace(
    ".filter((label) => label && !/^\\d{6,}$/.test(String(label)))",
    ".filter((label) => label && !isRawProductId(label))"
  );

  fs.writeFileSync(jsFile, src);
  console.log('✓ Storefront removes fake initial tiles and raw product IDs.');
}

function patchLiquid() {
  let src = read(liquidFile);
  src = src.replace(/data-build="[^"]*"/, 'data-build="reviews-seo-20260827-5"');
  fs.writeFileSync(liquidFile, src);
  console.log('✓ Build marker set to reviews-seo-20260827-5');
}

patchPublicApi();
patchRenderer();
patchLiquid();
