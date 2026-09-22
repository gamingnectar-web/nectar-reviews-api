const fs=require('fs'),assert=require('assert');
const svc=fs.readFileSync('src/modules/marketing-intelligence/marketingIntelligence.service.js','utf8');
const routes=fs.readFileSync('src/modules/marketing-intelligence/marketingIntelligence.routes.js','utf8');
const ui=fs.readFileSync('public/modules/marketing-intelligence/marketing-intelligence.js','utf8');
const css=fs.readFileSync('public/modules/marketing-intelligence/marketing-intelligence.css','utf8');
const checks=[
 ['all-time PO lookup',!svc.includes('const since=new Date(Date.now()-183*DAY)')],
 ['product/variant fallback maps',svc.includes('byProduct')&&svc.includes('byVariant')],
 ['order query includes variant id',svc.includes('variant{id inventoryQuantity')],
 ['uncosted units tracked',svc.includes('uncostedUnits30d')],
 ['cost diagnostic service',svc.includes('async function productCostBasis')],
 ['cost endpoint',routes.includes("/products/:productId/cost-basis")],
 ['creative helper service',svc.includes('async function suggestCreativeBrief')],
 ['creative helper endpoint',routes.includes("/creative/suggest-brief")],
 ['cost button',ui.includes('data-mi-cost')],
 ['cost modal',ui.includes('openCostBasis')],
 ['AI art direction button',ui.includes('mi-suggest-brief')],
 ['premium prompt guardrails',svc.includes('Avoid giant floating ingredients')],
 ['modal CSS',css.includes('.mi-cost-backdrop')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 cost + creative upgrade smoke passed: ${checks.length} checks`);
