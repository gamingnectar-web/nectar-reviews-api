const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(parts,s)=>fs.writeFileSync(F(...parts),s);

let dash=R('public','elev8-dashboard.js');
const oldFind="function findBtn(words){return[...document.querySelectorAll('.tab-btn,button,a')].find(el=>{const t=(el.textContent||'').toLowerCase();return words.some(w=>t.includes(w))})}function open(words){document.body.classList.remove('elev8-home-open');findBtn(words)?.click()}";
const newFind="const VIEW_ROUTES={reviews:'v-mgr',cart:'v-cart-rewards',imports:'v-product-creation-import',discounts:'v-discounts',loyalty:'v-loyalty',marketing:'v-marketing-intelligence',settings:'v-settings'};function openView(kind){const id=VIEW_ROUTES[kind];if(!id)return;document.body.classList.remove('elev8-home-open');document.body.dataset.e8Context=kind;if(typeof window.tab==='function')window.tab(id);if(id==='v-marketing-intelligence')window.Elev8MarketingIntelligence?.load?.()}";
if(dash.includes(oldFind))dash=dash.replace(oldFind,newFind);
else if(!dash.includes('VIEW_ROUTES='))throw new Error('Dashboard fuzzy router not found');
const oldClick="const m={reviews:['reviews'],cart:['cart rewards','cart reward'],imports:['product import','imports'],discounts:['discount'],loyalty:['loyalty'],marketing:['marketing intelligence'],settings:['settings','health']};open(m[t.dataset.open]||[])";
if(dash.includes(oldClick))dash=dash.replace(oldClick,'openView(t.dataset.open)');
else if(!dash.includes('openView(t.dataset.open)'))throw new Error('Dashboard tile mapping not found');
W(['public','elev8-dashboard.js'],dash);

let nav=R('public','elev8-context-nav.js');
const start=nav.indexOf('  function openModule(kind){');
const end=nav.indexOf('\n\n  function applyContext()',start);
if(start<0||end<0)throw new Error('Context openModule not found');
const newOpen=`  function openModule(kind){
    const map={
      reviews:'v-mgr',
      cart:'v-cart-rewards',
      imports:'v-product-creation-import',
      discounts:'v-discounts',
      loyalty:'v-loyalty',
      marketing:'v-marketing-intelligence',
      settings:'v-settings'
    };
    const id=map[kind];
    if(!id)return;
    document.body.classList.remove('elev8-home-open');
    document.body.dataset.e8Context=kind;
    if(typeof window.tab==='function')window.tab(id);
    if(id==='v-marketing-intelligence')window.Elev8MarketingIntelligence?.load?.();
    setTimeout(applyContext,20);
  }`;
nav=nav.slice(0,start)+newOpen+nav.slice(end);
W(['public','elev8-context-nav.js'],nav);

let admin=R('public','admin.js');
admin=admin.replace(
  "  if (['v-discounts', 'v-loyalty', 'v-referrals', 'v-cart-rewards'].includes(id)) window.loadModules();\n  if (id === 'v-loyalty') window.loadLoyaltyConfig?.();\n  if (id === 'v-cart-rewards') window.NectarModuleShell?.setActiveModule?.('cart-rewards', { silent: true });",
  "  if (['v-discounts', 'v-loyalty', 'v-referrals', 'v-cart-rewards', 'v-marketing-intelligence'].includes(id)) window.loadModules();\n  if (id === 'v-discounts') window.loadDiscountConfig?.();\n  if (id === 'v-loyalty') window.loadLoyaltyConfig?.();\n  if (id === 'v-cart-rewards') window.NectarModuleShell?.setActiveModule?.('cart-rewards', { silent: true });\n  if (id === 'v-marketing-intelligence') window.Elev8MarketingIntelligence?.load?.();"
);
W(['public','admin.js'],admin);

let shell=R('public','module-shell.js');
if(!shell.includes("v-marketing-intelligence') return 'marketing-intelligence'")){
 shell=shell.replace("    if (viewId === 'v-referrals') return 'referrals';","    if (viewId === 'v-referrals') return 'referrals';\n    if (viewId === 'v-marketing-intelligence') return 'marketing-intelligence';");
}
W(['public','module-shell.js'],shell);

let reg=R('public','module-registry.js');
if(!reg.includes("id:'marketing-intelligence'")){
 reg=reg.replace("    { id:'referrals', productSlug:'referrals', label:'Referrals', description:'Referral links, friend offers and attribution. Coming soon.', adminFolder:'/modules/referrals', legacy:true }",
 "    { id:'marketing-intelligence', productSlug:'marketing-intelligence', label:'Marketing Intelligence', description:'Sales-led product prioritisation and premium AI creative.', adminFolder:'/modules/marketing-intelligence', css:'/modules/marketing-intelligence/marketing-intelligence.css', script:'/modules/marketing-intelligence/marketing-intelligence.js' },\n    { id:'referrals', productSlug:'referrals', label:'Referrals', description:'Referral links, friend offers and attribution. Coming soon.', adminFolder:'/modules/referrals', legacy:true }");
}
W(['public','module-registry.js'],reg);

let mi=R('public','modules','marketing-intelligence','marketing-intelligence.js');
if(!mi.includes('window.Elev8MarketingIntelligence=')){
 mi=mi.replace("  function install(){\n    const view=$('v-marketing-intelligence');if(!view)return;",
 "  window.Elev8MarketingIntelligence={load:()=>load(),refresh:()=>load(true),selectProduct:index=>selectProduct(index)};\n\n  function install(){\n    const view=$('v-marketing-intelligence');if(!view)return;");
}
W(['public','modules','marketing-intelligence','marketing-intelligence.js'],mi);

let html=R('public','admin.html');
html=html.replace(/\/elev8-dashboard\.js\?v=[^\"]+/g,'/elev8-dashboard.js?v=route-fix-2')
         .replace(/\/elev8-context-nav\.js\?v=[^\"]+/g,'/elev8-context-nav.js?v=route-fix-2')
         .replace(/\/module-shell\.js\?v=[^\"]+/g,'/module-shell.js?v=route-fix-2')
         .replace(/\/module-registry\.js\?v=[^\"]+/g,'/module-registry.js?v=route-fix-2')
         .replace(/\/modules\/marketing-intelligence\/marketing-intelligence\.js\?v=[^\"]+/g,'/modules/marketing-intelligence/marketing-intelligence.js?v=route-fix-2');
W(['public','admin.html'],html);

console.log('✓ exact module routes installed');
