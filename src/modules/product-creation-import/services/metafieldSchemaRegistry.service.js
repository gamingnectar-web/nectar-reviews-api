const { cleanText, normaliseMetafields, parseTags } = require('../utils/safe');

const PRODUCT_IMPORT_PROFILE_SCHEMA = {
  product_flavour: { namespace: 'core', key: 'product_flavour', type: 'single_line_text_field', label: 'Product Flavour' },
  flavour_family: { namespace: 'core', key: 'flavour_family', type: 'single_line_text_field', label: 'Flavour Family' },
  flavour_profile: { namespace: 'core', key: 'flavour_profile', type: 'single_line_text_field', label: 'Flavour Profile' },
  formula_version: { namespace: 'core', key: 'formula_version', type: 'single_line_text_field', label: 'Formula Version' },
  sweetness: { namespace: 'core', key: 'sweetness', type: 'single_line_text_field', label: 'Sweetness', allowed: ['1', '2', '3', '4', '5'] },
  sourness: { namespace: 'core', key: 'sourness', type: 'single_line_text_field', label: 'Sourness', allowed: ['1', '2', '3', '4', '5'] },
  servings: { namespace: 'nutrition', key: 'servings', type: 'number_integer', label: 'Servings' },
  serving_size: { namespace: 'nutrition', key: 'serving_size', type: 'single_line_text_field', label: 'Serving Size' },
  calories_per_serving: { namespace: 'nutrition', key: 'calories_per_serving', type: 'number_integer', label: 'Calories Per Serving' },
  caffeine_mg_per_serving: { namespace: 'nutrition', key: 'caffeine_mg_per_serving', type: 'number_integer', label: 'Caffeine MG Per Serving' },
  sugar_g_per_serving: { namespace: 'nutrition', key: 'sugar_g_per_serving', type: 'number_decimal', label: 'Sugar G Per Serving' },
  carbs_g_per_serving: { namespace: 'nutrition', key: 'carbs_g_per_serving', type: 'number_decimal', label: 'Carbs G Per Serving' },
  sodium_mg_per_serving: { namespace: 'nutrition', key: 'sodium_mg_per_serving', type: 'number_integer', label: 'Sodium MG Per Serving' },
  dietary_labels: { namespace: 'nutrition', key: 'dietary_labels', type: 'single_line_text_field', label: 'Dietary Labels' },
  warning_labels: { namespace: 'nutrition', key: 'warning_labels', type: 'single_line_text_field', label: 'Warning Labels' },
  ingredients_label: { namespace: 'custom', key: 'ingredients_label', type: 'single_line_text_field', label: 'Ingredients Label' },
};

function valuePresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function numberString(value, integer = false) {
  const n = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return '';
  return integer ? String(Math.round(n)) : String(Number(n.toFixed(2)));
}

function clampGauge(value) {
  const n = Number(String(value || '').match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(n)) return '';
  return String(Math.max(1, Math.min(5, Math.round(n))));
}

function stringifyList(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 80)).filter(Boolean).join(', ');
  return parseTags(value).join(', ');
}

function buildMetafield(schemaKey, rawValue, source = 'batch-enrichment', confidence = 0) {
  const definition = PRODUCT_IMPORT_PROFILE_SCHEMA[schemaKey];
  if (!definition || !valuePresent(rawValue)) return null;
  let value = rawValue;
  if (definition.allowed) {
    value = clampGauge(rawValue);
    if (!definition.allowed.includes(value)) return null;
  } else if (definition.type === 'number_integer') {
    value = numberString(rawValue, true);
  } else if (definition.type === 'number_decimal') {
    value = numberString(rawValue, false);
  } else if (Array.isArray(rawValue)) {
    value = stringifyList(rawValue);
  } else {
    value = cleanText(rawValue, 5000);
  }
  if (!valuePresent(value)) return null;
  return {
    namespace: definition.namespace,
    key: definition.key,
    type: definition.type,
    value,
    label: definition.label,
    source,
    confidence: Number(confidence || 0),
  };
}

function profileToMetafields(profile = {}) {
  const confidence = Number(profile.confidence || 0);
  const source = cleanText(profile.source || profile.sourceLabel || 'batch-enrichment', 80);
  return normaliseMetafields([
    buildMetafield('product_flavour', profile.productFlavour || profile.product_flavour || profile.flavour, source, confidence),
    buildMetafield('flavour_family', profile.flavourFamily || profile.flavour_family, source, confidence),
    buildMetafield('flavour_profile', profile.flavourProfile || profile.flavour_profile, source, confidence),
    buildMetafield('formula_version', profile.formulaVersion || profile.formula_version, source, confidence),
    buildMetafield('sweetness', profile.sweetness, source, confidence),
    buildMetafield('sourness', profile.sourness, source, confidence),
    buildMetafield('servings', profile.servings, source, confidence),
    buildMetafield('serving_size', profile.servingSize || profile.serving_size, source, confidence),
    buildMetafield('calories_per_serving', profile.caloriesPerServing || profile.calories_per_serving, source, confidence),
    buildMetafield('caffeine_mg_per_serving', profile.caffeineMgPerServing || profile.caffeine_mg_per_serving, source, confidence),
    buildMetafield('sugar_g_per_serving', profile.sugarGPerServing || profile.sugar_g_per_serving, source, confidence),
    buildMetafield('carbs_g_per_serving', profile.carbsGPerServing || profile.carbs_g_per_serving, source, confidence),
    buildMetafield('sodium_mg_per_serving', profile.sodiumMgPerServing || profile.sodium_mg_per_serving, source, confidence),
    buildMetafield('dietary_labels', profile.labels || profile.dietaryLabels || profile.dietary_labels, source, confidence),
    buildMetafield('warning_labels', profile.warnings || profile.warningLabels || profile.warning_labels, source, confidence),
    buildMetafield('ingredients_label', profile.ingredientsLabelImage || profile.ingredients_label_image || profile.supplementLabelImage || profile.supplement_label_image, source, confidence),
  ].filter(Boolean));
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

function applyProfileToDraft(draft = {}, profile = {}) {
  const profileMetafields = profileToMetafields(profile);
  const recommendedTags = Array.from(new Set([
    ...(draft.recommendedTags || []),
    ...parseTags(profile.labels || []),
    ...parseTags(profile.flavourFamily || []),
  ])).slice(0, 40);
  return {
    ...draft,
    recommendedTags,
    metafields: mergeMetafields(draft.metafields || [], profileMetafields),
  };
}

module.exports = { PRODUCT_IMPORT_PROFILE_SCHEMA, profileToMetafields, applyProfileToDraft, mergeMetafields };
