#!/usr/bin/env bash
set -euo pipefail

FILES=(
  "src/modules/product-creation-import/services/supplierFactMapper.service.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "src/modules/product-creation-import/productCreationImport.routes.js"
  "public/supplier-sites-admin.js"
  "public/supplier-sites-admin.css"
)
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path

p=Path("src/modules/product-creation-import/services/supplierFactMapper.service.js")
s=p.read_text()

if "const ORGANISATION_FIELD_ALIASES" not in s:
    insert = r'''
const ORGANISATION_FIELD_ALIASES = {
  flavour: {
    canonical: 'core.product_flavour',
    labels: ['product flavour','product flavor','flavour','flavor','flavour name','flavor name','taste'],
    exclude: ['family','profile','sweet','sour','description']
  },
  formula: {
    canonical: 'core.formula_version',
    labels: ['formula version','formula','product line','product formula','formula code','range'],
    exclude: ['ingredients','nutrition','description']
  }
};

function definitionText(def={}) {
  return nk([def.name,def.label,def.namespace,def.key,def.description].filter(Boolean).join(' '));
}

function organisationFieldDefinitionMatches(field='', definitions=[]) {
  const spec=ORGANISATION_FIELD_ALIASES[field];
  if(!spec)return [];
  const canonical=spec.canonical;
  const aliases=(spec.labels||[]).map(nk);
  const excludes=(spec.exclude||[]).map(nk);

  return (definitions||[])
    .map(def=>{
      const compound=`${def.namespace||''}.${def.key||''}`;
      const text=definitionText(def);
      const key=nk(def.key||'');
      let score=0;
      if(compound===canonical)score=100;
      for(const alias of aliases){
        const aliasKey=alias.replace(/\s+/g,'_');
        if(key===aliasKey)score=Math.max(score,95);
        else if(text===alias)score=Math.max(score,92);
        else if(text.includes(alias))score=Math.max(score,78);
      }
      if(excludes.some(x=>text.includes(x)))score-=40;
      return {def,score};
    })
    .filter(row=>row.score>=70)
    .sort((a,b)=>b.score-a.score)
    .map(row=>({
      namespace:row.def.namespace,
      key:row.def.key,
      name:row.def.name||row.def.label||`${row.def.namespace}.${row.def.key}`,
      type:row.def.type?.name||row.def.type||'single_line_text_field',
      description:row.def.description||'',
      score:row.score,
      canonical:`${row.def.namespace}.${row.def.key}`===canonical
    }));
}

function getOrganisationFieldValue(draft={},field='') {
  const spec=ORGANISATION_FIELD_ALIASES[field];
  if(!spec)return '';
  const [namespace,key]=spec.canonical.split('.');
  return (draft.metafields||[]).find(m=>m.namespace===namespace&&m.key===key)?.value||'';
}

function applyOrganisationFieldMappings(draft={},metadata={}) {
  const definitions=defs(metadata);
  let metafields=normaliseMetafields(draft.metafields||[]);
  for(const field of Object.keys(ORGANISATION_FIELD_ALIASES)){
    const value=getOrganisationFieldValue({...draft,metafields},field);
    if(value===undefined||value===null||String(value).trim()==='')continue;
    const matches=organisationFieldDefinitionMatches(field,definitions);
    for(const match of matches){
      metafields=normaliseMetafields([
        ...metafields,
        {
          namespace:match.namespace,
          key:match.key,
          type:match.type||'single_line_text_field',
          label:match.name,
          value:String(value).trim(),
          source:'organisation-field-mapper',
          confidence:match.canonical?1:0.96
        }
      ]);
    }
  }
  return {...draft,metafields};
}

function organisationFieldMappingSummary({field='',draft={},metadata={}}){
  const value=getOrganisationFieldValue(draft,field);
  const matches=organisationFieldDefinitionMatches(field,defs(metadata));
  return {
    field,
    value,
    matches:matches.map(match=>({...match,compound:`${match.namespace}.${match.key}`,value}))
  };
}

'''
    s=s.replace("const FACT_ALIASES=", insert+"const FACT_ALIASES=")

s=s.replace(
"module.exports={mapSupplierFactsToExistingMetafields,findDefinition};",
"module.exports={mapSupplierFactsToExistingMetafields,findDefinition,applyOrganisationFieldMappings,organisationFieldMappingSummary,organisationFieldDefinitionMatches};"
)
p.write_text(s)

p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()
s=s.replace(
"const { mapSupplierFactsToExistingMetafields } = require('./supplierFactMapper.service');",
"const { mapSupplierFactsToExistingMetafields, applyOrganisationFieldMappings, organisationFieldMappingSummary } = require('./supplierFactMapper.service');"
)
old='''    const draft = normaliseDraftProduct(applyCatalogueRules({ draft: mergedDraft, metadata }));
    item.draft = draft;'''
new='''    let draft = normaliseDraftProduct(applyCatalogueRules({ draft: mergedDraft, metadata }));
    draft = normaliseDraftProduct(applyOrganisationFieldMappings(draft, metadata));
    item.draft = draft;'''
if old in s:
    s=s.replace(old,new)
elif "applyOrganisationFieldMappings(draft, metadata)" not in s:
    raise SystemExit("Could not patch updateBatchItem draft mapping")

if "async function getBatchItemFieldMappings(" not in s:
    marker="\nasync function setBatchItemApproval("
    pos=s.find(marker)
    if pos==-1:
        raise SystemExit("Could not find setBatchItemApproval anchor")
    fn=r'''
async function getBatchItemFieldMappings({ shopDomain, batchId, itemId, field = '' }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const item = batch.items.find((candidate) => candidate.itemId === itemId);
  if (!item) {
    const error = new Error('Batch item not found.');
    error.status = 404;
    throw error;
  }

  const metadata = await getProductImportMetadata({ shopDomain }).catch(() => ({}));
  const draft = item.draft || {};
  const direct = {
    vendor: [{ kind:'shopify', label:'Shopify Vendor', target:'product.vendor', value:draft.vendor||'' }],
    productType: [{ kind:'shopify', label:'Shopify Product Type', target:'product.product_type', value:draft.productType||'' }],
    productCategory: [{ kind:'draft', label:'Draft Product Category', target:'draft.productCategory', value:draft.productCategory||'', note:'Stored in the import draft. Native Shopify taxonomy mapping is not currently written by createShopifyProductFromDraft.' }]
  };

  if (direct[field]) return { field, value: direct[field][0].value, matches: direct[field] };
  if (field === 'flavour' || field === 'formula') {
    const summary = organisationFieldMappingSummary({ field, draft, metadata });
    return {
      field,
      value: summary.value,
      matches: summary.matches.map(match => ({
        kind:'metafield',
        label:match.name,
        target:match.compound,
        type:match.type,
        canonical:match.canonical,
        score:match.score,
        value:summary.value
      }))
    };
  }
  return { field, value:'', matches:[] };
}

'''
    s=s[:pos]+fn+s[pos:]

if "  getBatchItemFieldMappings," not in s:
    s=s.replace("  updateBatchItem,\n", "  updateBatchItem,\n  getBatchItemFieldMappings,\n")
p.write_text(s)

p=Path("src/modules/product-creation-import/productCreationImport.routes.js")
s=p.read_text()
if "  getBatchItemFieldMappings," not in s:
    s=s.replace("  updateBatchItem,\n", "  updateBatchItem,\n  getBatchItemFieldMappings,\n")
if "items/:itemId/field-mappings" not in s:
    anchor='''router.patch('/batches/:batchId/items/:itemId', asyncRoute(async (req, res) => {
  const result = await updateBatchItem({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId, itemId: req.params.itemId, patch: req.body || {} });
  res.json(result);
}));
'''
    if anchor not in s:
        raise SystemExit("Could not find item PATCH route")
    route=anchor+'''\nrouter.get('/batches/:batchId/items/:itemId/field-mappings', asyncRoute(async (req, res) => {
  const result = await getBatchItemFieldMappings({
    shopDomain: shopDomainFromReq(req),
    batchId: req.params.batchId,
    itemId: req.params.itemId,
    field: req.query.field || '',
  });
  res.json(result);
}));
'''
    s=s.replace(anchor,route)
p.write_text(s)

p=Path("public/supplier-sites-admin.js")
s=p.read_text()
repls = {
'<label class="pci-label">Vendor</label><input id="spm-vendor" class="pci-input">':'<label class="pci-label">Vendor</label><div class="supplier-field-map-row"><input id="spm-vendor" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="vendor" title="Show Shopify field mapping">↗</button></div>',
'<label class="pci-label">Product type</label><input id="spm-type" class="pci-input">':'<label class="pci-label">Product type</label><div class="supplier-field-map-row"><input id="spm-type" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="productType" title="Show Shopify field mapping">↗</button></div>',
'<label class="pci-label">Product category</label><input id="spm-category" class="pci-input">':'<label class="pci-label">Product category</label><div class="supplier-field-map-row"><input id="spm-category" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="productCategory" title="Show Shopify field mapping">↗</button></div>',
'<label class="pci-label">Flavour</label><input id="spm-flavour" class="pci-input">':'<label class="pci-label">Flavour</label><div class="supplier-field-map-row"><input id="spm-flavour" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="flavour" title="Show metafield matches">↗</button></div>',
'<label class="pci-label">Product line / formula</label><input id="spm-line" class="pci-input">':'<label class="pci-label">Product line / formula</label><div class="supplier-field-map-row"><input id="spm-line" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="formula" title="Show metafield matches">↗</button></div>'
}
for old,new in repls.items():
    if old in s:s=s.replace(old,new)

if 'id="spm-map-panel"' not in s:
    target='''              <section class="pci-editor-card">\n                <h4>Source</h4>'''
    panel='''              <section id="spm-map-panel" class="pci-editor-card supplier-map-panel" hidden>\n                <div class="pci-editor-card-head">\n                  <h4 id="spm-map-title">Field mapping</h4>\n                  <button id="spm-map-close" type="button" class="supplier-map-close" aria-label="Close mapping panel">×</button>\n                </div>\n                <div id="spm-map-content" class="supplier-map-content"></div>\n              </section>\n'''
    if target not in s:
        raise SystemExit("Could not add mapping panel")
    s=s.replace(target,panel+target)

if "async function showFieldMapping(" not in s:
    marker="  function modalStatus(message,kind=''){"
    pos=s.find(marker)
    if pos==-1: raise SystemExit("Could not find modalStatus()")
    fn='''  async function showFieldMapping(field){\n    if(!state.activeBatch||!state.activeItem)return;\n    const panel=$('spm-map-panel');\n    const content=$('spm-map-content');\n    const title=$('spm-map-title');\n    if(!panel||!content||!title)return;\n    const names={vendor:'Vendor',productType:'Product type',productCategory:'Product category',flavour:'Flavour',formula:'Product line / formula'};\n    panel.hidden=false;\n    title.textContent=`${names[field]||field} mapping`;\n    content.innerHTML='<div class="pci-muted">Checking Shopify definitions…</div>';\n    try{\n      await saveItemModal();\n      const data=await api(`/batches/${state.activeBatch._id}/items/${state.activeItem.itemId}/field-mappings?field=${encodeURIComponent(field)}`);\n      const matches=data.matches||[];\n      if(!matches.length){\n        content.innerHTML=`<div class="supplier-map-empty">No Shopify destination is currently matched for <strong>${esc(data.value||'this value')}</strong>.</div>`;\n        return;\n      }\n      content.innerHTML=matches.map(match=>`\n        <div class="supplier-map-match">\n          <div class="supplier-map-match-head">\n            <strong>${esc(match.label||match.target)}</strong>\n            ${match.canonical?'<span class="supplier-map-badge">Primary</span>':''}\n          </div>\n          <code>${esc(match.target||'')}</code>\n          ${match.type?`<small>${esc(match.type)}</small>`:''}\n          ${match.note?`<p>${esc(match.note)}</p>`:''}\n          <div class="supplier-map-value">← ${esc(match.value??data.value??'')}</div>\n        </div>\n      `).join('');\n    }catch(error){\n      content.innerHTML=`<div class="supplier-map-empty error">${esc(error.message||'Could not load mapping.')}</div>`;\n    }\n  }\n\n'''
    s=s[:pos]+fn+s[pos:]

wire="""    $('spm-ai-refresh').addEventListener('click',aiRefreshItemModal);\n    $('spm-create').addEventListener('click',createItemShopifyDraft);"""
wire_new="""    $('spm-ai-refresh').addEventListener('click',aiRefreshItemModal);\n    $('spm-create').addEventListener('click',createItemShopifyDraft);\n    document.querySelectorAll('#supplier-product-modal [data-map-field]').forEach(btn=>{\n      btn.addEventListener('click',()=>showFieldMapping(btn.dataset.mapField));\n    });\n    $('spm-map-close')?.addEventListener('click',()=>{$('spm-map-panel').hidden=true;});"""
if wire in s:s=s.replace(wire,wire_new)
p.write_text(s)

p=Path("public/supplier-sites-admin.css")
s=p.read_text()
css=r'''\n.supplier-field-map-row{display:grid;grid-template-columns:minmax(0,1fr) 38px;gap:7px;align-items:center}\n.supplier-map-btn{width:38px;height:100%;min-height:42px;border:1px solid #d3dae6;border-radius:10px;background:#f8fafc;color:#475569;font-size:17px;font-weight:800;cursor:pointer}\n.supplier-map-btn:hover{background:#eef2f7;color:#0f172a}\n.supplier-map-panel{border-color:#cbd5e1;background:#fbfdff}\n.supplier-map-close{width:28px;height:28px;border:0;border-radius:8px;background:#eef2f7;cursor:pointer;font-size:18px;line-height:1}\n.supplier-map-content{display:grid;gap:8px}\n.supplier-map-match{border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:10px;display:grid;gap:5px}\n.supplier-map-match-head{display:flex;align-items:center;justify-content:space-between;gap:8px}\n.supplier-map-match code{font-size:11px;color:#475569;word-break:break-all}\n.supplier-map-match small{color:#64748b}\n.supplier-map-match p{margin:2px 0;font-size:12px;color:#64748b}\n.supplier-map-value{margin-top:3px;font-size:12px;font-weight:700;color:#0f172a}\n.supplier-map-badge{padding:3px 7px;border-radius:999px;background:#dcfce7;color:#166534;font-size:10px;font-weight:800}\n.supplier-map-empty{font-size:12px;color:#64748b}\n.supplier-map-empty.error{color:#b91c1c}\n'''
if ".supplier-field-map-row{" not in s:s += css
p.write_text(s)
print("Added organisation field mapping inspector and metafield fan-out")
PY

node --check src/modules/product-creation-import/services/supplierFactMapper.service.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/supplier-sites-admin.js

npm run deploy:preflight

echo "Field mapping inspector ready."
echo "git add src/modules/product-creation-import/services/supplierFactMapper.service.js src/modules/product-creation-import/services/productImportBatch.service.js src/modules/product-creation-import/productCreationImport.routes.js public/supplier-sites-admin.js public/supplier-sites-admin.css"
echo 'git commit -m "Add product field mapping inspector and metafield fan-out"'
echo "git push origin clean-main"
