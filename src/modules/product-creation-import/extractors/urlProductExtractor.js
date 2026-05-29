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
  const offer = firstOffer(product.offers);
  const brand = typeof product.brand === 'object' ? product.brand?.name : product.brand;
  const title = cleanText(product.name || metaContent(html, 'og:title') || tagText(html, 'title'), 220);
  const description = cleanText(product.description || metaContent(html, 'og:description') || metaContent(html, 'description'), 5000);
  const imageUrls = Array.from(new Set([
    ...imageFromJsonLd(product.image, sourceUrl),
    ...extractHtmlImageCandidates(html, sourceUrl),
  ])).slice(0, 50);

  const draft = normaliseDraftProduct({
    source: 'url',
    sourceUrl,
    title,
    description,
    vendor: brand,
    price: toMoney(offer.price || metaContent(html, 'product:price:amount')),
    compareAtPrice: toMoney(offer.highPrice || offer.compareAtPrice || metaContent(html, 'product:price:compare_at_amount')),
    sku: product.sku || product.mpn || '',
    barcode: product.gtin13 || product.gtin || product.gtin12 || '',
    images: imageUrls,
    tags: ['url-import'],
    seo: { title, description },
  });

  return {
    ...draft,
    confidence: product.name ? 0.86 : (title ? 0.55 : 0.25),
    rawExtract: { jsonLdProductFound: Boolean(product.name), sourceUrl, imageCount: draft.images.length },
  };
}

module.exports = { extractProductFromUrl };
