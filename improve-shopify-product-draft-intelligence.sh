#!/usr/bin/env bash
set -euo pipefail

FILES=(
  "src/modules/product-creation-import/services/merchantCatalogueContext.service.js"
  "src/modules/product-creation-import/services/productEnrichment.service.js"
  "src/modules/product-creation-import/services/nutritionProfileExtractor.service.js"
)
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path

# ============================================================
# 1. Merchant catalogue context:
#    - generic supplier types are not authoritative
#    - retain actual Shopify SEO examples for pattern learning
# ============================================================
p=Path("src/modules/product-creation-import/services/merchantCatalogueContext.service.js")
s=p.read_text()

if "function isGenericProductType(" not in s:
    anchor="function mode(values=[]){"
    helper="""function isGenericProductType(value=''){
  const key=keyText(value);
  return !key || [
    'product','tub','powder','drink','energy drink','hydration',
    'merch','merchandise','accessory','accessories','bundle'
  ].includes(key);
}

function sameVendorRows(draft={},examples=[]){
  const vendor=keyText(draft.vendor||'');
  return (examples||[]).filter(row => vendor && keyText(row.vendor||'')===vendor);
}

"""
    if anchor not in s:
        raise SystemExit("Could not find mode() anchor")
    s=s.replace(anchor,helper+anchor)

old="""  if(next.vendor)next.vendor=exactExisting(next.vendor,snapshot.vendors,'vendor');
  if(next.productType)next.productType=exactExisting(next.productType,snapshot.productTypes,'productType');
  next=await applyBrandDirectoryProfile({shopDomain,draft:next}).catch(()=>next);
  const similar=chooseSimilarExamples(next,snapshot.seoExamples), examples=similar.map(x=>x.product);
  if(!next.productType&&examples.length)next.productType=mode(examples.map(x=>cleanText(x.productType||'',120)));"""

new="""  if(next.vendor)next.vendor=exactExisting(next.vendor,snapshot.vendors,'vendor');
  if(next.productType)next.productType=exactExisting(next.productType,snapshot.productTypes,'productType');
  next=await applyBrandDirectoryProfile({shopDomain,draft:next}).catch(()=>next);

  const similar=chooseSimilarExamples(next,snapshot.seoExamples);
  const examples=similar.map(x=>x.product);
  const vendorExamples=sameVendorRows(next,snapshot.seoExamples);

  // Supplier values such as "Tub" are descriptive but too generic to use as the
  // merchant-facing Shopify product type. Prefer the modal type from genuinely
  // similar existing products from the same vendor.
  if(isGenericProductType(next.productType)){
    const familyExamples=examples.filter(x=>cleanText(x.productType||'',120));
    const vendorTyped=vendorExamples.filter(x=>cleanText(x.productType||'',120));
    const learnedType=mode((familyExamples.length?familyExamples:vendorTyped).map(x=>cleanText(x.productType||'',120)));
    if(learnedType)next.productType=learnedType;
  }"""

if old in s:
    s=s.replace(old,new)
elif "const vendorExamples=sameVendorRows" not in s:
    raise SystemExit("Could not patch catalogue product-type learning")

old_meta="""  next.enrichment={...(next.enrichment||{}),merchantCatalogue:{source:'existing-shopify-products',similarProductCount:examples.length,similarProducts:examples.slice(0,5).map(x=>({title:x.title||'',handle:x.handle||'',vendor:x.vendor||'',productType:x.productType||''})),matchedProfileProducts:Number(profile.matchedProductCount||0),appliedWithoutAi:true,checkedAt:new Date().toISOString()}};"""

new_meta="""  next.enrichment={...(next.enrichment||{}),merchantCatalogue:{
    source:'existing-shopify-products',
    similarProductCount:examples.length,
    similarProducts:examples.slice(0,8).map(x=>({
      title:x.title||'',
      handle:x.handle||'',
      vendor:x.vendor||'',
      productType:x.productType||'',
      seoTitle:x.seoTitle||'',
      seoDescription:x.seoDescription||''
    })),
    matchedProfileProducts:Number(profile.matchedProductCount||0),
    learnedProductType:next.productType||'',
    appliedWithoutAi:true,
    checkedAt:new Date().toISOString()
  }};"""

if old_meta in s:
    s=s.replace(old_meta,new_meta)

p.write_text(s)

# ============================================================
# 2. Product enrichment:
#    Learn SEO title shape from the closest Shopify examples.
#    Improve deterministic description.
# ============================================================
p=Path("src/modules/product-creation-import/services/productEnrichment.service.js")
s=p.read_text()

if "function merchantSeoTitleFromExamples(" not in s:
    anchor="function makeMerchantSeo({ draft = {}, settings = {} }) {"
    helper=r"""function merchantSeoTitleFromExamples(draft={},fallback=''){
  const rows=draft.enrichment?.merchantCatalogue?.similarProducts||[];
  const productName=cleanText(draft.title||'',180);
  const vendor=cleanText(draft.vendor||'',100);

  for(const row of rows){
    const exampleTitle=cleanText(row.title||'',180);
    const seoTitle=cleanText(row.seoTitle||'',180);
    if(!exampleTitle||!seoTitle)continue;

    const lowerSeo=seoTitle.toLowerCase();
    const lowerExample=exampleTitle.toLowerCase();
    const at=lowerSeo.indexOf(lowerExample);

    // Safest pattern transfer: only replace the known existing product title
    // inside its own SEO title. Prefixes/suffixes/separators remain exactly as
    // the merchant already uses them.
    if(at>=0){
      const learned=seoTitle.slice(0,at)+productName+seoTitle.slice(at+exampleTitle.length);
      if(learned.trim())return cleanText(learned,120);
    }

    // If the catalogue consistently prefixes vendor, retain that convention.
    if(vendor && lowerSeo.startsWith(vendor.toLowerCase())){
      return fallback;
    }
  }
  return fallback;
}

function readableFlavour(draft={}){
  return cleanText(
    (draft.metafields||[]).find(mf=>mf.namespace==='core'&&mf.key==='product_flavour')?.value||'',
    90
  );
}

function readableFormula(draft={}){
  return cleanText(
    (draft.metafields||[]).find(mf=>mf.namespace==='core'&&mf.key==='formula_version')?.value||'',
    50
  );
}

"""
    if anchor not in s:
        raise SystemExit("Could not find makeMerchantSeo anchor")
    s=s.replace(anchor,helper+anchor)

old="""  const seoTitle = cleanText([vendor, safeProductName, format, seoLocation].filter(Boolean).join(' - '), 120);
  const handle = slugifyLoose([vendor, safeProductName, format, handleLocation].filter(Boolean).join('-'));
  const flavour = cleanText((draft.metafields || []).find((mf) => mf.namespace === 'core' && mf.key === 'product_flavour')?.value || '', 80);
  const flavourProfile = cleanText((draft.metafields || []).find((mf) => mf.namespace === 'core' && mf.key === 'flavour_profile')?.value || '', 120);
  const lead = [vendor, safeProductName, format].filter(Boolean).join(' ');
  const flavourSentence = flavour && !new RegExp(`\\\\b${flavour.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\\\b`, 'i').test(lead)
    ? `Flavour: ${flavour}.`
    : (flavourProfile ? flavourProfile.replace(/[.!?]?$/, '.') : '');
  const description = cleanText([
    `Buy ${lead} from Gaming Nectar with ${seoLocation}.`,
    flavourSentence,
    'Fast UK dispatch available.'
  ].filter(Boolean).join(' '), 155).replace(/[,:;\\s]+$/, '.');
  return { title: seoTitle || draft.seo?.title || draft.title, description, handle };"""

# Exact escaping differs across repo versions; use smaller replacements.
s=s.replace(
"""  const seoTitle = cleanText([vendor, safeProductName, format, seoLocation].filter(Boolean).join(' - '), 120);""",
"""  const fallbackSeoTitle = cleanText([vendor, safeProductName, format, seoLocation].filter(Boolean).join(' - '), 120);
  const seoTitle = merchantSeoTitleFromExamples(draft, fallbackSeoTitle);"""
)

# Replace generated description block robustly if current text exists.
old_desc="""  const description = cleanText([
    `Buy ${lead} from Gaming Nectar with ${seoLocation}.`,
    flavourSentence,
    'Fast UK dispatch available.'
  ].filter(Boolean).join(' '), 155).replace(/[,:;\\s]+$/, '.');"""

new_desc="""  const formula = readableFormula(draft);
  const flavourText = readableFlavour(draft) || flavour;
  const descriptor = [
    flavourText ? `${flavourText} flavour` : '',
    formula ? `${formula} formula` : ''
  ].filter(Boolean).join(', ');
  const description = cleanText([
    `Shop ${lead} at Gaming Nectar.`,
    descriptor ? `${descriptor}.` : flavourSentence,
    `Fast UK dispatch${seoLocation && seoLocation !== 'UK Stock' ? ` with ${seoLocation}` : ''}.`
  ].filter(Boolean).join(' '), 155).replace(/[,:;\\s]+$/, '.');"""

if old_desc in s:
    s=s.replace(old_desc,new_desc)

# AI call should receive shopDomain when explicitly used so it can also see
# catalogue context; this does NOT turn AI on.
s=s.replace(
"await aiSuggestProductProfile({ draft: normalised, metadata })",
"await aiSuggestProductProfile({ draft: normalised, metadata, shopDomain })"
)

p.write_text(s)

# ============================================================
# 3. Flavour inference:
#    "Butters Strawberry Candy" -> "Strawberry Candy"
#    instead of blank/full collab title.
# ============================================================
p=Path("src/modules/product-creation-import/services/nutritionProfileExtractor.service.js")
s=p.read_text()

if "function flavourPhraseFromTitleKeywords(" not in s:
    anchor="function inferFlavourFromTitle(title = '') {"
    helper=r"""function flavourPhraseFromTitleKeywords(title=''){
  const value=cleanText(title,160);
  if(!value)return '';

  // Start at the first unmistakable taste/flavour token. This intentionally
  // drops collaboration/character prefixes such as "Butters" while retaining
  // compound flavour names such as "Strawberry Candy".
  const flavourStart=/\b(strawberry|raspberry|blueberry|blackberry|cranberry|pomegranate|peach|mango|watermelon|lemon|lime|orange|grape|apple|cherry|pineapple|coconut|vanilla|cola|candy|bubble\s*gum|bubblegum|cotton\s*candy|sherbet|cream|creamsicle|tea|lemonade)\b/i;
  const match=flavourStart.exec(value);
  if(!match)return '';

  let candidate=value.slice(match.index)
    .replace(/\b(energy formula|hydration formula|hydration|tub|can|cans|collector'?s? box|bundle|powder|drink mix|40 servings?|30 servings?)\b/ig,' ')
    .replace(/[|–—:]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  // Avoid dragging merchandising/collab suffixes into the flavour.
  candidate=candidate.split(/\b(?:collector'?s?|bundle|shaker|limited edition|edition)\b/i)[0].trim();
  return cleanText(candidate,90);
}

"""
    if anchor not in s:
        raise SystemExit("Could not find inferFlavourFromTitle anchor")
    s=s.replace(anchor,helper+anchor)

old="""function inferFlavourFromTitle(title = '') {
  let value = cleanText(title, 140)"""

new="""function inferFlavourFromTitle(title = '') {
  const keywordPhrase=flavourPhraseFromTitleKeywords(title);
  if(keywordPhrase)return keywordPhrase.replace(/\\b\\w/g,(char)=>char.toUpperCase());

  let value = cleanText(title, 140)"""

if old in s:
    s=s.replace(old,new)

# Add common phrase explicitly so text detection catches it before loose regex.
s=s.replace(
"'strawberry shortcake', 'cotton candy'",
"'strawberry shortcake', 'strawberry candy', 'cotton candy'"
)

p.write_text(s)

print("Applied stronger Shopify pattern / type / flavour logic")
PY

node --check src/modules/product-creation-import/services/merchantCatalogueContext.service.js
node --check src/modules/product-creation-import/services/productEnrichment.service.js
node --check src/modules/product-creation-import/services/nutritionProfileExtractor.service.js

echo
echo "Running deploy preflight..."
npm run deploy:preflight

echo
echo "============================================================"
echo " Product draft intelligence improvement complete"
echo "============================================================"
echo
echo "Expected for a G FUEL tub:"
echo "  - generic 'Tub' upgraded from existing Shopify product types"
echo "  - SEO title follows nearest existing Shopify title pattern"
echo "  - flavour parsed separately from collab/product title"
echo "  - formula remains populated by deterministic profile logic"
echo "  - meta description uses product/flavour/formula rather than generic boilerplate"
echo "  - AI remains OFF unless explicitly requested"
echo
echo "Commit:"
echo "  git add src/modules/product-creation-import/services/merchantCatalogueContext.service.js \\"
echo "          src/modules/product-creation-import/services/productEnrichment.service.js \\"
echo "          src/modules/product-creation-import/services/nutritionProfileExtractor.service.js"
echo '  git commit -m "Improve Shopify product pattern and flavour inference"'
echo "  git push origin clean-main"
