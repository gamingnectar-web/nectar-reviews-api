const { cleanText, cleanUrl, toMoney, suggestedRetailFromCost } = require('../utils/safe');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function htmlFromPlainText(value) {
  const text = cleanText(value, 5000);
  return text ? `<p>${escapeHtml(text)}</p>` : '';
}

function normaliseImage(image, title) {
  if (!image) return null;
  if (typeof image === 'string') {
    const url = cleanUrl(image);
    return url ? { src: url, alt: title || 'Imported product' } : null;
  }
  const src = cleanUrl(image.src || image.url || image.originalSource || '');
  return src ? { src, alt: cleanText(image.alt || title || 'Imported product', 180) } : null;
}

function normaliseDraftProduct(raw = {}) {
  const title = cleanText(raw.title || raw.name || 'Imported product', 220) || 'Imported product';
  const cost = toMoney(raw.cost || raw.unitCost || raw.pricePaid || '');
  const price = toMoney(raw.price || raw.retailPrice || raw.suggestedRetailPrice || suggestedRetailFromCost(cost));
  const images = (Array.isArray(raw.images) ? raw.images : [raw.imageUrl || raw.image || raw.featuredImage])
    .map((image) => normaliseImage(image, title))
    .filter(Boolean)
    .slice(0, 12);

  return {
    source: cleanText(raw.source || 'manual', 40),
    sourceUrl: cleanUrl(raw.sourceUrl || raw.url || ''),
    title,
    descriptionHtml: raw.descriptionHtml || htmlFromPlainText(raw.description || raw.body || ''),
    vendor: cleanText(raw.vendor || raw.brand || raw.supplierName || '', 120),
    productType: cleanText(raw.productType || raw.category || '', 120),
    status: 'draft',
    tags: Array.from(new Set((Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(','))
      .map((tag) => cleanText(tag, 80))
      .filter(Boolean)
      .concat(['product-import'])
    )).slice(0, 30),
    price,
    cost,
    compareAtPrice: toMoney(raw.compareAtPrice || ''),
    sku: cleanText(raw.sku || raw.supplierProductCode || '', 120),
    barcode: cleanText(raw.barcode || raw.gtin || raw.gtin13 || '', 120),
    quantity: Number(raw.quantity || 1) || 1,
    images,
    seo: {
      title: cleanText(raw.seo?.title || title, 70),
      description: cleanText(raw.seo?.description || raw.description || title, 160),
    },
    raw,
  };
}

module.exports = { normaliseDraftProduct, htmlFromPlainText };
