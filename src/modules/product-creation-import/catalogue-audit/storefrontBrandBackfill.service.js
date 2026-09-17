const { env } = require('../../../config/env');
const { shopifyFetchOptional } = require('../../../utils/shopify');
const { ProductBrandProfile } = require('./catalogueAudit.model');
const { saveBrand } = require('./catalogueAudit.service');
const { deterministicProductLines } = require('./brandScrape.service');

const clean=value=>String(value||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const brandKey=value=>clean(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

async function fetchPublicProducts(rootUrl='https://www.gamingnectar.com',max=5000){
  const origin=new URL(rootUrl).origin,products=[];
  for(let page=1;page<=20&&products.length<max;page++){
    const response=await fetch(`${origin}/products.json?limit=250&page=${page}`,{headers:{Accept:'application/json','User-Agent':'ELEV8 Brand Backfill/2.0'}});
    if(!response.ok)throw new Error(`Public storefront returned ${response.status}`);
    const payload=await response.json(),rows=Array.isArray(payload.products)?payload.products:[];
    if(!rows.length)break;products.push(...rows);if(rows.length<250)break;
  }
  return products.slice(0,max);
}
async function fetchAdminProducts(shopDomain,max=5000){
  const products=[];let sinceId='';
  for(let page=0;page<20&&products.length<max;page++){
    const qs=new URLSearchParams({limit:'250',fields:'id,title,handle,vendor,product_type,tags,body_html,image'});
    if(sinceId)qs.set('since_id',sinceId);
    const payload=await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?${qs.toString()}`,{shopDomain});
    const rows=payload?.products||[];if(!rows.length)break;
    products.push(...rows);sinceId=String(rows[rows.length-1]?.id||'');if(rows.length<250)break;
  }
  return products.slice(0,max);
}
function cardsForVendor(products,vendor){
  return products.filter(p=>clean(p.vendor).toLowerCase()===clean(vendor).toLowerCase()).map(p=>({
    title:clean(p.title),vendor:clean(p.vendor),productType:clean(p.product_type||p.type),
    tags:Array.isArray(p.tags)?p.tags:String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
    description:clean(p.body_html||p.description||''),url:`https://www.gamingnectar.com/products/${p.handle}`,handle:p.handle||''
  }));
}
async function aiProfile({vendor,cards,productLines}){
  if(!process.env.OPENAI_API_KEY)return {aboutBrand:'',shortDescription:'',confidence:.4,productFamilies:productLines.map(x=>x.name),coreProductLines:productLines};
  const prompt=`Create a reusable brand profile and product-line directory from existing Gaming Nectar products.
Return JSON only: aboutBrand, shortDescription, claims, productFamilies, productTypes, coreProductLines, confidence.
For each coreProductLines entry include name, description, productType, matcher, defaultClaims, exampleProducts, sourceUrls, suggestedActions.
Focus on BRAND facts and PRODUCT-LINE formats. Do not generate SEO copy. Never turn product-specific flavour/nutrition into a brand-wide default.
VENDOR:${vendor}
LINES:${JSON.stringify(productLines)}
PRODUCTS:${JSON.stringify(cards.slice(0,60))}`;
  const model=process.env.OPENAI_PRODUCT_IMPORT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:.1,response_format:{type:'json_object'},messages:[{role:'system',content:'Create conservative reusable ecommerce brand rules from evidence only.'},{role:'user',content:prompt}]})});
  const json=await response.json();if(!response.ok)throw new Error(json?.error?.message||`OpenAI failed (${response.status})`);
  return JSON.parse(json?.choices?.[0]?.message?.content||'{}');
}
async function generateBrandsFromStorefront({shopDomain,rootUrl='https://www.gamingnectar.com',onlyMissing=true}){
  let products=[],source='public-storefront',sourceError='';
  try{products=await fetchPublicProducts(rootUrl)}catch(error){sourceError=error.message}
  if(!products.length){
    products=await fetchAdminProducts(shopDomain);
    source='shopify-admin';
  }
  if(!products.length)throw new Error(sourceError||'No products could be read from Gaming Nectar or Shopify.');

  const vendors=[...new Set(products.map(p=>clean(p.vendor)).filter(Boolean))].sort();
  const existing=await ProductBrandProfile.find({shopDomain}).lean();
  const byKey=new Map(existing.map(x=>[x.brandKey,x]));
  const results=[],errors=[];

  for(const vendor of vendors){
    try{
      const key=brandKey(vendor),current=byKey.get(key),cards=cardsForVendor(products,vendor);
      if(!cards.length)continue;
      const lines=deterministicProductLines(cards);
      if(onlyMissing&&current?.aboutBrand&&(current.coreProductLines||[]).length)continue;
      const ai=await aiProfile({vendor,cards,productLines:lines}).catch(()=>({aboutBrand:'',shortDescription:'',confidence:.35,productFamilies:lines.map(x=>x.name),coreProductLines:lines}));
      const profile=await saveBrand({shopDomain,profile:{
        ...ai,
        name:current?.name||vendor,canonicalVendor:current?.canonicalVendor||vendor,website:current?.website||'',
        aboutBrand:current?.aboutBrand||ai.aboutBrand||'',shortDescription:current?.shortDescription||ai.shortDescription||'',
        productFamilies:(current?.productFamilies||[]).length?current.productFamilies:(ai.productFamilies||lines.map(x=>x.name)),
        coreProductLines:(current?.coreProductLines||[]).length?current.coreProductLines:(ai.coreProductLines||lines),
        productTypes:[...new Set(cards.map(x=>x.productType).filter(Boolean))],
        source:current?'mixed':'shopify',sourceUrls:Array.from(new Set([...(current?.sourceUrls||[]),...cards.slice(0,25).map(x=>x.url)])),
        confidence:Math.max(Number(current?.confidence||0),Number(ai.confidence||.35)),status:current?.status||'draft',
        alwaysApply:current?.alwaysApply||[],conditionalRules:current?.conditionalRules||[],
        lastAuditedAt:new Date(),evidence:{...(current?.evidence||{}),source,productCount:cards.length,sampleProducts:cards.slice(0,25).map(x=>({title:x.title,url:x.url,productType:x.productType}))}
      }});
      results.push(profile);
    }catch(error){errors.push({vendor,error:error.message})}
  }
  return {brands:results,created:results.filter(x=>!byKey.has(x.brandKey)).length,updated:results.filter(x=>byKey.has(x.brandKey)).length,vendorCount:vendors.length,productCount:products.length,source,errors};
}
module.exports={generateBrandsFromStorefront,fetchStorefrontProducts:fetchPublicProducts,fetchAdminProducts};
