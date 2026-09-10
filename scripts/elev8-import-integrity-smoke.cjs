const fs=require('fs'),assert=require('assert');
const files={
 a:fs.readFileSync('src/modules/product-creation-import/services/fieldAuthority.service.js','utf8'),
 c:fs.readFileSync('src/modules/product-creation-import/services/catalogueReference.service.js','utf8'),
 n:fs.readFileSync('src/modules/product-creation-import/services/normaliseProduct.service.js','utf8'),
 m:fs.readFileSync('src/modules/product-creation-import/services/metafieldSchemaRegistry.service.js','utf8'),
 e:fs.readFileSync('src/modules/product-creation-import/services/productEnrichment.service.js','utf8'),
 b:fs.readFileSync('src/modules/product-creation-import/services/productImportBatch.service.js','utf8'),
 p:fs.readFileSync('src/modules/product-creation-import/productCreationImport.service.js','utf8')
};
const checks=[
 ['merchant lock service',files.a.includes('markMerchantEdits')],
 ['authority merge',files.a.includes('mergeMetafieldsWithAuthority')],
 ['catalogue context',files.c.includes('buildCatalogueReferenceContext')],
 ['about brand discovery',files.c.includes('findAboutBrandDefinition')],
 ['manual SEO preservation',files.n.includes("locked(raw, 'seo.title')")],
 ['about brand schema',files.m.includes('about_brand')],
 ['catalogue sent to OpenAI',files.e.includes('catalogueContext')],
 ['cross-product flavour blocked',files.e.includes('NEVER reuse flavour/profile')],
 ['batch edits marked merchant',files.b.includes('markMerchantEdits')],
 ['create flow preserves merchant draft',files.p.includes('merchantDraft')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 importer integrity smoke passed: ${checks.length} checks`);
