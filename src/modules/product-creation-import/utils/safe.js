function cleanText(value, limit = 500) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function cleanUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function toMoney(value) {
  const raw = String(value || '').replace(/,/g, '').trim();
  const match = raw.match(/-?\d+(?:\.\d{1,2})?/);
  return match ? Number(match[0]).toFixed(2) : '';
}

function suggestedRetailFromCost(cost) {
  const number = Number(toMoney(cost));
  if (!Number.isFinite(number) || number <= 0) return '';
  return (Math.ceil(number * 2.5) - 0.01).toFixed(2);
}

function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function makeLineId(index) {
  return `line_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function normaliseTitle(value) {
  return cleanText(value, 220).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(value, fallback = 'imported-product') {
  const slug = cleanText(value, 180)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug || fallback;
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map((tag) => cleanText(tag, 80)).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((tag) => cleanText(tag, 80))
    .filter(Boolean);
}

function normaliseMetafield(raw = {}) {
  const namespace = cleanText(raw.namespace || '', 80);
  const key = cleanText(raw.key || '', 80);
  const value = raw.value === undefined || raw.value === null ? '' : String(raw.value);
  if (!namespace || !key || value === '') return null;
  return {
    namespace,
    key,
    type: cleanText(raw.type || 'single_line_text_field', 80) || 'single_line_text_field',
    value: String(value).slice(0, 5000),
    label: cleanText(raw.label || raw.name || '', 120),
    source: cleanText(raw.source || '', 80),
    confidence: Number(raw.confidence || 0),
  };
}

function normaliseMetafields(value) {
  const list = Array.isArray(value) ? value : Object.entries(value || {}).map(([compoundKey, itemValue]) => {
    const [namespace, key] = compoundKey.split('.');
    return { namespace, key, value: itemValue };
  });
  const byKey = new Map();
  list.map(normaliseMetafield).filter(Boolean).forEach((item) => {
    byKey.set(`${item.namespace}.${item.key}`, item);
  });
  return Array.from(byKey.values()).slice(0, 100);
}

module.exports = { cleanText, cleanUrl, toMoney, suggestedRetailFromCost, safeJsonParse, makeLineId, normaliseTitle, slugify, parseTags, normaliseMetafield, normaliseMetafields };
