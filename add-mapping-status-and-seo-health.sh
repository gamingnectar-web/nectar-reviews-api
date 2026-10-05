#!/usr/bin/env bash
set -euo pipefail

REQ=(
  "public/admin.html"
  "public/supplier-sites-admin.js"
  "public/supplier-sites-admin.css"
  "public/product-creation-import.css"
  "src/modules/product-creation-import/productCreationImport.routes.js"
  "src/modules/product-creation-import/services/shopifyProduct.service.js"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

cat > src/modules/product-creation-import/services/productSeoAudit.service.js <<'EOF'
const { cleanText } = require('../utils/safe');
const { listShopifyProductsForMatching } = require('./shopifyProduct.service');

function words(value=''){ return cleanText(value,1000).toLowerCase().split(/\s+/).filter(Boolean); }
function norm(value=''){ return cleanText(value,500).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function slugOkay(handle=''){ return Boolean(handle) && handle.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle); }
function titleLooksUseful(title=''){ const n=cleanText(title,220); return n.length >= 4 && n.length <= 90; }

function scoreProduct(product={}, duplicates={}){
  const title=cleanText(product.title||'',220);
  const seoTitle=cleanText(product.seoTitle||'',220);
  const meta=cleanText(product.seoDescription||'',500);
  const handle=cleanText(product.handle||'',180);
  const vendor=cleanText(product.vendor||'',120);
  const issues=[];
  const checks=[];
  const add=(name,points,ok,note='')=>{ checks.push({name,points:ok?points:0,max:points,ok,note}); if(!ok&&note)issues.push(note); };

  add('Product title',15,titleLooksUseful(title),'Product title is missing, unusually short or unusually long.');
  add('SEO title present',10,Boolean(seoTitle),'SEO title is missing.');
  add('SEO title length',10,seoTitle.length>=30&&seoTitle.length<=65,'SEO title is outside the working range of roughly 30–65 characters.');
  add('SEO title relevance',10,Boolean(seoTitle)&&norm(seoTitle).includes(norm(title).split(' ').slice(0,2).join(' ')),'SEO title does not clearly reflect the product title.');
  add('Meta description present',10,Boolean(meta),'Meta description is missing.');
  add('Meta description length',10,meta.length>=110&&meta.length<=165,'Meta description is outside the working range of roughly 110–165 characters.');
  add('Meta description specific',10,Boolean(meta)&&(!vendor||norm(meta).includes(norm(vendor)))&&words(meta).length>=12,'Meta description looks generic or too thin.');
  add('URL handle',10,slugOkay(handle),'URL handle is missing, too long or untidy.');
  add('URL relevance',5,Boolean(handle)&&norm(handle).split(' ').some(token=>norm(title).includes(token)),'URL handle does not appear closely related to the product title.');
  add('Unique SEO title',5,!seoTitle||!duplicates.seoTitle,'SEO title duplicates another product.');
  add('Unique meta description',5,!meta||!duplicates.meta,'Meta description duplicates another product.');
  add('Unique URL',5,!handle||!duplicates.handle,'URL handle duplicates another product.');

  return { score:checks.reduce((sum,c)=>sum+c.points,0), checks, issues };
}

async function auditShopifySeo({shopDomain,maxProducts=2500}){
  const products=await listShopifyProductsForMatching({shopDomain,maxProducts});
  const seoTitleCounts=new Map(), metaCounts=new Map(), handleCounts=new Map();
  for(const p of products){
    const st=norm(p.seoTitle||''), md=norm(p.seoDescription||''), h=norm(p.handle||'');
    if(st)seoTitleCounts.set(st,(seoTitleCounts.get(st)||0)+1);
    if(md)metaCounts.set(md,(metaCounts.get(md)||0)+1);
    if(h)handleCounts.set(h,(handleCounts.get(h)||0)+1);
  }

  const rows=products.map(product=>{
    const audit=scoreProduct(product,{
      seoTitle:(seoTitleCounts.get(norm(product.seoTitle||''))||0)>1,
      meta:(metaCounts.get(norm(product.seoDescription||''))||0)>1,
      handle:(handleCounts.get(norm(product.handle||''))||0)>1,
    });
    return { id:product.id, legacyResourceId:product.legacyResourceId||'', title:product.title||'', vendor:product.vendor||'', handle:product.handle||'', productType:product.productType||'', status:product.status||'', image:product.image||'', seoTitle:product.seoTitle||'', seoDescription:product.seoDescription||'', ...audit };
  }).sort((a,b)=>a.score-b.score||a.title.localeCompare(b.title));

  const divisor=rows.length||1;
  return {
    summary:{
      products:rows.length,
      averageScore:Math.round(rows.reduce((sum,row)=>sum+row.score,0)/divisor),
      needsWork:rows.filter(row=>row.score<80).length,
      weakMeta:rows.filter(row=>row.issues.some(issue=>/meta description/i.test(issue))).length,
      titleIssues:rows.filter(row=>row.issues.some(issue=>/title/i.test(issue))).length,
      urlIssues:rows.filter(row=>row.issues.some(issue=>/URL/i.test(issue))).length,
    },
    products:rows,
  };
}

async function suggestSeoWithAi({product={}}){
  const apiKey=process.env.OPENAI_API_KEY||'';
  if(!apiKey){ const error=new Error('OPENAI_API_KEY is not configured.'); error.status=412; throw error; }
  const model=process.env.OPENAI_PRODUCT_IMPORT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
  const prompt=`Improve SEO copy for ONE ecommerce product. Return JSON only with keys seoTitle, seoDescription, handle.\n\nRules:\n- Preserve the actual product identity and facts.\n- Do not invent claims, ingredients, benefits or stock status.\n- SEO title should normally be around 30-65 characters where practical.\n- Meta description should normally be around 110-165 characters, specific to this product and natural.\n- Handle must be lowercase hyphenated words only.\n- Avoid generic filler such as \"available from Gaming Nectar\".\n- Do not keyword-stuff.\n\nProduct:\n${JSON.stringify(product).slice(0,6000)}`;
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'You improve one product SEO record. Output JSON only.'},{role:'user',content:prompt}]})});
  const json=await response.json().catch(()=>({}));
  if(!response.ok){ const error=new Error(json.error?.message||`OpenAI SEO suggestion failed (${response.status})`); error.status=502; throw error; }
  let suggestion={};
  try{ suggestion=JSON.parse(json.choices?.[0]?.message?.content||'{}'); }catch(_){ const error=new Error('AI SEO suggestion returned invalid JSON.'); error.status=502; throw error; }
  return { model, suggestion:{ seoTitle:cleanText(suggestion.seoTitle||'',70), seoDescription:cleanText(suggestion.seoDescription||'',165), handle:cleanText(suggestion.handle||'',180).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') } };
}

module.exports={auditShopifySeo,suggestSeoWithAi};
EOF

cat > public/product-seo-audit.js <<'EOF'
(function ProductSeoAudit(){
  const api=(path,options={})=>window.adminFetch(`/admin/product-creation-import${path}`,options);
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let loaded=false,data=null;

  function render(){
    if(!data)return;
    const s=data.summary||{};
    $('pci-seo-summary').innerHTML=`<div class="pci-seo-score-card"><strong>${s.averageScore||0}</strong><span>Average health</span></div><div class="pci-seo-stat"><strong>${s.needsWork||0}</strong><span>Products need work</span></div><div class="pci-seo-stat"><strong>${s.weakMeta||0}</strong><span>Weak / missing meta</span></div><div class="pci-seo-stat"><strong>${s.titleIssues||0}</strong><span>Title issues</span></div><div class="pci-seo-stat"><strong>${s.urlIssues||0}</strong><span>URL issues</span></div>`;
    const q=($('pci-seo-search')?.value||'').toLowerCase().trim();
    const filter=$('pci-seo-filter')?.value||'all';
    const rows=(data.products||[]).filter(row=>{ if(q&&!`${row.title} ${row.vendor} ${row.handle}`.toLowerCase().includes(q))return false; if(filter==='poor'&&row.score>=60)return false; if(filter==='work'&&row.score>=80)return false; if(filter==='good'&&row.score<80)return false; return true; });
    $('pci-seo-results').innerHTML=rows.map(row=>`<article class="pci-seo-row"><div class="pci-seo-row-main"><div class="pci-seo-row-title">${row.image?`<img src="${esc(row.image)}" alt="">`:''}<div><strong>${esc(row.title)}</strong><small>${esc(row.vendor)} · /products/${esc(row.handle)}</small></div></div><div class="pci-seo-score ${row.score>=80?'good':row.score>=60?'warn':'bad'}">${row.score}</div></div><div class="pci-seo-copy"><div><span>SEO TITLE</span><p>${esc(row.seoTitle||'Missing')}</p></div><div><span>META DESCRIPTION</span><p>${esc(row.seoDescription||'Missing')}</p></div></div><div class="pci-seo-issues">${(row.issues||[]).slice(0,5).map(issue=>`<span>⚠ ${esc(issue)}</span>`).join('')||'<span class="ok">✓ No major issues in this audit</span>'}</div><div class="pci-seo-actions"><button class="secondary-btn" type="button" data-ai-id="${esc(row.id)}">Improve with AI</button><div class="pci-seo-ai-result" id="seo-ai-${String(row.id).replace(/[^a-z0-9]/gi,'_')}"></div></div></article>`).join('')||'<div class="pci-empty">No products match this filter.</div>';
    document.querySelectorAll('[data-ai-id]').forEach(btn=>{btn.onclick=()=>suggest(btn.dataset.aiId,btn);});
  }

  async function suggest(id,btn){
    const row=(data.products||[]).find(item=>item.id===id); if(!row)return;
    const target=$(`seo-ai-${String(id).replace(/[^a-z0-9]/gi,'_')}`);
    try{ btn.disabled=true; target.textContent='Generating one AI suggestion…'; const result=await api('/seo/suggest',{method:'POST',body:JSON.stringify({product:row})}); const s=result.suggestion||{}; target.innerHTML=`<div class="pci-seo-suggestion"><strong>AI suggestion</strong><p><b>Title:</b> ${esc(s.seoTitle)}</p><p><b>Meta:</b> ${esc(s.seoDescription)}</p><p><b>URL:</b> /products/${esc(s.handle)}</p></div>`; }
    catch(error){ target.textContent=error.message||'AI suggestion failed.'; }
    finally{ btn.disabled=false; }
  }

  async function load(force=false){
    if(loaded&&!force){render();return;}
    $('pci-seo-status').textContent='Auditing Shopify product SEO…';
    try{ data=await api('/seo/audit?limit=2500'); loaded=true; $('pci-seo-status').textContent=`Audited ${data.summary?.products||0} Shopify products.`; render(); }
    catch(error){ $('pci-seo-status').textContent=error.message||'SEO audit failed.'; }
  }

  window.openProductSeoAudit=()=>{ window.pciTab?.('seo-health'); setTimeout(()=>load(false),50); };
  window.refreshProductSeoAudit=()=>load(true);
  document.addEventListener('input',event=>{if(event.target?.id==='pci-seo-search')render();});
  document.addEventListener('change',event=>{if(event.target?.id==='pci-seo-filter')render();});
})();
EOF

python3 - <<'PY'
from pathlib import Path
import re

p=Path('src/modules/product-creation-import/services/shopifyProduct.service.js')
s=p.read_text()
s=s.replace('''        productType\n        tags\n        status''','''        productType\n        tags\n        status\n        seo{title description}''')
s=s.replace('''        status:product.status||'',\n        image:featured,''','''        status:product.status||'',\n        seoTitle:product.seo?.title||'',\n        seoDescription:product.seo?.description||'',\n        image:featured,''')
p.write_text(s)

p=Path('src/modules/product-creation-import/productCreationImport.routes.js')
s=p.read_text()
if 'productSeoAudit.service' not in s:
    s=s.replace('const router = express.Router();',"const { auditShopifySeo, suggestSeoWithAi } = require('./services/productSeoAudit.service');\n\nconst router = express.Router();")
if "router.get('/seo/audit'" not in s:
    s=s.replace("router.get('/health', asyncRoute(async (req, res) => {",'''router.get('/seo/audit', asyncRoute(async (req, res) => {\n  const result = await auditShopifySeo({ shopDomain: shopDomainFromReq(req), maxProducts: req.query.limit || 2500 });\n  res.json(result);\n}));\n\nrouter.post('/seo/suggest', asyncRoute(async (req, res) => {\n  const result = await suggestSeoWithAi({ shopDomain: shopDomainFromReq(req), product: req.body?.product || {} });\n  res.json(result);\n}));\n\nrouter.get('/health', asyncRoute(async (req, res) => {''')
p.write_text(s)

p=Path('public/admin.html')
s=p.read_text()
needle='''              <button type="button" class="pci-import-launch-card" onclick="window.openSupplierImportWorkspace?.('catalogue')"><span class="pci-launch-number">04</span><strong>Brand product catalogue</strong><small>Open saved brand catalogues, cross-check Shopify and work only on missing products.</small><b>Review catalogues →</b></button>'''
if needle in s and 'Audit product SEO' not in s:
    s=s.replace(needle,needle+'''\n              <button type="button" class="pci-import-launch-card seo" onclick="window.openProductSeoAudit?.()"><span class="pci-launch-number">05</span><strong>SEO health</strong><small>Audit titles, SEO titles, meta descriptions and product URLs across Shopify.</small><b>Audit product SEO →</b></button>''')
if 'id="pci-pane-seo-health"' not in s:
    marker='<div class="pci-card pci-pane pci-full-product-pane" id="pci-pane-batch">'
    pane='''<div class="pci-card pci-pane pci-full-product-pane" id="pci-pane-seo-health">\n          <div class="pci-pane-head"><div><h3>SEO health</h3><p>A transparent catalogue audit for product title structure, SEO titles, meta descriptions and URL handles. This is an internal health score, not a Google-provided metric.</p></div><button class="secondary-btn" type="button" onclick="window.refreshProductSeoAudit?.()">Refresh audit</button></div>\n          <div id="pci-seo-status" class="pci-status">Open SEO Health to run an audit.</div>\n          <div id="pci-seo-summary" class="pci-seo-summary"></div>\n          <div class="pci-seo-toolbar"><input id="pci-seo-search" class="pci-input" placeholder="Search products, brands or handles"><select id="pci-seo-filter" class="pci-input"><option value="all">All products</option><option value="poor">Poor: under 60</option><option value="work">Needs work: under 80</option><option value="good">Good: 80+</option></select></div>\n          <div id="pci-seo-results" class="pci-seo-results"></div>\n        </div>\n\n        '''
    s=s.replace(marker,pane+marker)
if '/product-seo-audit.js' not in s:
    s=s.replace('</body>','<script src="/product-seo-audit.js?v=seo-health-1"></script>\n</body>')
s=re.sub(r'/supplier-sites-admin\.js\?v=[^"\']+', '/supplier-sites-admin.js?v=supplier-sites-12', s)
s=re.sub(r'/supplier-sites-admin\.css\?v=[^"\']+', '/supplier-sites-admin.css?v=supplier-sites-12', s)
s=re.sub(r'/product-creation-import\.css\?v=[^"\']+', '/product-creation-import.css?v=pci-v43', s)
p.write_text(s)

p=Path('public/supplier-sites-admin.js')
s=p.read_text()
s=s.replace('>Map</button>', '><span class="supplier-map-state">?</span></button>')
if 'async function refreshMappingIndicators(' not in s:
    marker='  async function showFieldMapping(field){'
    fn='''  async function refreshMappingIndicators(){\n    if(!state.activeBatch||!state.activeItem)return;\n    const buttons=[...document.querySelectorAll('#supplier-product-modal [data-map-field]')];\n    await Promise.all(buttons.map(async btn=>{\n      try{\n        const field=btn.dataset.mapField;\n        const data=await api(`/batches/${state.activeBatch._id}/items/${state.activeItem.itemId}/field-mappings?field=${encodeURIComponent(field)}`);\n        const count=(data.matches||[]).length;\n        btn.classList.toggle('mapped',count>0);\n        btn.classList.toggle('unmapped',count===0);\n        const stateEl=btn.querySelector('.supplier-map-state');\n        if(stateEl)stateEl.textContent=count>0?'✓':'×';\n        btn.title=count>0?`${count} destination${count===1?'':'s'} mapped`:'Not mapped — click to map';\n      }catch(_){}\n    }));\n  }\n\n'''
    s=s.replace(marker,fn+marker)
s=s.replace("    if(existingMatch)showMatchWarning(existingMatch);\n    $('supplier-product-modal').hidden=false;","    if(existingMatch)showMatchWarning(existingMatch);\n    $('supplier-product-modal').hidden=false;\n    refreshMappingIndicators();")
old="""        content.innerHTML=`<div class=\"supplier-map-empty\">No Shopify destination is currently matched for <strong>${esc(data.value||'this value')}</strong>.</div>`;"""
new="""        content.innerHTML=`<div class=\"supplier-map-empty\">No Shopify destination is currently matched for <strong>${esc(data.value||'this value')}</strong>.<div style=\"margin-top:10px\"><button type=\"button\" class=\"secondary-btn\" id=\"spm-open-metafield-mapper\">Map this field</button></div></div>`;\n        setTimeout(()=>$('spm-open-metafield-mapper')?.addEventListener('click',()=>{closeItemModal();window.pciTab?.('metafields');}),0);"""
if old in s:s=s.replace(old,new)
p.write_text(s)

p=Path('public/supplier-sites-admin.css')
s=p.read_text()+'''\n.supplier-field-map-row{grid-template-columns:minmax(0,1fr) 32px !important;gap:6px}.supplier-map-btn{width:32px !important;min-width:32px;height:32px !important;min-height:32px !important;align-self:center;border-radius:999px !important;padding:0 !important;font-size:14px !important;line-height:1}.supplier-map-btn.mapped{background:#ecfdf5 !important;border-color:#86efac !important;color:#15803d !important}.supplier-map-btn.unmapped{background:#fef2f2 !important;border-color:#fecaca !important;color:#b91c1c !important}.supplier-map-state{display:block;font-weight:900}\n'''
p.write_text(s)

p=Path('public/product-creation-import.css')
s=p.read_text()+'''\n.pci-import-launch-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.pci-import-launch-card.seo{background:#fbfdff}.pci-seo-summary{display:grid;grid-template-columns:1.25fr repeat(4,1fr);gap:10px;margin:14px 0}.pci-seo-score-card,.pci-seo-stat{border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px;display:grid;gap:4px}.pci-seo-score-card strong{font-size:28px}.pci-seo-stat strong{font-size:20px}.pci-seo-score-card span,.pci-seo-stat span{font-size:11px;color:#64748b}.pci-seo-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px;margin:12px 0}.pci-seo-results{display:grid;gap:10px}.pci-seo-row{border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px}.pci-seo-row-main{display:flex;align-items:center;justify-content:space-between;gap:14px}.pci-seo-row-title{display:flex;align-items:center;gap:10px}.pci-seo-row-title img{width:46px;height:46px;object-fit:contain;border-radius:8px;background:#f8fafc}.pci-seo-row-title div{display:grid;gap:3px}.pci-seo-row-title small{color:#64748b}.pci-seo-score{width:48px;height:48px;border-radius:999px;display:grid;place-items:center;font-weight:900}.pci-seo-score.good{background:#dcfce7;color:#166534}.pci-seo-score.warn{background:#fef3c7;color:#92400e}.pci-seo-score.bad{background:#fee2e2;color:#991b1b}.pci-seo-copy{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.pci-seo-copy>div{background:#f8fafc;border-radius:9px;padding:10px}.pci-seo-copy span{font-size:10px;font-weight:900;color:#64748b}.pci-seo-copy p{margin:4px 0 0}.pci-seo-issues{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.pci-seo-issues span{font-size:11px;background:#fff7ed;color:#9a3412;border-radius:999px;padding:4px 7px}.pci-seo-issues span.ok{background:#ecfdf5;color:#166534}.pci-seo-actions{margin-top:10px}.pci-seo-ai-result{margin-top:8px}.pci-seo-suggestion{border:1px solid #dbeafe;background:#eff6ff;border-radius:10px;padding:10px}.pci-seo-suggestion p{margin:4px 0}@media(max-width:1250px){.pci-import-launch-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.pci-seo-summary{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.pci-import-launch-grid{grid-template-columns:1fr}.pci-seo-summary,.pci-seo-copy,.pci-seo-toolbar{grid-template-columns:1fr}}\n'''
p.write_text(s)

print('Applied mapping status redesign and SEO Health workspace')
PY

node --check src/modules/product-creation-import/services/productSeoAudit.service.js
node --check src/modules/product-creation-import/services/shopifyProduct.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/product-seo-audit.js
node --check public/supplier-sites-admin.js
npm run deploy:preflight

echo
echo "Patch passed."
echo "git add src/modules/product-creation-import/services/productSeoAudit.service.js src/modules/product-creation-import/services/shopifyProduct.service.js src/modules/product-creation-import/productCreationImport.routes.js public/product-seo-audit.js public/supplier-sites-admin.js public/supplier-sites-admin.css public/product-creation-import.css public/admin.html"
echo 'git commit -m "Add mapping status controls and product SEO health audit"'
echo "git push origin clean-main"
