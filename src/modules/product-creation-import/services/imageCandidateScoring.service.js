const { cleanText, cleanUrl, slugify } = require('../utils/safe');

function tokenise(value = '') {
  return cleanText(value, 300)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', 'from', 'product', 'official', 'shop', 'image'].includes(word));
}

function canonicalImageKey(url = '') {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname
      .replace(/_(\d+x\d+|small|medium|large|master|compact|grande)(?=\.)/i, '')
      .replace(/\.(webp|png|jpe?g|gif|avif)$/i, (ext) => ext.toLowerCase());
    return `${parsed.hostname.toLowerCase()}${pathname.toLowerCase()}`;
  } catch (_) {
    return String(url || '').split('?')[0].toLowerCase();
  }
}

function qualityScore(url = '') {
  let score = 0;
  try {
    const parsed = new URL(url);
    const width = Number(parsed.searchParams.get('width') || parsed.searchParams.get('w') || 0);
    const height = Number(parsed.searchParams.get('height') || parsed.searchParams.get('h') || 0);
    if (width) score += Math.min(width / 20, 40);
    if (height) score += Math.min(height / 30, 25);
    if (!width && !height) score += 18;
  } catch (_) {}
  return score;
}

function imageContextScore({ image, title = '', sourceUrl = '', index = 0 }) {
  const src = cleanUrl(image?.src || image?.url || '');
  const alt = cleanText(image?.alt || image?.description || '', 220);
  if (!src) return { score: -100, reason: 'Invalid image URL', rejectReason: 'invalid-url' };

  const haystack = `${src} ${alt}`.toLowerCase();
  const titleTokens = tokenise(title);
  const sourceSlug = (() => {
    try { return slugify(new URL(sourceUrl).pathname.split('/').filter(Boolean).pop() || ''); }
    catch (_) { return ''; }
  })();
  const sourceTokens = tokenise(sourceSlug.replace(/-/g, ' '));
  const wantedTokens = Array.from(new Set([...titleTokens, ...sourceTokens]));

  let score = qualityScore(src);
  const reasons = [];
  const rejects = [];

  if (/cdn\.shopify\.com|cdn\/shop\/products|cdn\/shop\/files|\/products\//i.test(src)) { score += 24; reasons.push('Shopify/product CDN image'); }
  if (/product|gallery|media|main|zoom|packshot|thumbnail|pdp|featured/i.test(haystack)) { score += 22; reasons.push('Product-media context'); }
  if (/og:image|twitter:image|json-ld|structured-data/i.test(String(image?.source || ''))) { score += 25; reasons.push('Structured product image source'); }

  const matchedTokens = wantedTokens.filter((token) => token && haystack.includes(token));
  if (matchedTokens.length) {
    score += Math.min(28, matchedTokens.length * 7);
    reasons.push(`Matches product tokens: ${matchedTokens.slice(0, 5).join(', ')}`);
  }

  if (index === 0) { score += 6; reasons.push('First image candidate'); }
  if (/supplement\s*facts|nutrition\s*facts|nutritional|ingredients?\s*(label|panel|info|facts)|facts\s*panel|serving\s*size|amount\s*per\s*serving|\bSFF\b|[_-]SFF[_.-]|supp[_-]?facts/i.test(haystack)) {
    score -= 55;
    reasons.push('Nutrition/ingredients label candidate');
    rejects.push('supplement-label-metafield');
  }
  if (/logo|icon|sprite|avatar|payment|trust|badge|footer|header|social|facebook|instagram|tiktok|visa|mastercard|klarna|paypal/i.test(haystack)) {
    score -= 120;
    rejects.push('logo/icon/payment/trust/social image');
  }
  if (/collection|recommend|related|upsell|cross-sell|recently-viewed|blog|article|banner|hero/i.test(haystack) && !matchedTokens.length) {
    score -= 45;
    rejects.push('likely collection/banner/related image');
  }
  if (/\.svg(?:[?#]|$)/i.test(src)) {
    score -= 80;
    rejects.push('svg/non-product graphic');
  }

  const rejectReason = rejects[0] || (score < 20 ? 'low-product-confidence' : '');
  return {
    score: Math.round(score),
    reason: reasons.join('; ') || 'Generic image candidate',
    rejectReason,
  };
}

function scoreAndSelectProductImages({ images = [], title = '', sourceUrl = '', maxSelected = 8 }) {
  const bestByKey = new Map();
  (images || []).forEach((raw, index) => {
    const src = cleanUrl(raw?.src || raw?.url || (typeof raw === 'string' ? raw : ''));
    if (!src) return;
    const scored = imageContextScore({ image: raw, title, sourceUrl, index });
    const item = {
      src,
      alt: cleanText(raw?.alt || raw?.description || title || 'Product image', 180),
      score: scored.score,
      reason: scored.reason,
      selected: false,
      rejected: Boolean(scored.rejectReason),
      rejectReason: scored.rejectReason,
      canonicalKey: canonicalImageKey(src),
      source: cleanText(raw?.source || '', 80),
      originalIndex: Number.isFinite(Number(raw?.originalIndex)) ? Number(raw.originalIndex) : index,
    };
    const existing = bestByKey.get(item.canonicalKey);
    if (!existing || item.score > existing.score) {
      bestByKey.set(item.canonicalKey, { ...item, originalIndex: existing?.originalIndex ?? item.originalIndex });
    }
  });

  const candidates = Array.from(bestByKey.values()).sort((a, b) => (a.originalIndex ?? 9999) - (b.originalIndex ?? 9999));
  const selected = candidates.filter((item) => !item.rejected && item.score >= 20).slice(0, Math.max(1, Number(maxSelected) || 8));
  selected.forEach((item) => { item.selected = true; });
  const selectedKeys = new Set(selected.map((item) => item.canonicalKey));
  const rejected = candidates
    .filter((item) => !selectedKeys.has(item.canonicalKey))
    .map((item) => ({ ...item, selected: false, rejected: true, rejectReason: item.rejectReason || 'not-selected-lower-confidence' }));

  return { candidates, selected, rejected };
}

module.exports = { scoreAndSelectProductImages, canonicalImageKey, imageContextScore };
