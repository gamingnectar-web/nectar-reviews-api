const { cleanText, parseTags } = require('../utils/safe');

const BRAND_RULES = [
  { test: /g\s*fuel|gfuel/i, prefix: 'GF', requiredTagAliases: ['GFuel', 'G Fuel'], label: 'G FUEL' },
  { test: /advanced\s*gg|advancedgg/i, prefix: 'AD', requiredTagAliases: ['AdvancedGG', 'Advanced GG'], label: 'AdvancedGG' },
  { test: /\bnectar\b/i, prefix: 'NEC', requiredTagAliases: ['Nectar'], label: 'Nectar' },
  { test: /z[-\s]*zero|zzero/i, prefix: 'XZ', requiredTagAliases: ['Z-Zero', 'Z Zero'], label: 'Z-Zero' },
];

function siteValues(items = [], keys = []) {
  return (items || []).map((item) => {
    if (typeof item === 'string') return item;
    for (const key of keys) if (item?.[key]) return item[key];
    return '';
  }).map((v) => cleanText(v, 180)).filter(Boolean);
}
function same(a='', b='') { return cleanText(a,180).toLowerCase().replace(/[^a-z0-9]+/g,'') === cleanText(b,180).toLowerCase().replace(/[^a-z0-9]+/g,''); }
function findExact(value, values=[]) { return values.find((candidate) => same(value,candidate)) || ''; }
function brandRule(vendor='') { return BRAND_RULES.find((rule) => rule.test.test(String(vendor||''))) || null; }
function ensurePrefixedSku(sku='', vendor='') {
  const raw=cleanText(sku,120).replace(/^[-_\s]+|[-_\s]+$/g,'');
  const rule=brandRule(vendor);
  if (!raw || !rule) return raw;
  if (new RegExp(`^${rule.prefix}[-_\\s]?`, 'i').test(raw)) return raw.toUpperCase();
  return `${rule.prefix}-${raw}`.toUpperCase();
}
function inferPackageAndForm(draft={}) {
  const text=[draft.title,draft.productType,draft.descriptionHtml,draft.handleFormat].filter(Boolean).join(' ').toLowerCase();
  let packageType='';
  if (/\bcan\b|\bcans\b|ready[-\s]*to[-\s]*drink|\brtd\b/.test(text)) packageType='Can';
  else if (/sachet|stick pack|single serve/.test(text)) packageType='Sachet';
  else if (/bottle/.test(text)) packageType='Bottle';
  else if (/tub|powder|servings?/.test(text)) packageType='Tub';
  else if (/box|collector/.test(text)) packageType='Box';
  let beverageProductForm='';
  if (/\bcan\b|ready[-\s]*to[-\s]*drink|\brtd\b/.test(text)) beverageProductForm='Ready-to-drink';
  else if (/powder|tub|sachet|servings?/.test(text)) beverageProductForm='Powder';
  else if (/tablet|capsule/.test(text)) beverageProductForm='Tablet/Capsule';
  const consumable=/energy|hydration|focus|sleep|drink|powder|formula|supplement|tub|sachet|can\b/.test(text) && !/shaker|apparel|lunch|bag|case|collectible/.test(text);
  return { packageType, beverageProductForm, consumable };
}
function existingTag(value, metadata={}) {
  const tags=siteValues(metadata.tags,['tag']);
  return findExact(value,tags);
}
function applyCatalogueRules({ draft={}, metadata={} }) {
  const next={...draft};
  const vendors=siteValues(metadata.vendors,['vendor']);
  const types=siteValues(metadata.productTypes,['productType']);
  const templates=siteValues(metadata.themeTemplates,['template']);
  const vendorExact=findExact(next.vendor,vendors);
  if (vendorExact) next.vendor=vendorExact;
  const typeExact=findExact(next.productType,types);
  if (typeExact) next.productType=typeExact;
  const templateExact=findExact(next.themeTemplate || 'default',templates);
  if (templateExact) next.themeTemplate=templateExact === 'default' ? '' : templateExact;
  next.sku=ensurePrefixedSku(next.sku,next.vendor);
  const rule=brandRule(next.vendor);
  const approvedTags=parseTags(next.tags || []).map((tag)=>existingTag(tag,metadata)).filter(Boolean);
  if (rule) {
    const required=rule.requiredTagAliases.map((x)=>existingTag(x,metadata)).find(Boolean);
    if (required) approvedTags.push(required);
  }
  next.tags=Array.from(new Set(approvedTags));
  const inferred=inferPackageAndForm(next);
  next.fieldInference={...(next.fieldInference||{})};
  if (!next.packageType && inferred.packageType) { next.packageType=inferred.packageType; next.fieldInference.packageType=true; }
  if (!next.beverageProductForm && inferred.beverageProductForm) { next.beverageProductForm=inferred.beverageProductForm; next.fieldInference.beverageProductForm=true; }
  if (!next.dietarySupplement && inferred.consumable) { next.dietarySupplement='Yes'; next.fieldInference.dietarySupplement=true; }
  if (!next.salesChannelPolicy) next.salesChannelPolicy='all';
  if (!next.barcodeStatus) next.barcodeStatus=next.barcode ? 'provided' : 'needs_check';
  if (!next.compareAtPriceMode) next.compareAtPriceMode=next.compareAtPrice ? 'value' : 'needs_check';
  return next;
}
function metaValue(draft={}, key='') {
  const [namespace,k]=key.split('.');
  return (draft.metafields||[]).find((m)=>m.namespace===namespace && m.key===k)?.value ?? '';
}
function field(name,label,value,status,reason,required=true){return {name,label,value:value ?? '',status,reason,required};}
function completeness({draft={},item={},metadata={}}) {
  const confirmed=draft.fieldConfirmations||{};
  const inferredFields=draft.fieldInference||{};
  const inferred=inferPackageAndForm(draft);
  const vendors=siteValues(metadata.vendors,['vendor']);
  const types=siteValues(metadata.productTypes,['productType']);
  const templates=siteValues(metadata.themeTemplates,['template']);
  const exactVendor=Boolean(findExact(draft.vendor,vendors));
  const exactType=Boolean(findExact(draft.productType,types));
  const exactTemplate=Boolean(findExact(draft.themeTemplate || 'default',templates));
  const formula=item.nutrition?.formulaVersion || metaValue(draft,'core.formula_version');
  const flavour=item.nutrition?.productFlavour || metaValue(draft,'core.product_flavour');
  const family=item.nutrition?.flavourFamily || metaValue(draft,'core.flavour_family');
  const sweetness=item.nutrition?.sweetness ?? metaValue(draft,'core.sweetness');
  const sourness=item.nutrition?.sourness ?? metaValue(draft,'core.sourness');
  const profile=item.nutrition?.flavourProfile || metaValue(draft,'core.flavour_profile');
  const status=(name,ok,automaticReason='Verified')=> ok ? 'green' : (confirmed[name] ? 'green' : 'orange');
  const fields=[
    field('title','Title',draft.title,status('title',Boolean(draft.title && !/^imported product$/i.test(draft.title))), 'Required product title'),
    field('descriptionHtml','Accurate description',draft.descriptionHtml,status('descriptionHtml',String(draft.descriptionHtml||'').replace(/<[^>]+>/g,' ').trim().length>=80),'Description should be complete and source-aligned'),
    field('vendor','Vendor',draft.vendor,status('vendor',exactVendor),'Must match an existing Shopify vendor'),
    field('themeTemplate','Template',draft.themeTemplate || 'default',status('themeTemplate',exactTemplate),'Must match an existing product template'),
    field('price','Base price',draft.price,status('price',Boolean(draft.price) && !inferredFields.price),'Required'),
    field('compareAtPrice','Compare-at price',draft.compareAtPrice || (draft.compareAtPriceMode==='none'?'None':''),status('compareAtPrice',Boolean(draft.compareAtPrice || draft.compareAtPriceMode==='none') && !inferredFields.compareAtPrice),'Enter a value or explicitly confirm None'),
    field('dietarySupplement','Dietary supplement',draft.dietarySupplement,status('dietarySupplement',Boolean(draft.dietarySupplement) && !inferredFields.dietarySupplement),'Confirm Yes / No'),
    field('packageType','Package type',draft.packageType,status('packageType',Boolean(draft.packageType) && !inferredFields.packageType),'Tub, Can, Sachet, Box, Bottle etc.'),
    field('beverageProductForm','Beverage product form',inferred.consumable ? draft.beverageProductForm : 'N/A',status('beverageProductForm',!inferred.consumable || (Boolean(draft.beverageProductForm) && !inferredFields.beverageProductForm)),'Powder / Ready-to-drink / etc.'),
    field('productType','Product type',draft.productType,status('productType',exactType),'Must reuse an existing Shopify product type'),
    field('seoTitle','Page title',draft.seo?.title,status('seoTitle',Boolean(draft.seo?.title)),'Required SEO title'),
    field('seoDescription','Meta description',draft.seo?.description,status('seoDescription',Boolean(draft.seo?.description)),'Required meta description'),
    field('handle','URL handle',draft.handle,status('handle',Boolean(draft.handle)),'Required URL handle'),
    field('weight','Weight',draft.weight ? `${draft.weight}${draft.weightUnit||'g'}`:'',status('weight',Boolean(draft.weight) && !inferredFields.weight),'Required shipping/product weight'),
    field('harmonizedSystemCode','HS code',draft.harmonizedSystemCode,status('harmonizedSystemCode',Boolean(draft.harmonizedSystemCode) && Boolean(confirmed.harmonizedSystemCode)),'Database estimate stays orange until merchant confirms'),
    field('barcode','Barcode',draft.barcode || (draft.barcodeStatus==='unavailable'?'Confirmed unavailable':''),status('barcode',Boolean(draft.barcode || draft.barcodeStatus==='unavailable')),'Enter barcode or explicitly confirm unavailable'),
    field('salesChannelPolicy','Point of sale / sales channels',draft.salesChannelPolicy,status('salesChannelPolicy',draft.salesChannelPolicy==='all'),'Defaults to all channels / global publication policy'),
    field('tags','Tags',(draft.tags||[]).join(', '),status('tags',Boolean((draft.tags||[]).length)),'Only existing Shopify tags are permitted'),
    field('sku','SKU',draft.sku,status('sku',Boolean(draft.sku) && Boolean(brandRule(draft.vendor)?new RegExp(`^${brandRule(draft.vendor).prefix}-`,'i').test(draft.sku):true)),'Brand prefix + supplier SKU'),
    field('formulaVersion','Ingredient formula / library',formula,status('formulaVersion',!inferred.consumable || Boolean(confirmed.formulaVersion || (item.requiredChecks||[]).some((c)=>c.key==='formulaVersion' && c.confirmedValue))),'GFuel/AdvancedGG/Z-Zero product-line checks drive ingredient mapping'),
    field('productFlavour','Flavour profile product',flavour,status('productFlavour',!inferred.consumable || Boolean(confirmed.productFlavour)),'Required for relevant consumables'),
    field('flavourFamily','Flavour family',family,status('flavourFamily',!inferred.consumable || Boolean(confirmed.flavourFamily)),'Required for relevant consumables'),
    field('sweetness','Sweetness',sweetness,status('sweetness',!inferred.consumable || Boolean(confirmed.sweetness)),'Required for relevant consumables'),
    field('sourness','Sourness',sourness,status('sourness',!inferred.consumable || Boolean(confirmed.sourness)),'Required for relevant consumables'),
    field('flavourProfile','Flavour profile',profile,status('flavourProfile',!inferred.consumable || Boolean(confirmed.flavourProfile)),'Required for relevant consumables'),
  ];
  const blockers=fields.filter((f)=>f.required && f.status!=='green');
  return {fields,total:fields.length,green:fields.filter((f)=>f.status==='green').length,orange:blockers.length,ready:blockers.length===0,blockers:blockers.map((f)=>`${f.label}: ${f.reason}`)};
}
module.exports={BRAND_RULES,ensurePrefixedSku,applyCatalogueRules,completeness,inferPackageAndForm};
