/* ELEV8_SUPPLIER_CATALOGUE_UNIFICATION_V1 */
const ProductImportBatch=require('../productImportBatch.model');
const {cleanText,cleanUrl,parseTags,normaliseMetafields}=require('../utils/safe');
const {normaliseDraftProduct}=require('./normaliseProduct.service');
const {applyMerchantCatalogueContext,getSnapshot}=require('./merchantCatalogueContext.service');

function textKey(v=''){return cleanText(v,180).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function host(v=''){try{return new URL(String(v||'')).hostname.toLowerCase().replace(/^www\./,'');}catch(_){return '';}}
function identity({url='',vendor=''}={}){const h=host(url),vk=textKey(vendor);return{host:h,vendorKey:vk,key:h?'host:'+h:(vk?'vendor:'+vk:'')};}
function title(vendor='',fallback='Supplier'){return (cleanText(vendor||fallback,120)||'Supplier')+' Catalogue';}
function vendorFromDiscovery(discovery={},defaults={},fallback=''){
  const counts=new Map();
  for(const p of discovery.products||[]){const v=cleanText(p?.vendor||'',120);if(v)counts.set(v,(counts.get(v)||0)+1);}
  return cleanText([...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||defaults.vendor||defaults.brand||defaults.supplierName||fallback,120);
}
function itemKey(item={}){
  const d=item.draft||{};
  if(d.barcode)return 'barcode:'+String(d.barcode).toLowerCase();
  if(d.sku)return 'sku:'+String(d.sku).toLowerCase();
  if(item.extractedData?.sourceProductId)return 'source:'+String(item.extractedData.sourceProductId).toLowerCase();
  const handle=item.extractedData?.handle||d.handle;
  if(handle)return 'handle:'+String(handle).toLowerCase();
  try{const u=new URL(item.sourceUrl||'');return 'url:'+host(item.sourceUrl)+u.pathname.replace(/\/$/,'').toLowerCase();}catch(_){}
  return 'title:'+textKey(d.title||item.title||item.originalInput||item.itemId||'');
}
function score(item={}){
  const status={created:100,approved:80,analysed:70,needs_review:60,queued:20,failed:10,skipped:5}[item.status]||0,d=item.draft||{};
  return status+(d.descriptionHtml?8:0)+(d.barcode?8:0)+(d.sku?5:0)+(d.vendor?4:0)+(Array.isArray(d.metafields)?Math.min(10,d.metafields.length):0);
}
function cleanMetafields(rows=[]){
  const map=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const namespace=cleanText(row?.namespace||'',80),key=cleanText(row?.key||'',80),value=cleanText(row?.value??'',2000);
    if(!namespace||!key||!value)continue;
    map.set(namespace+'.'+key,{namespace,key,value,type:cleanText(row?.type||'single_line_text_field',120)||'single_line_text_field',source:'catalogue-preset'});
  }
  return [...map.values()].slice(0,100);
}
function cleanPresets(x={}){
  return{
    vendor:cleanText(x.vendor||'',120),productType:cleanText(x.productType||'',120),
    productCategory:cleanText(x.productCategory||'',180),
    themeTemplate:cleanText(x.themeTemplate||'',80).replace(/^product\./i,''),
    collections:[...new Set(parseTags(x.collections||[]))].slice(0,40),
    metafields:cleanMetafields(x.metafields||[])
  };
}
function applyPresets(draft={},input={}){
  const p=cleanPresets(input),n={...draft};
  if(!cleanText(n.vendor||'',120)&&p.vendor)n.vendor=p.vendor;
  if(!cleanText(n.productType||'',120)&&p.productType)n.productType=p.productType;
  if(!cleanText(n.productCategory||'',180)&&p.productCategory)n.productCategory=p.productCategory;
  if(!cleanText(n.themeTemplate||'',80)&&p.themeTemplate)n.themeTemplate=p.themeTemplate;
  if((!Array.isArray(n.collections)||!n.collections.length)&&p.collections.length)n.collections=[...p.collections];
  const current=normaliseMetafields(n.metafields||[]),keys=new Set(current.filter(m=>String(m?.value??'').trim()).map(m=>m.namespace+'.'+m.key));
  n.metafields=normaliseMetafields([...current,...p.metafields.filter(m=>!keys.has(m.namespace+'.'+m.key))]);
  return normaliseDraftProduct(n);
}
async function findExisting({shopDomain,rootUrl,vendor=''}){
  const want=identity({url:rootUrl,vendor});
  const rows=await ProductImportBatch.find({shopDomain,'automation.siteImport':true,'catalogue.active':{$ne:false}}).sort({updatedAt:-1});
  return rows.find(row=>{
    const u=row.supplierUrl||row.defaults?.supplierUrl||row.catalogue?.sourceUrls?.[0]||'';
    const v=row.catalogue?.vendor||row.defaults?.vendor||row.defaults?.brand||row.supplierName||row.name||'';
    const got=identity({url:u,vendor:v});
    return want.host&&got.host?want.host===got.host:Boolean(want.vendorKey&&got.vendorKey&&want.vendorKey===got.vendorKey);
  })||null;
}
async function consolidate({shopDomain}){
  const rows=await ProductImportBatch.find({shopDomain,'automation.siteImport':true,'catalogue.active':{$ne:false}}).sort({updatedAt:-1});
  const groups=new Map();
  for(const row of rows){
    const u=row.supplierUrl||row.defaults?.supplierUrl||'',v=row.catalogue?.vendor||row.defaults?.vendor||row.defaults?.brand||row.supplierName||row.name||'';
    const k=identity({url:u,vendor:v}).key||'batch:'+row._id;
    if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);
  }
  let mergedCatalogues=0,mergedProducts=0;
  for(const [k,g] of groups){
    if(g.length<1)continue;
    g.sort((a,b)=>(b.items?.length||0)-(a.items?.length||0)||new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
    const target=g[0],vendor=cleanText(target.catalogue?.vendor||target.defaults?.vendor||target.items?.find(x=>x.draft?.vendor)?.draft?.vendor||target.supplierName||'',120);
    target.catalogue=target.catalogue||{};target.catalogue.key=k;target.catalogue.vendor=vendor;target.catalogue.active=true;target.name=title(vendor,target.name);
    const index=new Map((target.items||[]).map((x,i)=>[itemKey(x),i])),mergedFrom=new Set((target.catalogue.mergedFrom||[]).map(String));
    for(const donor of g.slice(1)){
      for(const item of donor.items||[]){
        const ik=itemKey(item),idx=index.get(ik);
        if(idx===undefined){target.items.push(item.toObject?item.toObject():item);index.set(ik,target.items.length-1);mergedProducts++;}
        else if(score(item)>score(target.items[idx])){const keep=target.items[idx].itemId,repl=item.toObject?item.toObject():{...item};repl.itemId=keep||repl.itemId;target.items[idx]=repl;}
      }
      mergedFrom.add(String(donor._id));donor.catalogue=donor.catalogue||{};donor.catalogue.active=false;donor.catalogue.mergedInto=target._id;donor.catalogue.lastMergedAt=new Date();await donor.save();mergedCatalogues++;
    }
    target.catalogue.mergedFrom=[...mergedFrom];target.catalogue.lastMergedAt=new Date();await target.save();
  }
  return{ok:true,mergedCatalogues,mergedProducts};
}
async function getSettings({shopDomain,batchId}){const batch=await ProductImportBatch.findOne({_id:batchId,shopDomain});if(!batch)throw Object.assign(Error('Product import batch not found.'),{status:404});return{catalogue:batch.catalogue||{},presets:cleanPresets(batch.catalogue?.presets||{}),recommendations:batch.catalogue?.recommendations||{}};}
async function saveSettings({shopDomain,batchId,presets={}}){
  const batch=await ProductImportBatch.findOne({_id:batchId,shopDomain});if(!batch)throw Object.assign(Error('Product import batch not found.'),{status:404});
  batch.catalogue=batch.catalogue||{};batch.catalogue.presets=cleanPresets(presets);
  if(batch.catalogue.presets.vendor){batch.catalogue.vendor=batch.catalogue.presets.vendor;batch.name=title(batch.catalogue.vendor,batch.name);}
  for(const item of batch.items||[]){if(item.status==='created')continue;item.draft=applyPresets(item.draft||{},batch.catalogue.presets);item.vendor=item.draft.vendor||item.vendor||'';item.productType=item.draft.productType||item.productType||'';item.productCategory=item.draft.productCategory||item.productCategory||'';item.templateSuffix=item.draft.themeTemplate||item.templateSuffix||'';item.metafieldPlan=normaliseMetafields(item.draft.metafields||[]);item.updatedAt=new Date();}
  await batch.save();return{batch,presets:batch.catalogue.presets};
}
function mode(vals=[]){const m=new Map();vals.filter(Boolean).forEach(v=>m.set(v,(m.get(v)||0)+1));return[...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';}
function seoPattern(rows=[],field='seoTitle'){const vals=rows.map(x=>cleanText(x?.[field]||'',220)).filter(Boolean),suffix=mode(vals.map(v=>v.match(/(?:\||-|–|—)\s*([^|–—-]{3,80})$/)?.[1]?.trim()).filter(Boolean));return suffix?'{product} | '+suffix:'{product}';}
async function aiText(vendor,examples){
  const fallback={titlePattern:'{vendor} {product}',descriptionGuidance:'Match the structure, tone and level of detail used by similar products already in the shop. Keep all product facts product-specific.',seoTitlePattern:seoPattern(examples,'seoTitle'),seoDescriptionPattern:'Write a product-specific meta description in the same tone and approximate length as existing shop examples.',generatedWith:'deterministic'};
  if(!process.env.OPENAI_API_KEY||!examples.length)return fallback;
  try{
    const model=process.env.OPENAI_PRODUCT_IMPORT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
    const prompt='Infer reusable ecommerce writing patterns from these EXISTING SHOP products for vendor '+vendor+'. Return JSON only: titlePattern, descriptionGuidance, seoTitlePattern, seoDescriptionPattern. Use placeholders like {vendor}, {product}, {flavour}, {format}, {location}. Never turn product-specific facts into reusable claims. EXAMPLES: '+JSON.stringify(examples.slice(0,12));
    const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:.15,response_format:{type:'json_object'},messages:[{role:'system',content:'Infer merchant writing conventions without inventing facts.'},{role:'user',content:prompt}]})});
    const json=await res.json();if(!res.ok)throw Error(json?.error?.message||'AI request failed');
    return{...fallback,...JSON.parse(json?.choices?.[0]?.message?.content||'{}'),generatedWith:'ai'};
  }catch(e){return{...fallback,note:e.message};}
}
async function recommendations({shopDomain,batchId}){
  const batch=await ProductImportBatch.findOne({_id:batchId,shopDomain});if(!batch)throw Object.assign(Error('Product import batch not found.'),{status:404});
  const vendor=cleanText(batch.catalogue?.presets?.vendor||batch.catalogue?.vendor||batch.defaults?.vendor||batch.items?.find(x=>x.draft?.vendor)?.draft?.vendor||'',120);
  const snap=await getSnapshot(shopDomain),vk=textKey(vendor),examples=(snap.seoExamples||[]).filter(x=>!vk||textKey(x.vendor||'')===vk).slice(0,20);
  const rep=(batch.items||[]).find(x=>x.draft?.title)?.draft||{title:(vendor||'Supplier')+' product',vendor};
  const learned=await applyMerchantCatalogueContext({shopDomain,draft:{...rep,vendor:vendor||rep.vendor||''}}).catch(()=>rep),text=await aiText(vendor,examples);
  const rec={generatedAt:new Date().toISOString(),sampleCount:examples.length,generatedWith:text.generatedWith,suggested:{vendor:vendor||learned.vendor||'',productType:learned.productType||'',productCategory:learned.productCategory||'',themeTemplate:learned.themeTemplate||'',collections:[],metafields:(learned.metafields||[]).filter(m=>/about_brand|brand/i.test(m.namespace+'.'+m.key)).slice(0,10)},text:{titlePattern:text.titlePattern,descriptionGuidance:text.descriptionGuidance,seoTitlePattern:text.seoTitlePattern,seoDescriptionPattern:text.seoDescriptionPattern},examples:examples.slice(0,8).map(x=>({title:x.title||'',productType:x.productType||'',seoTitle:x.seoTitle||'',seoDescription:x.seoDescription||''}))};
  batch.catalogue=batch.catalogue||{};batch.catalogue.recommendations=rec;await batch.save();return{recommendations:rec};
}
module.exports={identity,title,vendorFromDiscovery,applyPresets,findExisting,consolidate,getSettings,saveSettings,recommendations};
