const { cleanText, cleanUrl, toMoney, suggestedRetailFromCost, slugify, parseTags, normaliseMetafields } = require('../utils/safe');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function htmlFromPlainText(value) {
  const text = cleanText(value, 5000);
  return text ? `<p>${escapeHtml(text)}</p>` : '';
}

function tokenSet(value = '') {
  return new Set(cleanText(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !['the','and','for','with','from','product','shop','gaming','nectar'].includes(word)));
}

function isSeoTextRelevant(seoText = '', title = '') {
  const seoTokens = tokenSet(seoText);
  const titleTokens = Array.from(tokenSet(title));
  if (!seoTokens.size || !titleTokens.length) return false;
  const overlap = titleTokens.filter((token) => seoTokens.has(token)).length;
  return overlap >= Math.min(2, titleTokens.length);
}

function makeSafeSeoTitle(rawSeoTitle = '', title = '', vendor = '') {
  const safeTitle = cleanText(title || 'Imported product', 70);
  const candidate = cleanText(rawSeoTitle || '', 70);
  if (candidate && isSeoTextRelevant(candidate, safeTitle)) return candidate;
  const branded = cleanText([safeTitle, vendor && !safeTitle.toLowerCase().includes(String(vendor).toLowerCase()) ? vendor : '', 'Gaming Nectar'].filter(Boolean).join(' • '), 70);
  return branded || safeTitle;
}

function makeSafeSeoDescription(rawDescription = '', title = '', vendor = '', productType = '') {
  const titleText = cleanText(title || 'Imported product', 120);
  const candidate = cleanText(rawDescription || '', 160);
  if (candidate && isSeoTextRelevant(candidate, titleText)) return candidate;
  const parts = [titleText];
  if (vendor && !titleText.toLowerCase().includes(String(vendor).toLowerCase())) parts.push(`from ${cleanText(vendor, 80)}`);
  if (productType) parts.push(cleanText(productType, 80));
  parts.push('available from Gaming Nectar.');
  return cleanText(parts.join(' '), 160);
}

function normaliseImage(image, title, index = 0) {
  if (!image) return null;
  const fallbackAlt = index === 0 ? (title || 'Imported product') : `${title || 'Imported product'} product image ${index + 1}`;
  if (typeof image === 'string') {
    const url = cleanUrl(image);
    return url ? { src: url, alt: fallbackAlt } : null;
  }
  const src = cleanUrl(image.src || image.url || image.originalSource || '');
  return src ? { src, alt: cleanText(image.alt || image.description || fallbackAlt, 180) } : null;
}

function dedupeImagesByCanonicalUrl(images = []) {
  const best = new Map();
  const score = (item) => {
    let n = 0;
    try {
      const parsed = new URL(item.src);
      const width = Number(parsed.searchParams.get('width') || parsed.searchParams.get('w') || 0);
      if (width) n += width; else n += 5000;
      if (/cdn\/shop\/products|product|gallery|media/i.test(item.src)) n += 1000;
    } catch (_) {}
    return n;
  };
  const keyFor = (src = '') => {
    try {
      const parsed = new URL(src);
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase().replace(/_(\d+x\d+|small|medium|large|master)(?=\.)/i, '')}`;
    } catch (_) {
      return String(src || '').split('?')[0].toLowerCase();
    }
  };
  images.filter(Boolean).forEach((item) => {
    const key = keyFor(item.src);
    const existing = best.get(key);
    if (!existing || score(item) > score(existing)) best.set(key, item);
  });
  return Array.from(best.values());
}

function coreMetafieldDefaults(raw = {}) {
  const meta = raw.core || raw.coreMetafields || {};
  const defaults = [
    { namespace: 'core', key: 'formula_version', label: 'Formula Version', value: raw.formulaVersion || meta.formula_version || meta.formulaVersion || '' },
    { namespace: 'core', key: 'grouped_profiles', label: 'Grouped Profiles', value: raw.groupedProfiles || meta.grouped_profiles || meta.groupedProfiles || '' },
    { namespace: 'core', key: 'sourness', label: 'Sourness', value: raw.sourness || meta.sourness || '' },
    { namespace: 'core', key: 'sweetness', label: 'Sweetness', value: raw.sweetness || meta.sweetness || '' },
    { namespace: 'core', key: 'flavour_profile', label: 'Flavour Profile', value: raw.flavourProfile || meta.flavour_profile || meta.flavourProfile || '' },
  ];
  return defaults.filter((item) => item.value !== '' && item.value !== undefined && item.value !== null).map((item) => ({ ...item, type: 'single_line_text_field', source: 'normalised' }));
}


function normaliseWeightUnit(value = '') {
  const unit = String(value || '').trim().toLowerCase();
  if (['kg', 'kilogram', 'kilograms'].includes(unit)) return 'kg';
  if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) return 'lb';
  if (['oz', 'ounce', 'ounces'].includes(unit)) return 'oz';
  return 'g';
}

function toWeight(value) {
  const raw = String(value || '').replace(/,/g, '').trim();
  const match = raw.match(/\d+(?:\.\d{1,3})?/);
  return match ? String(Number(match[0])) : '';
}

function normaliseDraftProduct(raw = {}) {
  const title = cleanText(raw.title || raw.name || 'Imported product', 220) || 'Imported product';
  const cost = toMoney(raw.cost || raw.unitCost || raw.pricePaid || '');
  const price = toMoney(raw.price || raw.retailPrice || raw.suggestedRetailPrice || suggestedRetailFromCost(cost));
  const handle = slugify(raw.handle || raw.slug || title);
  const weight = toWeight(raw.weight || raw.productWeight || raw.shippingWeight || '');
  const weightUnit = normaliseWeightUnit(raw.weightUnit || raw.productWeightUnit || raw.shippingWeightUnit || 'g');
  const images = (Array.isArray(raw.images) ? raw.images : [raw.imageUrl || raw.image || raw.featuredImage])
    .map((image, index) => normaliseImage(image, title, index))
    .filter(Boolean);
  const dedupedImages = dedupeImagesByCanonicalUrl(images).slice(0, 50);
  const tags = Array.from(new Set(parseTags(raw.tags)
    .concat(raw.source === 'url' ? ['url-import'] : [])
    .concat(raw.source === 'invoice' ? ['invoice-import'] : [])
    .concat(['product-import'])
  )).slice(0, 40);

  const metafields = normaliseMetafields([
    ...coreMetafieldDefaults(raw),
    ...(Array.isArray(raw.metafields) ? raw.metafields : normaliseMetafields(raw.metafields || {})),
  ]);

  return {
    source: cleanText(raw.source || 'manual', 40),
    sourceUrl: cleanUrl(raw.sourceUrl || raw.url || ''),
    title,
    handle,
    descriptionHtml: raw.descriptionHtml || htmlFromPlainText(raw.description || raw.body || ''),
    vendor: cleanText(raw.vendor || raw.brand || raw.supplierName || '', 120),
    productType: cleanText(raw.productType || raw.category || '', 120),
    status: 'draft',
    tags,
    price,
    cost,
    compareAtPrice: toMoney(raw.compareAtPrice || raw.originalPrice || ''),
    sku: cleanText(raw.sku || raw.supplierProductCode || '', 120),
    barcode: cleanText(raw.barcode || raw.gtin || raw.gtin13 || '', 120),
    weight,
    weightUnit,
    handleFormat: cleanText(raw.handleFormat || raw.format || '', 80),
    handleLocation: cleanText(raw.handleLocation || raw.location || '', 80),
    quantity: Number(raw.quantity || 1) || 1,
    images: dedupedImages,
    saveImagesToFiles: Boolean(raw.saveImagesToFiles),
    metafields,
    seo: {
      title: makeSafeSeoTitle(raw.seo?.title || '', title, raw.vendor || raw.brand || raw.supplierName || ''),
      description: makeSafeSeoDescription(raw.seo?.description || raw.description || '', title, raw.vendor || raw.brand || raw.supplierName || '', raw.productType || raw.category || ''),
    },
    enrichment: raw.enrichment || {},
    raw,
  };
}

module.exports = { normaliseDraftProduct, htmlFromPlainText, coreMetafieldDefaults, toWeight, normaliseWeightUnit };
