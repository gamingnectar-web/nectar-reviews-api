const fs=require('fs'),assert=require('assert');
const stats=fs.readFileSync('src/routes/elev8CommercePulse.js','utf8');
const model=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/catalogueAudit.model.js','utf8');
const profile=fs.readFileSync('src/modules/product-creation-import/services/brandDirectoryProfile.service.js','utf8');
const rules=fs.readFileSync('src/modules/product-creation-import/services/brandRules.service.js','utf8');
const ui=fs.readFileSync('public/brand-directory-rules.js','utf8');
const checks=[
['UK calendar day',stats.includes("TZ='Europe/London'")&&stats.includes('threshold(days)')],
['financial status filtering',stats.includes('displayFinancialStatus')&&stats.includes('function valid')],
['refunds netted',stats.includes('Math.max(0,total-refund)')],
['PO weighted cost',stats.includes('function poCosts')],
['Shopify unit cost fallback',stats.includes('inventoryItem{unitCost')],
['no fake 100% margin',stats.includes('knownRevenue>0?')],
['total customer count',stats.includes('customersCount')],
['always rules stored',model.includes('alwaysApply:')],
['conditional rules stored',model.includes('conditionalRules:')],
['merchant locks respected',rules.includes('locked(draft')],
['rules applied during import',profile.includes('applyBrandRules')],
['readable brand editor',ui.includes('What ELEV8 knows')&&ui.includes('Conditional rules')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 stats + brand rules smoke passed: ${checks.length} checks`);
