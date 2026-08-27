
const fs = require('fs');
const assert = require('assert');
const js = fs.readFileSync('public/admin-widget-library-universal.js', 'utf8');
const html = fs.readFileSync('public/admin.html', 'utf8');

const checks = [
  ['SEO widget uses current canonical key', js.includes("key: 'seo_reviews_page'")],
  ['legacy seo_page alias remains supported', js.includes("aliases: ['seo_page']")],
  ['all backend toggleable widgets are retained', js.includes('byKey.forEach')],
  ['SEO page setup endpoint is wired', js.includes('/admin/all-reviews-page-setup')],
  ['Shopify page creation endpoint is wired', js.includes('/admin/storefront-pages/create')],
  ['SEO editor exposes page handle', js.includes('uwm-seo-handle')],
  ['SEO editor exposes title', js.includes('uwm-seo-title')],
  ['SEO editor exposes search placeholder', js.includes('uwm-seo-placeholder')],
  ['existing widget editors remain routed', js.includes("widget.key === 'star_rating'") && js.includes("widget.key === 'reviews_carousel'")],
  ['admin shell loads universal manager', html.includes('/admin-widget-library-universal.js')],
];

let passed = 0;
for (const [label, ok] of checks) {
  assert.ok(ok, label);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`Universal widget manager smoke passed: ${passed} checks`);
