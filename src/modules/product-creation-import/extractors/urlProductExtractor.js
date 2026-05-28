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

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
  return decodeEntities((html.match(re) || html.match(alt) || [])[1] || '');
}

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
  const image = Array.isArray(product.image) ? product.image[0] : product.image;
  const title = cleanText(product.name || metaContent(html, 'og:title') || tagText(html, 'title'), 220);
  const description = cleanText(product.description || metaContent(html, 'og:description') || metaContent(html, 'description'), 5000);
  const ogImage = metaContent(html, 'og:image');

  const draft = normaliseDraftProduct({
    source: 'url',
    sourceUrl,
    title,
    description,
    vendor: brand,
    price: toMoney(offer.price || metaContent(html, 'product:price:amount')),
    sku: product.sku || product.mpn || '',
    barcode: product.gtin13 || product.gtin || product.gtin12 || '',
    images: [image || ogImage].filter(Boolean),
    tags: ['url-import'],
    seo: { title, description },
  });

  return {
    ...draft,
    confidence: product.name ? 0.86 : (title ? 0.55 : 0.25),
    rawExtract: { jsonLdProductFound: Boolean(product.name), sourceUrl },
  };
}

module.exports = { extractProductFromUrl };
