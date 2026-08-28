const fs=require('fs'),assert=require('assert');
const api=fs.readFileSync('src/routes/public.js','utf8');
const js=fs.readFileSync('extensions/review-widget-extension/assets/nectar-all-reviews-page.js','utf8');
const liquid=fs.readFileSync('extensions/review-widget-extension/blocks/all_reviews_seo_page.liquid','utf8');
const css=fs.readFileSync('extensions/review-widget-extension/assets/nectar-all-reviews-page-v5.css','utf8');

const checks=[
 ['v5 build',liquid.includes('reviews-seo-20260827-5')],
 ['v5 css',liquid.includes('nectar-all-reviews-page-v5.css')],
 ['catalogue text resolver',api.includes('searchSeoProductsFromReviewText')],
 ['confidence score',api.includes('seoCandidateScore')],
 ['requires title overlap',api.includes('best.titleMatches < 2')],
 ['unresolved recommendations suppressed',api.includes('reviewHasUsefulProductTitle(review)).forEach')],
 ['successful mapping persisted',api.includes("externalProductId: next.resolvedProductId")],
 ['raw id guard in JS',js.includes('isRawProductId')],
 ['no fake initial tile',!js.includes("esc(initials(review))")],
 ['no-image layout',css.includes('.nectar-seo-review.no-product-image')],
];

for(const [name,ok] of checks){assert.ok(ok,name);console.log(`✓ ${name}`)}
console.log(`All Reviews v5 resolver smoke passed: ${checks.length} checks`);
