'use strict';
const fs=require('fs');
const read=(p)=>fs.readFileSync(p,'utf8');
function c(ok,msg){if(!ok){console.error('✗ '+msg);process.exitCode=1}else console.log('✓ '+msg)}
const models=read('src/models/index.js');
const admin=read('src/routes/admin.js');
const pub=read('src/routes/public.js');
const html=read('public/admin.html');
const js=read('public/admin.js');
c(models.includes('productCardBuilder')&&models.includes('defaultLayoutId'),'builder settings schema exists');
c(admin.includes('sanitiseProductCardBuilder')&&admin.includes('featured_section'),'builder payload is validated');
c(pub.includes('productCardBuilder:'),'builder config is public to storefront');
c(html.includes('Product Cards</button>')&&html.includes('e8pcb-view-builder')&&html.includes('e8pcb-view-assignments'),'Product Cards UI has Builder and Assignments');
c(js.includes('e8pcbMove')&&js.includes('dragstart')&&js.includes('defaultLayoutId'),'drag/drop builder state is wired');
if(process.exitCode)process.exit(process.exitCode);
console.log('ELEV8 product-card builder smoke test passed.');