const { cleanText, cleanUrl, safeJsonParse } = require('../utils/safe');
const { canonicalImageKey } = require('./imageCandidateScoring.service');

function stripJsonFence(value = '') {
  return String(value || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function imageRoleFromText(image = {}) {
  const haystack = [image.src, image.alt, image.reason, image.source, image.rejectReason]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/supplement\s*facts|nutrition\s*facts|nutritional|ingredients?\s*(label|panel|info|facts)|label\s*(image|panel)|facts\s*panel|back\s*label|serving\s*size|amount\s*per\s*serving/i.test(haystack)) {
    return { role: 'supplement_label', confidence: 0.82, reason: 'Looks like a supplement/nutrition/ingredients label image.' };
  }
  if (/lifestyle|fitness|gaming|study|work|person|model|ugc|influencer|holding|drinking/i.test(haystack)) {
    return { role: 'lifestyle', confidence: 0.62, reason: 'Looks like lifestyle/usage media.' };
  }
  if (/compare|benefit|new\s*formula|formula|caffeine|zero\s*sugar|calories|kcal|servings|feature|infographic/i.test(haystack)) {
    return { role: 'infographic', confidence: 0.65, reason: 'Looks like product benefit/feature media.' };
  }
  return { role: 'product_image', confidence: 0.55, reason: 'Default product media role.' };
}

function normaliseRole(value = '') {
  const role = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['supplement_label', 'supplement_facts', 'nutrition_label', 'nutrition_facts', 'ingredients_label', 'ingredients_panel', 'label'].includes(role)) return 'supplement_label';
  if (['lifestyle', 'ugc', 'model', 'use_case'].includes(role)) return 'lifestyle';
  if (['infographic', 'benefits', 'comparison', 'feature_card', 'formula_card'].includes(role)) return 'infographic';
  if (['logo', 'icon', 'badge', 'trust_badge'].includes(role)) return 'logo_or_badge';
  return 'product_image';
}

async function aiClassifyImageRoles({ title = '', sourceUrl = '', images = [] }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey || !images.length) return [];
  const model = process.env.OPENAI_PRODUCT_IMPORT_VISION_MODEL || process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const indexed = images.slice(0, 12).map((image, index) => ({
    index,
    src: cleanUrl(image.src || image.url || ''),
    alt: cleanText(image.alt || '', 180),
    reason: cleanText(image.reason || image.rejectReason || '', 220),
  })).filter((image) => image.src);
  if (!indexed.length) return [];

  const prompt = `Classify Shopify product import images. Return ONLY JSON: {"images":[{"index":0,"role":"product_image|infographic|lifestyle|supplement_label|logo_or_badge","confidence":0.0,"reason":"short"}]}.

Important rules:
- A supplement facts / nutrition facts / ingredients label image must be role "supplement_label" and must NOT be treated as normal product media.
- Product packshots, tub renders, box renders and product benefit cards can stay as product_image or infographic.
- Lifestyle/person images are lifestyle.
- Logo/icon/payment/trust images are logo_or_badge.

Product title: ${cleanText(title, 220)}
Source URL: ${cleanText(sourceUrl, 500)}
Indexed candidates: ${JSON.stringify(indexed.map((item) => ({ index: item.index, src: item.src, alt: item.alt, reason: item.reason }))).slice(0, 5000)}`;

  const content = [{ type: 'text', text: prompt }];
  indexed.forEach((image) => {
    content.push({ type: 'image_url', image_url: { url: image.src, detail: 'low' } });
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.05,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You classify ecommerce product images for a Shopify importer. Output JSON only.' },
        { role: 'user', content },
      ],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const parsed = safeJsonParse(stripJsonFence(json.choices?.[0]?.message?.content || '{}')) || {};
  return Array.isArray(parsed.images) ? parsed.images : [];
}

function decorateRoles(images = [], roleHints = []) {
  const byIndex = new Map();
  (roleHints || []).forEach((hint) => {
    const index = Number(hint.index);
    if (Number.isFinite(index)) byIndex.set(index, hint);
  });
  return (images || []).map((image, index) => {
    const heuristic = imageRoleFromText(image);
    const ai = byIndex.get(index);
    const aiRole = ai ? normaliseRole(ai.role) : '';
    const aiConfidence = Number(ai?.confidence || 0);
    const role = aiRole && aiConfidence >= 0.55 ? aiRole : heuristic.role;
    const confidence = aiRole && aiConfidence >= 0.55 ? aiConfidence : heuristic.confidence;
    const roleReason = cleanText(ai?.reason || heuristic.reason || '', 240);
    return { ...image, role, roleConfidence: confidence, roleReason };
  });
}

function applyRoleSelection({ imagePlan = {}, roleHints = [] }) {
  const candidates = decorateRoles(imagePlan.candidates || [], roleHints);
  const byKey = new Map(candidates.map((image) => [image.canonicalKey || canonicalImageKey(image.src || ''), image]));
  const isSupplement = (image = {}) => image.role === 'supplement_label';
  const isJunk = (image = {}) => image.role === 'logo_or_badge';

  const selected = (imagePlan.selected || [])
    .map((image) => byKey.get(image.canonicalKey || canonicalImageKey(image.src || '')) || image)
    .filter((image) => !isSupplement(image) && !isJunk(image))
    .map((image) => ({ ...image, selected: true, rejected: false, rejectReason: '' }));

  if (!selected.length) {
    candidates.filter((image) => !isSupplement(image) && !isJunk(image) && !image.rejected && image.score >= 20).slice(0, 8).forEach((image) => {
      selected.push({ ...image, selected: true, rejected: false, rejectReason: '' });
    });
  }

  const selectedKeys = new Set(selected.map((image) => image.canonicalKey || canonicalImageKey(image.src || '')));
  const supplementLabelImages = candidates
    .filter(isSupplement)
    .map((image) => ({ ...image, selected: false, rejected: true, rejectReason: 'supplement-label-metafield' }))
    .slice(0, 8);
  const supplementKeys = new Set(supplementLabelImages.map((image) => image.canonicalKey || canonicalImageKey(image.src || '')));

  const rejected = candidates
    .filter((image) => !selectedKeys.has(image.canonicalKey || canonicalImageKey(image.src || '')) && !supplementKeys.has(image.canonicalKey || canonicalImageKey(image.src || '')))
    .map((image) => ({ ...image, selected: false, rejected: true, rejectReason: image.rejectReason || (isJunk(image) ? 'logo-or-badge' : 'not-selected-lower-confidence') }));

  return { candidates, selected, rejected, supplementLabelImages };
}

async function refineImagePlanWithAi({ imagePlan = {}, title = '', sourceUrl = '', useAi = true } = {}) {
  const fallback = applyRoleSelection({ imagePlan, roleHints: [] });
  if (!useAi) return fallback;
  try {
    const hints = await aiClassifyImageRoles({ title, sourceUrl, images: imagePlan.candidates || [] });
    if (!hints.length) return fallback;
    return applyRoleSelection({ imagePlan, roleHints: hints });
  } catch (_) {
    return fallback;
  }
}

module.exports = { refineImagePlanWithAi, imageRoleFromText, applyRoleSelection };
