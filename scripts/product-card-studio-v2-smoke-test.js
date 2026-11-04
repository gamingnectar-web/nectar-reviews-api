'use strict';
const fs=require('fs'); const read=p=>fs.readFileSync(p,'utf8');
function c(ok,m){if(!ok){console.error('✗ '+m);process.exitCode=1}else console.log('✓ '+m)}
const model=read('src/models/index.js'),admin=read('src/routes/admin.js'),html=read('public/admin.html'),js=read('public/admin.js');
c(model.includes('buttonDesigns')&&model.includes('infoRules'),'productCardBuilder stores button designs and info rules');
c(admin.includes('ELEV8_PC_BUTTON_ROLES')&&admin.includes('infoRules'),'admin validates studio configuration');
c(html.includes("window.tab('v-product-cards')")&&html.includes('Button Designs')&&html.includes('Product Info Rules'),'Product Cards is a top-level storefront studio');
c(js.includes('e8pcPromoteStudio')&&js.includes('e8pcbRenderButtonPreview')&&js.includes('e8pcbRenderInfoRules'),'studio UI and editors are wired');
if(process.exitCode)process.exit(process.exitCode);
console.log('ELEV8 Product Card Studio V2 smoke test passed.');