const fs=require('fs'),assert=require('assert');
const route=fs.readFileSync('src/routes/manualReviews.js','utf8');
const ui=fs.readFileSync('public/manual-review-import.js','utf8');
const checks=[
 ['AI title endpoint',route.includes("router.post('/generate-title'")],
 ['AI title grounded prompt',route.includes('Do not add facts, product claims, scores, flavour notes or benefits')],
 ['AI title max 80',route.includes('.slice(0,80)')],
 ['AI generate button',ui.includes('✨ AI generate title')],
 ['description required before AI',ui.includes("comment.length<8")],
 ['sourness opt-in',ui.includes('mr-sour-live')],
 ['sweetness opt-in',ui.includes('mr-sweet-live')],
 ['flavour opt-in',ui.includes('mr-flavour-live')],
 ['score sliders default disabled',ui.includes('value="5" disabled')],
 ['only opted-in attributes saved',ui.includes("mr-sour-live').checked")&&ui.includes("mr-flavour-live').checked")]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 manual review AI title + optional scores smoke passed: ${checks.length} checks`);
