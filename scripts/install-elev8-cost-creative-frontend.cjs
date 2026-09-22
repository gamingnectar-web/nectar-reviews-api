const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(parts,s)=>fs.writeFileSync(F(...parts),s);

let js=R('public','modules','marketing-intelligence','marketing-intelligence.js');

// Product actions: add cost & inventory button.
js=js.replace(
  `<div class="mi-card-actions"><button type="button" class="primary-btn" data-mi-creative="\${index}" \${p.image?'':'disabled'}>Generate creative</button></div>`,
  `<div class="mi-card-actions"><button type="button" class="secondary-btn" data-mi-cost="\${index}">Cost & inventory</button><button type="button" class="primary-btn" data-mi-creative="\${index}" \${p.image?'':'disabled'}>Generate creative</button></div>`
);

// Bind cost buttons.
js=js.replace(
  `$('mi-products').querySelectorAll('[data-mi-creative]').forEach(btn=>btn.onclick=()=>selectProduct(Number(btn.dataset.miCreative)));`,
  `$('mi-products').querySelectorAll('[data-mi-creative]').forEach(btn=>btn.onclick=()=>selectProduct(Number(btn.dataset.miCreative)));
    $('mi-products').querySelectorAll('[data-mi-cost]').forEach(btn=>btn.onclick=()=>openCostBasis(Number(btn.dataset.miCost)));`
);

// Add AI brief UI.
js=js.replace(
  `<label>Additional art direction<textarea id="mi-brief" rows="5" placeholder="e.g. icy blue atmosphere, premium crystal surface, subtle raspberry cues, leave copy space at the top"></textarea></label>`,
  `<label>Additional art direction
          <textarea id="mi-brief" rows="7" placeholder="Describe the campaign mood, materials, lighting and composition."></textarea>
          <div class="mi-brief-tools"><button type="button" class="secondary-btn" id="mi-suggest-brief">✨ Generate art direction</button><small id="mi-brief-help">Uses the product, sales insight and selected style to write a stronger visual brief.</small></div>
        </label>`
);

js=js.replace(
  `$('mi-generate-bg').onclick=generate;`,
  `$('mi-generate-bg').onclick=generate;
    $('mi-suggest-brief').onclick=suggestBrief;`
);

// Insert helpers before generate().
const marker=`  async function generate(){`;
const helpers=`
  async function suggestBrief(){
    const btn=$('mi-suggest-brief'),help=$('mi-brief-help');
    if(!state.selected)return;
    btn.disabled=true;btn.textContent='Writing…';help.textContent='Creating a premium art-direction brief…';
    try{
      const data=await api('/creative/suggest-brief',{method:'POST',body:JSON.stringify({
        product:state.selected,
        style:$('mi-style').value,
        marketing:{angle:state.selected.angle,reasons:state.selected.reasons||[]}
      })});
      $('mi-brief').value=data.brief||'';
      help.textContent=data.source==='ai'?'AI art direction ready — edit anything before generating.':'Suggested art direction ready — edit anything before generating.';
    }catch(e){help.textContent=e.message||'Could not generate art direction.'}
    finally{btn.disabled=false;btn.textContent='✨ Generate art direction'}
  }

  function costMoney(n){
    return n==null?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0));
  }

  function closeCostModal(){
    document.getElementById('mi-cost-modal')?.remove();
  }

  async function openCostBasis(index){
    const p=state.data?.products?.[index];if(!p)return;
    closeCostModal();
    const modal=document.createElement('div');
    modal.id='mi-cost-modal';modal.className='mi-cost-backdrop';
    modal.innerHTML=\`<div class="mi-cost-modal"><div class="mi-cost-head"><div><span class="mi-eyebrow">Cost diagnostic</span><h2>\${esc(p.title)}</h2><p>Tracing current Shopify inventory back through purchase orders and fallback costs.</p></div><button type="button" data-mi-cost-close>×</button></div><div class="mi-cost-body"><div class="mi-loading">Loading PO history, inventory and margin logic…</div></div></div>\`;
    document.body.appendChild(modal);
    modal.querySelector('[data-mi-cost-close]').onclick=closeCostModal;
    modal.addEventListener('click',e=>{if(e.target===modal)closeCostModal()});
    try{
      const data=await api(\`/products/\${encodeURIComponent(p.productId)}/cost-basis\`);
      const c=data.calculation||{},inv=data.inventory||{},ph=data.purchaseHistory||{},exp=data.explanation||{};
      const sources=Object.entries(c.costSources||{});
      const variants=inv.variants||[],receipts=ph.receipts||[];
      modal.querySelector('.mi-cost-body').innerHTML=\`
        <div class="mi-cost-summary">
          <div><span>Shopify stock</span><strong>\${inv.currentShopifyInventory??0}</strong></div>
          <div><span>30d units</span><strong>\${c.units30d??0}</strong></div>
          <div><span>Costed units</span><strong>\${c.costedUnits30d??0}</strong></div>
          <div><span>Uncosted units</span><strong class="\${c.uncostedUnits30d>0?'bad':''}">\${c.uncostedUnits30d??0}</strong></div>
          <div><span>30d margin</span><strong>\${c.margin30d==null?'—':Math.round(c.margin30d*100)+'%'}</strong></div>
          <div><span>Cost coverage</span><strong>\${Math.round((c.costCoverage30d||0)*100)}%</strong></div>
        </div>

        <div class="mi-cost-explain">
          <h3>How ELEV8 calculates this</h3>
          <p><b>Margin:</b> \${esc(exp.marginFormula||'')}</p>
          <p><b>Coverage:</b> \${esc(exp.coverageFormula||'')}</p>
          <p><b>Cost lookup order:</b> \${(exp.costPriority||[]).map(esc).join(' → ')}</p>
          \${sources.length?\`<p><b>30-day matched unit sources:</b> \${sources.map(([k,v])=>esc(k)+' '+v).join(' · ')}</p>\`:''}
        </div>

        \${(exp.missingReasons||[]).length?\`<div class="mi-cost-alert"><strong>Why cost may be missing</strong>\${exp.missingReasons.map(x=>\`<span>• \${esc(x)}</span>\`).join('')}</div>\`:''}

        <div class="mi-cost-grid">
          <div class="mi-cost-panel">
            <h3>Margin calculation</h3>
            <dl>
              <div><dt>30d revenue</dt><dd>\${costMoney(c.revenue30d)}</dd></div>
              <div><dt>Revenue with known cost</dt><dd>\${costMoney(c.knownCostRevenue30d)}</dd></div>
              <div><dt>Matched product cost</dt><dd>\${costMoney(c.cost30d)}</dd></div>
              <div><dt>Gross profit on known-cost sales</dt><dd>\${costMoney(c.grossProfit30d)}</dd></div>
              <div><dt>Weighted PO unit cost</dt><dd>\${costMoney(ph.weightedPoUnitCost)}</dd></div>
              <div><dt>Weighted Shopify unit cost</dt><dd>\${costMoney(ph.weightedShopifyUnitCost)}</dd></div>
            </dl>
          </div>
          <div class="mi-cost-panel">
            <h3>Purchase history</h3>
            <dl>
              <div><dt>Matched PO receipts</dt><dd>\${ph.receiptCount||0}</dd></div>
              <div><dt>Total units purchased</dt><dd>\${ph.totalPurchasedQty||0}</dd></div>
              <div><dt>Total matched PO cost</dt><dd>\${costMoney(ph.totalPurchasedCost)}</dd></div>
              <div><dt>Current Shopify inventory</dt><dd>\${inv.currentShopifyInventory||0}</dd></div>
            </dl>
          </div>
        </div>

        <div class="mi-cost-table-wrap"><h3>Current Shopify variants</h3>
          <table class="mi-cost-table"><thead><tr><th>Variant</th><th>SKU</th><th>Inventory</th><th>Shopify unit cost</th></tr></thead><tbody>
          \${variants.map(v=>\`<tr><td>\${esc(v.title)}</td><td>\${esc(v.sku||'—')}</td><td>\${v.inventory}</td><td>\${costMoney(v.shopifyUnitCost)}</td></tr>\`).join('')||'<tr><td colspan="4">No variants returned.</td></tr>'}
          </tbody></table>
        </div>

        <div class="mi-cost-table-wrap"><h3>PO lines associated with this product</h3>
          <table class="mi-cost-table"><thead><tr><th>Date</th><th>PO</th><th>Supplier</th><th>SKU</th><th>Qty</th><th>Unit cost</th><th>Matched by</th></tr></thead><tbody>
          \${receipts.map(r=>\`<tr><td>\${r.date?new Date(r.date).toLocaleDateString('en-GB'):'—'}</td><td>\${esc(r.poNumber||r.invoiceNumber||'—')}</td><td>\${esc(r.supplierName||'—')}</td><td>\${esc(r.sku||'—')}</td><td>\${r.qty}</td><td>\${costMoney(r.unitCost)}</td><td><span class="mi-match-pill">\${esc(r.matchedBy||'')}</span></td></tr>\`).join('')||'<tr><td colspan="7">No matching PO lines found.</td></tr>'}
          </tbody></table>
        </div>
      \`;
    }catch(e){
      modal.querySelector('.mi-cost-body').innerHTML=\`<div class="mi-cost-alert"><strong>Could not load cost basis</strong><span>\${esc(e.message||'Request failed')}</span></div>\`;
    }
  }

`;
if(!js.includes('async function openCostBasis('))js=js.replace(marker,helpers+marker);

// Expose diagnostic.
js=js.replace(
  `window.Elev8MarketingIntelligence={load:()=>load(),refresh:()=>load(true),selectProduct:index=>selectProduct(index)};`,
  `window.Elev8MarketingIntelligence={load:()=>load(),refresh:()=>load(true),selectProduct:index=>selectProduct(index),openCostBasis:index=>openCostBasis(index)};`
);

W(['public','modules','marketing-intelligence','marketing-intelligence.js'],js);

// CSS
let css=R('public','modules','marketing-intelligence','marketing-intelligence.css');
if(!css.includes('.mi-cost-backdrop')){
  css += `
.mi-card-actions{display:flex;justify-content:flex-end;gap:8px}
.mi-brief-tools{display:flex;align-items:center;gap:9px;margin-top:8px;flex-wrap:wrap}.mi-brief-tools small{color:#667085;font-weight:600;line-height:1.4;flex:1;min-width:180px}.mi-brief-tools .secondary-btn{min-height:36px;padding:7px 10px;font-size:12px}
.mi-cost-backdrop{position:fixed;inset:0;z-index:2147483500;background:rgba(15,23,42,.58);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px}
.mi-cost-modal{width:min(1180px,96vw);max-height:92vh;overflow:auto;background:#f7f9fb;border-radius:20px;box-shadow:0 35px 110px rgba(15,23,42,.35);border:1px solid #dfe5eb}
.mi-cost-head{position:sticky;top:0;z-index:2;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);padding:20px 22px;border-bottom:1px solid #e5eaf0;display:flex;justify-content:space-between;gap:20px}.mi-cost-head h2{margin:4px 0 3px;font-size:28px}.mi-cost-head p{margin:0;color:#667085}.mi-cost-head>button{width:40px;height:40px;border:0;background:#eef2f5;border-radius:999px;font-size:25px;cursor:pointer}
.mi-cost-body{padding:18px}.mi-cost-summary{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}.mi-cost-summary>div{background:#fff;border:1px solid #e0e6ec;border-radius:12px;padding:12px}.mi-cost-summary span,.mi-cost-summary strong{display:block}.mi-cost-summary span{font-size:9px;text-transform:uppercase;font-weight:850;color:#667085}.mi-cost-summary strong{font-size:23px;margin-top:5px}.mi-cost-summary strong.bad{color:#b42318}
.mi-cost-explain,.mi-cost-alert,.mi-cost-panel,.mi-cost-table-wrap{background:#fff;border:1px solid #e0e6ec;border-radius:14px;padding:15px;margin-top:12px}.mi-cost-explain h3,.mi-cost-panel h3,.mi-cost-table-wrap h3{margin:0 0 10px}.mi-cost-explain p{margin:5px 0;color:#475467;line-height:1.45}.mi-cost-alert{border-color:#f4c7bd;background:#fff7f5;color:#8c2d20}.mi-cost-alert strong,.mi-cost-alert span{display:block}.mi-cost-alert span{margin-top:5px}
.mi-cost-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mi-cost-panel dl{margin:0}.mi-cost-panel dl>div{display:flex;justify-content:space-between;gap:15px;padding:9px 0;border-bottom:1px solid #edf1f4}.mi-cost-panel dl>div:last-child{border-bottom:0}.mi-cost-panel dt{color:#667085}.mi-cost-panel dd{margin:0;font-weight:850}
.mi-cost-table-wrap{overflow:auto}.mi-cost-table{width:100%;border-collapse:collapse;min-width:760px}.mi-cost-table th,.mi-cost-table td{padding:9px 8px;border-bottom:1px solid #edf0f4;text-align:left;font-size:12px}.mi-cost-table th{font-size:9px;text-transform:uppercase;color:#667085}.mi-match-pill{display:inline-flex;background:#edf7ff;color:#175f8e;border-radius:999px;padding:4px 7px;font-weight:800}
@media(max-width:900px){.mi-cost-summary{grid-template-columns:repeat(3,1fr)}.mi-cost-grid{grid-template-columns:1fr}}@media(max-width:600px){.mi-cost-backdrop{padding:8px}.mi-cost-summary{grid-template-columns:repeat(2,1fr)}}
`;
}
W(['public','modules','marketing-intelligence','marketing-intelligence.css'],css);

// cache bump
let html=R('public','admin.html');
html=html
 .replace(/\/modules\/marketing-intelligence\/marketing-intelligence\.css\?v=[^"]+/g,'/modules/marketing-intelligence/marketing-intelligence.css?v=cost-creative-2')
 .replace(/\/modules\/marketing-intelligence\/marketing-intelligence\.js\?v=[^"]+/g,'/modules/marketing-intelligence/marketing-intelligence.js?v=cost-creative-2');
W(['public','admin.html'],html);

console.log('✓ Cost & inventory diagnostic modal added');
console.log('✓ AI art-direction helper added to Creative Studio');
console.log('✓ Marketing Intelligence assets cache-bumped');
