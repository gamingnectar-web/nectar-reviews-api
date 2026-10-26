'use strict';
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');
function c(ok, m){ if(!ok){ console.error('✗ ' + m); process.exitCode=1; } else console.log('✓ ' + m); }

const models = read('src/models/index.js');
const route = read('src/routes/admin.js');
const html = read('public/admin.html');
const js = read('public/admin.js');
const liquid = read('extensions/review-widget-extension/blocks/product_card_stars.liquid');
const mirror = read('Shopify-Liquid/blocks/product_card_stars.liquid');

c(models.includes('displayPreset') && models.includes('collectionPreset') && models.includes('recommendationPreset'), 'settings schema stores product-card versions by context');
c(route.includes("displayPreset: ['pill','minimal','stars','score','outline']") && route.includes('collectionPreset') && route.includes('searchPreset'), 'admin settings route validates product-card context versions');
c(html.includes('card-display-preset') && html.includes('card-collection-preset') && html.includes('card-recommendation-preset'), 'Visual Customiser exposes product-card context selectors');
c(js.includes('elev8CardPresetForContext') && js.includes('elev8CardPreviewMarkup') && js.includes('recommendationPreset'), 'admin preview and save/load logic support context versions');
c(liquid.includes('data-card-context') && liquid.includes('inferContext') && liquid.includes('resolvePreset'), 'theme app extension selects product-card version from storefront context');
c(liquid.includes('product-recommendations') && liquid.includes("context = inferContext"), 'recommendation sections are detected client-side');
c(liquid.includes("preset === 'minimal'") && liquid.includes("preset === 'stars'") && liquid.includes("preset === 'score'") && liquid.includes("preset === 'outline'"), 'all five product-card versions render');
c(liquid === mirror, 'Shopify-Liquid mirror stays identical to the theme app extension block');

if(process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 product-card context styles smoke test passed.');
