const { cleanText, slugify, normaliseMetafields, parseTags } = require('../utils/safe');
const { normaliseDraftProduct } = require('./normaliseProduct.service');
const { listRecentlyUsedProductTags, listRecentlyUsedProductVendors, getProductMetafieldDefinitions, getProfileValuesFromExistingProducts } = require('./shopifyProduct.service');
const { getProductImportSettings, applySettingsToDraft } = require('./productImportSettings.service');

const CORE_PROFILE_METAFIELDS = [
  { namespace: 'core', key: 'formula_version', name: 'Formula Version', type: 'single_line_text_field', help: 'Used to decide which product-line/formula profile this product belongs to.' },
  { namespace: 'core', key: 'grouped_profiles', name: 'Grouped Profiles', type: 'single_line_text_field', help: 'Reusable grouped flavour/profile labels.' },
  { namespace: 'core', key: 'sourness', name: 'Sourness', type: 'single_line_text_field', help: 'Estimated sourness level, for example low, medium or high.' },
  { namespace: 'core', key: 'sweetness', name: 'Sweetness', type: 'single_line_text_field', help: 'Estimated sweetness level, for example low, medium or high.' },
  { namespace: 'core', key: 'flavour_profile', name: 'Flavour Profile', type: 'single_line_text_field', help: 'Plain-English flavour description.' },
];

function mergeMetafields(...groups) {
  const byKey = new Map();
  groups.flat().filter(Boolean).forEach((item) => {
    if (!item.namespace || !item.key) return;
    const compound = `${item.namespace}.${item.key}`;
    const existing = byKey.get(compound);
    if (!existing || (!existing.value && item.value) || Number(item.confidence || 0) > Number(existing.confidence || 0)) {
      byKey.set(compound, item);
    }
  });
  return Array.from(byKey.values());
}

function stripJsonFence(value = '') {
  return String(value || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

async function aiSuggestProductProfile({ draft, metadata }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const prompt = `You are enriching a Shopify product draft. Return ONLY valid JSON with keys: handle, productType, tags, metafields, notes.

metafields must be an array of {namespace,key,type,value,confidence,source}. Include these core metafields when relevant: core.formula_version, core.grouped_profiles, core.sourness, core.sweetness, core.flavour_profile.

Rules:
- Preserve merchant terminology from existing tags/metafield names.
- For G Fuel drinks/tubs, estimate Formula Version, sweetness, sourness and flavour profile from the product title, description and URL content. Use concise values that a merchant can edit.
- Do not invent SKU, barcode or paid price.
- Suggest an SEO-safe handle matching the title.
- Keep confidence below 0.75 when the answer is inferred from flavour names rather than explicit content.

Existing tag examples: ${(metadata.tags || []).slice(0, 80).map((item) => item.tag || item).join(', ')}
Metafield definitions: ${(metadata.metafieldDefinitions || []).slice(0, 80).map((item) => `${item.namespace}.${item.key} (${item.name || item.type})`).join(', ')}
Product draft: ${JSON.stringify({ title: draft.title, vendor: draft.vendor, productType: draft.productType, tags: draft.tags, sourceUrl: draft.sourceUrl, descriptionHtml: draft.descriptionHtml, handle: draft.handle }).slice(0, 7000)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You prepare editable Shopify product import drafts. Output JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { error: json.error?.message || `OpenAI enrichment failed (${response.status})` };
  try { return JSON.parse(stripJsonFence(json.choices?.[0]?.message?.content || '{}')); }
  catch (_) { return null; }
}

async function getProductImportMetadata({ shopDomain }) {
  const [tags, vendors, metafieldDefinitions, settings] = await Promise.all([
    listRecentlyUsedProductTags({ shopDomain }),
    listRecentlyUsedProductVendors({ shopDomain }),
    getProductMetafieldDefinitions({ shopDomain }),
    getProductImportSettings({ shopDomain }),
  ]);
  const byKey = new Map();
  [...CORE_PROFILE_METAFIELDS, ...(metafieldDefinitions || [])].forEach((item) => {
    byKey.set(`${item.namespace}.${item.key}`, { ...item, type: item.type || 'single_line_text_field' });
  });
  return {
    tags,
    vendors,
    settings,
    metafieldDefinitions: Array.from(byKey.values()),
    coreProfileMetafields: CORE_PROFILE_METAFIELDS,
  };
}

async function suggestProductProfile({ shopDomain, draft }) {
  const normalised = normaliseDraftProduct(draft || {});
  const metadata = await getProductImportMetadata({ shopDomain });
  const existing = await getProfileValuesFromExistingProducts({
    shopDomain,
    tags: normalised.tags,
    vendor: normalised.vendor,
    productType: normalised.productType,
  });
  const ai = await aiSuggestProductProfile({ draft: normalised, metadata });

  const suggestedTags = Array.from(new Set([
    ...normalised.tags,
    ...parseTags(ai?.tags || []),
  ])).slice(0, 40);

  const suggestedMetafields = normaliseMetafields(mergeMetafields(
    existing.metafields || [],
    normalised.metafields || [],
    ai?.metafields || []
  ));

  const settingsApplied = applySettingsToDraft({
    ...normalised,
    handle: cleanText(ai?.handle || normalised.handle || slugify(normalised.title), 180),
    productType: cleanText(ai?.productType || normalised.productType || '', 120),
    tags: suggestedTags,
    metafields: suggestedMetafields,
  }, metadata.settings || {});

  return {
    handle: settingsApplied.handle,
    productType: settingsApplied.productType,
    vendor: settingsApplied.vendor,
    sku: settingsApplied.sku,
    title: settingsApplied.title,
    tags: settingsApplied.tags,
    metafields: settingsApplied.metafields,
    existingProfileMatchedProducts: existing.matchedProductCount || 0,
    aiNotes: cleanText(ai?.notes || ai?.error || '', 500),
  };
}

async function enrichProductDraft({ shopDomain, draft }) {
  const normalised = normaliseDraftProduct(draft || {});
  const suggestion = await suggestProductProfile({ shopDomain, draft: normalised });
  return normaliseDraftProduct({
    ...normalised,
    title: suggestion.title || normalised.title,
    handle: suggestion.handle || normalised.handle,
    vendor: suggestion.vendor || normalised.vendor,
    productType: suggestion.productType || normalised.productType,
    sku: suggestion.sku || normalised.sku,
    tags: suggestion.tags?.length ? suggestion.tags : normalised.tags,
    metafields: mergeMetafields(normalised.metafields || [], suggestion.metafields || []),
    enrichment: suggestion,
  });
}

module.exports = { getProductImportMetadata, suggestProductProfile, enrichProductDraft, CORE_PROFILE_METAFIELDS };
