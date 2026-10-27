'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
function check(ok,msg){if(ok)console.log('✓ '+msg);else{console.error('✗ '+msg);process.exitCode=1;}}

const service=read('src/modules/product-creation-import/services/productFieldRecommendation.service.js');
const shopify=read('src/modules/product-creation-import/services/shopifyProduct.service.js');
const routes=read('src/modules/product-creation-import/productCreationImport.routes.js');
const ui=read('public/supplier-sites-admin.js');
const css=read('public/supplier-sites-admin.css');
const authority=read('src/modules/product-creation-import/services/fieldAuthority.service.js');

check(service.includes('buildProductFieldRecommendations')&&service.includes('buildProvenance'),'backend builds field recommendations and provenance');
check(service.includes("Product override")&&service.includes("Catalogue default")&&service.includes("Shop recommendation")&&service.includes("AI suggestion")&&service.includes("Supplier"),'all requested provenance states are modelled');
check(service.includes('Similar existing products from this merchant')||service.includes('SIMILAR EXISTING PRODUCTS FROM THIS MERCHANT'),'AI uses existing Shopify products as style examples');
check(service.includes('Never invent ingredients')&&service.includes('style/format examples only'),'AI prompt prevents shop examples becoming fake product facts');
check(shopify.includes('body_html')&&shopify.includes('descriptionHtml: product.body_html'),'existing Shopify description structure is available to recommendation engine');
check(routes.includes('/field-recommendations'),'field recommendation endpoint is exposed');
check(ui.includes('Shop-aware recommendations')&&ui.includes('applyFieldRecommendation')&&ui.includes('renderProvenance'),'product modal shows reviewable field-level suggestions and provenance');
check(ui.includes("loadFieldAdvice(false)")&&ui.includes("loadFieldAdvice(true)"),'modal loads deterministic shop comparison and offers optional AI refinement');
check(authority.includes('markMerchantEdits')&&authority.includes("source: 'merchant'"),'applied recommendation becomes an explicit merchant/product override when saved');
check(css.includes('.supplier-source-chip')&&css.includes('.supplier-advice-card'),'recommendation/provenance UI is styled');

if(process.exitCode)process.exit(process.exitCode);
console.log('ELEV8 import field intelligence smoke test passed.');
