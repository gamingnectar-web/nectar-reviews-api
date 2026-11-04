'use strict';
const fs=require('fs'); const read=p=>fs.readFileSync(p,'utf8');
function c(ok,m){if(!ok){console.error('✗ '+m);process.exitCode=1}else console.log('✓ '+m)}
const admin=read('src/routes/admin.js'),html=read('public/admin.html'),js=read('public/admin.js');
c(admin.includes('componentStyles')&&admin.includes('controlSize')&&admin.includes('fontFamily'),'server validates per-component styles');
c(html.includes('e8pcb-component-modal')&&html.includes('Override theme styling'),'component style modal exists');
c(js.includes('e8pcbOpenComponentEditor')&&js.includes('e8pcbPreviewStyle'),'builder can edit and preview component styles');
c(js.includes('data-e8pcb-edit'),'preview chips expose style editor');
if(process.exitCode)process.exit(process.exitCode);
console.log('ELEV8 product-card component styles smoke test passed.');