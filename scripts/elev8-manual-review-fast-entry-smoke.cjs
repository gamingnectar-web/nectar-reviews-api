const fs=require('fs'),assert=require('assert');
const route=fs.readFileSync('src/routes/manualReviews.js','utf8');
const ui=fs.readFileSync('public/manual-review-import.js','utf8');
const edit=fs.readFileSync('public/manual-review-edit.js','utf8');
const checks=[
 ['same batch continuation',route.includes('requestedBatchId')&&route.includes('newBatchId()')],
 ['save and add button',ui.includes('Save & add another')&&ui.includes('mr-save-add')],
 ['active batch retained',ui.includes('activeManualBatchId=data.batchId')],
 ['new blank row after save',ui.includes("rows.innerHTML=''")&&ui.includes('addRow();')],
 ['manual stars larger',ui.includes('font-size:40px')],
 ['edit stars larger',edit.includes('font-size:40px')],
 ['edit button restyled',edit.includes('.manual-import-edit-btn{')&&edit.includes('#eef9fb')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 manual-review fast-entry smoke passed: ${checks.length} checks`);
