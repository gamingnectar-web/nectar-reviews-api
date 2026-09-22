const fs=require('fs'),assert=require('assert');
const d=fs.readFileSync('public/elev8-dashboard.js','utf8'),n=fs.readFileSync('public/elev8-context-nav.js','utf8'),a=fs.readFileSync('public/admin.js','utf8'),s=fs.readFileSync('public/module-shell.js','utf8'),r=fs.readFileSync('public/module-registry.js','utf8'),m=fs.readFileSync('public/modules/marketing-intelligence/marketing-intelligence.js','utf8'),h=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['discounts exact',d.includes("discounts:'v-discounts'")],
 ['loyalty exact',d.includes("loyalty:'v-loyalty'")],
 ['marketing exact',d.includes("marketing:'v-marketing-intelligence'")],
 ['no fuzzy router',!d.includes("querySelectorAll('.tab-btn,button,a')")],
 ['context exact marketing',n.includes("marketing:'v-marketing-intelligence'")],
 ['discount loader',a.includes("id === 'v-discounts') window.loadDiscountConfig?.()")],
 ['loyalty loader',a.includes("id === 'v-loyalty') window.loadLoyaltyConfig?.()")],
 ['marketing loader',a.includes("id === 'v-marketing-intelligence') window.Elev8MarketingIntelligence?.load?.()")],
 ['shell module',s.includes("v-marketing-intelligence') return 'marketing-intelligence'")],
 ['browser registry',r.includes("id:'marketing-intelligence'")],
 ['marketing public API',m.includes('window.Elev8MarketingIntelligence=')],
 ['cache bump',h.includes('route-fix-2')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 module routing smoke passed: ${checks.length} checks`);
