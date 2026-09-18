const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

// 1) Let Manual Add carry a Vault/discontinued-product flag.
let manual=R('public','manual-review-import.js');

if(!manual.includes('mr-product-archived')){
  manual=manual.replace(
    '<input class="mr-product-image" type="hidden">',
    '<input class="mr-product-image" type="hidden">\n            <input class="mr-product-archived" type="hidden" value="0">'
  );

  manual=manual.replace(
    "        row.querySelector('.mr-product-image').value=btn.dataset.image;",
    "        row.querySelector('.mr-product-image').value=btn.dataset.image;\n        row.querySelector('.mr-product-archived').value='0';"
  );

  manual=manual.replace(
    "      productImage:row.querySelector('.mr-product-image').value,",
    "      productImage:row.querySelector('.mr-product-image').value,\n      archivedProduct:row.querySelector('.mr-product-archived').value==='1',"
  );

  manual=manual.replace(
    "    row.querySelector('.mr-product-image').value=draft.productImage||'';",
    "    row.querySelector('.mr-product-image').value=draft.productImage||'';\n    row.querySelector('.mr-product-archived').value=draft.archivedProduct?'1':'0';"
  );
}
W(['public','manual-review-import.js'],manual);

// 2) Allow a manually imported review to use a synthetic Vault item id when the original Shopify product is gone.
let route=R('src','routes','manualReviews.js');

if(!route.includes("const archivedProduct=Boolean(raw.archivedProduct);")){
  route=route.replace(
    "        const productId=numericId(raw.itemId||raw.productId||'');\n        if(scope==='product'&&!productId) throw new Error('Choose a product.');",
    "        const productId=numericId(raw.itemId||raw.productId||'');\n        const archivedProduct=Boolean(raw.archivedProduct);\n        if(scope==='product'&&!productId&&!archivedProduct) throw new Error('Choose a product or mark it as an archived Vault product.');\n        const vaultItemId=archivedProduct?`vault-${crypto.createHash('sha1').update(String(raw.productTitle||raw.comment||Date.now())).digest('hex').slice(0,16)}`:'';"
  );

  route=route.replace(
    "          shopDomain,itemId:scope==='site'?'site':productId,",
    "          shopDomain,itemId:scope==='site'?'site':(archivedProduct?vaultItemId:productId),"
  );

  route=route.replace(
    "          productImage:cleanText(raw.productImage||'',1000),\n          externalProductId:productId,",
    "          productImage:cleanText(raw.productImage||(archivedProduct?'/images/elev8-vault-tub.png':''),1000),\n          productTags:archivedProduct?['elev8:vault-product']:[],\n          externalProductId:archivedProduct?'':productId,"
  );

  route=route.replace(
    "          source:'manual',sourcePlatform:'manual',sourceLabel:'Manual Add',",
    "          source:'manual',sourcePlatform:'manual',sourceLabel:archivedProduct?'Manual Add · Vault':'Manual Add',"
  );
}
W(['src','routes','manualReviews.js'],route);

// 3) Load the extra UI styling.
let html=R('public','admin.html');
if(!html.includes('/manual-review-vault.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="/manual-review-vault.css?v=vault-1">\n</head>');
}
html=html.replace(/\/manual-review-image-import\.js\?v=[^"]+/g,'/manual-review-image-import.js?v=vault-1');
html=html.replace(/\/manual-review-import\.js\?v=[^"]+/g,'/manual-review-import.js?v=vault-1');
W(['public','admin.html'],html);

console.log('✓ Manual Add can carry archived/Vault products');
console.log('✓ Backend accepts Vault reviews without a live Shopify product id');
console.log('✓ Vault image and mapping CSS are wired into admin');
