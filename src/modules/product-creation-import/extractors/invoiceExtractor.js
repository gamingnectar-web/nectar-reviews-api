const { cleanText, makeLineId, safeJsonParse, suggestedRetailFromCost, toMoney } = require('../utils/safe');

function lineFromRaw(raw = {}, index = 0) {
  const unitCost = toMoney(raw.unitCost || raw.pricePaid || raw.cost || raw.unit_price || raw.price || raw.paidPrice || raw.finalUnitPrice || '');
  const originalUnitPrice = toMoney(raw.originalUnitPrice || raw.originalPrice || raw.retailPrice || raw.compareAtPrice || '');
  const discountAmount = toMoney(raw.discountAmount || raw.discount || raw.discountValue || '');
  const totalCost = toMoney(raw.totalCost || raw.lineTotal || raw.total || raw.paidTotal || '');
  return {
    lineId: raw.lineId || makeLineId(index),
    title: cleanText(raw.title || raw.productTitle || raw.name || raw.description || '', 220),
    sku: cleanText(raw.sku || raw.SKU || '', 120),
    barcode: cleanText(raw.barcode || raw.gtin || raw.ean || '', 120),
    supplierProductCode: cleanText(raw.supplierProductCode || raw.productCode || raw.code || '', 120),
    quantity: Number(raw.quantity || raw.qty || 1) || 1,
    unitCost,
    originalUnitPrice,
    totalCost,
    discountAmount,
    discountLabel: cleanText(raw.discountLabel || raw.discountCode || raw.promotion || raw.offer || '', 220),
    suggestedRetailPrice: cleanText(raw.suggestedRetailPrice || raw.retailPrice || suggestedRetailFromCost(unitCost), 40),
    imageUrl: cleanText(raw.imageUrl || raw.image || raw.productImageUrl || '', 500),
    imageDescription: cleanText(raw.imageDescription || raw.productImageDescription || raw.visualDescription || '', 500),
    imageSearchQuery: cleanText(raw.imageSearchQuery || raw.productImageSearchQuery || raw.searchQuery || '', 300),
    sourceUrl: cleanText(raw.sourceUrl || raw.url || raw.productUrl || '', 500),
    confidence: Number(raw.confidence || 0.6),
    raw,
    match: { status: 'unmatched', score: 0, reason: 'Not matched yet.' },
  };
}

function parseQuantity(row) {
  const match = row.match(/(?:qty|quantity|×|x)\s*[:]?\s*(\d+)/i) || row.match(/\b(\d+)\s*(?:×|x)\b/i);
  return match ? Number(match[1]) : 1;
}

function parseDiscount(row) {
  const label = (row.match(/(?:discount|offer|promo|buy\s+\d+[^\n,;]*)[^£$€\n]*/i) || [])[0] || '';
  const negative = (row.match(/[-−]\s*(?:£|GBP|USD|EUR|\$|€)?\s*\d+(?:[.,]\d{2})?/i) || [])[0] || '';
  return { discountLabel: cleanText(label, 220), discountAmount: toMoney(negative) };
}

function parseLinesFromNotes(notes = '') {
  const text = String(notes || '').trim();
  if (!text) return [];
  const rows = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 60);
  return rows.map((row, index) => {
    const moneyMatches = row.match(/(?:£|GBP|USD|EUR|\$|€)?\s*-?\d+(?:[.,]\d{2})?/g) || [];
    const unitCost = moneyMatches.length ? moneyMatches[moneyMatches.length - 1] : '';
    const quantity = parseQuantity(row);
    const discount = parseDiscount(row);
    const title = row
      .replace(/(?:£|GBP|USD|EUR|\$|€)?\s*-?\d+(?:[.,]\d{2})?/g, '')
      .replace(/\bqty\s*[:x]?\s*\d+\b/ig, '')
      .replace(/\b(?:×|x)\s*\d+\b/ig, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return lineFromRaw({ title: title || row, quantity, unitCost, confidence: 0.35, rawText: row, ...discount }, index);
  });
}

function stripJsonFence(value = '') {
  return String(value || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

async function extractWithOpenAi({ imageDataUrl, filename, notes, supplierUrl }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey || !imageDataUrl) return null;

  const model = process.env.OPENAI_INVOICE_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const prompt = `Extract product purchase data from this supplier invoice, order confirmation, PO or receipt for a Shopify product import app. Return ONLY JSON with keys: supplierName, invoiceNumber, invoiceDate, currency, total, shippingTotal, taxTotal, discountTotal, lines.

lines must be an array of product rows only. Each line object must include as many of these as possible: title, sku, barcode, supplierProductCode, quantity, unitCost, originalUnitPrice, totalCost, discountAmount, discountLabel, suggestedRetailPrice, imageUrl, imageDescription, imageSearchQuery, sourceUrl, confidence.

Important:
- Look at product thumbnails/images in the screenshot. If an actual product image URL is visible in the document, return imageUrl. If not, describe the thumbnail in imageDescription and create a concise imageSearchQuery.
- Capture free/discounted lines as quantity with unitCost 0.00 or the final paid price, and put the promotion text in discountLabel.
- Do not include shipping, tax, payment rows, insurance rows, order status text or totals as product lines unless they are clearly a purchasable product line.
- Keep prices as decimal numbers without currency symbols.

Notes: ${notes || ''}
Supplier URL: ${supplierUrl || ''}
Filename: ${filename || ''}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a careful invoice, receipt and order-confirmation extraction engine. Output valid JSON only.' },
        { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageDataUrl } }] },
      ],
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.error?.message || `OpenAI invoice extraction failed (${response.status})`;
    const error = new Error(message);
    error.status = 502;
    throw error;
  }

  const content = json.choices?.[0]?.message?.content || '';
  return safeJsonParse(stripJsonFence(content));
}

async function extractInvoiceProducts({ imageDataUrl = '', mimeType = '', filename = '', notes = '', supplierUrl = '' }) {
  let extracted = null;
  let extractionError = '';
  try {
    extracted = await extractWithOpenAi({ imageDataUrl, mimeType, filename, notes, supplierUrl });
  } catch (error) {
    extractionError = error.message || 'AI invoice extraction failed.';
  }

  const fallbackLines = parseLinesFromNotes(notes);
  const rawLines = Array.isArray(extracted?.lines) && extracted.lines.length ? extracted.lines : fallbackLines;
  const lines = rawLines.map(lineFromRaw).filter((line) => line.title || line.sku || line.barcode || line.supplierProductCode);

  return {
    supplierUrl: supplierUrl || '',
    supplierName: cleanText(extracted?.supplierName || extracted?.supplier || '', 180),
    invoiceNumber: cleanText(extracted?.invoiceNumber || extracted?.invoiceNo || extracted?.orderNumber || '', 120),
    invoiceDate: cleanText(extracted?.invoiceDate || extracted?.date || '', 80),
    currency: cleanText(extracted?.currency || 'GBP', 10),
    total: toMoney(extracted?.total || extracted?.invoiceTotal || extracted?.orderTotal || ''),
    shippingTotal: toMoney(extracted?.shippingTotal || extracted?.shipping || ''),
    taxTotal: toMoney(extracted?.taxTotal || extracted?.tax || ''),
    discountTotal: toMoney(extracted?.discountTotal || extracted?.discount || ''),
    confidence: Number(extracted?.confidence || (extracted ? 0.75 : fallbackLines.length ? 0.35 : 0.1)),
    lines,
    warning: extractionError || (!process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY is not configured, so invoice image extraction used notes/fallback text only.' : ''),
  };
}

module.exports = { extractInvoiceProducts, lineFromRaw };
