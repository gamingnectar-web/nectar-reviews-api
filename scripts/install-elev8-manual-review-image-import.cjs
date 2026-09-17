const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

// Mount image-import API.
let app=R('src','app.js');
if(!app.includes("require('./routes/manualReviewImageImports')")){
  app=app.replace(
    "const manualReviewRoutes = require('./routes/manualReviews');",
    "const manualReviewRoutes = require('./routes/manualReviews');\nconst manualReviewImageImportRoutes = require('./routes/manualReviewImageImports');"
  );
}
if(!app.includes("app.use('/api/admin/manual-review-image-imports'")){
  const marker="app.use('/api/admin/manual-reviews', requireAdminSession, manualReviewRoutes);";
  if(!app.includes(marker))throw new Error('manual review route mount not found in app.js');
  app=app.replace(
    marker,
    `${marker}\napp.use('/api/admin/manual-review-image-imports', requireAdminSession, manualReviewImageImportRoutes);`
  );
}
W(['src','app.js'],app);

// Expose a small public API from the existing Manual Add closure so image drafts can populate the exact same form.
let manual=R('public','manual-review-import.js');
if(!manual.includes('function addDraft(draft={}')){
  const close='})();';
  const pos=manual.lastIndexOf(close);
  if(pos<0)throw new Error('manual-review-import.js closure end not found');
  const bridge=String.raw`
  function addDraft(draft={}){
    const box=$('mr-rows');
    if(!box)return null;

    let row=[...box.querySelectorAll('.mr-row')].find(candidate=>{
      return !candidate.querySelector('.mr-comment')?.value.trim()
        && !candidate.querySelector('.mr-product-id')?.value
        && !candidate.querySelector('.mr-name')?.value.trim();
    });
    if(!row){addRow();row=box.lastElementChild}

    row.querySelector('.mr-product-search').value=draft.productTitle||'';
    row.querySelector('.mr-product-id').value=draft.itemId||'';
    row.querySelector('.mr-product-title').value=draft.productTitle||'';
    row.querySelector('.mr-product-handle').value=draft.productHandle||'';
    row.querySelector('.mr-product-image').value=draft.productImage||'';
    row.querySelector('.mr-name').value=draft.reviewerName||'';
    row.querySelector('.mr-email').value=draft.email||'';
    row.querySelector('.mr-order').value=draft.orderId||'';
    row.querySelector('.mr-date').value=draft.createdAt||new Date().toISOString().slice(0,10);
    row.querySelector('.mr-headline').value=draft.headline||'';
    row.querySelector('.mr-comment').value=draft.comment||'';
    row.querySelector('.mr-verified').checked=Boolean(draft.verifiedPurchase);
    row.querySelector('.mr-import-reason').value=draft.importReason||'historical_migration';
    row.querySelector('.mr-import-reason-detail').value=draft.importReasonDetail||'';

    const rating=Math.max(1,Math.min(5,Number(draft.rating||5)));
    const stars=row.querySelector('.mr-stars');
    stars.dataset.rating=rating;
    stars.querySelectorAll('button').forEach(btn=>btn.classList.toggle('on',Number(btn.dataset.star)<=rating));

    const scoreMap=[
      ['sourness','.mr-sour-live','.mr-sour'],
      ['sweetness','.mr-sweet-live','.mr-sweet'],
      ['flavour','.mr-flavour-live','.mr-flavour']
    ];
    scoreMap.forEach(([key,toggleSel,rangeSel])=>{
      const has=draft.attributes?.[key]!==undefined&&draft.attributes?.[key]!==null;
      const toggle=row.querySelector(toggleSel),range=row.querySelector(rangeSel);
      toggle.checked=has;
      range.disabled=!has;
      if(has)range.value=Number(draft.attributes[key]);
      const control=range.closest('.mr-score-control');
      control?.classList.toggle('is-off',!has);
      const valueNode=control?.querySelector('.mr-val');
      if(valueNode)valueNode.textContent=range.value;
    });
    row.scrollIntoView({behavior:'smooth',block:'center'});
    return row;
  }

  window.Elev8ManualReviewImport={
    ...(window.Elev8ManualReviewImport||{}),
    addDraft,
    addRow,
    loadDrafts,
    switchTab,
    saveBatch
  };
`;
  manual=manual.slice(0,pos)+bridge+manual.slice(pos);
}
W(['public','manual-review-import.js'],manual);

// Load polished layout and image-import controller.
let html=R('public','admin.html');
if(!html.includes('/manual-review-polish.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="/manual-review-polish.css?v=review-images-1">\n</head>');
}
if(!html.includes('/manual-review-image-import.js')){
  html=html.replace('</body>','  <script src="/manual-review-image-import.js?v=review-images-1" defer></script>\n</body>');
}
html=html.replace(/\/manual-review-import\.js\?v=[^"]+/g,'/manual-review-import.js?v=review-images-1');
W(['public','admin.html'],html);

console.log('✓ Mounted AI screenshot review-import API');
console.log('✓ Connected image drafts to the existing Manual Add form');
console.log('✓ Added Import from images tab');
console.log('✓ Added review-form layout polish');
