const { cleanText, cleanUrl } = require('../utils/safe');
const { discoverSiteProducts } = require('../services/siteCatalogDiscovery.service');

function hostname(url=''){ try{return new URL(url).hostname.replace(/^www\./,'')}catch(_){return ''} }
function inferBrandName(url=''){
  const token=(hostname(url).split('.')[0]||'').replace(/[-_]+/g,' ').trim();
  return token.replace(/\b\w/g,c=>c.toUpperCase()).replace(/^X Zero$/i,'X-Zero');
}
async function fetchProductCard(url){
  try{
    const parsed=new URL(url);
    const handle=parsed.pathname.match(/\/products\/([^/?#]+)/)?.[1]||'';
    if(!handle)return null;
    const response=await fetch(`${parsed.origin}/products/${handle}.js`,{headers:{Accept:'application/json','User-Agent':'ELEV8 Brand Directory/1.0'}});
    if(!response.ok)return null;
    const p=await response.json();
    return {
      url,handle:p.handle||handle,title:cleanText(p.title||'',240),vendor:cleanText(p.vendor||'',160),
      productType:cleanText(p.type||'',160),tags:Array.isArray(p.tags)?p.tags.slice(0,40):[],
      description:cleanText(String(p.description||'').replace(/<[^>]+>/g,' '),3000),
      image:p.featured_image||p.images?.[0]||''
    };
  }catch(_){return null}
}
function deterministicProductLines(cards=[]){
  const buckets=new Map();
  for(const card of cards){
    const text=`${card?.title||''} ${card?.productType||''} ${(card?.tags||[]).join(' ')}`.toLowerCase();
    let family=cleanText(card?.productType||'',120);
    if(/hydration/.test(text))family='Hydration';
    else if(/creatine/.test(text))family='Creatine';
    else if(/shaker|cup/.test(text))family='Shakers';
    else if(/collector|bundle|starter kit|starter pack/.test(text))family='Bundles & Starter Kits';
    else if(/can\b|ready to drink|rtd/.test(text))family='Ready-to-Drink';
    else if(/sachet|packet|single serving|sample/.test(text))family='Single Servings';
    else if(/pouch/.test(text))family='Pouches';
    else if(/energy|formula|powder|tub/.test(text))family='Energy Powder';
    else if(!family)family='Other';
    if(!buckets.has(family))buckets.set(family,{name:family,productType:card?.productType||'',examples:[],sourceUrls:[]});
    const row=buckets.get(family);
    if(row.examples.length<8)row.examples.push(card.title);
    if(row.sourceUrls.length<8)row.sourceUrls.push(card.url);
  }
  return [...buckets.values()].sort((a,b)=>b.examples.length-a.examples.length);
}
async function aiBrandAndLines({brandName,website,cards,productLines}){
  if(!process.env.OPENAI_API_KEY)return {
    name:brandName,canonicalVendor:brandName,website,aboutBrand:'',shortDescription:'',
    seoTitle:`${brandName} Products UK | Gaming Nectar`.slice(0,70),
    seoDescription:`Shop ${brandName} products at Gaming Nectar with UK stock and fast dispatch.`.slice(0,160),
    productFamilies:productLines.map(x=>x.name),productTypes:[...new Set(cards.map(x=>x.productType).filter(Boolean))],
    claims:[],howToUse:'',storage:'',warnings:'',countryOfOrigin:'',confidence:.45,coreProductLines:productLines
  };
  const prompt=`Build a reusable ecommerce brand profile and core product-line directory for Gaming Nectar.
Return ONLY valid JSON with name, canonicalVendor, website, aboutBrand, shortDescription, seoTitle, seoDescription,
productFamilies, productTypes, claims, howToUse, storage, warnings, countryOfOrigin, confidence, coreProductLines.
Each coreProductLines item must include name, description, productType, defaultClaims, howToUse, warnings, exampleProducts, sourceUrls.
Separate materially different ranges such as Energy, Hydration, Creatine, Shakers and Bundles.
Use only supplied evidence. Never apply product-specific caffeine/nutrition claims to an entire brand.
BRAND:${brandName}
WEBSITE:${website}
DETERMINISTIC LINES:${JSON.stringify(productLines)}
PRODUCT EVIDENCE:${JSON.stringify(cards.slice(0,40))}`;
  const model=process.env.OPENAI_PRODUCT_IMPORT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
    model,temperature:.15,response_format:{type:'json_object'},messages:[{role:'system',content:'Create conservative evidence-grounded ecommerce metadata.'},{role:'user',content:prompt}]
  })});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload?.error?.message||`OpenAI failed (${response.status})`);
  return JSON.parse(payload?.choices?.[0]?.message?.content||'{}');
}
async function scrapeBrandUrl({sourceUrl,brandName=''}) {
  const url=cleanUrl(sourceUrl); if(!url)throw new Error('A valid brand or collection URL is required.');
  const website=new URL(url).origin;
  const name=cleanText(brandName||inferBrandName(url),120);
  const discovery=await discoverSiteProducts({rootUrl:url,maxProducts:1000});
  const cards=[];
  for(let i=0;i<discovery.urls.length;i+=12){
    const results=await Promise.all(discovery.urls.slice(i,i+12).map(fetchProductCard));
    cards.push(...results.filter(Boolean));
  }
  const productLines=deterministicProductLines(cards);
  const suggestion=await aiBrandAndLines({brandName:name,website,cards,productLines});
  return {
    sourceUrl:url,website,brandName:name,discoveredCount:discovery.count,discoveryMethod:discovery.method,
    productCards:cards,deterministicProductLines:productLines,
    suggestion:{...suggestion,name:suggestion.name||name,canonicalVendor:suggestion.canonicalVendor||name,website:suggestion.website||website,
      productFamilies:Array.isArray(suggestion.productFamilies)?suggestion.productFamilies:productLines.map(x=>x.name),
      coreProductLines:Array.isArray(suggestion.coreProductLines)?suggestion.coreProductLines:productLines,
      sourceUrls:Array.from(new Set([url,...(suggestion.sourceUrls||[])])),source:'supplier',confidence:Number(suggestion.confidence||.5)}
  };
}
module.exports={scrapeBrandUrl,deterministicProductLines,inferBrandName};
