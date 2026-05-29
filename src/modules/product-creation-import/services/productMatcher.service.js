const { normaliseTitle } = require('../utils/safe');
const { searchShopifyProducts } = require('./shopifyProduct.service');

function scoreProduct(line = {}, product = {}) {
  let score = 0;
  const reasons = [];
  const sku = String(line.sku || line.supplierProductCode || '').trim().toLowerCase();
  const barcode = String(line.barcode || '').trim().toLowerCase();
  const title = normaliseTitle(line.title);
  const productTitle = normaliseTitle(product.title);

  if (sku && String(product.sku || '').toLowerCase() === sku) { score += 0.55; reasons.push('SKU matched'); }
  if (barcode && String(product.barcode || '').toLowerCase() === barcode) { score += 0.7; reasons.push('Barcode matched'); }
  if (title && productTitle === title) { score += 0.35; reasons.push('Exact title matched'); }
  else if (title && productTitle.includes(title)) { score += 0.2; reasons.push('Title contained invoice text'); }
  else if (title && title.includes(productTitle)) { score += 0.15; reasons.push('Invoice text contained product title'); }

  return { score: Math.min(score, 1), reason: reasons.join(', ') || 'Weak text match' };
}

async function matchInvoiceLinesToShopify({ shopDomain, lines = [] }) {
  const matches = [];
  for (const line of lines) {
    const searchTerms = [line.sku, line.barcode, line.supplierProductCode, line.title].filter(Boolean);
    let candidates = [];
    for (const term of searchTerms) {
      try {
        const found = await searchShopifyProducts({ shopDomain, q: term, first: 8 });
        candidates = candidates.concat(found);
      } catch (error) {
        matches.push({ lineId: line.lineId, status: 'unmatched', score: 0, reason: error.message, candidates: [] });
        candidates = [];
        break;
      }
      if (candidates.length) break;
    }
    const unique = Array.from(new Map(candidates.map((product) => [product.id, product])).values());
    const ranked = unique.map((product) => ({ product, ...scoreProduct(line, product) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    matches.push({
      lineId: line.lineId,
      status: best && best.score >= 0.35 ? 'suggested' : 'unmatched',
      score: best?.score || 0,
      productId: best?.product?.id || '',
      variantId: best?.product?.variantId || '',
      productTitle: best?.product?.title || '',
      handle: best?.product?.handle || '',
      image: best?.product?.image || '',
      reason: best?.reason || 'No confident match found.',
      candidates: ranked.slice(0, 5).map((item) => ({ ...item.product, score: item.score, reason: item.reason })),
    });
  }
  return matches;
}

function applyMatchesToImportDoc(doc, matches = []) {
  const byLine = new Map(matches.map((match) => [match.lineId, match]));
  doc.lines.forEach((line) => {
    const match = byLine.get(line.lineId);
    if (!match) return;
    line.match = {
      status: match.status || 'unmatched',
      score: match.score || 0,
      productId: match.productId || '',
      variantId: match.variantId || '',
      productTitle: match.productTitle || '',
      handle: match.handle || '',
      image: match.image || '',
      reason: match.reason || '',
    };
  });
  const matchedCount = doc.lines.filter((line) => ['suggested', 'assigned', 'created'].includes(line.match?.status)).length;
  if (!doc.lines.length) doc.status = 'analysed';
  else if (matchedCount === doc.lines.length) doc.status = 'matched';
  else if (matchedCount > 0) doc.status = 'partial';
  else doc.status = 'analysed';
  return doc;
}

module.exports = { matchInvoiceLinesToShopify, applyMatchesToImportDoc };
