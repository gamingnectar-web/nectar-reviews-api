const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('public/manual-review-image-import.js','utf8');
const checks=[
 ['no blob URL dependency',!src.includes('URL.createObjectURL(file)')],
 ['FileReader used',src.includes('new FileReader()')],
 ['data URL decode path',src.includes('image.src=dataUrl')],
 ['supported types validated',src.includes('Unsupported image type')],
 ['canvas guarded',src.includes("if(!ctx)throw new Error('Browser image canvas is unavailable.')")]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 review-image CSP hotfix smoke passed: ${checks.length} checks`);
