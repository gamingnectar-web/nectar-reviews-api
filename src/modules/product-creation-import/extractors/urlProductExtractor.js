const { cleanText, cleanUrl, safeJsonParse, toMoney } = require('../utils/safe');
const { normaliseDraftProduct } = require('../services/normaliseProduct.service');

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absolutizeUrl(url = '', base = '') {
  const cleaned = cleanUrl(url);
  if (cleaned) return cleaned;
  try { return new URL(String(url || '').trim(), base).toString(); }
  catch (_) { return ''; }
}

function metaContents(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const results = [];
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'ig'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'ig'),
  ];
  patterns.forEach((re) => {
    let match;
    while ((match = re.exec(String(html || '')))) results.push(decodeEntities(match[1] || ''));
  });
  return results.filter(Boolean);
}

function metaContent(html, selector) { return metaContents(html, selector)[0] || ''; }

function tagText(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
  return decodeEntities(String((html.match(re) || [])[1] || '').replace(/<[^>]+>/g, ' '));
}

function flattenJsonLd(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    value.forEach((item) => flattenJsonLd(item, out));
    return out;
  }
  if (typeof value === 'object') {
    out.push(value);
    if (Array.isArray(value['@graph'])) value['@graph'].forEach((item) => flattenJsonLd(item, out));
    if (value.mainEntity) flattenJsonLd(value.mainEntity, out);
  }
  return out;
}

function getJsonLdProductCandidates(html) {
  const blocks = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const products = [];
  for (const block of blocks) {
    const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    const parsed = safeJsonParse(raw);
    flattenJsonLd(parsed).forEach((item) => {
      const type = Array.isArray(item?.['@type']) ? item['@type'].join(' ') : String(item?.['@type'] || '');
      if (/product/i.test(type)) products.push(item);
    });
  }
  return products;
}

function tokenizeProductText(value = '') {
  return cleanText(value, 400)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['the','and','for','with','from','product','products','shop','gamer','drink','official'].includes(word));
}

function urlSlugText(sourceUrl = '') {
  try {
    const parsed = new URL(sourceUrl);
    const bits = parsed.pathname.split('/').filter(Boolean);
    return bits[bits.length - 1] || '';
  } catch (_) {
    return '';
  }
}

function titleSimilarityScore(candidateTitle = '', hints = []) {
  const candidateTokens = new Set(tokenizeProductText(candidateTitle));
  if (!candidateTokens.size) return 0;
  let best = 0;
  hints.forEach((hint) => {
    const hintTokens = tokenizeProductText(hint);
    if (!hintTokens.length) return;
    const overlap = hintTokens.filter((token) => candidateTokens.has(token)).length;
    best = Math.max(best, overlap / Math.max(hintTokens.length, 1));
  });
  return best;
}

function productUrlMatchesSource(product = {}, sourceUrl = '') {
  const productUrls = [product.url, product['@id'], product.offers?.url]
    .concat(Array.isArray(product.offers) ? product.offers.map((offer) => offer?.url) : [])
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (!productUrls.length || !sourceUrl) return false;
  const source = String(sourceUrl).toLowerCase().split('?')[0].replace(/\/$/, '');
  const slug = urlSlugText(sourceUrl).toLowerCase();
  return productUrls.some((url) => {
    const clean = url.split('?')[0].replace(/\/$/, '');
    return clean === source || clean.includes(slug) || source.includes(clean);
  });
}

function findBestProductJsonLd(html, sourceUrl = '') {
  const candidates = getJsonLdProductCandidates(html);
  if (!candidates.length) return { product: {}, score: 0, candidates: 0 };
  const pageHints = [
    urlSlugText(sourceUrl),
    metaContent(html, 'og:title'),
    metaContent(html, 'twitter:title'),
    tagText(html, 'h1'),
    tagText(html, 'title'),
  ].filter(Boolean);

  const scored = candidates.map((product, index) => {
    const name = cleanText(product.name || product.headline || '', 220);
    let score = titleSimilarityScore(name, pageHints);
    if (productUrlMatchesSource(product, sourceUrl)) score += 2;
    if (imageFromJsonLd(product.image, sourceUrl).length) score += 0.15;
    if (product.offers) score += 0.1;
    return { product, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const best = scored[0] || { product: {}, score: 0 };
  // Avoid taking SEO/title/description from unrelated related-product JSON-LD blocks.
  // Some supplier pages include many Product objects for recommendations; using the first
  // one caused lunch boxes to inherit unrelated tub SEO.
  if (best.score < 0.35 && candidates.length > 1) return { product: {}, score: best.score, candidates: candidates.length };
  return { product: best.product || {}, score: best.score, candidates: candidates.length };
}

function firstOffer(offers) {
  if (!offers) return {};
  if (Array.isArray(offers)) return offers[0] || {};
  if (Array.isArray(offers.offers)) return offers.offers[0] || {};
  return offers;
}

function imageFromJsonLd(value, baseUrl) {
  if (!value) return [];
  if (typeof value === 'string') {
    const src = absolutizeUrl(value, baseUrl);
    return src ? [{ src, alt: '', source: 'json-ld-product-image' }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => imageFromJsonLd(item, baseUrl));
  if (typeof value === 'object') {
    return [value.url, value.contentUrl, value.src].map((item) => absolutizeUrl(item, baseUrl)).filter(Boolean).map((src) => ({ src, alt: cleanText(value.caption || value.name || value.alt || '', 180), source: 'json-ld-product-image' }));
  }
  return [];
}

function isProbablyImageUrl(url = '') {
  const raw = String(url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  const lower = raw.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(lower)) return true;
  if (/cdn\/shop\/products|cdn\/shop\/files|cdn\.shopify\.com|images?|media/i.test(lower) && !/\/products\/[^/?#]+(?:[?#]|$)/i.test(lower)) return true;
  return false;
}

function canonicalImageKey(url = '') {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/_(\d+x\d+|small|medium|large|master)(?=\.)/i, '');
    return `${parsed.hostname.toLowerCase()}${pathname.toLowerCase()}`;
  } catch (_) {
    return String(url || '').split('?')[0].toLowerCase();
  }
}

function imageQualityScore(item = {}) {
  const src = typeof item === 'string' ? item : item.src;
  let score = 0;
  try {
    const parsed = new URL(src);
    ['width','w'].forEach((key) => { const n = Number(parsed.searchParams.get(key) || 0); if (n) score += n; });
    ['height','h'].forEach((key) => { const n = Number(parsed.searchParams.get(key) || 0); if (n) score += Math.round(n / 2); });
    if (!parsed.searchParams.has('width') && !parsed.searchParams.has('w')) score += 5000;
  } catch (_) {}
  if (/cdn\/shop\/products|product|gallery|media/i.test(src || '')) score += 1000;
  if (/logo|icon|sprite|avatar|payment|trust|badge/i.test(src || '')) score -= 10000;
  return score;
}

function dedupeImageCandidates(items = []) {
  const best = new Map();
  for (const raw of items || []) {
    const item = typeof raw === 'string' ? { src: raw, alt: '' } : { src: raw.src || raw.url || '', alt: raw.alt || '' };
    if (!isProbablyImageUrl(item.src)) continue;
    const key = canonicalImageKey(item.src);
    const current = best.get(key);
    if (!current || imageQualityScore(item) > imageQualityScore(current)) best.set(key, item);
  }
  return Array.from(best.values()).sort((a, b) => imageQualityScore(b) - imageQualityScore(a)).slice(0, 50);
}


function htmlToText(html = '') {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractBarcodeFromText(text = '') {
  const source = String(text || '');
  const labelled = source.match(/(?:barcode|bar code|ean|gtin|upc)\D{0,30}(\d{8,14})/i);
  if (labelled) return labelled[1];
  return '';
}

function extractWeightFromAny(product = {}, text = '') {
  const candidates = [];
  const add = (weight, unit, source) => {
    const raw = String(weight || '').trim();
    const num = (raw.match(/\d+(?:\.\d{1,3})?/) || [])[0];
    if (!num) return;
    const normalUnit = String(unit || '').toLowerCase().replace(/grams?/, 'g').replace(/kilograms?/, 'kg').replace(/ounces?/, 'oz').replace(/pounds?|lbs?/, 'lb');
    candidates.push({ weight: String(Number(num)), weightUnit: ['g','kg','oz','lb'].includes(normalUnit) ? normalUnit : 'g', source });
  };
  if (product.weight) {
    if (typeof product.weight === 'object') add(product.weight.value || product.weight.amount, product.weight.unitCode || product.weight.unitText || product.weight.unit, 'json-ld-weight');
    else {
      const m = String(product.weight).match(/(\d+(?:\.\d{1,3})?)\s*(kg|g|grams?|oz|ounces?|lb|lbs|pounds?)/i);
      if (m) add(m[1], m[2], 'json-ld-weight');
    }
  }
  const props = Array.isArray(product.additionalProperty) ? product.additionalProperty : [];
  props.forEach((prop) => {
    const name = String(prop.name || prop.propertyID || '').toLowerCase();
    if (name.includes('weight') || name.includes('net wt')) {
      const m = String(prop.value || '').match(/(\d+(?:\.\d{1,3})?)\s*(kg|g|grams?|oz|ounces?|lb|lbs|pounds?)/i);
      if (m) add(m[1], m[2], 'json-ld-additional-property');
    }
  });
  const m = String(text || '').match(/(?:net\s*wt\.?|net\s*weight|weight|product\s*weight|shipping\s*weight)\D{0,35}(\d+(?:\.\d{1,3})?)\s*(kg|g|grams?|oz|ounces?|lb|lbs|pounds?)/i)
    || String(text || '').match(/(\d+(?:\.\d{1,3})?)\s*(kg|g|grams?|oz|ounces?|lb|lbs|pounds?)\s*(?:net\s*wt\.?|net\s*weight|tub|powder|drink|product)/i);
  if (m) add(m[1], m[2], 'page-text');
  return candidates[0] || { weight: '', weightUnit: 'g', source: '' };
}

function extractHtmlImageCandidates(html, baseUrl) {
  const images = [];
  const metaSelectors = ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'product:image'];
  metaSelectors.forEach((selector) => metaContents(html, selector).forEach((url) => {
    const src = absolutizeUrl(url, baseUrl);
    if (src) images.push({ src, alt: '', source: selector });
  }));

  const imgRe = /<img\b[^>]*(?:src|data-src|data-original|data-zoom-image|data-image)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRe.exec(String(html || '')))) {
    const tag = match[0] || '';
    const src = absolutizeUrl(match[1], baseUrl);
    const alt = (tag.match(/alt=["']([^"']*)["']/i) || [])[1] || '';
    const cls = (tag.match(/class=["']([^"']*)["']/i) || [])[1] || '';
    const scoreText = `${src} ${alt} ${cls}`.toLowerCase();
    const isLikelyProduct = /(product|gallery|media|main|zoom|packshot|thumbnail|image)/i.test(scoreText);
    if (src && isLikelyProduct && !/logo|icon|sprite|avatar|payment|trust|badge/i.test(scoreText)) images.push({ src, alt: cleanText(alt, 180), source: cleanText(cls || 'img-tag', 80) });
  }

  const srcsetRe = /(?:srcset|data-srcset)=["']([^"']+)["']/gi;
  while ((match = srcsetRe.exec(String(html || '')))) {
    String(match[1] || '').split(',').forEach((part) => {
      const url = part.trim().split(/\s+/)[0];
      const absolute = absolutizeUrl(url, baseUrl);
      if (absolute) images.push({ src: absolute, alt: '', source: 'srcset' });
    });
  }

  return dedupeImageCandidates(images).slice(0, 60);
}

async function extractProductFromUrl(url) {
  const sourceUrl = cleanUrl(url);
  if (!sourceUrl) {
    const error = new Error('Enter a valid public http/https product URL.');
    error.status = 400;
    throw error;
  }

  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 NectarProductImporter/1.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
    },
  });

  if (!response.ok) {
    const error = new Error(`Could not load that URL (${response.status}).`);
    error.status = 400;
    throw error;
  }

  const html = await response.text();
  const productMatch = findBestProductJsonLd(html, sourceUrl);
  const product = productMatch.product || {};
  const pageText = htmlToText(html);
  const offer = firstOffer(product.offers);
  const brand = typeof product.brand === 'object' ? product.brand?.name : product.brand;
  const pageTitle = cleanText(metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || tagText(html, 'h1') || tagText(html, 'title'), 220);
  const productTitle = cleanText(product.name || '', 220);
  const title = cleanText(productTitle || pageTitle || urlSlugText(sourceUrl).replace(/-/g, ' '), 220);
  const description = cleanText(product.description || metaContent(html, 'og:description') || metaContent(html, 'description') || '', 5000);
  const imageCandidates = dedupeImageCandidates([
    ...imageFromJsonLd(product.image, sourceUrl),
    ...extractHtmlImageCandidates(html, sourceUrl),
  ]).map((image, index) => ({
    src: image.src,
    alt: cleanText(image.alt || `${title || 'Product'} image ${index + 1}`, 180),
  }));
  const weightInfo = extractWeightFromAny(product, pageText);
  const extractedBarcode = product.gtin13 || product.gtin14 || product.gtin12 || product.gtin8 || product.gtin || extractBarcodeFromText(pageText) || '';

  const draft = normaliseDraftProduct({
    source: 'url',
    sourceUrl,
    title,
    description,
    vendor: brand,
    price: toMoney(offer.price || metaContent(html, 'product:price:amount')),
    compareAtPrice: toMoney(offer.highPrice || offer.compareAtPrice || metaContent(html, 'product:price:compare_at_amount')),
    sku: product.sku || product.mpn || '',
    barcode: extractedBarcode,
    weight: weightInfo.weight,
    weightUnit: weightInfo.weightUnit,
    images: imageCandidates,
    tags: ['url-import'],
    seo: { title, description },
  });

  return {
    ...draft,
    confidence: product.name ? 0.86 : (title ? 0.55 : 0.25),
    rawExtract: { jsonLdProductFound: Boolean(product.name), jsonLdCandidateCount: productMatch.candidates || 0, jsonLdMatchScore: Number(productMatch.score || 0).toFixed(2), sourceUrl, pageTitle, productTitle, description, pageTextSample: cleanText(pageText, 12000), imageCount: draft.images.length, imageDedupe: 'canonical-url-highest-quality', barcodeSource: extractedBarcode ? (product.gtin || product.gtin13 || product.gtin12 ? 'json-ld' : 'page-text') : '', weightSource: weightInfo.source },
  };
}

module.exports = { extractProductFromUrl, extractBarcodeFromText, extractWeightFromAny };
