const { cleanText, safeJsonParse } = require('../utils/safe');

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function num(value) {
  const match = String(value || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function firstNumber(text, patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match) {
      const n = num(match[1] || match[0]);
      if (n !== null) return n;
    }
  }
  return null;
}

function firstText(text, patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match) return cleanText(match[1] || match[0], 80);
  }
  return '';
}

function inferFlavourFromTitle(title = '') {
  let value = cleanText(title, 140)
    .replace(/\b(g\s*fuel|gfuel|energy formula|hydration formula|hydration|tub|can|cans|collector'?s? box|bundle|powder|drink mix|40 servings?|30 servings?)\b/ig, ' ')
    .replace(/[–—|:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  value = value.replace(/^flavo[u]?r\s*/i, '').trim();
  return cleanText(value || title, 120);
}

function flavourFamilies(text = '') {
  const haystack = String(text || '').toLowerCase();
  const matches = [];
  const families = [
    ['Peach', /peach/], ['Candy', /candy|rings|gummy|bubblegum|sherbet|sour\s*strips/],
    ['Berry', /berry|blueberry|raspberry|strawberry|blackberry/], ['Citrus', /citrus|orange|lemon|lime|grapefruit/],
    ['Tropical', /tropical|pineapple|mango|guava|passion\s*fruit|coconut/], ['Cherry', /cherry/],
    ['Grape', /grape/], ['Apple', /apple/], ['Watermelon', /watermelon/], ['Cola', /cola/],
    ['Lemonade', /lemonade/], ['Tea', /tea/], ['Vanilla', /vanilla/], ['Chocolate', /chocolate/],
  ];
  families.forEach(([label, re]) => { if (re.test(haystack)) matches.push(label); });
  return Array.from(new Set(matches)).slice(0, 6);
}

function inferSweetness(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/sour|tart|citrus|lemon|lime|cranberry/.test(lower) && !/sweet/.test(lower)) return 3;
  if (/candy|gummy|rings|bubblegum|cotton\s*candy|sherbet|vanilla|cola|sweet/.test(lower)) return 4;
  if (/unsweetened|not\s*sweet/.test(lower)) return 1;
  return 3;
}

function inferSourness(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/extreme\s*sour|very\s*sour|super\s*sour/.test(lower)) return 5;
  if (/sour|tart|lemon|lime|citrus|green\s*apple/.test(lower)) return 4;
  if (/peach\s*rings|candy|berry|grape|cola/.test(lower)) return 2;
  return 2;
}

function heuristicProfileFromDraft(draft = {}) {
  const text = cleanText([
    draft.title,
    draft.vendor,
    draft.productType,
    stripHtml(draft.descriptionHtml || draft.description || ''),
    draft.sourceUrl,
    JSON.stringify(draft.raw || {}).slice(0, 2000),
  ].filter(Boolean).join(' '), 12000);
  const title = cleanText(draft.title || '', 220);
  const flavour = inferFlavourFromTitle(title);
  const lower = text.toLowerCase();
  const labels = [];
  const warnings = [];

  if (/sugar\s*free|zero\s*sugar|0g\s*sugar|0\s*g\s*of\s*sugar/i.test(text)) labels.push('Sugar Free');
  if (/caffeine\s*free|zero\s*caffeine|0\s*mg\s*caffeine/i.test(text)) labels.push('Caffeine Free');
  if (/hydration/i.test(text)) labels.push('Hydration');
  if (/vegan/i.test(text)) labels.push('Vegan');
  if (/gluten\s*free/i.test(text)) labels.push('Gluten Free');
  if (/high\s*caffeine|not\s*recommended\s*for\s*children|pregnant|nursing|sensitive\s*to\s*caffeine/i.test(text)) warnings.push('High caffeine content');

  const servings = firstNumber(text, [
    /(?:servings?|serves|serving\s*count)\D{0,25}(\d{1,3})/i,
    /(\d{1,3})\s*(?:servings?|serves)\b/i,
  ]);
  const caffeine = /caffeine\s*free|zero\s*caffeine/i.test(lower) ? 0 : firstNumber(text, [
    /(?:caffeine)\D{0,35}(\d{1,4})\s*mg/i,
    /(\d{1,4})\s*mg\s*(?:of\s*)?caffeine/i,
  ]);
  const sugar = /sugar\s*free|zero\s*sugar/i.test(lower) ? 0 : firstNumber(text, [
    /(?:sugar|sugars)\D{0,25}(\d+(?:\.\d+)?)\s*g/i,
    /(\d+(?:\.\d+)?)\s*g\s*(?:of\s*)?sugar/i,
  ]);
  const calories = firstNumber(text, [
    /(?:calories|kcal)\D{0,25}(\d{1,4})/i,
    /(\d{1,4})\s*(?:calories|kcal)/i,
  ]);
  const servingSize = firstText(text, [
    /(?:serving\s*size)\D{0,25}(\d+(?:\.\d+)?\s*(?:g|grams?|ml|oz|scoop|scoops))/i,
    /(\d+(?:\.\d+)?\s*(?:g|grams?|ml|oz))\s*(?:per\s*serving|serving)/i,
  ]);
  const carbs = firstNumber(text, [/(?:carbohydrates?|carbs)\D{0,25}(\d+(?:\.\d+)?)\s*g/i]);
  const sodium = firstNumber(text, [/(?:sodium)\D{0,25}(\d+(?:\.\d+)?)\s*mg/i]);

  return {
    productFlavour: flavour,
    flavourFamily: flavourFamilies(`${title} ${text}`),
    flavourProfile: flavour ? `${flavour} flavour profile.` : '',
    sweetness: inferSweetness(`${title} ${text}`),
    sourness: inferSourness(`${title} ${text}`),
    servings: servings ?? '',
    servingSize,
    caloriesPerServing: calories ?? '',
    caffeineMgPerServing: caffeine ?? '',
    sugarGPerServing: sugar ?? '',
    carbsGPerServing: carbs ?? '',
    sodiumMgPerServing: sodium ?? '',
    labels,
    warnings,
    confidence: 0.48,
    source: 'heuristic-text-extraction',
    needsReview: true,
  };
}

function mergeProfiles(base = {}, ai = {}) {
  const merged = { ...base };
  Object.entries(ai || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && !value.length) return;
    merged[key] = value;
  });
  merged.confidence = Math.max(Number(base.confidence || 0), Number(ai.confidence || 0));
  merged.needsReview = merged.confidence < 0.86 || Boolean(ai.needsReview || base.needsReview);
  merged.source = ai.source || base.source || 'batch-profile-extraction';
  return merged;
}

function stripJsonFence(value = '') {
  return String(value || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

async function aiProfileFromDraft(draft = {}) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const prompt = `Return ONLY valid JSON for a Shopify drink/consumable product import. Extract or infer conservatively.
Keys: productFlavour, flavourFamily, flavourProfile, sweetness, sourness, servings, servingSize, caloriesPerServing, caffeineMgPerServing, sugarGPerServing, carbsGPerServing, sodiumMgPerServing, labels, warnings, confidence, needsReview, source.
Rules:
- sweetness and sourness are numbers 1-5 only.
- caffeine/calories/servings/sugar must be numeric only when visible or very strongly implied by product line conventions. Otherwise use empty string.
- labels/warnings must be short reusable filter labels.
- Keep confidence under 0.75 when nutrition is inferred rather than explicit.
Product draft: ${JSON.stringify({ title: draft.title, vendor: draft.vendor, productType: draft.productType, sourceUrl: draft.sourceUrl, descriptionHtml: draft.descriptionHtml, raw: draft.raw }).slice(0, 7000)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You extract standardised ecommerce nutrition and flavour profile data. Output JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { error: json.error?.message || `OpenAI profile extraction failed (${response.status})` };
  const parsed = safeJsonParse(stripJsonFence(json.choices?.[0]?.message?.content || '{}'));
  return parsed && typeof parsed === 'object' ? parsed : null;
}

async function extractNutritionAndProductProfile({ draft = {}, useAi = true } = {}) {
  const heuristic = heuristicProfileFromDraft(draft);
  if (!useAi) return heuristic;
  try {
    const ai = await aiProfileFromDraft(draft);
    if (!ai || ai.error) return { ...heuristic, aiError: ai?.error || '' };
    return mergeProfiles(heuristic, ai);
  } catch (error) {
    return { ...heuristic, aiError: error.message || 'AI profile extraction failed' };
  }
}

module.exports = { extractNutritionAndProductProfile, heuristicProfileFromDraft };
