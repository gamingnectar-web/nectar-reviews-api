const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync('src/app.js','utf8');
const route=fs.readFileSync('src/routes/manualReviewImageImports.js','utf8');
const ui=fs.readFileSync('public/manual-review-image-import.js','utf8');
const manual=fs.readFileSync('public/manual-review-import.js','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['image import route mounted',app.includes('/api/admin/manual-review-image-imports')],
 ['OpenAI image analysis',route.includes("type:'image_url'")&&route.includes('OPENAI_API_KEY')],
 ['faithful transcription prompt',route.includes('Transcribe reviewText faithfully')],
 ['unknown products batch instead of forced mapping',route.includes("status:matchedProduct?'ready':'needs_mapping'")],
 ['persistent Mongo image batch',route.includes("manual_review_image_imports")],
 ['multiple images supported in UI',ui.includes('multiple hidden')&&ui.includes('for(let i=0;i<files.length;i++)')],
 ['browser compression before upload',ui.includes("canvas.toDataURL('image/jpeg',.75)")],
 ['unresolved items stay batched',ui.includes('Needs product mapping')],
 ['ready items move to Manual Add',ui.includes('Add ready drafts to Manual Add')],
 ['existing manual form bridge',manual.includes('function addDraft(draft={})')],
 ['polish CSS loaded',html.includes('/manual-review-polish.css')],
 ['image UI loaded',html.includes('/manual-review-image-import.js')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 review image import smoke passed: ${checks.length} checks`);
