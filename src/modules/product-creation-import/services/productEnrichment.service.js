const { cleanText, slugify, normaliseMetafields, parseTags } = require('../utils/safe');
const { normaliseDraftProduct } = require('./normaliseProduct.service');
const { listRecentlyUsedProductTags, listRecentlyUsedProductVendors, listRecentlyUsedProductTypes, listRecentlyUsedThemeTemplates, listProductCategoryHints, getProductMetafieldDefinitions, getProfileValuesFromExistingProducts, getCommercialSuggestionsFromExistingProducts, listShopifyCollections, listProductSeoExamples, listThemeTemplateHints } = require('./shopifyProduct.service');
const { getProductImportSettings, applySettingsToDraft } = require('./productImportSettings.service');

const CORE_PROFILE_METAFIELDS = [
  { namespace: 'core', key: 'product_flavour', name: 'Product Flavour', type: 'single_line_text_field', help: 'The actual flavour shown on the supplier/product page, e.g. Pomegranate Green Tea.' },
  { namespace: 'core', key: 'flavour_family', name: 'Flavour Family', type: 'single_line_text_field', help: 'Reusable flavour grouping, e.g. Citrus, Berry, Tea.' },
  { namespace: 'core', key: 'formula_version', name: 'Formula Version', type: 'single_line_text_field', help: 'Used to decide which product-line/formula profile this product belongs to.' },
  { namespace: 'core', key: 'grouped_profiles', name: 'Grouped Profiles', type: 'single_line_text_field', help: 'Reusable grouped flavour/profile labels.' },
  { namespace: 'core', key: 'sourness', name: 'Sourness', type: 'single_line_text_field', help: '1 to 5 gauge where 1 is not sour and 5 is very sour.' },
  { namespace: 'core', key: 'sweetness', name: 'Sweetness', type: 'single_line_text_field', help: '1 to 5 gauge where 1 is not sweet and 5 is very sweet.' },
  { namespace: 'core', key: 'flavour_profile', name: 'Flavour Profile', type: 'single_line_text_field', help: 'Plain-English flavour description.' },
];

const CORE_PROFILE_KEYS = new Set(['core.product_flavour', 'core.flavour_family', 'core.formula_version', 'core.grouped_profiles', 'core.sourness', 'core.sweetness', 'core.flavour_profile']);

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

function stripVendorFromTitle(title = '', vendor = '') {
  let next = cleanText(title || '', 220);
  const vendorText = cleanText(vendor || '', 120);
  if (!vendorText) return next;
  const escaped = vendorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  next = next.replace(new RegExp(`^${escaped}\\s*[-–—:|•]*\\s*`, 'i'), '').trim();
  if (/^g\s*fuel/i.test(vendorText)) next = next.replace(/^g\s*fuel\s*[-–—:|•]*\s*/i, '').trim();
  return next || cleanText(title || '', 220);
}

function titleCaseLocation(value = '') {
  const raw = cleanText(value || '', 80);
  if (!raw) return 'UK Stock';
  if (/^uk$/i.test(raw)) return 'UK Stock';
  if (/stock/i.test(raw)) return raw.replace(/\buk\b/i, 'UK');
  return `${raw.replace(/\buk\b/i, 'UK')} Stock`;
}

function inferProductFormat(draft = {}, settings = {}) {
  const rules = settings.handleRules || {};
  const explicit = cleanText(draft.handleFormat || draft.productFormat || rules.format || '', 100);
  const text = [draft.title, draft.productType, draft.descriptionHtml, parseTags(draft.recommendedTags).join(' ')].filter(Boolean).join(' ').toLowerCase();
  if (/collector|collectible/.test(text) && /box/.test(text)) return 'Collector Box';
  if (explicit && !/^tub$/i.test(explicit)) return explicit;
  if (/hydration/.test(text)) return /tub|powder|servings?/.test(text) ? 'Hydration Powder Tub' : 'Hydration Drink';
  if (/can\b|cans\b|case/.test(text)) return 'Energy Drink Can';
  if (/sachet|stick|single\s*serve/.test(text)) return 'Energy Drink Sachet';
  if (/shaker|cup|bottle/.test(text)) return 'Shaker Cup';
  if (/energy|formula|powder|tub|servings?/.test(text) || /^g\s*fuel$/i.test(draft.vendor || '')) return 'Energy Drink Powder Tub';
  return explicit || draft.productType || 'Product';
}

function slugifyLoose(value = '') {
  return cleanText(value, 180).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '');
}

function titleLocationForSeo(value = '') {
  const raw = cleanText(value || '', 80);
  if (!raw) return 'UK Stock';
  if (/^uk$/i.test(raw)) return 'UK Stock';
  return titleCaseLocation(raw);
}

function locationForHandle(value = '') {
  const raw = cleanText(value || '', 80);
  if (!raw) return 'uk';
  if (/^uk\s*stock$/i.test(raw)) return 'uk';
  return raw;
}

function stripFormatFromProductName(productName = '', format = '') {
  let next = cleanText(productName, 180);
  const fmt = cleanText(format, 120).toLowerCase();
  if (!next || !fmt) return next;

  if (/collector/.test(fmt)) {
    next = next
      .replace(/\bcollector'?s?\s*box\b/ig, '')
      .replace(/\bcollectible\s*box\b/ig, '')
      .replace(/\bbundle\b/ig, '')
      .replace(/[-–—:|•]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  if (/energy\s*drink\s*powder\s*tub|powder\s*tub|\btub\b/.test(fmt)) {
    next = next
      .replace(/\b(energy\s*formula|energy\s*drink|powder\s*tub|drink\s*powder\s*tub|tub|40\s*servings?|30\s*servings?)\b/ig, '')
      .replace(/[-–—:|•]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return next || cleanText(productName, 180);
}

function makeMerchantSeo({ draft = {}, settings = {} }) {
  const vendor = cleanText(draft.vendor || '', 80);
  const productName = stripVendorFromTitle(draft.title || '', vendor);
  const format = inferProductFormat(draft, settings);
  const seoLocation = titleLocationForSeo(draft.handleLocation || settings.handleRules?.location || 'uk');
  const handleLocation = locationForHandle(draft.handleLocation || settings.handleRules?.location || 'uk');
  const safeProductName = stripFormatFromProductName(productName, format);
  const seoTitle = cleanText([vendor, safeProductName, format, seoLocation].filter(Boolean).join(' - '), 120);
  const handle = slugifyLoose([vendor, safeProductName, format, handleLocation].filter(Boolean).join('-'));
  const flavour = cleanText((draft.metafields || []).find((mf) => mf.namespace === 'core' && mf.key === 'product_flavour')?.value || '', 80);
  const flavourProfile = cleanText((draft.metafields || []).find((mf) => mf.namespace === 'core' && mf.key === 'flavour_profile')?.value || '', 120);
  const lead = [vendor, safeProductName, format].filter(Boolean).join(' ');
  const flavourSentence = flavour && !new RegExp(`\\b${flavour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lead)
    ? `Flavour: ${flavour}.`
    : (flavourProfile ? flavourProfile.replace(/[.!?]?$/, '.') : '');
  const description = cleanText([
    `Buy ${lead} from Gaming Nectar with ${seoLocation}.`,
    flavourSentence,
    'Fast UK dispatch available.'
  ].filter(Boolean).join(' '), 155).replace(/[,:;\s]+$/, '.');
  return { title: seoTitle || draft.seo?.title || draft.title, description, handle };
}

function valueKey(value = '') {
  return cleanText(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function compactValueKey(value = '') {
  return valueKey(value).replace(/\s+/g, '');
}

function optionValue(item = {}, key = 'value') {
  return cleanText(item[key] || item.title || item.handle || item.vendor || item.productType || item.template || item.tag || item.category || (typeof item === 'string' ? item : ''), 180);
}

function exactSiteValue(value = '', options = [], key = 'value') {
  const raw = cleanText(value, 180);
  if (!raw) return '';
  const rawKey = valueKey(raw);
  const rawCompact = compactValueKey(raw);
  const found = (options || []).find((item) => {
    const candidate = optionValue(item, key);
    return valueKey(candidate) === rawKey || compactValueKey(candidate) === rawCompact;
  });
  return found ? optionValue(found, key) : raw;
}

function filterToExistingTags(values = [], siteTags = []) {
  const byKey = new Map((siteTags || []).map((item) => [valueKey(item.tag || item), cleanText(item.tag || item, 80)]));
  return Array.from(new Set(parseTags(values).map((tag) => byKey.get(valueKey(tag))).filter(Boolean))).slice(0, 40);
}

function filterToExistingCollections(values = [], collections = [], allowUserDefaults = []) {
  const byKey = new Map();
  (collections || []).forEach((collection) => {
    if (collection.title) byKey.set(valueKey(collection.title), collection.handle || collection.title);
    if (collection.handle) byKey.set(valueKey(collection.handle), collection.handle);
  });
  const userDefaults = new Set(parseTags(allowUserDefaults).map(valueKey));
  return Array.from(new Set(parseTags(values).map((value) => {
    const key = valueKey(value);
    return byKey.get(key) || (userDefaults.has(key) ? cleanText(value, 80) : '');
  }).filter(Boolean))).slice(0, 40);
}

async function aiSuggestProductProfile({ draft, metadata }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const prompt = `You are enriching a Shopify product draft. Return ONLY valid JSON with keys: handle, productType, productCategory, themeTemplate, collections, recommendedTags, seoTitle, seoDescription, metafields, weight, weightUnit, notes.

metafields must be an array of {namespace,key,type,value,confidence,source}. Include these core metafields when relevant: core.product_flavour, core.flavour_family, core.formula_version, core.grouped_profiles, core.sourness, core.sweetness, core.flavour_profile.

Rules:
- Preserve merchant terminology from existing vendors, collections, templates, tags and metafield names. Do not invent collection/tag names.
- For G Fuel drinks/tubs/consumable drink products only, extract the actual product flavour from the page/options/title/description, then estimate Formula Version, sweetness, sourness and flavour profile.
- Do not add core.product_flavour, core.flavour_family, core.formula_version, core.grouped_profiles, core.sourness, core.sweetness or core.flavour_profile for accessories, lunch boxes, shakers, cases, apparel, insurance, or non-consumable merchandise.
- core.sourness and core.sweetness must be string numbers from "1" to "5" only: 1 = very low, 3 = medium, 5 = very high. Do not use words like low/medium/high for these two fields.
- Do not invent SKU, barcode or paid price. Only suggest weight if it is explicit in the page/title/description or clearly visible in provided content.
- Build SEO in the merchant pattern: vendor + product name + product format + location. For example: G FUEL Tornado • Energy Drink Powder Tub • UK Stock.
- Build URL handles in the same merchant pattern: vendor-product-name-product-format-location.
- Product format should be human readable, e.g. Energy Drink Powder Tub, Collector Box, Shaker Cup, Hydration Powder Tub.
- Keep confidence below 0.75 when the answer is inferred from flavour names rather than explicit content.

Existing tag examples for click-to-add suggestions only: ${(metadata.tags || []).slice(0, 80).map((item) => item.tag || item).join(', ')}
Metafield definitions: ${(metadata.metafieldDefinitions || []).slice(0, 80).map((item) => `${item.namespace}.${item.key} (${item.name || item.type})`).join(', ')}
Metafield mapping rules: ${JSON.stringify((metadata.settings?.metafieldMappingRules || []).filter((rule) => rule.enabled !== false).slice(0, 80)).slice(0, 4000)}
Product draft: ${JSON.stringify({ title: draft.title, vendor: draft.vendor, productType: draft.productType, productCategory: draft.productCategory, tags: draft.tags, sourceUrl: draft.sourceUrl, descriptionHtml: draft.descriptionHtml, handle: draft.handle, handleFormat: draft.handleFormat, handleLocation: draft.handleLocation, weight: draft.weight, weightUnit: draft.weightUnit, images: (draft.images || []).slice(0, 10).map((img) => ({ src: img.src, alt: img.alt, role: img.role })), raw: draft.raw, likelyDrinkProduct: isLikelyDrinkProduct(draft), clearlyNonDrinkProduct: isClearlyNonDrinkProduct(draft) }).slice(0, 9000)}`;

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
  const [tags, vendors, productTypes, themeTemplates, productCategories, metafieldDefinitions, settings, collections, seoExamples] = await Promise.all([
    listRecentlyUsedProductTags({ shopDomain }),
    listRecentlyUsedProductVendors({ shopDomain }),
    listRecentlyUsedProductTypes({ shopDomain }).catch(() => []),
    listRecentlyUsedThemeTemplates({ shopDomain }).catch(() => listThemeTemplateHints().map((template) => ({ template }))),
    listProductCategoryHints({ shopDomain }).catch(() => []),
    getProductMetafieldDefinitions({ shopDomain }),
    getProductImportSettings({ shopDomain }),
    listShopifyCollections({ shopDomain }).catch(() => []),
    listProductSeoExamples({ shopDomain }).catch(() => []),
  ]);
  const byKey = new Map();
  [...CORE_PROFILE_METAFIELDS, ...(metafieldDefinitions || [])].forEach((item) => {
    byKey.set(`${item.namespace}.${item.key}`, { ...item, type: item.type || 'single_line_text_field' });
  });
  return {
    tags,
    vendors,
    productTypes,
    productCategories,
    settings,
    metafieldDefinitions: Array.from(byKey.values()),
    coreProfileMetafields: CORE_PROFILE_METAFIELDS,
    collections,
    seoExamples,
    themeTemplates,
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

  // Tags and collections must align to the merchant's site. AI can suggest, but it
  // cannot create random collection/tag names or auto-apply url-import/product-import.
  const recommendedTags = filterToExistingTags([
    ...parseTags(normalised.recommendedTags || []),
    ...parseTags(ai?.recommendedTags || ai?.tags || []),
  ], metadata.tags || []);
  const aiCollections = filterToExistingCollections(parseTags(ai?.collections || []), metadata.collections || [], []);
  const allowedCollections = filterToExistingCollections([...(normalised.collections || []), ...aiCollections], metadata.collections || [], normalised.collections || []);

  const mergedMetafields = mergeMetafields(
    filterMetafieldsForProductKind(existing.metafields || [], normalised),
    filterMetafieldsForProductKind(normalised.metafields || [], normalised),
    filterMetafieldsForProductKind(ai?.metafields || [], normalised)
  );
  const suggestedMetafields = normaliseMetafields(normaliseCoreGaugeMetafields(filterMetafieldsForProductKind(mergedMetafields, normalised)));

  const settingsApplied = applySettingsToDraft({
    ...normalised,
    handle: normalised.handle || slugify(normalised.title),
    productType: normalised.productType || cleanText(ai?.productType || '', 120),
    productCategory: normalised.productCategory || cleanText(ai?.productCategory || '', 180),
    tags: normalised.tags,
    recommendedTags,
    themeTemplate: normalised.themeTemplate || cleanText(ai?.themeTemplate || '', 80),
    collections: allowedCollections,
    metafields: suggestedMetafields,
  }, metadata.settings || {});
  const commercialSuggestions = await getCommercialSuggestionsFromExistingProducts({ shopDomain, draft: settingsApplied }).catch(() => ({}));
  const merchantSeo = makeMerchantSeo({ draft: settingsApplied, settings: metadata.settings || {} });

  return {
    handle: merchantSeo.handle || settingsApplied.handle,
    productType: exactSiteValue(settingsApplied.productType, metadata.productTypes || [], 'productType'),
    productCategory: settingsApplied.productCategory || normalised.productCategory || '',
    weight: cleanText(ai?.weight || normalised.weight || commercialSuggestions.weight?.value || '', 40),
    weightUnit: cleanText(ai?.weightUnit || normalised.weightUnit || commercialSuggestions.weight?.weightUnit || 'g', 10),
    vendor: exactSiteValue(settingsApplied.vendor, metadata.vendors || [], 'vendor'),
    sku: settingsApplied.sku || normalised.sku || '',
    title: settingsApplied.title,
    tags: normalised.tags,
    recommendedTags: settingsApplied.recommendedTags || recommendedTags,
    themeTemplate: settingsApplied.themeTemplate || normalised.themeTemplate || '',
    collections: settingsApplied.collections || normalised.collections || [],
    seo: {
      title: cleanText(merchantSeo.title || normalised.seo?.title || '', 70),
      description: cleanText(merchantSeo.description || normalised.seo?.description || '', 155).replace(/[,:;\s]+$/, '.'),
    },
    metafields: filterMetafieldsForProductKind(settingsApplied.metafields || [], settingsApplied),
    suggestions: commercialSuggestions,
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
    productCategory: suggestion.productCategory || normalised.productCategory,
    themeTemplate: suggestion.themeTemplate || normalised.themeTemplate,
    collections: suggestion.collections || normalised.collections,
    recommendedTags: suggestion.recommendedTags || normalised.recommendedTags,
    weight: suggestion.weight || normalised.weight,
    weightUnit: suggestion.weightUnit || normalised.weightUnit,
    sku: suggestion.sku || normalised.sku,
    seo: suggestion.seo || normalised.seo || {},
    suggestions: suggestion.suggestions || normalised.suggestions || {},
    tags: normalised.tags,
    recommendedTags: suggestion.recommendedTags || normalised.recommendedTags || [],
    metafields: normaliseCoreGaugeMetafields(filterMetafieldsForProductKind(mergeMetafields(normalised.metafields || [], suggestion.metafields || []), normalised)),
    enrichment: suggestion,
  });
}

module.exports = { getProductImportMetadata, suggestProductProfile, enrichProductDraft, CORE_PROFILE_METAFIELDS, isLikelyDrinkProduct, isClearlyNonDrinkProduct, filterMetafieldsForProductKind };
