const fs=require('fs'),path=require('path');
const root=process.cwd();

function read(p){const f=path.join(root,p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')}
function write(p,s){fs.writeFileSync(path.join(root,p),s)}

let route=read('src/routes/manualReviews.js');

if(!route.includes("router.post('/generate-title'")){
  const marker="router.post('/batches', async (req,res,next) => {";
  const endpoint=String.raw`
router.post('/generate-title', async (req,res,next) => {
  try {
    const comment=cleanText(req.body?.comment||'',6000);
    const productTitle=cleanText(req.body?.productTitle||'',300);
    const rating=Number(req.body?.rating||0);
    if(comment.length<8) return res.status(400).json({error:'Add more review text before generating a title.'});

    const fallback=()=>{
      const first=comment.split(/[.!?]/).map(x=>x.trim()).find(Boolean)||comment;
      const compact=first.replace(/\s+/g,' ').trim();
      return compact.length<=80?compact:`${compact.slice(0,77).trim()}…`;
    };

    if(!process.env.OPENAI_API_KEY){
      return res.json({title:fallback(),source:'fallback'});
    }

    const model=process.env.OPENAI_ASSISTANT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        model,
        temperature:0.2,
        messages:[
          {
            role:'system',
            content:'Write a concise ecommerce review headline from the customer review text. Maximum 80 characters. Preserve the reviewer sentiment and tone. Do not add facts, product claims, scores, flavour notes or benefits that are not explicitly in the review. Return the headline only, without quotes.'
          },
          {
            role:'user',
            content:`Product: ${productTitle||'Unknown'}\nStar rating: ${rating||'Unknown'}\nReview:\n${comment}`
          }
        ]
      })
    });

    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload?.error?.message||`OpenAI title generation failed (${response.status})`);
    const title=cleanText(payload?.choices?.[0]?.message?.content||'',120).replace(/^["“]|["”]$/g,'').trim();
    res.json({title:(title||fallback()).slice(0,80),source:title?'openai':'fallback'});
  } catch(e){next(e)}
});

`;
  if(!route.includes(marker))throw new Error('Could not find manual review batch route marker');
  route=route.replace(marker,endpoint+marker);
}
write('src/routes/manualReviews.js',route);

let ui=read('public/manual-review-import.js');

ui=ui.replace(
  '<label><span>Review headline</span><input class="mr-headline" placeholder="Great flavour and fast delivery"></label>',
  `<label><span>Review headline</span><div class="mr-headline-row"><input class="mr-headline" placeholder="Great flavour and fast delivery"><button type="button" class="mr-ai-title">✨ AI generate title</button></div><small class="mr-ai-help">Summarises only the review text below; it will not invent flavour or product claims.</small></label>`
);

ui=ui.replace(
  `<label><span>Sourness <b class="mr-val">5</b>/10</span><input class="mr-sour" type="range" min="1" max="10" value="5"></label>
          <label><span>Sweetness <b class="mr-val">5</b>/10</span><input class="mr-sweet" type="range" min="1" max="10" value="5"></label>
          <label><span>Flavour <b class="mr-val">5</b>/10</span><input class="mr-flavour" type="range" min="1" max="10" value="5"></label>`,
  `<label class="mr-score-card"><span><input class="mr-score-live mr-sour-live" type="checkbox"> Include Sourness score</span><div class="mr-score-control is-off"><span>Sourness <b class="mr-val">5</b>/10</span><input class="mr-sour" type="range" min="1" max="10" value="5" disabled></div></label>
          <label class="mr-score-card"><span><input class="mr-score-live mr-sweet-live" type="checkbox"> Include Sweetness score</span><div class="mr-score-control is-off"><span>Sweetness <b class="mr-val">5</b>/10</span><input class="mr-sweet" type="range" min="1" max="10" value="5" disabled></div></label>
          <label class="mr-score-card"><span><input class="mr-score-live mr-flavour-live" type="checkbox"> Include Flavour score</span><div class="mr-score-control is-off"><span>Flavour <b class="mr-val">5</b>/10</span><input class="mr-flavour" type="range" min="1" max="10" value="5" disabled></div></label>`
);

const wireMarker=`    row.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>{
      input.closest('label').querySelector('.mr-val').textContent=input.value;
    });`;

const wireReplacement=`    row.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>{
      input.closest('.mr-score-control')?.querySelector('.mr-val').textContent=input.value;
    });

    row.querySelectorAll('.mr-score-live').forEach(toggle=>toggle.addEventListener('change',()=>{
      const card=toggle.closest('.mr-score-card');
      const control=card?.querySelector('.mr-score-control');
      const slider=card?.querySelector('input[type=range]');
      if(slider)slider.disabled=!toggle.checked;
      control?.classList.toggle('is-off',!toggle.checked);
    }));

    row.querySelector('.mr-ai-title')?.addEventListener('click',async()=>{
      const btn=row.querySelector('.mr-ai-title');
      const comment=row.querySelector('.mr-comment').value.trim();
      if(comment.length<8){window.showToast?.('Add the review description first');row.querySelector('.mr-comment').focus();return}
      const original=btn.textContent;btn.disabled=true;btn.textContent='Generating…';
      try{
        const result=await api('/generate-title',{method:'POST',body:JSON.stringify({
          comment,
          productTitle:row.querySelector('.mr-product-title').value||row.querySelector('.mr-product-search').value,
          rating:Number(row.querySelector('.mr-stars').dataset.rating||5)
        })});
        row.querySelector('.mr-headline').value=result.title||'';
      }catch(error){window.showToast?.(error.message||'Could not generate title')}
      finally{btn.disabled=false;btn.textContent=original}
    });`;

if(!ui.includes(wireMarker))throw new Error('Could not find review row wiring block');
ui=ui.replace(wireMarker,wireReplacement);

const collectOld=`      attributes:{
        sourness:Number(row.querySelector('.mr-sour').value),
        sweetness:Number(row.querySelector('.mr-sweet').value),
        flavour:Number(row.querySelector('.mr-flavour').value)
      }`;

const collectNew=`      attributes:{
        ...(row.querySelector('.mr-sour-live').checked?{sourness:Number(row.querySelector('.mr-sour').value)}:{}),
        ...(row.querySelector('.mr-sweet-live').checked?{sweetness:Number(row.querySelector('.mr-sweet').value)}:{}),
        ...(row.querySelector('.mr-flavour-live').checked?{flavour:Number(row.querySelector('.mr-flavour').value)}:{})
      }`;

if(!ui.includes(collectOld))throw new Error('Could not find existing manual attribute collection block');
ui=ui.replace(collectOld,collectNew);

ui=ui.replace(
  '.mr-attributes{margin-top:14px;border-top:1px solid #edf0f4;padding-top:14px}.mr-attributes>strong{font-size:13px}.mr-attributes small{font-weight:500;color:#7b8493}.mr-attr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:10px}.mr-attr-grid input{padding:0;border:0}',
  `.mr-attributes{margin-top:14px;border-top:1px solid #edf0f4;padding-top:14px}.mr-attributes>strong{font-size:13px}.mr-attributes small{font-weight:500;color:#7b8493}.mr-attr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:10px}.mr-attr-grid input{padding:0;border:0}.mr-headline-row{display:flex;gap:8px}.mr-headline-row .mr-headline{flex:1}.mr-ai-title{border:1px solid #d6dce5;background:#fff;border-radius:10px;padding:9px 11px;font-weight:800;white-space:nowrap;cursor:pointer}.mr-ai-title:disabled{opacity:.55;cursor:wait}.mr-ai-help{display:block;color:#7b8493;margin-top:5px}.mr-score-card{border:1px solid #e2e7ed;border-radius:12px;padding:10px}.mr-score-card>span{display:flex!important;align-items:center;gap:7px}.mr-score-card>span input{width:auto!important}.mr-score-control{margin-top:8px;transition:.2s}.mr-score-control>span{display:block;font-size:11px;font-weight:800;color:#4b5563;margin-bottom:5px}.mr-score-control.is-off{opacity:.35}.mr-score-control input:disabled{cursor:not-allowed}`
);

write('public/manual-review-import.js',ui);

console.log('✓ Added AI review-title generation endpoint');
console.log('✓ Added AI generate title button to each manual review');
console.log('✓ Sourness, Sweetness and Flavour now have independent Include score toggles');
console.log('✓ Manual scores default OFF so historical reviews do not get invented 5/10 values');
