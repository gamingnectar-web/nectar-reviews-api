const fs=require('fs'),assert=require('assert');
const route=fs.readFileSync('src/routes/manualReviewImageImports.js','utf8');
const manualRoute=fs.readFileSync('src/routes/manualReviews.js','utf8');
const ui=fs.readFileSync('public/manual-review-image-import.js','utf8');
const manual=fs.readFileSync('public/manual-review-import.js','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['manual product search endpoint',route.includes("router.get('/products/search'")],
 ['Shopify search includes status',route.includes('status vendor')],
 ['vault endpoint',route.includes("/items/:itemId/vault")],
 ['vault placeholder path',route.includes('/images/elev8-vault-tub.png')],
 ['unresolved remains needs mapping',route.includes("'needs_mapping'")],
 ['frontend manual search',ui.includes('Search all Shopify products')&&ui.includes('mri-search-btn')],
 ['frontend vault action',ui.includes('Use Vault / discontinued product')],
 ['frontend vault image',ui.includes("VAULT_IMAGE='/images/elev8-vault-tub.png'")],
 ['manual form carries archived flag',manual.includes('mr-product-archived')],
 ['manual backend allows vault id',manualRoute.includes('vaultItemId')],
 ['vault source label',manualRoute.includes("Manual Add · Vault")],
 ['vault CSS loaded',html.includes('/manual-review-vault.css')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 review image Vault mapping smoke passed: ${checks.length} checks`);
