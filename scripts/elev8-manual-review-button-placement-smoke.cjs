const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('public/manual-review-import.js','utf8');
const checks=[
 ['tab row lookup',src.includes("['reviews','approval rules','trash'].includes(text)")],
 ['button appended to tab row',src.includes('tabsParent.appendChild(btn)')],
 ['right aligned in same line',src.includes('.mr-review-tabs-row .mr-open-inline{margin-left:auto!important')],
 ['fallback still exists',src.includes("parent.classList.add('mr-titlebar')")]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 Manual Add placement smoke passed: ${checks.length} checks`);
