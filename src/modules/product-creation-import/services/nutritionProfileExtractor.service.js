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

function inferKnownFlavourPhrase(text = '') {
  const haystack = ` ${String(text || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase()} `;
  const known = [
    'orange creamsicle', 'peach rings', 'blue raspberry', 'sour blue chug rug', 'rainbow sherbet',
    'snow cone', 'tropical rain', 'strawberry banana', 'watermelon limeade', 'lemon lime',
    'cherry limeade', 'green apple', 'pink lemonade', 'mango lemonade', 'mango peach',
    'strawberry shortcake', 'cotton candy', 'bubble gum', 'sour cherry', 'sour grape',
    'citrus cream', 'citrus lemonade', 'raspberry iced tea', 'peach iced tea', 'pineapple coconut',
  ];
  const found = known.find((phrase) => haystack.includes(` ${phrase} `));
  if (!found) return '';
  return found.replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferFlavourFromText(title = '', text = '') {
  const explicit = inferKnownFlavourPhrase(`${title} ${text}`);
  if (explicit) return explicit;
  const cleaned = cleanText(text, 5000);
  const patterns = [
    /(?:flavo[u]?r|taste|profile)\D{0,25}([A-Za-z][A-Za-z '&-]{2,50})(?:[.!?\n]|$)/i,
    /(?:orange|peach|mango|blue\s*raspberry|raspberry|strawberry|watermelon|lemon|lime|cherry|grape|apple|cola|vanilla|coconut|pineapple)[A-Za-z\s'&-]{0,35}/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return cleanText(match[1] || match[0], 80).replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return inferFlavourFromTitle(title);
}

function inferFormulaVersion(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/gf[-\s]*en\s*2\.0|gf[-\s]*en2\.0|en\s*2\.0|en2\.0|energy\s*2\.0|2\.0\s*formula|formula\s*2\.0|new\s*&\s*improved\s*energy\s*formula/i.test(lower)) return 'GF-EN2.0';
  if (/hydration\s*formula|gf[-\s]*hy/i.test(lower)) return 'GF-HY';
  if (/energy\s*formula|gf[-\s]*en\b/i.test(lower)) return 'GF-EN';
  return '';
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
  const flavour = inferFlavourFromText(title, text);
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
    formulaVersion: inferFormulaVersion(text),
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
Keys: productFlavour, flavourFamily, flavourProfile, formulaVersion, sweetness, sourness, servings, servingSize, caloriesPerServing, caffeineMgPerServing, sugarGPerServing, carbsGPerServing, sodiumMgPerServing, labels, warnings, supplementLabelImage, ingredientsLabelImage, confidence, needsReview, source.
Rules:
- sweetness and sourness are numbers 1-5 only.
- Use image reading when supplied to extract visible caffeine, calories/kcal, sugar, servings and supplement/ingredients label information.
- caffeine/calories/servings/sugar must be numeric only when visible on the page or visible in supplied images, or extremely standard for the clearly identified product line. Otherwise use empty string.
- If a supplement facts / nutrition facts / ingredients label image is visible, return its URL in supplementLabelImage or ingredientsLabelImage.
- labels/warnings must be short reusable filter labels.
- Keep confidence under 0.75 when nutrition is inferred rather than explicit.
Product draft: ${JSON.stringify({ title: draft.title, vendor: draft.vendor, productType: draft.productType, sourceUrl: draft.sourceUrl, descriptionHtml: draft.descriptionHtml, raw: draft.raw }).slice(0, 7000)}`;

  const images = (Array.isArray(draft.images) ? draft.images : [])
    .map((image) => ({ src: image.src || image.url || '', alt: image.alt || '', role: image.role || '' }))
    .filter((image) => /^https?:\/\//i.test(image.src))
    .slice(0, 10);
  const userContent = [{ type: 'text', text: `${prompt}\nCandidate image URLs for visual extraction: ${JSON.stringify(images).slice(0, 3000)}` }];
  images.forEach((image) => userContent.push({ type: 'image_url', image_url: { url: image.src, detail: 'low' } }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You extract standardised ecommerce nutrition and flavour profile data from text and supplied product images. Output JSON only.' },
        { role: 'user', content: userContent },
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
