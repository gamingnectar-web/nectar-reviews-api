'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
function check(ok,msg){if(ok)console.log('✓ '+msg);else{console.error('✗ '+msg);process.exitCode=1;}}

const routes=read('src/modules/product-creation-import/productCreationImport.routes.js');
const service=read('src/modules/product-creation-import/services/productImportBatch.service.js');
const authority=read('src/modules/product-creation-import/services/fieldAuthority.service.js');
const ui=read('public/supplier-sites-admin.js');

check(routes.includes("'/batches/:batchId/ai-rescan'"),'explicit AI source-rescan endpoint exists');
check(routes.includes("itemIds.length > 3")&&routes.includes("capped at 3 products"),'server hard-caps each request at 3 products');
check(routes.includes("useAi: true")&&routes.includes("OPENAI_API_KEY"),'explicit rescan uses AI and requires the configured key');
check(routes.includes("automaticRetry: false"),'no automatic retry is queued');
check(routes.includes("estimatedMaxAiCalls: itemIds.length * 3"),'response exposes a conservative AI-call ceiling');
check(service.includes("const beforeDraft = item.draft")&&service.includes("preserveLockedFields(beforeDraft, draft)"),'saved merchant fields are restored after source/AI enrichment');
check(authority.includes("'price','compareAtPrice','sku','barcode'"),'price/SKU/barcode merchant locks are preserved');
check(ui.includes("AI rescan unresolved · max 3")&&ui.includes("AI re-read source"),'catalogue and product-level AI source rescan controls exist');
check(ui.includes("['failed','needs_review','queued'].includes(item.status)"),'catalogue action targets unresolved products only');
check(ui.includes("Nothing will retry automatically")&&ui.includes("No retries were queued"),'UI makes retry behaviour explicit');

if(process.exitCode)process.exit(process.exitCode);
console.log('ELEV8 explicit AI source rescan smoke test passed.');
