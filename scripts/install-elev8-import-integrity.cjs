const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

function patchNormaliser(){
  let s=R('src','modules','product-creation-import','services','normaliseProduct.service.js');
  if(!s.includes("require('./fieldAuthority.service')")) s=s.replace(
    "const { cleanText, cleanUrl, toMoney, suggestedRetailFromCost, slugify, parseTags, normaliseMetafields } = require('../utils/safe');",
    "const { cleanText, cleanUrl, toMoney, suggestedRetailFromCost, slugify, parseTags, normaliseMetafields } = require('../utils/safe');\nconst { preserveLockedFields, locked } = require('./fieldAuthority.service');");
  if(!s.includes('fieldLocks: raw.fieldLocks')){
    s=s.replace("    raw,\n  };\n}\n\nmodule.exports =",
`    fieldLocks: raw.fieldLocks && typeof raw.fieldLocks === 'object' ? raw.fieldLocks : {},
    lastMerchantEditAt: raw.lastMerchantEditAt || null,
    raw,
  };
  if (locked(raw, 'seo.title')) result.seo.title = cleanText(raw.seo?.title || '', 180);
  if (locked(raw, 'seo.description')) result.seo.description = cleanText(raw.seo?.description || '', 500);
  return preserveLockedFields(raw, result);
}

module.exports =`);
    s=s.replace("  return {\n    source:", "  const result = {\n    source:");
  }
  W(['src','modules','product-creation-import','services','normaliseProduct.service.js'],s);
}

function patchRegistry(){
  let s=R('src','modules','product-creation-import','services','metafieldSchemaRegistry.service.js');
  if(!s.includes("require('./fieldAuthority.service')")) s=s.replace(
    "const { cleanText, normaliseMetafields, parseTags } = require('../utils/safe');",
    "const { cleanText, normaliseMetafields, parseTags } = require('../utils/safe');\nconst { mergeMetafieldsWithAuthority } = require('./fieldAuthority.service');");
  if(!s.includes("about_brand:")) s=s.replace(
    "  flavour_profile: { namespace: 'core', key: 'flavour_profile', type: 'single_line_text_field', label: 'Flavour Profile' },",
    "  flavour_profile: { namespace: 'core', key: 'flavour_profile', type: 'single_line_text_field', label: 'Flavour Profile' },\n  about_brand: { namespace: 'core', key: 'about_brand', type: 'rich_text_field', label: 'About Brand' },");
  if(!s.includes("buildMetafield('about_brand'")) s=s.replace(
    "    buildMetafield('flavour_profile', profile.flavourProfile || profile.flavour_profile, source, confidence),",
    "    buildMetafield('flavour_profile', profile.flavourProfile || profile.flavour_profile, source, confidence),\n    buildMetafield('about_brand', profile.aboutBrand || profile.about_brand || profile.brandDescription, source, confidence),");
  s=s.replace("metafields: mergeMetafields(draft.metafields || [], profileMetafields),",
    "metafields: mergeMetafieldsWithAuthority(draft.metafields || [], profileMetafields, draft),");
  W(['src','modules','product-creation-import','services','metafieldSchemaRegistry.service.js'],s);
}

function patchEnrichment(){
  let s=R('src','modules','product-creation-import','services','productEnrichment.service.js');
  if(!s.includes("require('./catalogueReference.service')")) s=s.replace(
    "const { getProductImportSettings, applySettingsToDraft } = require('./productImportSettings.service');",
    "const { getProductImportSettings, applySettingsToDraft } = require('./productImportSettings.service');\nconst { buildCatalogueReferenceContext } = require('./catalogueReference.service');\nconst { preserveLockedFields } = require('./fieldAuthority.service');");
  if(!s.includes('merchant edits are authoritative')){
    s=s.replace("async function aiSuggestProductProfile({ draft, metadata }) {",
      "async function aiSuggestProductProfile({ draft, metadata, shopDomain = '' }) {\n  const catalogueContext = shopDomain ? await buildCatalogueReferenceContext({ shopDomain, draft }).catch(() => null) : null;");
    s=s.replace("Rules:\\n- Preserve merchant terminology",
`SHOPIFY CATALOGUE REFERENCE:
\${JSON.stringify(catalogueContext || {}, null, 2)}

Critical rules:
- merchant edits are authoritative and must never be replaced.
- use Shopify catalogue examples only for blank/unlocked fields.
- each product is isolated: NEVER reuse flavour/profile values from another batch item.
- product flavour must be evidenced by THIS product's title, supplier page, options, description or images.
- if uncertain, leave flavour blank rather than copy a catalogue example.
- preserve manually edited SEO title, SEO description, URL handle and About Brand exactly.
- use the existing Shopify About Brand metafield definition when one exists.

Rules:
- Preserve merchant terminology`);
    s=s.replace(/aiSuggestProductProfile\(\{\s*draft,\s*metadata\s*\}\)/g,
      "aiSuggestProductProfile({ draft, metadata, shopDomain })");
  }
  W(['src','modules','product-creation-import','services','productEnrichment.service.js'],s);
}

function patchBatch(){
  let s=R('src','modules','product-creation-import','services','productImportBatch.service.js');
  if(!s.includes("require('./fieldAuthority.service')")) s=s.replace(
    "const { cleanText, cleanUrl, makeLineId, parseTags, normaliseMetafields, slugify } = require('../utils/safe');",
    "const { cleanText, cleanUrl, makeLineId, parseTags, normaliseMetafields, slugify } = require('../utils/safe');\nconst { markMerchantEdits, preserveLockedFields } = require('./fieldAuthority.service');");
  const marker="async function updateBatchItem(";
  if(!s.includes("markMerchantEdits(itemPreview.draft")){
    const i=s.indexOf(marker); if(i<0) throw new Error('updateBatchItem not found');
    const b=s.indexOf('{',i);
    s=s.slice(0,b+1)+`
  if (patch?.draft && typeof patch.draft === 'object') {
    const batchPreview = await ProductImportBatch.findOne({ _id: batchId, shopDomain }).lean();
    const itemPreview = batchPreview?.items?.find(row => row.itemId === itemId);
    if (itemPreview) patch = { ...patch, draft: markMerchantEdits(itemPreview.draft || {}, patch.draft) };
  }
`+s.slice(b+1);
  }
  W(['src','modules','product-creation-import','services','productImportBatch.service.js'],s);
}

function patchCreate(){
  let s=R('src','modules','product-creation-import','productCreationImport.service.js');
  if(!s.includes("require('./services/fieldAuthority.service')")) s=s.replace(
    "const { getProductImportSettings, saveProductImportSettings } = require('./services/productImportSettings.service');",
    "const { getProductImportSettings, saveProductImportSettings } = require('./services/productImportSettings.service');\nconst { preserveLockedFields } = require('./services/fieldAuthority.service');");
  s=s.replace("sourceDraft = await enrichProductDraft({ shopDomain, draft: sourceDraft });",
`{
    const merchantDraft = JSON.parse(JSON.stringify(sourceDraft || {}));
    const enriched = await enrichProductDraft({ shopDomain, draft: sourceDraft });
    sourceDraft = preserveLockedFields(merchantDraft, enriched);
  }`);
  W(['src','modules','product-creation-import','productCreationImport.service.js'],s);
}

patchNormaliser();patchRegistry();patchEnrichment();patchBatch();patchCreate();
console.log('ELEV8 importer integrity update installed');
