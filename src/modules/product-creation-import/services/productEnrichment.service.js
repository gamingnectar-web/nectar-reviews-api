const { cleanText, slugify, normaliseMetafields, parseTags } = require('../utils/safe');
const { normaliseDraftProduct } = require('./normaliseProduct.service');
const { listRecentlyUsedProductTags, listRecentlyUsedProductVendors, getProductMetafieldDefinitions, getProfileValuesFromExistingProducts } = require('./shopifyProduct.service');
const { getProductImportSettings, applySettingsToDraft } = require('./productImportSettings.service');

const CORE_PROFILE_METAFIELDS = [
  { namespace: 'core', key: 'formula_version', name: 'Formula Version', type: 'single_line_text_field', help: 'Used to decide which product-line/formula profile this product belongs to.' },
  { namespace: 'core', key: 'grouped_profiles', name: 'Grouped Profiles', type: 'single_line_text_field', help: 'Reusable grouped flavour/profile labels.' },
  { namespace: 'core', key: 'sourness', name: 'Sourness', type: 'single_line_text_field', help: '1 to 5 gauge where 1 is not sour and 5 is very sour.' },
  { namespace: 'core', key: 'sweetness', name: 'Sweetness', type: 'single_line_text_field', help: '1 to 5 gauge where 1 is not sweet and 5 is very sweet.' },
  { namespace: 'core', key: 'flavour_profile', name: 'Flavour Profile', type: 'single_line_text_field', help: 'Plain-English flavour description.' },
];

const CORE_PROFILE_KEYS = new Set(['core.formula_version', 'core.grouped_profiles', 'core.sourness', 'core.sweetness', 'core.flavour_profile']);

function draftSearchText(draft = {}) {
  return [
    draft.title,
    draft.vendor,
    draft.productType,
    Array.isArray(draft.tags) ? draft.tags.join(' ') : draft.tags,
    draft.sourceUrl,
    draft.descriptionHtml,
  ].filter(Boolean).join(' ').toLowerCase();
}

function isClearlyNonDrinkProduct(draft = {}) {
  const text = draftSearchText(draft);
  return /lunch\s*box|lunchbox|collectible|collector|shaker|cup|bottle|keychain|sticker|hat|shirt|hoodie|apparel|merch|accessor(y|ies)|checkout\+|insurance|warranty|protection|mystery\s+(item|product)/i.test(text)
    && !/serving|formula|powder|hydration|energy\s*(drink|formula)|tub|can\s*(pack|case)|drink\s*mix/i.test(text);
}

function isLikelyDrinkProduct(draft = {}) {
  const text = draftSearchText(draft);
  if (isClearlyNonDrinkProduct(draft)) return false;
  return /serving|formula|powder|hydration|energy\s*(drink|formula)|gamer\s*drink|tub|drink\s*mix|can\s*(pack|case)|cans?\b|flavour|flavor/i.test(text);
}

function filterMetafieldsForProductKind(items = [], draft = {}) {
  const allowCoreDrinkProfile = isLikelyDrinkProduct(draft);
  return (items || []).filter((item) => {
    const compound = `${item.namespace}.${item.key}`;
    if (!CORE_PROFILE_KEYS.has(compound)) return true;
    return allowCoreDrinkProfile;
  });
}

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

function normaliseGaugeValue(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  const numeric = Number((raw.match(/\d+(?:\.\d+)?/) || [])[0]);
  if (Number.isFinite(numeric) && numeric > 0) return String(Math.max(1, Math.min(5, Math.round(numeric))));
  if (/very\s*high|strong|intense|extreme/.test(raw)) return '5';
  if (/high|sweet|sour/.test(raw)) return '4';
  if (/medium|moderate|balanced/.test(raw)) return '3';
  if (/low|mild|light/.test(raw)) return '2';
  if (/none|not|very\s*low/.test(raw)) return '1';
  return raw ? '3' : '';
}

function normaliseCoreGaugeMetafields(items = []) {
  return (items || []).map((item) => {
    if (item?.namespace === 'core' && ['sourness', 'sweetness'].includes(item.key)) {
      return { ...item, value: normaliseGaugeValue(item.value), type: item.type || 'single_line_text_field' };
    }
    return item;
  });
}

async function aiSuggestProductProfile({ draft, metadata }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const prompt = `You are enriching a Shopify product draft. Return ONLY valid JSON with keys: handle, productType, tags, metafields, weight, weightUnit, notes.

metafields must be an array of {namespace,key,type,value,confidence,source}. Include these core metafields when relevant: core.formula_version, core.grouped_profiles, core.sourness, core.sweetness, core.flavour_profile.

Rules:
- Preserve merchant terminology from existing tags/metafield names.
- For G Fuel drinks/tubs/consumable drink products only, estimate Formula Version, sweetness, sourness and flavour profile from the product title, description and URL content.
- Do not add core.formula_version, core.grouped_profiles, core.sourness, core.sweetness or core.flavour_profile for accessories, lunch boxes, shakers, cases, apparel, insurance, or non-consumable merchandise.
- core.sourness and core.sweetness must be string numbers from "1" to "5" only: 1 = very low, 3 = medium, 5 = very high. Do not use words like low/medium/high for these two fields.
- Do not invent SKU, barcode or paid price. Only suggest weight if it is explicit in the page/title/description or clearly visible in provided content.
- Suggest an SEO-safe handle matching the title.
- Keep confidence below 0.75 when the answer is inferred from flavour names rather than explicit content.

Existing tag examples: ${(metadata.tags || []).slice(0, 80).map((item) => item.tag || item).join(', ')}
Metafield definitions: ${(metadata.metafieldDefinitions || []).slice(0, 80).map((item) => `${item.namespace}.${item.key} (${item.name || item.type})`).join(', ')}
Metafield mapping rules: ${JSON.stringify((metadata.settings?.metafieldMappingRules || []).filter((rule) => rule.enabled !== false).slice(0, 80)).slice(0, 4000)}
Product draft: ${JSON.stringify({ title: draft.title, vendor: draft.vendor, productType: draft.productType, tags: draft.tags, sourceUrl: draft.sourceUrl, descriptionHtml: draft.descriptionHtml, handle: draft.handle, weight: draft.weight, weightUnit: draft.weightUnit, likelyDrinkProduct: isLikelyDrinkProduct(draft), clearlyNonDrinkProduct: isClearlyNonDrinkProduct(draft) }).slice(0, 7000)}`;

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
    title: normalised.title,
  });
  const ai = await aiSuggestProductProfile({ draft: normalised, metadata });

  const suggestedTags = Array.from(new Set([
    ...normalised.tags,
    ...parseTags(ai?.tags || []),
  ])).slice(0, 40);

  const mergedMetafields = mergeMetafields(
    filterMetafieldsForProductKind(existing.metafields || [], normalised),
    filterMetafieldsForProductKind(normalised.metafields || [], normalised),
    filterMetafieldsForProductKind(ai?.metafields || [], normalised)
  );
  const suggestedMetafields = normaliseMetafields(normaliseCoreGaugeMetafields(filterMetafieldsForProductKind(mergedMetafields, normalised)));

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
    weight: cleanText(ai?.weight || normalised.weight || '', 40),
    weightUnit: cleanText(ai?.weightUnit || normalised.weightUnit || 'g', 10),
    vendor: settingsApplied.vendor,
    sku: settingsApplied.sku,
    title: settingsApplied.title,
    tags: settingsApplied.tags,
    metafields: filterMetafieldsForProductKind(settingsApplied.metafields || [], settingsApplied),
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
    weight: suggestion.weight || normalised.weight,
    weightUnit: suggestion.weightUnit || normalised.weightUnit,
    sku: suggestion.sku || normalised.sku,
    tags: suggestion.tags?.length ? suggestion.tags : normalised.tags,
    metafields: normaliseCoreGaugeMetafields(filterMetafieldsForProductKind(mergeMetafields(normalised.metafields || [], suggestion.metafields || []), normalised)),
    enrichment: suggestion,
  });
}

module.exports = { getProductImportMetadata, suggestProductProfile, enrichProductDraft, CORE_PROFILE_METAFIELDS, isLikelyDrinkProduct, isClearlyNonDrinkProduct, filterMetafieldsForProductKind };
