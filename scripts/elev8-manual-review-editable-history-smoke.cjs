const fs=require('fs'),assert=require('assert');
const model=fs.readFileSync('src/models/index.js','utf8');
const route=fs.readFileSync('src/routes/manualReviews.js','utf8');
const manual=fs.readFileSync('public/manual-review-import.js','utf8');
const edit=fs.readFileSync('public/manual-review-edit.js','utf8');
const admin=fs.readFileSync('public/admin.js','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['import reason schema',model.includes('importReason:')&&model.includes('importReasonDetail:')],
 ['manual reason required',route.includes('Choose why this review is being added manually')],
 ['historical edit GET',route.includes("router.get('/reviews/:reviewId'"))],
 ['historical edit PATCH',route.includes("router.patch('/reviews/:reviewId'"))],
 ['edits restricted to manual/import',route.includes("['manual','import']")],
 ['AI title endpoint',route.includes("router.post('/generate-title'"))],
 ['manual reason UI',manual.includes('mr-import-reason')],
 ['manual optional scores',manual.includes('mr-sour-live')&&manual.includes('mr-flavour-live')],
 ['history editor reason',edit.includes('Reason this review exists in ELEV8')],
 ['history editor AI title',edit.includes('AI generate title')],
 ['history editor independent scores',edit.includes('Include Sourness score')&&edit.includes('Include Flavour score')],
 ['review manager edit action',admin.includes('editableImportHtml')&&admin.includes('openImportedReviewEditor')],
 ['reason warning on old imports',admin.includes('Import reason not recorded')],
 ['editor asset loaded',html.includes('/manual-review-edit.js')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 editable historical review smoke passed: ${checks.length} checks`);
