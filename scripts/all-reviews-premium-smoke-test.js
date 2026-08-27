const fs = require('fs');
const assert = require('assert');

const liquid = fs.readFileSync('extensions/review-widget-extension/blocks/all_reviews_seo_page.liquid','utf8');
const css = fs.readFileSync('extensions/review-widget-extension/assets/nectar-all-reviews-page.css','utf8');
const js = fs.readFileSync('extensions/review-widget-extension/assets/nectar-all-reviews-page.js','utf8');
const api = fs.readFileSync('src/routes/public.js','utf8');

const checks = [
  ['premium build marker exists', liquid.includes('reviews-seo-20260827-2')],
  ['center search shell exists', liquid.includes('nectar-seo-search__box')],
  ['floating review background exists', liquid.includes('data-nectar-seo-ambient') && css.includes('@keyframes nectarSeoFloat')],
  ['5 star quick search exists', liquid.includes('data-rating="5"')],
  ['1 star quick search exists', liquid.includes('data-rating="1"')],
  ['exact rating API supported', api.includes('const exactRating = clampNumber(req.query.rating')],
  ['exact rating applies before min rating', api.includes('if (exactRating) match.rating = exactRating')],
  ['results include filter sidebar', liquid.includes('nectar-seo-filter-panel')],
  ['real reviews populate floating cards', js.includes('populateAmbient(root, reviews)')],
  ['search failure has retry UI', js.includes('data-retry-reviews')],
  ['approved review API remains source', js.includes('/reviews/seo-page')],
  ['JSON-LD remains rendered', js.includes('application/ld+json')],
];
for (const [label, ok] of checks) {
  assert.ok(ok, label);
  console.log(`✓ ${label}`);
}
console.log(`All Reviews premium smoke passed: ${checks.length} checks`);
