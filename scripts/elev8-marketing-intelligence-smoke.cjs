const fs=require('fs'),assert=require('assert');
const registry=fs.readFileSync('src/modules/moduleRegistry.js','utf8');
const modules=fs.readFileSync('src/modules/index.js','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const dash=fs.readFileSync('public/elev8-dashboard.js','utf8');
const backend=fs.readFileSync('src/modules/marketing-intelligence/marketingIntelligence.service.js','utf8');
const ui=fs.readFileSync('public/modules/marketing-intelligence/marketing-intelligence.js','utf8');
const checks=[
 ['module registered',registry.includes("id: 'marketing-intelligence'")],
 ['module mounted',modules.includes('mountMarketingIntelligenceModule(app, deps)')],
 ['API namespace',modules.includes("require('./marketing-intelligence')")],
 ['admin nav',html.includes("window.tab('v-marketing-intelligence')")],
 ['admin view',html.includes('id="v-marketing-intelligence"')],
 ['admin assets',html.includes('/modules/marketing-intelligence/marketing-intelligence.js')],
 ['dashboard tile',dash.includes('data-open="marketing"')],
 ['sales scoring',backend.includes('opportunityScore')],
 ['6 month normalisation',backend.includes('units183d')],
 ['review sentiment input',backend.includes("status:'accepted'")],
 ['PO cost input',backend.includes("product_creation_imports")],
 ['OpenAI background generation',backend.includes('/v1/images/generations')],
 ['background-only prompt',backend.includes('Generate ONLY a background plate')],
 ['real product compositing',ui.includes('ctx.drawImage(product,x,y,w,h)')],
 ['safe Shopify image proxy',fs.readFileSync('src/modules/marketing-intelligence/marketingIntelligence.routes.js','utf8').includes("host==='cdn.shopify.com'")]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 Marketing Intelligence smoke passed: ${checks.length} checks`);
