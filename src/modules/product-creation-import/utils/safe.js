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

module.exports = { cleanText, cleanUrl, toMoney, suggestedRetailFromCost, safeJsonParse, makeLineId, normaliseTitle };
