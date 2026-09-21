const fs=require('fs'),assert=require('assert');
const nav=fs.readFileSync('public/elev8-context-nav.js','utf8');
const dash=fs.readFileSync('public/elev8-dashboard.js','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['dashboard tile exists',dash.includes('data-open="marketing"')],
 ['context router handles marketing',nav.includes("marketing:['Marketing Intelligence']")],
 ['sidebar click context handles marketing',nav.includes("e8Context='marketing'")],
 ['marketing sidebar button exists',html.includes("window.tab('v-marketing-intelligence')")],
 ['marketing target view exists',html.includes('id="v-marketing-intelligence"')],
 ['marketing module script exists',html.includes('/modules/marketing-intelligence/marketing-intelligence.js')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 Marketing navigation hotfix smoke passed: ${checks.length} checks`);
