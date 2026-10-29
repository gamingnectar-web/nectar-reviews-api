'use strict';
const fs=require('fs');
const ui=fs.readFileSync('public/supplier-sites-admin.js','utf8');
function check(ok,msg){if(ok)console.log('✓ '+msg);else{console.error('✗ '+msg);process.exitCode=1;}}
check(ui.includes('ELEV8_SITE_PRODUCT_LINE_TAGS_V1'),'patch marker exists');
check(ui.includes("ENERGY: { label:'ENERGY', tags:['ENERGY','Drink'] }"),'ENERGY adds ENERGY + Drink');
check(ui.includes("HYDRATION: { label:'HYDRATION', tags:['HYDRATION','Drink'] }"),'HYDRATION adds HYDRATION + Drink');
check(ui.includes("'PROTEIN DRINK': { label:'PROTEIN DRINK', tags:['PROTEIN DRINK','Drink'] }"),'PROTEIN DRINK adds PROTEIN DRINK + Drink');
check(ui.includes("SNACK: { label:'SNACK', tags:['SNACK'] }"),'SNACK adds SNACK only');
check(ui.includes('SITE_PRODUCT_LINE_MANAGED_TAGS'),'managed tags are replaced safely');
check(ui.includes('tags:applySiteProductLineTags'),'selection is saved into draft.tags');
check(ui.includes('siteProductLineFromTags(d.tags||[])'),'existing tags restore selector');
check(ui.includes('Other product tags are left untouched'),'UI explains preservation');
check(ui.includes('Formula / version'),'formula field is distinct from site line');
if(process.exitCode)process.exit(process.exitCode);
console.log('ELEV8 site product line tag smoke test passed.');
