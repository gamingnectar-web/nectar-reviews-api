'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
const { extractProductFromUrl } = require('../extractors/urlProductExtractor');
const { shopifyGraphql } = require('./shopifyProduct.service');
const { cleanUrl, cleanText } = require('../utils/safe');

function reject(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const n = ip.split('.').map(Number);
    return n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 ||
      (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
      (n[0] === 192 && n[1] === 168) || (n[0] === 100 && n[1] >= 64 && n[1] <= 127);
  }
  return ip === '::1' || ip === '::' || /^f[cd]/i.test(ip) || /^fe[89ab]/i.test(ip) || /^::ffff:/i.test(ip);
}
async function validatePublicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80','443'].includes(url.port)) reject('A public HTTP(S) supplier URL is required.');
  if (!url.hostname.includes('.') || url.hostname === 'localhost' || url.hostname.endsWith('.local')) reject('Only public supplier sites may be scanned.');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(x => isPrivateIp(x.address))) reject('Supplier URL resolves to a private or invalid address.');
  return url;
}
const money = (raw, minorUnits = false) => {
  if (raw == null || raw === '') return '';
  const n = Number(String(raw).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? (minorUnits ? n / 100 : n).toFixed(2) : '';
};
const absolute = (value, base) => {
  try { const u = new URL(typeof value === 'string' ? value : value?.src || value?.url || '', base); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
};
function optionNames(options = []) {
  return options.slice(0, 3).map((o, i) => cleanText(typeof o === 'string' ? o : o.name || `Option ${i+1}`, 60) || `Option ${i+1}`);
}
function sourceToVariant(source, names, imageLookup, sourceUrl, minorUnits = true) {
  const values = names.map((name, i) => ({ name, value: cleanText(source[`option${i + 1}`] || source.options?.[i] || '', 120) }));
  let img = source.featured_image || source.image || '';
  if (img && typeof img === 'object') img = img.src || img.url || '';
  if (!img && source.image_id) img = imageLookup.get(String(source.image_id)) || '';
  return {
    sourceVariantId: String(source.id || ''), included: true, options: values,
    sku: cleanText(source.sku || '', 120), barcode: cleanText(source.barcode || '', 64),
    price: money(source.price, minorUnits), compareAtPrice: money(source.compare_at_price, minorUnits),
    cost: '', weight: source.grams ? String(source.grams) : (source.weight != null ? String(source.weight) : ''),
    weightUnit: source.grams ? 'g' : String(source.weight_unit || 'g'),
    sourceAvailable: source.available !== false,
    imageUrl: absolute(img, sourceUrl), imageMapping: img ? 'supplier' : 'missing'
  };
}
function normalizeFromShopifyJson(product, sourceUrl, minorUnits = true) {
  const names = optionNames(product.options || []);
  const gallery = (product.images || []).map((img) => ({
    id: String(img?.id || ''), src: absolute(img, sourceUrl), alt: String(img?.alt || '')
  })).filter(x => x.src);
  if (product.featured_image) {
    const src = absolute(product.featured_image, sourceUrl);
    if (src && !gallery.find(x => x.src === src)) gallery.unshift({ id: '', src, alt: '' });
  }
  const lookup = new Map(gallery.filter(x => x.id).map(x => [x.id, x.src]));
  const variants = (product.variants || []).map(v => sourceToVariant(v, names, lookup, sourceUrl, minorUnits));
  const imageByVariant = new Map();
  for (const photo of (product.images || [])) {
    if (!photo || typeof photo !== 'object' || !photo.variant_ids) continue;
    for (const id of photo.variant_ids) imageByVariant.set(String(id), absolute(photo, sourceUrl));
  }
  variants.forEach(v => { if (!v.imageUrl && imageByVariant.has(v.sourceVariantId)) { v.imageUrl = imageByVariant.get(v.sourceVariantId); v.imageMapping = 'supplier'; } });
  return {
    source: 'shopify-public-json', sourceUrl, title: cleanText(product.title, 220),
    descriptionHtml: String(product.description || product.body_html || ''),
    vendor: cleanText(product.vendor || '', 120), productType: cleanText(product.type || product.product_type || '', 120),
    handle: cleanText(product.handle || '', 180),
    options: names.map((name, i) => ({ name, values: [...new Set(variants.map(v => v.options[i]?.value).filter(Boolean))] })),
    variants, images: gallery, sourceProductId: String(product.id || ''),
    warnings: variants.filter(v => !v.imageUrl).length ? ['Some variants have no directly mapped image. Assign them in the editor before creating the draft.'] : []
  };
}
async function scanVariations({ url }) {
  const input = cleanUrl(url);
  if (!input) reject('Enter a valid product URL.');
  let parsed;
  try { parsed = await validatePublicUrl(input); }
  catch (error) { reject(`Supplier address validation failed: ${error.message}`, 400); }
  const canonical = new URL(parsed.href);
  canonical.search = ''; canonical.hash = '';
  const handle = canonical.pathname.match(/^\/products\/([^/]+)/i)?.[1];
  if (!handle) reject('This importer needs a direct supplier product URL containing /products/ and its handle.');
  const slug = encodeURIComponent(decodeURIComponent(handle));
  const candidates = [
    { url: new URL(`/products/${slug}.js`, canonical.origin), cents: true, label: 'Shopify public product JS' },
    { url: new URL(`/products/${slug}.json`, canonical.origin), cents: false, label: 'Shopify public product JSON' }
  ];
  const diagnostics = [];
  for (const candidate of candidates) {
    try {
      // Deliberately reject redirects to avoid accepting an unchecked private destination.
      const response = await fetch(candidate.url, {
        signal: AbortSignal.timeout(17000),
        redirect: 'error',
        headers: { Accept: 'application/json,text/javascript;q=0.9,*/*;q=0.5', 'User-Agent': 'Mozilla/5.0 ELEV8VariationImporter/1.1' }
      });
      if (!response.ok) { diagnostics.push(`${candidate.label}: HTTP ${response.status}`); continue; }
      const raw = await response.text();
      if (raw.length > 5_000_000) { diagnostics.push(`${candidate.label}: supplier response too large`); continue; }
      let payload;
      try { payload = JSON.parse(raw); }
      catch { diagnostics.push(`${candidate.label}: response was not JSON`); continue; }
      const product = payload?.product || payload;
      if (!product?.title || !Array.isArray(product.variants) || !product.variants.length) {
        diagnostics.push(`${candidate.label}: no complete variants found`);
        continue;
      }
      const draft = normalizeFromShopifyJson(product, canonical.href, candidate.cents);
      return { draft, count: draft.variants.length, source: candidate.label, diagnostics };
    } catch (error) {
      diagnostics.push(`${candidate.label}: ${error?.cause?.code || error?.code || error?.message || 'fetch failed'}`);
    }
  }
  // Preserve the existing cross-source fallback, but never silently invent variants.
  try {
    const fallback = await extractProductFromUrl(canonical.href);
    const product = fallback.rawSupplierProduct || fallback.rawExtract?.rawSupplierProduct;
    if (product && Array.isArray(product.variants) && product.variants.length) {
      const draft = normalizeFromShopifyJson(product, canonical.href, fallback.source === 'shopify-public-json');
      return { draft, count: draft.variants.length, source: 'supplier extractor', diagnostics };
    }
  } catch (error) { diagnostics.push(`Supplier page fallback: ${error?.cause?.code || error?.code || error?.message || 'failed'}`); }
  reject(`Could not retrieve verifiable variants from this supplier. ${diagnostics.join(' | ').slice(0, 750)}`, 422);
}
function validateVariationDraft(draft) {
  const errors = [], warnings = [];
  if (!draft || !cleanText(draft.title || '', 220)) errors.push('Product title is required.');
  const variants = (draft?.variants || []).filter(v => v.included !== false);
  if (!variants.length) errors.push('Select at least one variant.');
  if (variants.length > 2048) errors.push('Too many variants for one Shopify product.');
  const options = (draft?.options || []).filter(o => o.name);
  if (!options.length || options.length > 3) errors.push('This importer supports 1–3 named Shopify options.');
  const combinations = new Set(), skus = new Set(), barcodes = new Set();
  variants.forEach((v, i) => {
    const label = `Variant ${i + 1}`;
    if (!Array.isArray(v.options) || v.options.length !== options.length || v.options.some((o,j) => !o.value || o.name !== options[j].name)) errors.push(`${label}: option values must match the product option names.`);
    const combo = (v.options || []).map(o => String(o.value || '').trim().toLowerCase()).join('|');
    if (combinations.has(combo)) errors.push(`${label}: duplicate option combination.`); combinations.add(combo);
    const sku = String(v.sku || '').trim().toLowerCase(), barcode = String(v.barcode || '').trim().toLowerCase();
    if (sku && skus.has(sku)) errors.push(`${label}: duplicate SKU ${v.sku}.`); if (sku) skus.add(sku);
    if (barcode && barcodes.has(barcode)) errors.push(`${label}: duplicate barcode ${v.barcode}.`); if (barcode) barcodes.add(barcode);
    if (!/^\d+(\.\d{1,2})?$/.test(String(v.price || ''))) errors.push(`${label}: valid selling price is required.`);
    if (v.compareAtPrice && (!/^\d+(\.\d{1,2})?$/.test(String(v.compareAtPrice)) || Number(v.compareAtPrice) <= Number(v.price))) errors.push(`${label}: compare-at price must exceed price.`);
    if (!v.imageUrl) warnings.push(`${label}: missing image; product image will be used if available.`);
  });
  return { valid: errors.length === 0, errors, warnings, included: variants.length };
}
function graphqlErrors(operation) { const e = operation?.userErrors || []; if (e.length) reject(e.map(x => x.message).join('; '), 422); }
async function createVariationDraft({ shopDomain, draft }) {
  if (!shopDomain) reject('Shopify shop connection is missing.');
  const check = validateVariationDraft(draft);
  if (!check.valid) reject(check.errors.join(' '));
  const variants = draft.variants.filter(x => x.included !== false);
  const uniqueMedia = [...new Set([...(draft.images || []).map(x => x.src || x), ...variants.map(v => v.imageUrl)].filter(Boolean))].slice(0, 100);
  const productInput = {
    title: cleanText(draft.title, 220), descriptionHtml: String(draft.descriptionHtml || ''),
    vendor: cleanText(draft.vendor || '', 120), productType: cleanText(draft.productType || '', 120),
    status: 'DRAFT',
    ...(draft.handle ? { handle: cleanText(draft.handle, 180) } : {}),
    productOptions: draft.options.map(o => ({ name: o.name, values: [...new Set(variants.map(v => v.options.find(x=>x.name === o.name)?.value).filter(Boolean))].map(name => ({ name })) }))
  };
  // Product is created only after complete validation. A later Shopify API error will leave a draft
  // that the merchant can finish manually; never auto-publish or silently delete it.
  const create = await shopifyGraphql({ shopDomain, query: `mutation NewVariationProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) { productCreate(product:$product, media:$media) { product { id title handle media(first:100) { nodes { id ... on MediaImage { image { url } } } } } userErrors { field message } } }`, variables: { product: productInput, media: uniqueMedia.map(originalSource => ({ originalSource, mediaContentType: 'IMAGE' })) } });
  graphqlErrors(create?.productCreate);
  const product = create?.productCreate?.product;
  if (!product?.id) reject('Shopify did not return a product ID.', 502);
  const variantInput = variants.map(v => ({
    price: String(v.price), ...(v.compareAtPrice ? { compareAtPrice: String(v.compareAtPrice) } : {}),
    ...(v.barcode ? { barcode: String(v.barcode) } : {}),
    optionValues: v.options.map(o => ({ optionName: o.name, name: o.value })),
    inventoryItem: { tracked: true, ...(v.sku ? { sku: String(v.sku) } : {}), ...(v.cost ? { cost: String(v.cost) } : {}) },
    ...(v.imageUrl ? { mediaSrc: [v.imageUrl] } : {})
  }));
  const results = [];
  try {
    // Send in small chunks to remain below GraphQL complexity/size limits.
    for (let i = 0; i < variantInput.length; i += 50) {
      const data = await shopifyGraphql({ shopDomain, query: `mutation AddVariationRows($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy!) { productVariantsBulkCreate(productId:$productId, variants:$variants, strategy:$strategy) { productVariants { id title sku price } userErrors { field message } } }`, variables: { productId: product.id, variants: variantInput.slice(i,i+50), strategy: i === 0 ? 'REMOVE_STANDALONE_VARIANT' : 'DEFAULT' } });
      graphqlErrors(data?.productVariantsBulkCreate);
      results.push(...(data?.productVariantsBulkCreate?.productVariants || []));
    }
  } catch (error) {
    error.message = `Shopify product draft ${product.id} was created, but variant creation stopped after ${results.length}/${variants.length}. ${error.message}`;
    error.partialDraftProductId = product.id;
    throw error;
  }
  return { product: { id: product.id, title: product.title, handle: product.handle, status: 'DRAFT', variantCount: results.length, variants: results }, warnings: check.warnings };
}
module.exports = { scanVariations, validateVariationDraft, createVariationDraft, normalizeFromShopifyJson };
