const { cleanText, cleanUrl, makeLineId, safeJsonParse } = require('../utils/safe');

function stripJsonFence(value = '') {
  return String(value || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function normaliseBrand(value = '') {
  const text = cleanText(value || '', 120);
  if (/^g\s*fuel$/i.test(text) || /^gfuel$/i.test(text)) return 'G FUEL';
  if (/advanced\s*gg/i.test(text)) return 'AdvancedGG';
  if (/^z[-\s]*zero$/i.test(text) || /^zzero$/i.test(text)) return 'Z-Zero';
  return text;
}

function sourceSearchUrl(sourceWebsite = '', query = '') {
  const website = cleanUrl(sourceWebsite || '');
  const q = cleanText(query || '', 220);
  if (!website || !q) return '';
  try {
    const parsed = new URL(website);
    return `https://www.google.com/search?q=${encodeURIComponent(`site:${parsed.hostname} ${q}`)}`;
  } catch (_) {
    return '';
  }
}

function inferAdvancedLine(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/sleep|night|relax|rest|dream/.test(lower)) return 'SLEEP';
  if (/hydration|hydrate|electrolyte/.test(lower)) return 'HYDRATION';
  if (/focus|cognition|nootropic|clarity/.test(lower)) return 'FOCUS';
  if (/energy|caffeine|pre[-\s]?workout|performance/.test(lower)) return 'ENERGY';
  return '';
}

function inferZZeroLine(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/hydration|hydrate|electrolyte/.test(lower)) return 'HYDRATION';
  if (/energy|caffeine|boost/.test(lower)) return 'ENERGY';
  return '';
}

function inferGfuelFormula(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/v\s*2|2\.0|new\s*&?\s*improved|energy\s*2/.test(lower)) return 'GF-EN2.0';
  if (/v\s*1|original\s*formula|classic\s*formula|energy\s*formula/.test(lower)) return 'GF-EN';
  if (/hydration|caffeine\s*free/.test(lower)) return 'GF-HY';
  return '';
}

function reviewQuestionsFor({ brand = '', title = '', productLine = '', formulaVersion = '' }) {
  const vendor = normaliseBrand(brand);
  const haystack = `${vendor} ${title} ${productLine} ${formulaVersion}`;
  const questions = [];

  if (/^g\s*fuel$/i.test(vendor)) {
    const formula = formulaVersion || inferGfuelFormula(haystack);
    if (!formula || /^GF-EN$/i.test(formula)) {
      questions.push({
        key: 'formulaVersion',
        label: 'Confirm G FUEL formula',
        help: 'V1/V2 affects ingredient-library matching. Pick V2 for Energy Formula 2.0 / New & Improved tubs.',
        options: ['GF-EN', 'GF-EN2.0', 'GF-HY'],
        required: true,
      });
    }
  }

  if (/advanced\s*gg/i.test(vendor)) {
    const line = productLine || inferAdvancedLine(haystack);
    if (!line) {
      questions.push({
        key: 'productLine',
        label: 'Confirm AdvancedGG line',
        help: 'This controls the ingredients/nutrition library and metafield defaults.',
        options: ['ENERGY', 'FOCUS', 'HYDRATION', 'SLEEP'],
        required: true,
      });
    }
  }

  if (/^z[-\s]*zero$/i.test(vendor)) {
    const line = productLine || inferZZeroLine(haystack);
    if (!line) {
      questions.push({
        key: 'productLine',
        label: 'Confirm Z-Zero line',
        help: 'This controls ingredient-library mapping.',
        options: ['ENERGY', 'HYDRATION'],
        required: true,
      });
    }
  }

  return questions;
}

function fallbackProductsFromNotes({ notes = '', brand = '', sourceWebsite = '', photos = [] }) {
  const rows = String(notes || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const source = cleanUrl(sourceWebsite || '');
  const vendor = normaliseBrand(brand);
  const list = rows.length ? rows : photos.map((photo, index) => cleanText(photo.filename || `Photo product ${index + 1}`, 140));
  return list.slice(0, 80).map((title, index) => buildPhotoItem({
    index,
    title,
    brand: vendor,
    sourceWebsite: source,
    imageDataUrl: photos[index]?.imageDataUrl || '',
    confidence: rows.length ? 0.35 : 0.22,
    reason: rows.length ? 'Created from fallback notes because AI image extraction was unavailable.' : 'Photo queued for manual review because AI image extraction was unavailable.',
  }));
}

function buildPhotoItem({ index = 0, title = '', brand = '', sourceWebsite = '', imageDataUrl = '', confidence = 0.5, productLine = '', formulaVersion = '', reason = '', visibleText = '', suggestedSourceUrl = '' }) {
  const vendor = normaliseBrand(brand);
  const safeTitle = cleanText(title || visibleText || `Photo product ${index + 1}`, 220);
  const searchQuery = cleanText([vendor, safeTitle].filter(Boolean).join(' '), 220);
  const sourceUrl = cleanUrl(suggestedSourceUrl || '');
  const questions = reviewQuestionsFor({ brand: vendor, title: safeTitle, productLine, formulaVersion });
  const requiredValues = {};
  if (formulaVersion) requiredValues.formulaVersion = formulaVersion;
  if (productLine) requiredValues.productLine = productLine;

  return {
    itemId: makeLineId(index),
    sourceType: 'photo',
    sourceUrl,
    sourceWebsite: cleanUrl(sourceWebsite || ''),
    sourceImageDataUrl: String(imageDataUrl || '').slice(0, 1_500_000),
    originalInput: searchQuery || safeTitle,
    title: safeTitle,
    vendor,
    confidence: Number(confidence || 0.5),
    visualEvidence: {
      visibleText: cleanText(visibleText || '', 1500),
      reason: cleanText(reason || 'Read from uploaded product photo.', 500),
      sourceSearchUrl: sourceSearchUrl(sourceWebsite, searchQuery),
      searchQuery,
    },
    requiredChecks: questions,
    draft: {
      source: 'photo',
      sourceUrl,
      title: safeTitle,
      vendor,
      description: '',
      recommendedTags: ['photo-import'].filter(Boolean),
      enrichment: {
        photoImport: true,
        visualEvidence: reason || visibleText || '',
        requiredChecks: questions,
        requiredValues,
      },
    },
    nutrition: {
      formulaVersion: formulaVersion || '',
      groupedProfiles: productLine || '',
      confidence: Number(confidence || 0.5),
      needsReview: Boolean(questions.length),
      source: 'photo-import',
    },
  };
}

function normaliseAiProduct(raw = {}, index = 0, context = {}) {
  const brand = normaliseBrand(raw.brand || raw.vendor || context.brand || '');
  const title = cleanText(raw.title || raw.productTitle || raw.visibleTitle || raw.name || '', 220);
  const productLine = cleanText(raw.productLine || raw.line || raw.range || '', 40).toUpperCase();
  const formulaVersion = cleanText(raw.formulaVersion || raw.formula || '', 40).toUpperCase().replace(/^V1$/i, 'GF-EN').replace(/^V2$/i, 'GF-EN2.0');
  return buildPhotoItem({
    index,
    title,
    brand,
    sourceWebsite: context.sourceWebsite,
    imageDataUrl: context.photos[index]?.imageDataUrl || context.photos[0]?.imageDataUrl || '',
    confidence: Number(raw.confidence || 0.65),
    productLine,
    formulaVersion,
    reason: raw.reason || raw.evidence || raw.description || '',
    visibleText: raw.visibleText || raw.ocrText || '',
    suggestedSourceUrl: raw.sourceUrl || raw.productUrl || raw.url || '',
  });
}

async function extractWithOpenAi({ photos = [], brand = '', sourceWebsite = '', notes = '', defaults = {} }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey || !photos.length) return null;
  const model = process.env.OPENAI_PRODUCT_PHOTO_MODEL || process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const safeBrand = normaliseBrand(brand || defaults.vendor || defaults.brand || defaults.supplierName || '');
  const safeWebsite = cleanUrl(sourceWebsite || defaults.supplierUrl || '');
  const prompt = `Extract products from uploaded merchant product photos/screenshots for a Shopify draft import queue. The merchant has supplied the brand and official/source website so the product can be reviewed and matched against that source.
Return ONLY JSON: { "products": [ ... ] }.
Each product must include: title, brand, visibleText, productLine, formulaVersion, sourceUrl, confidence, reason.
Rules:
- Read the visible product title from the photo. Do not invent a title if it is not visible; use low confidence and explain.
- sourceUrl should only be a visible or extremely clear product URL. Do not fabricate supplier URLs.
- Brand supplied by merchant: ${safeBrand || '(not supplied)'}.
- Source website supplied by merchant: ${safeWebsite || '(not supplied)'}.
- For G FUEL, formulaVersion must be GF-EN for V1/original energy, GF-EN2.0 for Energy Formula 2.0/New & Improved, or GF-HY for Hydration. If unclear, leave formulaVersion blank.
- For AdvancedGG, productLine must be one of ENERGY, FOCUS, HYDRATION, SLEEP. If unclear, leave blank.
- For Z-Zero, productLine must be ENERGY or HYDRATION. If unclear, leave blank.
- Use confidence under 0.7 when the title is partly obscured or the line/formula is inferred.
Notes from merchant: ${cleanText(notes || '', 2000)}`;

  const content = [{ type: 'text', text: prompt }];
  photos.slice(0, 12).forEach((photo) => {
    if (photo.imageDataUrl) content.push({ type: 'image_url', image_url: { url: photo.imageDataUrl } });
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.05,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a careful product-photo extraction engine for Shopify product import. Output valid JSON only.' },
        { role: 'user', content },
      ],
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error?.message || `OpenAI product photo extraction failed (${response.status})`);
    error.status = 502;
    throw error;
  }
  return safeJsonParse(stripJsonFence(json.choices?.[0]?.message?.content || ''));
}

async function extractProductsFromPhotos({ photos = [], brand = '', sourceWebsite = '', notes = '', defaults = {} }) {
  const safePhotos = (Array.isArray(photos) ? photos : []).slice(0, 30).map((photo, index) => ({
    filename: cleanText(photo.filename || `photo-${index + 1}`, 180),
    mimeType: cleanText(photo.mimeType || photo.type || 'image/jpeg', 80),
    imageDataUrl: String(photo.imageDataUrl || '').slice(0, 1_500_000),
  })).filter((photo) => /^data:image\//i.test(photo.imageDataUrl));
  if (!safePhotos.length && cleanText(notes || '', 2000)) return { items: fallbackProductsFromNotes({ notes, brand, sourceWebsite, photos: [] }), extractionError: 'No photos supplied, so products were queued from notes only.' };
  if (!safePhotos.length) return { items: [], extractionError: 'No readable image files were supplied.' };

  let extracted = null;
  let extractionError = '';
  try {
    extracted = await extractWithOpenAi({ photos: safePhotos, brand, sourceWebsite, notes, defaults });
  } catch (error) {
    extractionError = error.message || 'AI product-photo extraction failed.';
  }

  const rawProducts = Array.isArray(extracted?.products) ? extracted.products : [];
  const items = rawProducts.length
    ? rawProducts.slice(0, 80).map((raw, index) => normaliseAiProduct(raw, index, { brand, sourceWebsite, photos: safePhotos }))
    : fallbackProductsFromNotes({ notes, brand, sourceWebsite, photos: safePhotos });
  return { items, extractionError, raw: extracted || null };
}

module.exports = {
  extractProductsFromPhotos,
  reviewQuestionsFor,
  sourceSearchUrl,
};
