const { cleanText, normaliseMetafields, parseTags } = require('../utils/safe');
const { normaliseDraftProduct } = require('./normaliseProduct.service');
const { getProductImportSettings, applySettingsToDraft } = require('./productImportSettings.service');
const { applyBrandDirectoryProfile } = require('./brandDirectoryProfile.service');
const {
  listRecentlyUsedProductVendors,
  listRecentlyUsedProductTypes,
  listRecentlyUsedThemeTemplates,
  listShopifyCollections,
  listProductSeoExamples,
  getProductMetafieldDefinitions,
  getProfileValuesFromExistingProducts,
} = require('./shopifyProduct.service');

const snapshotCache = new Map();
const profileCache = new Map();
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const PROFILE_TTL_MS = 15 * 60 * 1000;

function keyText(value=''){ return cleanText(value,220).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim(); }
function compact(value=''){ return keyText(value).replace(/\s+/g,''); }
function exactExisting(raw='', rows=[], field='value'){
  const value=cleanText(raw,180); if(!value)return '';
  const key=keyText(value), comp=compact(value);
  const hit=(rows||[]).find(row=>{
    const candidate=cleanText(typeof row==='string'?row:(row?.[field]||row?.title||row?.handle||''),180);
    return keyText(candidate)===key || compact(candidate)===comp;
  });
  return hit ? cleanText(typeof hit==='string'?hit:(hit?.[field]||hit?.title||hit?.handle||''),180) : value;
}
function titleTokens(value=''){
  return new Set(keyText(value).split(/\s+/).filter(w=>w.length>2).filter(w=>!['the','and','for','with','from','product','drink','energy','powder','tub','box','uk','stock'].includes(w)));
}
function overlapScore(a='',b=''){ const aa=titleTokens(a),bb=titleTokens(b); let n=0; aa.forEach(x=>{if(bb.has(x))n++}); return n; }
function productFamilyText(draft={}){
  return [draft.title,draft.productType,draft.productCategory,draft.handleFormat,parseTags(draft.tags).join(' '),parseTags(draft.recommendedTags).join(' '),draft.descriptionHtml].filter(Boolean).join(' ').toLowerCase();
}
function chooseSimilarExamples(draft={},examples=[]){
  const vendor=keyText(draft.vendor||''), type=keyText(draft.productType||''), family=productFamilyText(draft);
  return (examples||[]).map(product=>{
    let score=0;
    if(vendor&&keyText(product.vendor||'')===vendor)score+=50;
    if(type&&keyText(product.productType||'')===type)score+=25;
    score+=Math.min(24,overlapScore(draft.title||'',product.title||'')*8);
    const hay=`${product.title||''} ${product.productType||''}`.toLowerCase();
    if(/hydration/.test(family)&&/hydration/.test(hay))score+=15;
    if(/collector/.test(family)&&/collector/.test(hay))score+=15;
    if(/shaker|cup/.test(family)&&/shaker|cup/.test(hay))score+=15;
    if(/powder|serving|formula/.test(family)&&/powder|serving|formula/.test(hay))score+=10;
    return {product,score};
  }).filter(x=>x.score>=35).sort((a,b)=>b.score-a.score).slice(0,8);
}
function mode(values=[]){
  const counts=new Map(); values.filter(Boolean).forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
}
function mergeMetafields(existing=[],incoming=[]){
  const map=new Map();
  [...existing,...incoming].filter(Boolean).forEach(mf=>{
    if(!mf.namespace||!mf.key||mf.value===undefined||mf.value===null||mf.value==='')return;
    const k=`${mf.namespace}.${mf.key}`,cur=map.get(k);
    if(!cur||(!cur.value&&mf.value)||Number(mf.confidence||0)>Number(cur.confidence||0))map.set(k,mf);
  });
  return normaliseMetafields([...map.values()]);
}
async function getSnapshot(shopDomain){
  const cached=snapshotCache.get(shopDomain);
  if(cached&&Date.now()-cached.at<SNAPSHOT_TTL_MS)return cached.value;
  const [vendors,productTypes,templates,collections,seoExamples,metafieldDefinitions,settings]=await Promise.all([
    listRecentlyUsedProductVendors({shopDomain,limit:250}).catch(()=>[]),
    listRecentlyUsedProductTypes({shopDomain,limit:250}).catch(()=>[]),
    listRecentlyUsedThemeTemplates({shopDomain,limit:250}).catch(()=>[]),
    listShopifyCollections({shopDomain,limit:250}).catch(()=>[]),
    listProductSeoExamples({shopDomain,limit:120}).catch(()=>[]),
    getProductMetafieldDefinitions({shopDomain}).catch(()=>[]),
    getProductImportSettings({shopDomain}).catch(()=>({})),
  ]);
  const value={vendors,productTypes,templates,collections,seoExamples,metafieldDefinitions,settings};
  snapshotCache.set(shopDomain,{at:Date.now(),value}); return value;
}
async function similarMetafields({shopDomain,draft}){
  const vendor=cleanText(draft.vendor||'',120),type=cleanText(draft.productType||'',120);
  if(!vendor&&!type)return {matchedProductCount:0,metafields:[]};
  const cacheKey=`${shopDomain}|${keyText(vendor)}|${keyText(type)}|${[...titleTokens(draft.title||'')].slice(0,4).join('-')}`;
  const cached=profileCache.get(cacheKey);
  if(cached&&Date.now()-cached.at<PROFILE_TTL_MS)return cached.value;
  const value=await getProfileValuesFromExistingProducts({shopDomain,tags:[],vendor,productType:type,title:draft.title||''}).catch(()=>({matchedProductCount:0,metafields:[]}));
  profileCache.set(cacheKey,{at:Date.now(),value}); return value;
}
function allowedProfileMetafield(mf={},draft={}){
  const compound=`${mf.namespace}.${mf.key}`.toLowerCase();
  if(/barcode|gtin|sku|price|cost|inventory|quantity|mpn/.test(compound))return false;
  const family=productFamilyText(draft);
  const drink=/drink|powder|hydration|formula|servings?|caffeine|flavour|flavor/.test(family);
  if(!drink&&['core.product_flavour','core.flavour_family','core.flavour_profile','core.formula_version','core.grouped_profiles','core.sourness','core.sweetness','nutrition.servings','nutrition.serving_size','nutrition.calories_per_serving','nutrition.caffeine_mg_per_serving','nutrition.sugar_g_per_serving','nutrition.carbs_g_per_serving','nutrition.sodium_mg_per_serving','nutrition.dietary_labels','nutrition.warning_labels','custom.ingredients_label'].includes(compound))return false;
  if(compound==='core.about_brand')return true;
  return /^(core|custom|nutrition)\./.test(compound);
}
function collectionSuggestions(draft={},collections=[]){
  const hay=[draft.vendor,draft.productType,draft.productCategory,draft.title].filter(Boolean).join(' ').toLowerCase();
  const suggestions=[];
  for(const c of collections||[]){
    const title=cleanText(c.title||'',120),handle=cleanText(c.handle||'',120);
    const words=keyText(title).split(/\s+/).filter(w=>w.length>3);
    if(words.some(w=>hay.includes(w)))suggestions.push(handle||title);
  }
  return [...new Set([...(draft.collections||[]),...suggestions])].slice(0,20);
}
async function applyMerchantCatalogueContext({shopDomain,draft={}}){
  let next=normaliseDraftProduct(draft||{});
  if(!shopDomain||!next.title)return next;
  const snapshot=await getSnapshot(shopDomain);
  if(next.vendor)next.vendor=exactExisting(next.vendor,snapshot.vendors,'vendor');
  if(next.productType)next.productType=exactExisting(next.productType,snapshot.productTypes,'productType');
  next=await applyBrandDirectoryProfile({shopDomain,draft:next}).catch(()=>next);
  const similar=chooseSimilarExamples(next,snapshot.seoExamples), examples=similar.map(x=>x.product);
  if(!next.productType&&examples.length)next.productType=mode(examples.map(x=>cleanText(x.productType||'',120)));
  if(!next.themeTemplate){
    const likely=mode((snapshot.templates||[]).filter(x=>x.template&&x.template!=='default').slice(0,5).map(x=>x.template));
    if(likely&&examples.length)next.themeTemplate=likely;
  }
  next.collections=collectionSuggestions(next,snapshot.collections);
  const profile=await similarMetafields({shopDomain,draft:next});
  const reusable=(profile.metafields||[]).filter(mf=>allowedProfileMetafield(mf,next)).map(mf=>({...mf,source:'shopify-catalogue-pattern',confidence:Math.min(Number(mf.confidence||0),0.92)}));
  next.metafields=mergeMetafields(next.metafields||[],reusable);
  next=applySettingsToDraft(next,snapshot.settings||{});
  next.enrichment={...(next.enrichment||{}),merchantCatalogue:{source:'existing-shopify-products',similarProductCount:examples.length,similarProducts:examples.slice(0,5).map(x=>({title:x.title||'',handle:x.handle||'',vendor:x.vendor||'',productType:x.productType||''})),matchedProfileProducts:Number(profile.matchedProductCount||0),appliedWithoutAi:true,checkedAt:new Date().toISOString()}};
  return normaliseDraftProduct(next);
}
module.exports={applyMerchantCatalogueContext,getSnapshot};
