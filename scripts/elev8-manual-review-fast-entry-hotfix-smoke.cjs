const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('public/manual-review-import.js','utf8');
const checks=[
 ['no literal newline token between save handlers',!src.includes("continueAdding:false});\\n    $('mr-save-add')")],
 ['save handler exists',src.includes("$('mr-save').onclick=()=>saveBatch({continueAdding:false});")],
 ['save-add handler exists',src.includes("$('mr-save-add').onclick=()=>saveBatch({continueAdding:true});")],
 ['active batch declared',src.includes("let activeManualBatchId=''")],
 ['active batch retained after save',src.includes('activeManualBatchId=data.batchId||activeManualBatchId')],
 ['new modal resets batch',src.includes("function modal(){\n    activeManualBatchId='';")],
 ['save-add hidden on drafts',src.includes("$('mr-save-add').style.display=name==='add'?'inline-flex':'none';")]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 fast-entry hotfix smoke passed: ${checks.length} checks`);
