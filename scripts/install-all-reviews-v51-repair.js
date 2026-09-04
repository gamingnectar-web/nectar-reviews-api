const fs = require('fs');
const path = require('path');

const liquidFile = path.join(process.cwd(),'extensions','review-widget-extension','blocks','all_reviews_seo_page.liquid');
const jsFile = path.join(process.cwd(),'extensions','review-widget-extension','assets','nectar-all-reviews-page.js');
const publicFile = path.join(process.cwd(),'src','routes','public.js');

function read(file){ if(!fs.existsSync(file)) throw new Error(`Missing ${file}`); return fs.readFileSync(file,'utf8'); }
function write(file,src){ fs.writeFileSync(file,src); }

let liquid = read(liquidFile);
liquid = liquid.replace(/data-build="[^"]*"/,'data-build="reviews-seo-20260904-5.1"');
write(liquidFile, liquid);
console.log('✓ Liquid build marker updated');

let js = read(jsFile);
const cleanMarker = "const cleanText = (value) => String(value ?? '').trim();";
if(!js.includes('const isRawProductId =')){
  js = js.replace(cleanMarker, `${cleanMarker}
  const isRawProductId = (value) => {
    const text = cleanText(value);
    return /^\\d{6,}$/.test(text) || /^gid:\\/\\/shopify\\/(?:Product|Variant)\\/\\d+$/i.test(text);
  };
  const safeProductTitle = (value, fallback = '') => {
    const title = cleanText(value);
    return title && !isRawProductId(title) ? title : fallback;
  };`);
}
js = js.replace(/esc\(item\.productTitle \|\| 'Recommended product'\)/g,
  "esc(safeProductTitle(item.productTitle, 'Recommended product'))");
js = js.replace(/esc\(review\.productTitle \|\| 'Customer review'\)/g,
  "esc(safeProductTitle(review.productTitle, 'Customer review'))");
js = js.replace(/: esc\(initials\(review\)\)/g, ": ''");
js = js.replace(
  '<article class="nectar-seo-review">',
  '<article class="nectar-seo-review ${image ? \\'has-product-image\\' : \\'no-product-image\\'}">'
);
js = js.replace(
  /\.filter\(\(label\) => label && !\/\^\\\\d\{6,\}\$\/\.test\(String\(label\)\)\)/g,
  ".filter((label) => label && !isRawProductId(label))"
);
write(jsFile, js);
console.log('✓ Storefront JS repaired');

let api = read(publicFile);
if(!api.includes("const { env } = require('../config/env');")){
  api = api.replace("const express = require('express');",
    "const express = require('express');\nconst { env } = require('../config/env');");
}

const enrichMarker = 'async function enrichSeoReviewProducts(shopDomain, reviews = []) {';
if(!api.includes(enrichMarker)) throw new Error('Missing enrichSeoReviewProducts helper');

if(!api.includes('async function searchSeoProductsFromReviewText(')){
const helpers = `
const SEO_REVIEW_STOP_WORDS = new Set([
  'about','after','again','also','been','being','best','but','could','customer','did','does',
  'drink','drinking','everything','flavour','flavor','from','great','have','honestly','into',
  'just','like','love','make','makes','more','much','only','people','price','really','review',
  'says','said','smooth','still','super','taste','tastes','than','that','their','there','these',
  'they','this','those','very','what','when','with','would','your'
]);

function seoReviewWords(value){
  return cleanText(value,3000).toLowerCase().replace(/[^a-z0-9]+/g,' ')
    .split(/\\s+/).filter((word)=>word.length>=3 && !SEO_REVIEW_STOP_WORDS.has(word));
}

function seoReviewSearchTerms(review={}){
  return Array.from(new Set([
    ...seoReviewWords(review.headline),
    ...(review.productTags||[]).flatMap(seoReviewWords),
    ...seoReviewWords(review.comment)
  ])).filter((word)=>word.length>=4).slice(0,12);
}

function seoCandidateScore(review={}, product={}){
  const reviewWords = new Set([
    ...seoReviewWords(review.headline),
    ...seoReviewWords(review.comment),
    ...(review.productTags||[]).flatMap(seoReviewWords)
  ]);
  const titleWords = seoReviewWords(product.title);
  let titleMatches=0, score=0;
  titleWords.forEach((word)=>{
    if(reviewWords.has(word)){
      titleMatches += 1;
      score += word.length>=7 ? 6 : 4;
    }
  });
  if(titleMatches>=2) score += 10;
  return {score,titleMatches};
}

async function shopifySeoProductSearch(shopDomain, queryText){
  const query = \`query NectarReviewProductSearch($query: String!) {
    products(first: 20, query: $query, sortKey: RELEVANCE) {
      nodes {
        id title handle tags
        featuredMedia { preview { image { url } } }
      }
    }
  }\`;
  const response = await shopifyFetchOptional(
    \`/admin/api/\${env.shopifyApiVersion}/graphql.json\`,
    { shopDomain, method:'POST', body:JSON.stringify({query,variables:{query:queryText}}) }
  ).catch(()=>null);
  return Array.isArray(response?.data?.products?.nodes) ? response.data.products.nodes : [];
}

async function searchSeoProductsFromReviewText(shopDomain, review={}){
  const terms = seoReviewSearchTerms(review);
  if(!terms.length) return null;

  const queries=[];
  if(terms.length>=2) queries.push(terms.slice(0,2).join(' '));
  if(terms.length>=3) queries.push(terms.slice(0,3).join(' '));
  terms.slice(0,6).forEach((term)=>queries.push(term));

  const candidates=new Map();
  const seen=new Set();

  for(const q of queries){
    if(!q || seen.has(q)) continue;
    seen.add(q);
    const products = await shopifySeoProductSearch(shopDomain,q);
    products.forEach((product)=>{ if(product?.id && product?.title) candidates.set(product.id,product); });
  }

  const ranked = Array.from(candidates.values())
    .map((product)=>({product,...seoCandidateScore(review,product)}))
    .sort((a,b)=>b.score-a.score);

  const best=ranked[0], second=ranked[1];
  if(!best || best.titleMatches<2 || best.score<16) return null;
  if(second && best.score-second.score<3 && second.titleMatches>=best.titleMatches) return null;

  const image = best.product?.featuredMedia?.preview?.image?.url || '';
  const productId = String(best.product.id||'').split('/').pop();

  return {
    productId,
    productTitle: cleanText(best.product.title,240),
    productHandle: cleanText(best.product.handle,180),
    productImage: cleanText(image,1000),
    productUrl: best.product.handle ? \`https://\${shopDomain}/products/\${encodeURIComponent(best.product.handle)}\` : '',
    resolutionMethod:'review_text_catalogue_match',
    resolutionScore:Number(best.score.toFixed(2))
  };
}

async function resolveSeoReviewProduct(shopDomain, review={}, productMap=new Map()){
  const numericId = seoProductNumericId(review.itemId);
  if(numericId && productMap.has(numericId)){
    return {...productMap.get(numericId), productId:numericId, resolutionMethod:'shopify_id', resolutionScore:100};
  }
  return searchSeoProductsFromReviewText(shopDomain,review);
}

`;
api = api.replace(enrichMarker, helpers + enrichMarker);
}

const oldStart = `  const writes = [];
  const enriched = rows.map((row) => {`;
const oldEnd = `  if (writes.length) Review.bulkWrite(writes, { ordered: false }).catch((error) => console.warn('SEO product metadata backfill skipped:', error.message));
  return enriched;`;

if(api.includes(oldStart)){
  const start = api.indexOf(oldStart);
  const end = api.indexOf(oldEnd,start);
  if(end<0) throw new Error('Could not locate old enrichment block');

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

    if (row._id && (
      next.productTitle !== row.productTitle ||
      next.productHandle !== row.productHandle ||
      next.productUrl !== row.productUrl ||
      next.productImage !== row.productImage
    )) {
      writes.push({
        updateOne: {
          filter: { _id: row._id, shopDomain },
          update: { $set: {
            productTitle: next.productTitle || '',
            productHandle: next.productHandle || '',
            productUrl: next.productUrl || '',
            productImage: next.productImage || '',
            externalProductId: next.resolvedProductId || row.externalProductId || '',
          }}
        }
      });
    }
  }

  if (writes.length) {
    Review.bulkWrite(writes, { ordered:false })
      .catch((error)=>console.warn('SEO product metadata backfill skipped:',error.message));
  }

  return enriched;`;

  api = api.slice(0,start) + replacement + api.slice(end + oldEnd.length);
}

api = api.replace(
  "baseRows.filter((review) => (review.reviewScope || 'product') === 'product' && review.itemId !== '__site__').forEach((review) => {",
  "baseRows.filter((review) => (review.reviewScope || 'product') === 'product' && review.itemId !== '__site__' && reviewHasUsefulProductTitle(review)).forEach((review) => {"
);

write(publicFile, api);
console.log('✓ Backend resolver installed');
console.log('All Reviews v5.1 repair complete');
