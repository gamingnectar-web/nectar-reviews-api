const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

// 1) Persist provenance/audit reason on reviews.
let model=R('src','models','index.js');
if(!model.includes('importReason:')){
  model=model.replace(
    "  importBatchId: { type: String, default: '', index: true },",
    "  importBatchId: { type: String, default: '', index: true },\n  importReason: { type: String, default: '' },\n  importReasonDetail: { type: String, default: '' },\n  importedReviewEditedAt: { type: Date, default: null },\n  importedReviewEditedBy: { type: String, default: '' },"
  );
}
W(['src','models','index.js'],model);

// 2) Manual-review API: AI title if absent, required reason for new manual adds,
//    plus safe edit endpoints for manual and imported historical reviews.
let route=R('src','routes','manualReviews.js');

if(!route.includes("router.post('/generate-title'")){
  const marker="router.post('/batches', async (req,res,next) => {";
  if(!route.includes(marker))throw new Error('Manual batch route marker missing');
  const endpoint=`router.post('/generate-title', async (req,res,next) => {\n  try {\n    const comment=cleanText(req.body?.comment||'',6000);\n    const productTitle=cleanText(req.body?.productTitle||'',300);\n    const rating=Number(req.body?.rating||0);\n    if(comment.length<8)return res.status(400).json({error:'Add more review text before generating a title.'});\n    const fallback=()=>{const first=comment.split(/[.!?]/).map(x=>x.trim()).find(Boolean)||comment;return first.length<=80?first:first.slice(0,77).trim()+'…'};\n    if(!process.env.OPENAI_API_KEY)return res.json({title:fallback(),source:'fallback'});\n    const model=process.env.OPENAI_ASSISTANT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';\n    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:.2,messages:[{role:'system',content:'Write a concise ecommerce review headline from the customer review text. Maximum 80 characters. Preserve sentiment and tone. Do not add facts, product claims, scores, flavour notes or benefits not explicitly present. Return the headline only.'},{role:'user',content:'Product: '+(productTitle||'Unknown')+'\\nStar rating: '+(rating||'Unknown')+'\\nReview:\\n'+comment}]})});\n    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error?.message||('OpenAI title generation failed ('+response.status+')'));\n    const title=cleanText(payload?.choices?.[0]?.message?.content||'',120).replace(/^[\\\"“]|[\\\"”]$/g,'').trim();\n    res.json({title:(title||fallback()).slice(0,80),source:title?'openai':'fallback'});\n  } catch(e){next(e)}\n});\n\n`;
  route=route.replace(marker,endpoint+marker);
}

if(!route.includes('const allowedImportReasons')){
  route=route.replace(
    "const newBatchId = () => `manual-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;",
    "const newBatchId = () => `manual-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;\nconst allowedImportReasons = new Set(['historical_migration','platform_export','customer_record','manual_recovery','other']);\nconst isEditableImport = review => ['manual','import'].includes(String(review?.source||''));"
  );
}

// Add required reason validation and persistence to manual batch creation.
if(!route.includes("if(!allowedImportReasons.has(String(raw.importReason||'')))")){
  route=route.replace(
    "        const scope=raw.reviewScope==='site'?'site':'product';",
    "        const scope=raw.reviewScope==='site'?'site':'product';\n        if(!allowedImportReasons.has(String(raw.importReason||''))) throw new Error('Choose why this review is being added manually.');\n        if(raw.importReason==='other'&&!cleanText(raw.importReasonDetail||'',500)) throw new Error('Add a note explaining the Other import reason.');"
  );
  route=route.replace(
    "          importBatchId:id,status:'pending',",
    "          importBatchId:id,status:'pending',\n          importReason:String(raw.importReason||''),importReasonDetail:cleanText(raw.importReasonDetail||'',500),"
  );
}

if(!route.includes("router.get('/reviews/:reviewId'")){
  const marker='module.exports=router;';
  if(!route.includes(marker))throw new Error('manualReviews export marker missing');
  const endpoints=`router.get('/reviews/:reviewId', async (req,res,next) => {\n  try {\n    const review=await Review.findOne({_id:req.params.reviewId,shopDomain:shop(req),isDeleted:{$ne:true}}).lean();\n    if(!review)return res.status(404).json({error:'Review not found.'});\n    if(!isEditableImport(review))return res.status(403).json({error:'Only manual and imported historical reviews can be edited here.'});\n    res.json({review});\n  } catch(e){next(e)}\n});\n\nrouter.patch('/reviews/:reviewId', async (req,res,next) => {\n  try {\n    const review=await Review.findOne({_id:req.params.reviewId,shopDomain:shop(req),isDeleted:{$ne:true}});\n    if(!review)return res.status(404).json({error:'Review not found.'});\n    if(!isEditableImport(review))return res.status(403).json({error:'Only manual and imported historical reviews can be edited here.'});\n    const body=req.body||{};\n    const reason=String(body.importReason||'');\n    if(!allowedImportReasons.has(reason))return res.status(400).json({error:'Choose why this review was imported.'});\n    const reasonDetail=cleanText(body.importReasonDetail||'',500);\n    if(reason==='other'&&!reasonDetail)return res.status(400).json({error:'Add a note explaining the Other import reason.'});\n    const comment=cleanText(body.comment??review.comment,6000);if(!comment)return res.status(400).json({error:'Review text is required.'});\n    const createdAt=body.createdAt?new Date(body.createdAt):review.createdAt;if(Number.isNaN(createdAt.getTime()))return res.status(400).json({error:'Review date is invalid.'});\n    review.userId=cleanText(body.userId??review.userId,120)||'Guest';\n    review.email=cleanEmail(body.email??review.email);\n    review.rating=clampNumber(body.rating??review.rating,1,5,review.rating||5);\n    review.headline=cleanText(body.headline??review.headline,300);\n    review.comment=comment;review.createdAt=createdAt;\n    review.verifiedPurchase=Boolean(body.verifiedPurchase);\n    review.attributes=cleanAttributes(body.attributes||{});\n    review.importReason=reason;review.importReasonDetail=reasonDetail;\n    review.importedReviewEditedAt=new Date();review.importedReviewEditedBy='admin';\n    review.duplicateHash=hash(review.shopDomain,review);\n    await review.save();\n    res.json({ok:true,review:review.toObject()});\n  } catch(e){next(e)}\n});\n\n`;
  route=route.replace(marker,endpoints+marker);
}
W(['src','routes','manualReviews.js'],route);

// 3) New manual adds must record why they are being added.
let ui=R('public','manual-review-import.js');
if(!ui.includes('mr-import-reason')){
  const marker='      <div class="mr-grid rating-row">';
  if(!ui.includes(marker))throw new Error('Manual review form rating marker missing');
  const reason=`      <div class="mr-grid two mr-reason-grid">\n        <label><span>Reason for manual add <b>required</b></span><select class="mr-import-reason"><option value="">Choose a reason…</option><option value="historical_migration">Historical review migration</option><option value="platform_export">Imported from previous review platform</option><option value="customer_record">Existing customer review transcribed from records</option><option value="manual_recovery">Manual recovery / reconstruction</option><option value="other">Other – explain below</option></select></label>\n        <label><span>Reason note <small>optional unless Other</small></span><input class="mr-import-reason-detail" placeholder="e.g. migrated from Yotpo before plan expired"></label>\n      </div>\n\n`;
  ui=ui.replace(marker,reason+marker);
  ui=ui.replace(
    "      verifiedPurchase:row.querySelector('.mr-verified').checked,",
    "      verifiedPurchase:row.querySelector('.mr-verified').checked,\n      importReason:row.querySelector('.mr-import-reason').value,\n      importReasonDetail:row.querySelector('.mr-import-reason-detail').value.trim(),"
  );
}

// Bring AI title + individually optional scores into Manual Add if an older live file still lacks them.
if(!ui.includes('mr-ai-title')){
  ui=ui.replace(
    '<label><span>Review headline</span><input class="mr-headline" placeholder="Great flavour and fast delivery"></label>',
    '<label><span>Review headline</span><div class="mr-headline-row"><input class="mr-headline" placeholder="Great flavour and fast delivery"><button type="button" class="mr-ai-title">✨ AI generate title</button></div><small class="mr-ai-help">Summarises only the review text below; it will not invent flavour or product claims.</small></label>'
  );
}
if(!ui.includes('mr-sour-live')){
  ui=ui.replace(
    '<label><span>Sourness <b class="mr-val">5</b>/10</span><input class="mr-sour" type="range" min="1" max="10" value="5"></label>\n          <label><span>Sweetness <b class="mr-val">5</b>/10</span><input class="mr-sweet" type="range" min="1" max="10" value="5"></label>\n          <label><span>Flavour <b class="mr-val">5</b>/10</span><input class="mr-flavour" type="range" min="1" max="10" value="5"></label>',
    '<label class="mr-score-card"><span><input class="mr-score-live mr-sour-live" type="checkbox"> Include Sourness score</span><div class="mr-score-control is-off"><span>Sourness <b class="mr-val">5</b>/10</span><input class="mr-sour" type="range" min="1" max="10" value="5" disabled></div></label>\n          <label class="mr-score-card"><span><input class="mr-score-live mr-sweet-live" type="checkbox"> Include Sweetness score</span><div class="mr-score-control is-off"><span>Sweetness <b class="mr-val">5</b>/10</span><input class="mr-sweet" type="range" min="1" max="10" value="5" disabled></div></label>\n          <label class="mr-score-card"><span><input class="mr-score-live mr-flavour-live" type="checkbox"> Include Flavour score</span><div class="mr-score-control is-off"><span>Flavour <b class="mr-val">5</b>/10</span><input class="mr-flavour" type="range" min="1" max="10" value="5" disabled></div></label>'
  );
  const wire=`    row.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>{\n      input.closest('label').querySelector('.mr-val').textContent=input.value;\n    });`;
  if(ui.includes(wire))ui=ui.replace(wire,`    row.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>{input.closest('.mr-score-control')?.querySelector('.mr-val').textContent=input.value});\n    row.querySelectorAll('.mr-score-live').forEach(toggle=>toggle.addEventListener('change',()=>{const card=toggle.closest('.mr-score-card'),slider=card?.querySelector('input[type=range]');if(slider)slider.disabled=!toggle.checked;card?.querySelector('.mr-score-control')?.classList.toggle('is-off',!toggle.checked)}));\n    row.querySelector('.mr-ai-title')?.addEventListener('click',async()=>{const btn=row.querySelector('.mr-ai-title'),comment=row.querySelector('.mr-comment').value.trim();if(comment.length<8)return window.showToast?.('Add the review description first');const old=btn.textContent;btn.disabled=true;btn.textContent='Generating…';try{const result=await api('/generate-title',{method:'POST',body:JSON.stringify({comment,productTitle:row.querySelector('.mr-product-title').value||row.querySelector('.mr-product-search').value,rating:Number(row.querySelector('.mr-stars').dataset.rating||5)})});row.querySelector('.mr-headline').value=result.title||''}catch(error){window.showToast?.(error.message||'Could not generate title')}finally{btn.disabled=false;btn.textContent=old}});`);
  ui=ui.replace(
    "      attributes:{\n        sourness:Number(row.querySelector('.mr-sour').value),\n        sweetness:Number(row.querySelector('.mr-sweet').value),\n        flavour:Number(row.querySelector('.mr-flavour').value)\n      }",
    "      attributes:{\n        ...(row.querySelector('.mr-sour-live').checked?{sourness:Number(row.querySelector('.mr-sour').value)}:{}),\n        ...(row.querySelector('.mr-sweet-live').checked?{sweetness:Number(row.querySelector('.mr-sweet').value)}:{}),\n        ...(row.querySelector('.mr-flavour-live').checked?{flavour:Number(row.querySelector('.mr-flavour').value)}:{})\n      }"
  );
}
W(['public','manual-review-import.js'],ui);

// 4) Review Manager: manual/imported reviews get an Edit Import button and provenance indicator.
let adminJs=R('public','admin.js');
if(!adminJs.includes('editableImportHtml')){
  const marker="  const sourceHtml = `<span class=\"source-pill ${escapeHtml(sourceClass)}\">${escapeHtml(sourceLabel)}${r.externalReviewId ? ` · ${escapeHtml(r.externalReviewId)}` : ''}</span>`;";
  if(!adminJs.includes(marker))throw new Error('Review Manager sourceHtml marker missing');
  adminJs=adminJs.replace(marker,marker+`\n  const editableImport = ['manual','import'].includes(String(r.source || ''));\n  const reasonLabels = { historical_migration:'Historical migration', platform_export:'Previous platform', customer_record:'Customer record', manual_recovery:'Manual recovery', other:'Other' };\n  const importReasonHtml = editableImport ? \`<div style=\"margin-top:7px;font-size:11px;color:\${r.importReason ? 'var(--muted)' : '#a72b20'};font-weight:700;\">\${r.importReason ? 'Reason: ' + escapeHtml(reasonLabels[r.importReason] || r.importReason) : '⚠ Import reason not recorded'}</div>\` : '';\n  const editableImportHtml = editableImport && !isTrash ? \`<button class=\"manual-import-edit-btn\" onclick=\"window.openImportedReviewEditor?.('\${r._id}')\">✎ Edit import</button>\` : '';`);
  adminJs=adminJs.replace(
    '          <div>${sourceHtml}</div>\n          <p class="admin-card-meta-label"',
    '          <div>${sourceHtml}</div>\n          ${importReasonHtml}\n          <p class="admin-card-meta-label"'
  );
  adminJs=adminJs.replace(
    '${isTrash ? `<button class="restore-btn" onclick="window.toggleBin(\'${r._id}\', false)">↺ Restore</button>` : `<button class="delete-btn" onclick="window.toggleBin(\'${r._id}\', true)">🗑️ Trash</button>`}',
    '${editableImportHtml}\n          ${isTrash ? `<button class="restore-btn" onclick="window.toggleBin(\'${r._id}\', false)">↺ Restore</button>` : `<button class="delete-btn" onclick="window.toggleBin(\'${r._id}\', true)">🗑️ Trash</button>`}'
  );
}
W(['public','admin.js'],adminJs);

// 5) Load dedicated editor asset.
let html=R('public','admin.html');
if(!html.includes('/manual-review-edit.js'))html=html.replace('</body>','  <script src="/manual-review-edit.js?v=editable-imports-1" defer></script>\n</body>');
html=html.replace(/\/manual-review-import\.js\?v=[^\"]+/g,'/manual-review-import.js?v=editable-imports-1');
W(['public','admin.html'],html);

console.log('✓ Manual adds now require an import reason');
console.log('✓ Manual and historical imported reviews are editable');
console.log('✓ AI titles work in both new manual adds and old imports');
console.log('✓ Sourness / Sweetness / Flavour can each be enabled or removed independently');
