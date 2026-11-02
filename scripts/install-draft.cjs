/* Run from the project root AFTER copying these files into public/ and scripts/ */
'use strict';
const fs=require('fs');
const path=require('path');
const file=path.resolve(process.cwd(),'public/admin.html');
if(!fs.existsSync(file))throw Error('Run from nectar-reviews-api root (public/admin.html must exist)');
let html=fs.readFileSync(file,'utf8');
if(!html.includes('id="v-cart-rewards"'))throw Error('Existing Cart Rewards view not found, no changes made');
const marker='<!-- ELEV8_BASKET_REWARDS_DRAFT_V1 -->';
if(html.includes(marker)){console.log('Draft already linked — nothing changed');process.exit(0);}
const links=`  ${marker}\n  <link rel="stylesheet" href="/elev8-basket-rewards-draft.css?v=draft-1">\n  <script src="/elev8-basket-rewards-engine.js?v=draft-1" defer></script>\n  <script src="/elev8-basket-rewards-draft.js?v=draft-1" defer></script>\n`;
if(!html.includes('</body>'))throw Error('HTML body closing tag missing');
html=html.replace('</body>',links+'</body>');
fs.writeFileSync(file,html);
console.log('✓ ELEV8 Cart Rewards draft linked in admin.html. No production discount logic changed.');
