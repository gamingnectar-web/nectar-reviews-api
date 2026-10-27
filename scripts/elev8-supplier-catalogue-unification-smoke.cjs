'use strict';const fs=require('fs'),R=p=>fs.readFileSync(p,'utf8');function c(v,m){if(v)console.log('✓ '+m);else{console.error('✗ '+m);process.exitCode=1;}}
const model=R('src/modules/product-creation-import/productImportBatch.model.js'),svc=R('src/modules/product-creation-import/services/supplierCatalogue.service.js'),batch=R('src/modules/product-creation-import/services/productImportBatch.service.js'),routes=R('src/modules/product-creation-import/productCreationImport.routes.js'),ui=R('public/supplier-sites-admin.js');
c(model.includes('supplierCatalogueSchema'),'catalogue identity/settings schema exists');
c(svc.includes('findExisting')&&batch.includes('newItemIds'),'repeat supplier scans merge and report only new items');
c(svc.includes('consolidate')&&svc.includes('mergedInto'),'legacy duplicate catalogues consolidate without deletion');
c(svc.includes('applyPresets')&&svc.includes("source:'catalogue-preset'"),'catalogue presets are fallback-only');
c(svc.includes('getSnapshot(shopDomain)')&&svc.includes('seoTitlePattern'),'recommendations learn writing patterns from shop products');
c(routes.includes('/site-imports/consolidate')&&routes.includes('/catalogue-settings')&&routes.includes('/catalogue-recommendations'),'catalogue APIs exist');
c(ui.includes('supplier-site-cog')&&ui.includes('CATALOGUE DEFAULTS'),'catalogue cog/settings modal exists');
c(ui.includes('onlyNew')&&ui.includes('newItemIds'),'repeat scans first-pass only new products');
if(process.exitCode)process.exit(process.exitCode);console.log('ELEV8 supplier catalogue unification smoke test passed.');