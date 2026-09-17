const fs=require('fs'),assert=require('assert');
const model=fs.readFileSync('src/models/index.js','utf8');
const app=fs.readFileSync('src/app.js','utf8');
const route=fs.readFileSync('src/routes/manualReviews.js','utf8');
const ui=fs.readFileSync('public/manual-review-import.js','utf8');
const admin=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['manual source enum',model.includes("['website', 'email', 'import', 'manual']")],
 ['manual route mounted',app.includes("/api/admin/manual-reviews")],
 ['Shopify product search',route.includes("router.get('/products'")],
 ['bulk draft creation',route.includes("router.post('/batches'")&&route.includes("status:'pending'")],
 ['duplicate protection',route.includes('duplicateHash')],
 ['batch approval',route.includes("router.post('/batches/:batchId/approve'")],
 ['draft delete',route.includes("router.post('/batches/:batchId/delete'")],
 ['Manual Add button',ui.includes('+ Manual Add')],
 ['customer-style star fields',ui.includes('mr-stars')&&ui.includes('Review headline')],
 ['bulk add rows',ui.includes('+ Add another review')],
 ['draft batch manager',ui.includes('Draft batches')&&ui.includes('Approve batch')],
 ['admin asset loaded',admin.includes('/manual-review-import.js')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 manual review import smoke passed: ${checks.length} checks`);
