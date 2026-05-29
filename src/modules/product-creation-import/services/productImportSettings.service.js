const { ProductCreationImportSettings } = require('../productCreationImport.model');
const { cleanText, slugify, parseTags, normaliseMetafields } = require('../utils/safe');

const DEFAULT_SETTINGS = {
  handleRules: {
    prefix: '',
    suffix: '',
    maxLength: 180,
    separator: '-',
    overwriteExistingHandle: false,
    pattern: '{vendor}-{title}-{format}-{location}',
    format: 'tub',
    location: 'uk',
  },
  defaultCurrency: 'GBP',
  vendorPresets: [],
  imageRules: {
    saveSelectedImagesToFiles: false,
    generateSeoAltText: true,
    dedupeByCanonicalUrl: true,
  },
  skuRules: [
    {
      enabled: true,
      name: 'Example: EN G Fuel tubs',
      vendorContains: 'G Fuel',
      vendorCode: 'GFUEL',
      productLineContains: 'EN',
      lineCode: 'EN',
      tagContains: 'G Fuel',
      metafieldNamespace: 'core',
      metafieldKey: 'formula_version',
      template: '{vendorCode}-{lineCode}-{titleCode}',
      overwriteExistingSku: false,
    },
  ],
  metafieldMappingRules: [],
  conditionalRules: [
    {
      enabled: true,
      name: 'Example: set G Fuel product type from tag',
      whenField: 'tags',
      operator: 'contains',
      value: 'G Fuel',
      actionType: 'set_product_type',
      actionTarget: '',
      actionValue: 'Energy Drink',
    },
  ],
};

function mergeDefaults(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    handleRules: { ...DEFAULT_SETTINGS.handleRules, ...(settings.handleRules || {}) },
    imageRules: { ...DEFAULT_SETTINGS.imageRules, ...(settings.imageRules || {}) },
    skuRules: Array.isArray(settings.skuRules) ? settings.skuRules : DEFAULT_SETTINGS.skuRules,
    conditionalRules: Array.isArray(settings.conditionalRules) ? settings.conditionalRules : DEFAULT_SETTINGS.conditionalRules,
    metafieldMappingRules: Array.isArray(settings.metafieldMappingRules) ? settings.metafieldMappingRules : DEFAULT_SETTINGS.metafieldMappingRules,
    vendorPresets: Array.isArray(settings.vendorPresets) ? settings.vendorPresets : [],
    defaultCurrency: settings.defaultCurrency || DEFAULT_SETTINGS.defaultCurrency,
  };
}

async function getProductImportSettings({ shopDomain }) {
  const existing = await ProductCreationImportSettings.findOne({ shopDomain }).lean();
  if (!existing) return mergeDefaults({ shopDomain });
  return mergeDefaults(existing);
}

function cleanRuleList(list = [], limit = 60) {
  return (Array.isArray(list) ? list : []).slice(0, limit).map((rule) => ({
    ...rule,
    name: cleanText(rule.name || '', 120),
    vendorContains: cleanText(rule.vendorContains || '', 120),
    vendorCode: cleanText(rule.vendorCode || '', 40).toUpperCase(),
    productLineContains: cleanText(rule.productLineContains || '', 120),
    lineCode: cleanText(rule.lineCode || '', 40).toUpperCase(),
    tagContains: cleanText(rule.tagContains || '', 120),
    metafieldNamespace: cleanText(rule.metafieldNamespace || 'core', 80),
    metafieldKey: cleanText(rule.metafieldKey || 'formula_version', 80),
    template: cleanText(rule.template || '{vendorCode}-{lineCode}-{titleCode}', 180),
    overwriteExistingSku: Boolean(rule.overwriteExistingSku),
    enabled: rule.enabled !== false,
  }));
}

function cleanConditionalRules(list = []) {
  return (Array.isArray(list) ? list : []).slice(0, 80).map((rule) => ({
    enabled: rule.enabled !== false,
    name: cleanText(rule.name || '', 120),
    whenField: cleanText(rule.whenField || 'title', 120),
    operator: ['contains', 'equals', 'starts_with', 'ends_with', 'exists'].includes(rule.operator) ? rule.operator : 'contains',
    value: cleanText(rule.value || '', 220),
    actionType: ['add_tag', 'set_product_type', 'set_vendor', 'set_metafield', 'title_prefix', 'title_suffix'].includes(rule.actionType) ? rule.actionType : 'add_tag',
    actionTarget: cleanText(rule.actionTarget || '', 180),
    actionValue: cleanText(rule.actionValue || '', 500),
  }));
}


function cleanMetafieldMappingRules(list = []) {
  return (Array.isArray(list) ? list : []).slice(0, 150).map((rule) => ({
    enabled: rule.enabled !== false,
    name: cleanText(rule.name || '', 120),
    vendorContains: cleanText(rule.vendorContains || '', 120),
    productTypeContains: cleanText(rule.productTypeContains || '', 120),
    tagContains: cleanText(rule.tagContains || '', 120),
    titleContains: cleanText(rule.titleContains || '', 120),
    target: cleanText(rule.target || '', 180),
    mode: ['fixed', 'ai', 'copy_from_similar'].includes(rule.mode) ? rule.mode : 'fixed',
    value: cleanText(rule.value || '', 800),
  })).filter((rule) => rule.target || rule.mode === 'ai' || rule.value);
}

async function saveProductImportSettings({ shopDomain, settings = {} }) {
  const payload = mergeDefaults(settings);
  const clean = {
    shopDomain,
    handleRules: {
      prefix: cleanText(payload.handleRules.prefix || '', 80),
      suffix: cleanText(payload.handleRules.suffix || '', 80),
      pattern: cleanText(payload.handleRules.pattern || '{vendor}-{title}-{format}-{location}', 180),
      format: cleanText(payload.handleRules.format || '', 80),
      location: cleanText(payload.handleRules.location || '', 80),
      maxLength: Math.max(40, Math.min(Number(payload.handleRules.maxLength) || 180, 240)),
      separator: cleanText(payload.handleRules.separator || '-', 4) || '-',
      overwriteExistingHandle: Boolean(payload.handleRules.overwriteExistingHandle),
    },
    defaultCurrency: cleanText(payload.defaultCurrency || 'GBP', 10).toUpperCase(),
    imageRules: {
      saveSelectedImagesToFiles: Boolean(payload.imageRules?.saveSelectedImagesToFiles),
      generateSeoAltText: payload.imageRules?.generateSeoAltText !== false,
      dedupeByCanonicalUrl: payload.imageRules?.dedupeByCanonicalUrl !== false,
    },
    vendorPresets: Array.from(new Set((payload.vendorPresets || []).map((item) => cleanText(item, 120)).filter(Boolean))).slice(0, 200),
    skuRules: cleanRuleList(payload.skuRules),
    conditionalRules: cleanConditionalRules(payload.conditionalRules),
    metafieldMappingRules: cleanMetafieldMappingRules(payload.metafieldMappingRules),
  };
  const doc = await ProductCreationImportSettings.findOneAndUpdate({ shopDomain }, { $set: clean }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  return mergeDefaults(doc);
}

function getMetafieldValue(draft = {}, namespace = '', key = '') {
  const found = (draft.metafields || []).find((item) => String(item.namespace || '').toLowerCase() === String(namespace).toLowerCase() && String(item.key || '').toLowerCase() === String(key).toLowerCase());
  return found?.value || '';
}

function fieldValue(draft = {}, field = '') {
  if (field.startsWith('metafield:')) {
    const [, compound] = field.split(':');
    const [namespace, key] = String(compound || '').split('.');
    return getMetafieldValue(draft, namespace, key);
  }
  if (field === 'tags') return parseTags(draft.tags).join(', ');
  if (field === 'productType') return draft.productType || '';
  return draft[field] || '';
}

function matchesRuleValue(actual = '', operator = 'contains', expected = '') {
  const a = String(actual || '').toLowerCase();
  const e = String(expected || '').toLowerCase();
  if (operator === 'exists') return Boolean(a.trim());
  if (!e) return false;
  if (operator === 'equals') return a.trim() === e.trim();
  if (operator === 'starts_with') return a.trim().startsWith(e.trim());
  if (operator === 'ends_with') return a.trim().endsWith(e.trim());
  return a.includes(e);
}

function titleCode(title = '') {
  const words = cleanText(title, 120).split(/\s+/).filter(Boolean).filter((word) => !/^(the|and|with|for|of|a|an)$/i.test(word));
  const code = words.slice(0, 4).map((word) => word.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()).filter(Boolean).join('');
  return code || 'ITEM';
}

function codeFrom(value = '', length = 6) {
  const code = cleanText(value, 80).replace(/[^a-z0-9]/gi, '').toUpperCase();
  return code.slice(0, length) || 'GEN';
}

function applyHandleRules(draft = {}, settings = {}) {
  const rules = settings.handleRules || DEFAULT_SETTINGS.handleRules;
  if (draft.handle && !rules.overwriteExistingHandle) return draft.handle;
  const separator = rules.separator || '-';
  const maxLength = Math.max(40, Math.min(Number(rules.maxLength) || 180, 240));
  const tokens = {
    prefix: rules.prefix || '',
    suffix: rules.suffix || '',
    vendor: draft.vendor || '',
    title: draft.title || '',
    name: draft.title || '',
    format: draft.handleFormat || rules.format || '',
    location: draft.handleLocation || rules.location || '',
    productType: draft.productType || '',
  };
  const pattern = rules.pattern || '{vendor}-{title}-{format}-{location}';
  const raw = pattern.replace(/\{(prefix|suffix|vendor|title|name|format|location|productType)\}/g, (_, key) => tokens[key] || '').replace(/[-_\s]+/g, ' ');
  let handle = slugify(raw).replace(/-/g, separator === '-' ? '-' : separator);
  if (handle.length > maxLength) handle = handle.slice(0, maxLength).replace(new RegExp(`${separator}+$`), '');
  return handle || draft.handle || slugify(draft.title || 'imported-product');
}

function applyConditionalRules(draft = {}, settings = {}) {
  const next = { ...draft, tags: parseTags(draft.tags), metafields: normaliseMetafields(draft.metafields || []) };
  for (const rule of settings.conditionalRules || []) {
    if (rule.enabled === false) continue;
    const actual = fieldValue(next, rule.whenField);
    if (!matchesRuleValue(actual, rule.operator, rule.value)) continue;
    if (rule.actionType === 'add_tag' && rule.actionValue) {
      next.tags = Array.from(new Set([...next.tags, rule.actionValue]));
    } else if (rule.actionType === 'set_product_type' && rule.actionValue) {
      next.productType = rule.actionValue;
    } else if (rule.actionType === 'set_vendor' && rule.actionValue) {
      next.vendor = rule.actionValue;
    } else if (rule.actionType === 'title_prefix' && rule.actionValue && !String(next.title || '').startsWith(rule.actionValue)) {
      next.title = `${rule.actionValue} ${next.title || ''}`.trim();
    } else if (rule.actionType === 'title_suffix' && rule.actionValue && !String(next.title || '').endsWith(rule.actionValue)) {
      next.title = `${next.title || ''} ${rule.actionValue}`.trim();
    } else if (rule.actionType === 'set_metafield' && rule.actionTarget && rule.actionValue) {
      const [namespace, key] = String(rule.actionTarget).split('.');
      if (namespace && key) {
        next.metafields = normaliseMetafields([...next.metafields, { namespace, key, value: rule.actionValue, type: 'single_line_text_field', source: 'conditional-rule' }]);
      }
    }
  }
  return next;
}

function applySkuRules(draft = {}, settings = {}) {
  const rules = settings.skuRules || [];
  let sku = draft.sku || '';
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (sku && !rule.overwriteExistingSku) continue;
    const vendorHit = !rule.vendorContains || String(draft.vendor || '').toLowerCase().includes(String(rule.vendorContains).toLowerCase());
    const tagHit = !rule.tagContains || parseTags(draft.tags).join(', ').toLowerCase().includes(String(rule.tagContains).toLowerCase());
    const metaValue = getMetafieldValue(draft, rule.metafieldNamespace || 'core', rule.metafieldKey || 'formula_version');
    const lineHaystack = [draft.productType, metaValue, parseTags(draft.tags).join(', ')].join(' ').toLowerCase();
    const lineHit = !rule.productLineContains || lineHaystack.includes(String(rule.productLineContains).toLowerCase());
    if (!vendorHit || !tagHit || !lineHit) continue;
    const vendorCode = rule.vendorCode || codeFrom(draft.vendor, 8);
    const lineCode = rule.lineCode || codeFrom(rule.productLineContains || metaValue || draft.productType, 8);
    const generated = String(rule.template || '{vendorCode}-{lineCode}-{titleCode}')
      .replaceAll('{vendorCode}', vendorCode)
      .replaceAll('{lineCode}', lineCode)
      .replaceAll('{productLine}', lineCode)
      .replaceAll('{titleCode}', titleCode(draft.title))
      .replaceAll('{handle}', draft.handle || slugify(draft.title || 'item'))
      .replaceAll('{vendor}', codeFrom(draft.vendor, 12))
      .replaceAll('{metafield}', codeFrom(metaValue, 12))
      .replace(/[^A-Z0-9_-]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .toUpperCase();
    if (generated) sku = generated.slice(0, 80);
  }
  return sku;
}


function ruleMatchesDraft(rule = {}, draft = {}) {
  const tags = parseTags(draft.tags).join(', ').toLowerCase();
  const checks = [
    [rule.vendorContains, draft.vendor],
    [rule.productTypeContains, draft.productType],
    [rule.tagContains, tags],
    [rule.titleContains, draft.title],
  ];
  return checks.every(([needle, haystack]) => !needle || String(haystack || '').toLowerCase().includes(String(needle).toLowerCase()));
}

function applyMetafieldMappingRules(draft = {}, settings = {}) {
  const next = { ...draft, metafields: normaliseMetafields(draft.metafields || []) };
  for (const rule of settings.metafieldMappingRules || []) {
    if (rule.enabled === false || !ruleMatchesDraft(rule, next)) continue;
    if (rule.mode !== 'fixed' || !rule.target || !rule.value) continue;
    const [namespace, key] = String(rule.target || '').split('.');
    if (namespace && key) next.metafields = normaliseMetafields([...next.metafields, { namespace, key, value: rule.value, type: 'single_line_text_field', source: 'metafield-mapping-rule', confidence: 1 }]);
  }
  return next;
}

function applySettingsToDraft(draft = {}, settings = {}) {
  let next = applyConditionalRules({ ...draft }, mergeDefaults(settings));
  next = applyMetafieldMappingRules(next, mergeDefaults(settings));
  next.handle = applyHandleRules(next, settings);
  next.sku = applySkuRules(next, settings);
  return next;
}

module.exports = { DEFAULT_SETTINGS, getProductImportSettings, saveProductImportSettings, applySettingsToDraft };
