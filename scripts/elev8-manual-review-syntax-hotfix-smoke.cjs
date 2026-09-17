const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('public/manual-review-import.js','utf8');
assert.ok(!src.includes("?.querySelector('.mr-val').textContent=input.value"),'invalid optional-chain assignment still present');
assert.ok(src.includes("const valueNode=input.closest('.mr-score-control')?.querySelector('.mr-val');"),'safe score value lookup missing');
console.log('✓ manual review optional-score syntax is valid');
