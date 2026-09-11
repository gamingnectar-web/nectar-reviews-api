const { cleanText, normaliseMetafields } = require('../../utils/safe');

const XZERO_HOSTS = new Set(['x-zero.co.uk', 'www.x-zero.co.uk']);

function isXZeroUrl(value = '') {
  try { return XZERO_HOSTS.has(new URL(value).hostname.toLowerCase()); }
  catch (_) { return false; }
}

function plain(value = '') {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function sourceText(draft = {}) {
  return [draft.title, draft.descriptionHtml, draft.raw?.title, draft.raw?.description, draft.raw?.body, draft.sourceUrl]
    .filter(Boolean).map(plain).join(' ');
}

function classifyXZeroProduct(draft = {}) {
  const text = sourceText(draft).toLowerCase();
  if (/hydration\+?/.test(text)) return 'hydration_powder';
  if (/energy\s*pouch|pouches/.test(text)) return 'energy_pouch';
  if (/shaker/.test(text)) return 'shaker';
  if (/mouse\s*pad|mousepad/.test(text)) return 'mousepad';
  if (/air\s*freshener/.test(text)) return 'air_freshener';
  if (/sample\s*pack|starter\s*pack/.test(text) && /shaker|sample/.test(text)) return 'bundle';
  if (/sample/.test(text) && !/mousepad/.test(text)) return 'sample';
  if (/160\s*g|servings?|powdered\s+energy|energy\s+drink/.test(text)) return 'energy_powder';
  if (/merch|hoodie|shirt|tee|cap|hat/.test(text)) return 'merch';
  return 'other';
}

function meta(namespace, key, type, value, label, confidence = 0.98) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return { namespace, key, type, value: String(value), label, source: 'xzero-supplier-profile', confidence };
}

function parseWeight(text = '') {
  const m = String(text).match(/\b(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!m) return null;
  let value = Number(m[1]);
  if (m[2].toLowerCase() === 'kg') value *= 1000;
  return { value: String(value), unit: 'g' };
}

function parseServings(text = '') {
  const m = String(text).match(/\b(\d{1,3})\s*servings?\b/i);
  return m ? Number(m[1]) : null;
}

function parseCapacity(text = '') {
  const m = String(text).match(/\b(\d{3,4})\s*ml\b/i);
  return m ? `${m[1]}ml` : '';
}

function parseDimensions(text = '') {
  const m = String(text).match(/\b(\d{2,4})\s*[x×]\s*(\d{2,4})\s*mm\b/i);
  return m ? `${m[1]}x${m[2]}mm` : '';
}

function cleanFlavourFromTitle(title = '', family = '') {
  let value = plain(title)
    .replace(/^x[\s-]*zero\s*/i, '')
    .replace(/\benergy\s*drink\b/ig, '')
    .replace(/\bhydration\+?\b/ig, '')
    .replace(/\(\s*\d+(?:\.\d+)?\s*g\s*\/?\s*\d+\s*servings?\s*\)/ig, '')
    .replace(/\(\s*\d+(?:\.\d+)?\s*g\s*\)/ig, '')
    .replace(/\(\s*\d+\s*servings?\s*\)/ig, '')
    .replace(/\b160g\b/ig, '').replace(/\b100\s*servings?\b/ig, '')
    .replace(/\s{2,}/g, ' ').replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '').trim();
  if (!value || /^(energy|drink|powder|product)$/i.test(value)) return '';
  if (['shaker','mousepad','air_freshener','merch','energy_pouch','bundle'].includes(family)) return '';
  return cleanText(value, 120);
}

function aboutBrand() {
  return 'X-Zero creates powdered energy and hydration drinks focused on bold flavours and convenient mixing. Its core X-Zero energy range is positioned as zero sugar, zero calories and zero fat, while Hydration+ is designed without caffeine or taurine.';
}

function familyDefaults(family) {
  switch (family) {
    case 'energy_powder': return { productType:'Energy Drink Powder', handleFormat:'Energy Drink Powder Tub', facts:{ product_family:'Energy Powder', caffeine_mg_per_serving:100, zero_sugar:true, zero_calories:true, zero_fat:true, vegan:true, keto_friendly:true, preparation:'Add two flat scoops to 350-500ml of water and shake. Serve over ice if preferred.', storage:'Store sealed in a dry area. X-Zero recommends consuming within 3 months of opening and within 6 months unopened.' } };
    case 'hydration_powder': return { productType:'Hydration Powder', handleFormat:'Hydration Powder Tub', facts:{ product_family:'Hydration Powder', caffeine_mg_per_serving:0, taurine_mg_per_serving:0, zero_caffeine:true, zero_taurine:true, zero_sugar:true, zero_calories:true, preparation:'Add two flat scoops to 350-500ml of water and shake. Serve over ice if preferred.' } };
    case 'shaker': return { productType:'Shaker Cup', handleFormat:'Shaker Cup', facts:{ product_family:'Shaker' } };
    case 'mousepad': return { productType:'Mousepad', handleFormat:'Mousepad', facts:{ product_family:'Mousepad' } };
    case 'air_freshener': return { productType:'Air Freshener', handleFormat:'Car Air Freshener', facts:{ product_family:'Air Freshener' } };
    case 'energy_pouch': return { productType:'Energy Pouches', handleFormat:'Energy Pouches', facts:{ product_family:'Energy Pouches', nicotine_free:true, tobacco_free:true, vegan:true, keto_friendly:true } };
    case 'bundle': return { productType:'Bundle', handleFormat:'Starter Bundle', facts:{ product_family:'Bundle' } };
    case 'sample': return { productType:'Energy Drink Sample', handleFormat:'Energy Drink Sample', facts:{ product_family:'Sample' } };
    case 'merch': return { productType:'Merchandise', handleFormat:'Merchandise', facts:{ product_family:'Merchandise' } };
    default: return { productType:'', handleFormat:'', facts:{ product_family:'Other' } };
  }
}

function applyXZeroProfile(draft = {}) {
  if (!isXZeroUrl(draft.sourceUrl || draft.url || '')) return draft;
  const family = classifyXZeroProduct(draft);
  const defaults = familyDefaults(family);
  const text = sourceText(draft);
  const weight = parseWeight(text);
  const servings = parseServings(text);
  const capacity = parseCapacity(text);
  const dimensions = parseDimensions(text);
  const flavour = cleanFlavourFromTitle(draft.title, family);
  const facts = { ...defaults.facts, supplier:'X-Zero', brand:'X-Zero', about_brand:aboutBrand(), net_weight_g:weight?.value || '', servings:servings || '', capacity:capacity || '', dimensions:dimensions || '' };
  if (family === 'bundle') {
    const contents = plain(draft.descriptionHtml).split(/(?<=[.!?])\s+|\s{2,}/).filter(line => /sample|shaker/i.test(line) && line.length < 160);
    if (contents.length) facts.bundle_contents = contents.slice(0, 12).join(' | ');
  }
  const standardMetafields = [
    meta('core','product_flavour','single_line_text_field',flavour,'Product Flavour',0.99),
    meta('nutrition','servings','number_integer',servings,'Servings',0.99),
    meta('nutrition','caffeine_mg_per_serving','number_integer',['energy_powder','hydration_powder'].includes(family)?defaults.facts.caffeine_mg_per_serving:'','Caffeine MG Per Serving',0.99),
    meta('nutrition','sugar_g_per_serving','number_decimal',['energy_powder','hydration_powder'].includes(family)&&defaults.facts.zero_sugar?0:'','Sugar G Per Serving',0.99),
  ].filter(Boolean);
  return { ...draft, vendor:draft.vendor || 'X-Zero', productType:draft.productType || defaults.productType, handleFormat:draft.handleFormat || defaults.handleFormat, weight:draft.weight || weight?.value || '', weightUnit:draft.weightUnit || (weight?'g':draft.weightUnit || 'g'), metafields:normaliseMetafields([...(draft.metafields || []), ...standardMetafields]), enrichment:{ ...(draft.enrichment || {}), supplierProfile:'x-zero', supplierFamily:family, supplierFacts:facts, supplierEvidence:{ sourceUrl:draft.sourceUrl || '', sourceText:cleanText(plain(text),5000) } } };
}

module.exports = { isXZeroUrl, classifyXZeroProduct, applyXZeroProfile, familyDefaults, aboutBrand };
