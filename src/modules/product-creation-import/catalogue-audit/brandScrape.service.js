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
    const response=await fetch(`${parsed.origin}/products/${handle}.js`,{
      headers:{Accept:'application/json','User-Agent':'ELEV8 Brand Directory/2.0'}
    });
    if(!response.ok)return null;
    const p=await response.json();
    return {
      url,handle:p.handle||handle,title:cleanText(p.title||'',240),vendor:cleanText(p.vendor||'',160),
      productType:cleanText(p.type||'',160),tags:Array.isArray(p.tags)?p.tags.slice(0,60):[],
      description:cleanText(String(p.description||'').replace(/<[^>]+>/g,' '),5000),
      image:p.featured_image||p.images?.[0]||''
    };
  }catch(_){return null}
}
function matcherForFamily(family='', productType=''){
  const lower=String(family||'').toLowerCase();
  if(/hydration/.test(lower))return {field:'title',operator:'contains',value:'hydration'};
  if(/creatine/.test(lower))return {field:'title',operator:'contains',value:'creatine'};
  if(/shaker|cup/.test(lower))return {field:'title',operator:'contains',value:'shaker'};
  if(/bundle|starter/.test(lower))return {field:'title',operator:'contains',value:'starter'};
  if(/ready-to-drink|can/.test(lower))return {field:'productType',operator:'contains',value:'drink'};
  if(/single serving|sachet|sample/.test(lower))return {field:'title',operator:'contains',value:'sachet'};
  if(/pouch/.test(lower))return {field:'title',operator:'contains',value:'pouch'};
  if(productType)return {field:'productType',operator:'equals',value:productType};
  return {field:'title',operator:'contains',value:family};
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

    if(!buckets.has(family))buckets.set(family,{
      name:family,description:'',productType:card?.productType||'',examples:[],sourceUrls:[],tags:new Map(),defaultClaims:[],rules:[]
    });
    const row=buckets.get(family);
    if(row.examples.length<12)row.examples.push(card.title);
    if(row.sourceUrls.length<12)row.sourceUrls.push(card.url);
    for(const tag of card.tags||[]){
      const k=cleanText(tag,80);if(k)row.tags.set(k,(row.tags.get(k)||0)+1);
    }
  }
  return [...buckets.values()].map(row=>({
    name:row.name,description:row.description,productType:row.productType,
    matcher:matcherForFamily(row.name,row.productType),
    examples:row.examples,sourceUrls:row.sourceUrls,
    commonTags:[...row.tags.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([tag])=>tag),
    defaultClaims:row.defaultClaims,rules:row.rules
  })).sort((a,b)=>b.examples.length-a.examples.length);
}
async function aiBrandAndLines({brandName,website,cards,productLines}){
  if(!process.env.OPENAI_API_KEY)return {
    name:brandName,canonicalVendor:brandName,website,aboutBrand:'',shortDescription:'',
    productFamilies:productLines.map(x=>x.name),
    productTypes:[...new Set(cards.map(x=>x.productType).filter(Boolean))],
    claims:[],howToUse:'',storage:'',warnings:'',countryOfOrigin:'',confidence:.45,coreProductLines:productLines
  };
  const prompt=`Build a reusable brand profile and PRODUCT-LINE RULE DIRECTORY for Gaming Nectar.
Return ONLY valid JSON with:
name, canonicalVendor, website, aboutBrand, shortDescription, productFamilies, productTypes,
claims, howToUse, storage, warnings, countryOfOrigin, confidence, coreProductLines.

Do NOT focus on SEO. The purpose is reusable product-import logic.

Each coreProductLines item must contain:
name, description, productType, matcher, defaultClaims, howToUse, storage, warnings,
exampleProducts, sourceUrls, suggestedActions.

matcher must be {field,operator,value}, where field is title, productType, tags or description
and operator is contains, equals, starts_with or ends_with.

suggestedActions must be conservative reusable actions only, e.g.
{"type":"set_field","target":"productType","value":"Hydration Powder"}
or {"type":"set_metafield","target":"namespace.key","value":"0","metafieldType":"number_integer"}.

Rules:
- Use only evidence below.
- Separate Energy, Hydration, Creatine, Shakers, Cans, Bundles, etc.
- Never generalise caffeine/nutrition claims across the whole brand unless every relevant product supports it.
- Product-specific flavour/SKU/barcode/price must never become brand defaults.
- About Brand belongs at brand level.
- If a claim is only true for one product line, keep it in that product line.
- If uncertain, leave a field blank.

BRAND:${brandName}
WEBSITE:${website}
DETERMINISTIC LINES:${JSON.stringify(productLines)}
PRODUCT EVIDENCE:${JSON.stringify(cards.slice(0,50))}`;

  const model=process.env.OPENAI_PRODUCT_IMPORT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
  const response=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model,temperature:.1,response_format:{type:'json_object'},
      messages:[
        {role:'system',content:'Create evidence-grounded ecommerce brand and product-line rules. Never invent product facts.'},
        {role:'user',content:prompt}
      ]
    })
  });
  const payload=await response.json();
  if(!response.ok)throw new Error(payload?.error?.message||`OpenAI failed (${response.status})`);
  const parsed=JSON.parse(payload?.choices?.[0]?.message?.content||'{}');
  parsed.coreProductLines=(parsed.coreProductLines||productLines).map(line=>{
    const deterministic=productLines.find(x=>String(x.name).toLowerCase()===String(line.name||'').toLowerCase());
    return {
      ...(deterministic||{}),...line,
      matcher:line.matcher||deterministic?.matcher||matcherForFamily(line.name,line.productType),
      rules:Array.isArray(line.rules)?line.rules:[],
      suggestedActions:Array.isArray(line.suggestedActions)?line.suggestedActions:[]
    };
  });
  return parsed;
}
async function scrapeBrandUrl({sourceUrl,brandName='',onProgress=async()=>{}}){
  const url=cleanUrl(sourceUrl);if(!url)throw new Error('A valid brand or collection URL is required.');
  const website=new URL(url).origin,name=cleanText(brandName||inferBrandName(url),120);
  const discovery=await discoverSiteProducts({rootUrl:url,maxProducts:1000});
  if(!discovery.urls?.length)throw new Error('No product URLs were discovered on this supplier site.');
  await onProgress({stage:'discovered',progress:20,headline:'Supplier catalogue found',detail:`Found ${discovery.count||discovery.urls.length} product URLs.`,discoveredCount:discovery.count||discovery.urls.length,log:'Catalogue discovered',logDetail:`${discovery.urls.length} URLs found`,logStatus:'success'});

  const cards=[];
  for(let i=0;i<discovery.urls.length;i+=12){
    const chunk=discovery.urls.slice(i,i+12),results=await Promise.all(chunk.map(fetchProductCard));
    cards.push(...results.filter(Boolean));
    const processed=Math.min(i+chunk.length,discovery.urls.length);
    await onProgress({stage:'reading_products',progress:20+Math.round((processed/discovery.urls.length)*35),headline:'Reading product data',detail:`Analysed ${processed} of ${discovery.urls.length} product URLs; ${cards.length} returned product data.`,discoveredCount:discovery.urls.length,processedCount:processed,log:processed===discovery.urls.length?'Finished reading product catalogue':'Read product group',logDetail:`${cards.length} usable products`,logStatus:processed===discovery.urls.length?'success':'info'});
  }
  if(!cards.length)throw new Error('Product URLs were found, but the supplier did not expose usable product data.');

  const productLines=deterministicProductLines(cards);
  await onProgress({stage:'grouping_lines',progress:62,headline:'Grouping product lines',detail:`Identified ${productLines.length} reusable ranges.`,productLineCount:productLines.length,log:'Product lines identified',logDetail:productLines.map(x=>x.name).join(' · '),logStatus:'success'});
  await onProgress({stage:'ai_enrichment',progress:72,headline:'Assessing brand and range rules',detail:'Separating brand-wide facts from product-line conditions.',log:'Started brand intelligence',logDetail:'Assessing About Brand, line matchers and reusable rules'});
  const suggestion=await aiBrandAndLines({brandName:name,website,cards,productLines});
  await onProgress({stage:'ai_complete',progress:90,headline:'Brand and product-line intelligence ready',detail:'Reusable brand fields and range tabs are ready to save.',productLineCount:(suggestion.coreProductLines||productLines).length,log:'Brand intelligence complete',logDetail:`${Math.round(Number(suggestion.confidence||0)*100)}% confidence`,logStatus:'success'});

  return {
    sourceUrl:url,website,brandName:name,discoveredCount:cards.length,discoveryMethod:discovery.method,
    productCards:cards,deterministicProductLines:productLines,
    suggestion:{...suggestion,name:suggestion.name||name,canonicalVendor:suggestion.canonicalVendor||name,website:suggestion.website||website,
      productFamilies:Array.isArray(suggestion.productFamilies)?suggestion.productFamilies:productLines.map(x=>x.name),
      coreProductLines:Array.isArray(suggestion.coreProductLines)?suggestion.coreProductLines:productLines,
      sourceUrls:Array.from(new Set([url,...(suggestion.sourceUrls||[])])),source:'supplier',confidence:Number(suggestion.confidence||.5)}
  };
}
module.exports={scrapeBrandUrl,deterministicProductLines,inferBrandName,matcherForFamily};
