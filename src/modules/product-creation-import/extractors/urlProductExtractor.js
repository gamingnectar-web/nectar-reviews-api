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

function findProductJsonLd(html) {
  const blocks = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    const parsed = safeJsonParse(raw);
    const candidates = flattenJsonLd(parsed).filter((item) => {
      const type = Array.isArray(item['@type']) ? item['@type'].join(' ') : String(item['@type'] || '');
      return /product/i.test(type);
    });
    if (candidates[0]) return candidates[0];
  }
  return null;
}

function firstOffer(offers) {
  if (!offers) return {};
  if (Array.isArray(offers)) return offers[0] || {};
  if (Array.isArray(offers.offers)) return offers.offers[0] || {};
  return offers;
}

function imageFromJsonLd(value, baseUrl) {
  if (!value) return [];
  if (typeof value === 'string') return [absolutizeUrl(value, baseUrl)].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => imageFromJsonLd(item, baseUrl));
  if (typeof value === 'object') return [value.url, value.contentUrl, value.src].map((item) => absolutizeUrl(item, baseUrl)).filter(Boolean);
  return [];
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
  metaSelectors.forEach((selector) => metaContents(html, selector).forEach((url) => images.push(absolutizeUrl(url, baseUrl))));

  const imgRe = /<img\b[^>]*(?:src|data-src|data-original|data-zoom-image|data-image)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRe.exec(String(html || '')))) {
    const tag = match[0] || '';
    const src = absolutizeUrl(match[1], baseUrl);
    const alt = (tag.match(/alt=["']([^"']*)["']/i) || [])[1] || '';
    const cls = (tag.match(/class=["']([^"']*)["']/i) || [])[1] || '';
    const scoreText = `${src} ${alt} ${cls}`.toLowerCase();
    const isLikelyProduct = /(product|gallery|media|main|zoom|packshot|thumbnail|image)/i.test(scoreText);
    if (src && isLikelyProduct && !/logo|icon|sprite|avatar|payment|trust|badge/i.test(scoreText)) images.push(src);
  }

  const srcsetRe = /(?:srcset|data-srcset)=["']([^"']+)["']/gi;
  while ((match = srcsetRe.exec(String(html || '')))) {
    String(match[1] || '').split(',').forEach((part) => {
      const url = part.trim().split(/\s+/)[0];
      const absolute = absolutizeUrl(url, baseUrl);
      if (absolute) images.push(absolute);
    });
  }

  return Array.from(new Set(images.filter(Boolean))).slice(0, 60);
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
  const product = findProductJsonLd(html) || {};
  const pageText = htmlToText(html);
  const offer = firstOffer(product.offers);
  const brand = typeof product.brand === 'object' ? product.brand?.name : product.brand;
  const title = cleanText(product.name || metaContent(html, 'og:title') || tagText(html, 'title'), 220);
  const description = cleanText(product.description || metaContent(html, 'og:description') || metaContent(html, 'description'), 5000);
  const imageUrls = Array.from(new Set([
    ...imageFromJsonLd(product.image, sourceUrl),
    ...extractHtmlImageCandidates(html, sourceUrl),
  ])).slice(0, 50);
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
    images: imageUrls,
    tags: ['url-import'],
    seo: { title, description },
  });

  return {
    ...draft,
    confidence: product.name ? 0.86 : (title ? 0.55 : 0.25),
    rawExtract: { jsonLdProductFound: Boolean(product.name), sourceUrl, imageCount: draft.images.length, barcodeSource: extractedBarcode ? (product.gtin || product.gtin13 || product.gtin12 ? 'json-ld' : 'page-text') : '', weightSource: weightInfo.source },
  };
}

module.exports = { extractProductFromUrl, extractBarcodeFromText, extractWeightFromAny };
