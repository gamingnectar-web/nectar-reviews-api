#!/usr/bin/env bash
set -euo pipefail

REQ=(
  "src/modules/product-creation-import/services/shopifyProduct.service.js"
  "src/modules/product-creation-import/services/productSeoAudit.service.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "public/admin.html"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run this from the repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path
import re

p=Path("src/modules/product-creation-import/services/shopifyProduct.service.js")
s=p.read_text()

old="""        id legacyResourceId title handle vendor productType tags status
        featuredMedia{preview{image{url}}}"""
new="""        id legacyResourceId title handle vendor productType tags status
        seo{title description}
        featuredMedia{preview{image{url}}}"""
if old in s:
    s=s.replace(old,new)
elif "seo{title description}" not in s[s.find("async function listShopifyProductsForMatching"):s.find("function isValidJsonString")]:
    raise SystemExit("Could not add Shopify SEO fields to catalogue query")

s=s.replace(
    "products.json?limit=250&fields=id,title,handle,image,images,variants,tags,vendor,product_type,status",
    "products.json?limit=250&fields=id,title,handle,image,images,variants,tags,vendor,product_type,status,metafields_global_title_tag,metafields_global_description_tag"
)

old_push="""      products.push(restProductToCard(product,{
        status:product.status||'',
        skus:(product.variants||[]).map(v=>cleanText(v.sku||'',120)).filter(Boolean),
        barcodes:(product.variants||[]).map(v=>cleanText(v.barcode||'',120)).filter(Boolean),
      }));"""
new_push="""      const card=restProductToCard(product,{
        status:product.status||'',
        skus:(product.variants||[]).map(v=>cleanText(v.sku||'',120)).filter(Boolean),
        barcodes:(product.variants||[]).map(v=>cleanText(v.barcode||'',120)).filter(Boolean),
      });
      products.push({
        ...card,
        seoTitle:product.metafields_global_title_tag||'',
        seoDescription:product.metafields_global_description_tag||'',
      });"""
if old_push in s:
    s=s.replace(old_push,new_push)

p.write_text(s)

p=Path("src/modules/product-creation-import/services/productSeoAudit.service.js")
s=p.read_text()
start=s.find("function scoreProduct(product={}, duplicates={}){")
end=s.find("\nasync function auditShopifySeo",start)
if start==-1 or end==-1:
    raise SystemExit("Could not locate scoreProduct()")

replacement="""function scoreProduct(product={}, duplicates={}){
  const title=cleanText(product.title||'',220);
  const seoTitle=cleanText(product.seoTitle||'',220);
  const meta=cleanText(product.seoDescription||'',500);
  const handle=cleanText(product.handle||'',180);
  const vendor=cleanText(product.vendor||'',120);
  const issues=[];
  const checks=[];
  const titleNorm=norm(title);
  const seoNorm=norm(seoTitle);
  const firstUsefulTokens=titleNorm.split(' ').filter(Boolean).slice(0,2);
  const titleRelevant=Boolean(seoTitle)&&firstUsefulTokens.every(token=>seoNorm.includes(token));

  const add=(name,max,ok,note='')=>{
    checks.push({name,points:ok?max:0,max,ok,note});
    if(!ok&&note)issues.push(note);
  };

  add('Product title',10,titleLooksUseful(title),
    'Product title is missing, unusually short or unusually long.');
  add('SEO title present',10,Boolean(seoTitle),
    'SEO title is missing.');
  add('SEO title display length',15,seoTitle.length>=25&&seoTitle.length<=70,
    'SEO title is outside the preferred working range of roughly 25–70 characters.');
  add('SEO title relevance',10,titleRelevant,
    'SEO title does not clearly represent the product title.');
  add('Meta description present',10,Boolean(meta),
    'Meta description is missing.');
  add('Meta description display length',15,meta.length>=80&&meta.length<=160,
    'Meta description is outside the preferred working range of roughly 80–160 characters.');
  add('Meta description specificity',10,
    Boolean(meta)&&words(meta).length>=12&&
    (titleNorm.split(' ').some(token=>token.length>3&&norm(meta).includes(token)) || (!vendor||norm(meta).includes(norm(vendor)))),
    'Meta description looks too generic or too thin for this product.');
  add('URL handle format',10,slugOkay(handle),
    'URL handle is missing, too long or untidy.');
  add('URL relevance',5,
    Boolean(handle)&&norm(handle).split(' ').some(token=>token.length>2&&titleNorm.includes(token)),
    'URL handle does not appear closely related to the product title.');
  add('Unique SEO title',2,!seoTitle||!duplicates.seoTitle,
    'SEO title duplicates another product.');
  add('Unique meta description',2,!meta||!duplicates.meta,
    'Meta description duplicates another product.');
  add('Unique URL',1,!handle||!duplicates.handle,
    'URL handle duplicates another product.');

  const score=Math.min(100,checks.reduce((sum,c)=>sum+c.points,0));
  return {score,checks,issues};
}"""
s=s[:start]+replacement+s[end:]
p.write_text(s)

p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

if "function duplicateBaseTitle(" not in s:
    marker="function duplicateTokens(value=''){"
    helper="""function duplicateBaseTitle(value=''){
  return strictDuplicateNorm(value)
    .replace(/\\b(shaker cup|shaker|energy drink powder|energy powder|powder tub|tub|collector s box|collector box|bundle|can pack|case|cans|can)\\b/g,' ')
    .replace(/\\s+/g,' ')
    .trim();
}

function duplicateVersionTokens(value=''){
  return Array.from(String(value||'').matchAll(/\\b(?:v(?:ersion)?\\s*)?(\\d+(?:\\.\\d+)?)\\b/ig))
    .map(match=>match[1])
    .filter(token=>Number(token)>0);
}

function duplicateVersionConflict(a='',b=''){
  const aa=duplicateVersionTokens(a);
  const bb=duplicateVersionTokens(b);
  if(!aa.length&&!bb.length)return false;
  if(!aa.length||!bb.length)return true;
  return aa.join('|')!==bb.join('|');
}

function compatibleProductType(a='',b=''){
  const aa=duplicateNorm(a||'');
  const bb=duplicateNorm(b||'');
  if(!aa||!bb)return true;
  if(aa===bb)return true;
  const groups=[
    ['shaker','shaker cup','cup'],
    ['energy drink powder','energy powder','powder','tub'],
    ['collector box','collectors box','bundle'],
    ['hydration','hydration tub'],
  ];
  return groups.some(group=>group.some(x=>aa.includes(x))&&group.some(x=>bb.includes(x)));
}

"""
    s=s.replace(marker,helper+marker)

start=s.find("async function detectExistingProduct({ shopDomain, draft }) {")
end=s.find("\nfunction matchDraftAgainstCatalogue",start)
if start==-1 or end==-1:
    raise SystemExit("Could not locate detectExistingProduct()")

detect="""async function detectExistingProduct({ shopDomain, draft }) {
  const title=cleanText(draft.title||'',180);
  const sku=cleanText(draft.sku||'',120);
  const barcode=cleanText(draft.barcode||'',120);
  const handle=cleanText(draft.handle||'',180);
  let sourceHandle='';
  try{
    sourceHandle=new URL(draft.sourceUrl||'').pathname.split('/products/')[1]?.split('/')[0]||'';
  }catch(_){}

  const simplerTitle=cleanText(title
    .replace(/\\b(new|improved|energy|formula|powder|tub|drink|40 servings?)\\b/ig,' ')
    .replace(/\\s+/g,' '),180);

  const queries=Array.from(new Set([barcode,sku,handle,sourceHandle,title,simplerTitle].filter(Boolean)));
  const byKey=new Map();

  for(const q of queries.slice(0,6)){
    const rows=await searchShopifyProducts({shopDomain,q,first:12}).catch(()=>[]);
    for(const row of rows){
      const key=row.id||row.legacyResourceId||row.handle||row.title;
      if(key&&!byKey.has(key))byKey.set(key,row);
    }
  }

  return matchDraftAgainstCatalogue(draft,[...byKey.values()]);
}
"""
s=s[:start]+detect+s[end:]

start=s.find("function matchDraftAgainstCatalogue(draft={},catalogue=[]){")
end=s.find("\nasync function reconcileBatchShopifyMatches",start)
if start==-1 or end==-1:
    raise SystemExit("Could not locate matchDraftAgainstCatalogue()")

matcher="""function matchDraftAgainstCatalogue(draft={},catalogue=[]){
  const title=cleanText(draft.title||'',180);
  const sku=cleanText(draft.sku||'',120).toLowerCase();
  const barcode=cleanText(draft.barcode||'',120).toLowerCase();
  const handle=cleanText(draft.handle||'',180);
  const vendor=duplicateNorm(draft.vendor||'');
  const wantedImages=draftImageFingerprints(draft);
  const draftType=cleanText(draft.productType||'',120);
  let best=null;

  for(const product of catalogue||[]){
    const signals=[];
    let score=0;

    const skus=[product.sku,...(product.skus||[])].filter(Boolean).map(x=>String(x).toLowerCase());
    const barcodes=[product.barcode,...(product.barcodes||[])].filter(Boolean).map(x=>String(x).toLowerCase());

    const skuHit=Boolean(sku&&skus.includes(sku));
    const barcodeHit=Boolean(barcode&&barcodes.includes(barcode));
    const handleHit=Boolean(handle&&product.handle&&duplicateNorm(handle)===duplicateNorm(product.handle));
    const vendorHit=!vendor||!product.vendor||vendor===duplicateNorm(product.vendor||'');
    const strictTitleMatch=Boolean(strictDuplicateNorm(title)&&strictDuplicateNorm(title)===strictDuplicateNorm(product.title||''));
    const baseTitleMatch=Boolean(duplicateBaseTitle(title)&&duplicateBaseTitle(title)===duplicateBaseTitle(product.title||''));
    const titleScore=tokenSimilarity(title,product.title||'');
    const imageHit=candidateImageHit(product,wantedImages);
    const versionConflict=duplicateVersionConflict(title,product.title||'');
    const typeHit=compatibleProductType(draftType,product.productType||'');

    if(barcodeHit){score=1;signals.push('barcode');}
    if(skuHit){score=Math.max(score,.995);signals.push('sku');}
    if(handleHit){score=Math.max(score,.985);signals.push('handle');}

    if(strictTitleMatch&&vendorHit){
      score=Math.max(score,.99);signals.push('strict-title','vendor');
    }else if(baseTitleMatch&&vendorHit){
      score=Math.max(score,.965);signals.push('base-title','vendor');
    }else if(titleScore>=.90&&vendorHit){
      score=Math.max(score,.94);signals.push('near-title','vendor');
    }

    if(imageHit&&vendorHit&&titleScore>=.40){
      score=Math.max(score,.975);signals.push('image','vendor');
    }
    if(typeHit&&vendorHit&&(baseTitleMatch||titleScore>=.75)){
      score=Math.max(score,.955);signals.push('product-type');
    }

    const hardIdentifier=barcodeHit||skuHit||handleHit;
    const corroboratedSameProduct=
      !versionConflict &&
      vendorHit &&
      (
        strictTitleMatch ||
        (baseTitleMatch&&(imageHit||typeHit)) ||
        (imageHit&&typeHit&&titleScore>=.65)
      );

    const confirmed=Boolean(hardIdentifier||corroboratedSameProduct);

    if(!best||score>best.score){
      best={
        product,
        score,
        confirmed,
        signals:[...new Set(signals)],
        versionConflict,
      };
    }
  }

  if(!best||best.score<.90)return null;

  return {
    exact:best.confirmed,
    confirmed:best.confirmed,
    matchLevel:best.confirmed?'confirmed':'possible',
    confidence:Number(best.score.toFixed(3)),
    id:best.product.id,
    legacyResourceId:best.product.legacyResourceId||'',
    title:best.product.title,
    handle:best.product.handle,
    vendor:best.product.vendor||'',
    sku:best.product.sku||'',
    barcode:best.product.barcode||'',
    image:best.product.image||'',
    signals:best.signals,
    versionConflict:best.versionConflict,
    reason:`Shopify ${best.confirmed?'confirmed':'possible'} match (${Math.round(best.score*100)}%): ${best.signals.join(' + ')}${best.versionConflict?' · version differs':''}.`
  };
}
"""
s=s[:start]+matcher+s[end:]
p.write_text(s)

p=Path("public/admin.html")
s=p.read_text()
s=re.sub(r'/product-seo-audit\\.js\\?v=[^"\']+', '/product-seo-audit.js?v=seo-health-2', s)
s=re.sub(r'/supplier-sites-admin\\.js\\?v=[^"\']+', '/supplier-sites-admin.js?v=supplier-sites-13', s)
p.write_text(s)

print("Fixed Shopify SEO retrieval/scoring and existing-product confirmation logic.")
PY

node --check src/modules/product-creation-import/services/shopifyProduct.service.js
node --check src/modules/product-creation-import/services/productSeoAudit.service.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js

npm run deploy:preflight

echo
echo "SEO + green-dot repair passed."
echo
echo "Commit:"
echo "  git add src/modules/product-creation-import/services/shopifyProduct.service.js src/modules/product-creation-import/services/productSeoAudit.service.js src/modules/product-creation-import/services/productImportBatch.service.js public/admin.html"
echo '  git commit -m "Fix Shopify SEO audit data and confirmed product matching"'
echo "  git push origin clean-main"
