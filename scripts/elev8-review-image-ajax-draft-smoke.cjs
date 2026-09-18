const fs=require('fs'),assert=require('assert');
const ui=fs.readFileSync('public/manual-review-image-import.js','utf8');
const route=fs.readFileSync('src/routes/manualReviewImageImports.js','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['local edits synced before rerender',ui.includes('function syncAllCardsIntoItems()')],
 ['item draft persisted',ui.includes('async function persistItemDraft(index)')],
 ['manual API helper exists',ui.includes('async function manualApi(')],
 ['stable manual batch id exists',ui.includes('ensureManualDraftBatchId()')],
 ['single add is AJAX',ui.includes("manualApi('/batches'")&&ui.includes("Saving draft…")],
 ['single add does not switch tabs',!ui.match(/function addItem[\s\S]{0,1800}data-tab="add"/)],
 ['bulk add stays in image tab',ui.includes('await addItem(indexes[i])')],
 ['added item gets state',ui.includes("item.addedToManualDraft=true")],
 ['backend persists added state',route.includes("item.addedToManualDraft=Boolean")],
 ['backend drafted status',route.includes("item.status=item.addedToManualDraft?'drafted'")],
 ['ajax css loaded',html.includes('/manual-review-ajax-draft.css')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 image AJAX draft fix smoke passed: ${checks.length} checks`);
