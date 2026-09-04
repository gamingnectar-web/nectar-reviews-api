const fs=require('fs'),assert=require('assert');
const liquid=fs.readFileSync('extensions/review-widget-extension/blocks/all_reviews_seo_page.liquid','utf8');
const js=fs.readFileSync('extensions/review-widget-extension/assets/nectar-all-reviews-page.js','utf8');
const api=fs.readFileSync('src/routes/public.js','utf8');

const checks=[
 ['build marker',liquid.includes('reviews-seo-20260904-5.1')],
 ['raw id guard',js.includes('const isRawProductId =')],
 ['safe title guard',js.includes('const safeProductTitle =')],
 ['fake initials removed',!js.includes('esc(initials(review))')],
 ['catalogue resolver',api.includes('searchSeoProductsFromReviewText')],
 ['confidence scoring',api.includes('seoCandidateScore')],
 ['title overlap gate',api.includes('best.titleMatches<2') || api.includes('best.titleMatches < 2')],
 ['resolved metadata persisted',api.includes('externalProductId: next.resolvedProductId')],
 ['unresolved recommendations suppressed',api.includes('reviewHasUsefulProductTitle(review)).forEach')],
];
for(const [name,ok] of checks){ assert.ok(ok,name); console.log(`✓ ${name}`); }
console.log(`All Reviews v5.1 repair smoke passed: ${checks.length} checks`);
