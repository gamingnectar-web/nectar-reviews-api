const { cleanText, makeLineId, safeJsonParse, suggestedRetailFromCost, toMoney } = require('../utils/safe');

function lineFromRaw(raw = {}, index = 0) {
  const unitCost = toMoney(raw.unitCost || raw.pricePaid || raw.cost || raw.unit_price || raw.price || '');
  const totalCost = toMoney(raw.totalCost || raw.lineTotal || raw.total || '');
  return {
    lineId: raw.lineId || makeLineId(index),
    title: cleanText(raw.title || raw.productTitle || raw.name || raw.description || '', 220),
    sku: cleanText(raw.sku || raw.SKU || '', 120),
    barcode: cleanText(raw.barcode || raw.gtin || raw.ean || '', 120),
    supplierProductCode: cleanText(raw.supplierProductCode || raw.productCode || raw.code || '', 120),
    quantity: Number(raw.quantity || raw.qty || 1) || 1,
    unitCost,
    totalCost,
    suggestedRetailPrice: cleanText(raw.suggestedRetailPrice || suggestedRetailFromCost(unitCost), 40),
    imageUrl: cleanText(raw.imageUrl || raw.image || '', 500),
    sourceUrl: cleanText(raw.sourceUrl || raw.url || '', 500),
    confidence: Number(raw.confidence || 0.6),
    raw,
    match: { status: 'unmatched', score: 0, reason: 'Not matched yet.' },
  };
}

function parseLinesFromNotes(notes = '') {
  const text = String(notes || '').trim();
  if (!text) return [];
  const rows = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 40);
  return rows.map((row, index) => {
    const moneyMatches = row.match(/(?:£|GBP|USD|EUR|\$|€)?\s*\d+(?:[.,]\d{2})?/g) || [];
    const unitCost = moneyMatches.length ? moneyMatches[moneyMatches.length - 1] : '';
    const title = row.replace(/(?:£|GBP|USD|EUR|\$|€)?\s*\d+(?:[.,]\d{2})?/g, '').replace(/\bqty\s*[:x]?\s*\d+\b/ig, '').replace(/\s{2,}/g, ' ').trim();
    return lineFromRaw({ title: title || row, unitCost, confidence: 0.35, rawText: row }, index);
  });
}

function stripJsonFence(value = '') {
  return String(value || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

async function extractWithOpenAi({ imageDataUrl, filename, notes, supplierUrl }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey || !imageDataUrl) return null;

  const model = process.env.OPENAI_INVOICE_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const prompt = `Extract product purchase data from this supplier invoice for a Shopify product import app. Return ONLY JSON with keys: supplierName, invoiceNumber, invoiceDate, currency, total, lines. lines must be an array of objects with: title, sku, barcode, supplierProductCode, quantity, unitCost, totalCost, imageUrl, sourceUrl, confidence. Prefer product/item rows only, not shipping/VAT/payment rows. Notes: ${notes || ''} Supplier URL: ${supplierUrl || ''} Filename: ${filename || ''}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a careful invoice data extraction engine. Output valid JSON only.' },
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
    invoiceNumber: cleanText(extracted?.invoiceNumber || extracted?.invoiceNo || '', 120),
    invoiceDate: cleanText(extracted?.invoiceDate || extracted?.date || '', 80),
    currency: cleanText(extracted?.currency || 'GBP', 10),
    total: toMoney(extracted?.total || extracted?.invoiceTotal || ''),
    confidence: Number(extracted?.confidence || (extracted ? 0.75 : fallbackLines.length ? 0.35 : 0.1)),
    lines,
    warning: extractionError || (!process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY is not configured, so invoice image extraction used notes/fallback text only.' : ''),
  };
}

module.exports = { extractInvoiceProducts, lineFromRaw };
