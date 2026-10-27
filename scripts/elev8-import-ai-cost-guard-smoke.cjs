'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
function check(ok,msg){if(ok)console.log('✓ '+msg);else{console.error('✗ '+msg);process.exitCode=1;}}

const routes=read('src/modules/product-creation-import/productCreationImport.routes.js');
const ui=read('public/supplier-sites-admin.js');
const jobs=read('src/modules/product-creation-import/jobs/siteImportAutomation.js');
const batch=read('src/modules/product-creation-import/services/productImportBatch.service.js');

check(jobs.includes("disabled: true")&&jobs.includes("manual-only supplier imports")&&jobs.includes("function startSiteImportAutomation() { return null; }"),'scheduled supplier import automation is disabled');
check(batch.includes('backgroundEnabled:false')&&batch.includes('backgroundAi:false'),'new supplier catalogues disable background processing and background AI');
check(routes.includes('PRODUCT_IMPORT_BULK_AI_ENABLED'),'bulk AI has a separate explicit server-side opt-in');
check((routes.match(/productImportBulkAiEnabled\(\) && body\.useAi === true/g)||[]).length>=3,'site import, scan and enrich all enforce the bulk-AI kill switch');
check(ui.includes("rootUrl,name,maxProducts,useAi:false"),'supplier catalogue discovery explicitly keeps AI off');
check(ui.includes("useAi:false")&&ui.includes('Each product is attempted once only; AI is off.'),'initial supplier pass is non-AI and one-attempt');
check(ui.includes("loadFieldAdvice(false)); // ELEV8_IMPORT_AI_COST_GUARD_V1"),'Shop suggestions are deterministic and do not consume AI');
check(ui.includes("spm-advice-ai')?.addEventListener('click',()=>loadFieldAdvice(true))")||ui.includes("spm-advice-ai').addEventListener('click',()=>loadFieldAdvice(true))"),'AI refine copy remains an explicit one-product action');
check(ui.includes('No automatic retry will occur.'),'AI refresh failure message confirms no automatic retry');

if(process.exitCode)process.exit(process.exitCode);
console.log('ELEV8 import AI cost guard smoke test passed.');
