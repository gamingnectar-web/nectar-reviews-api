const { ProductBrandProfile } = require('./catalogueAudit.model');
const { saveBrand } = require('./catalogueAudit.service');
const { deterministicProductLines } = require('./brandScrape.service');

function clean(value='') {
  return String(value || '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function brandKey(value='') {
  return clean(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

async function fetchStorefrontProducts(rootUrl='https://www.gamingnectar.com', max=5000) {
  const origin = new URL(rootUrl).origin;
  const products = [];
  for (let page=1; page<=20 && products.length<max; page++) {
    const response = await fetch(`${origin}/products.json?limit=250&page=${page}`, {
      headers: { Accept:'application/json', 'User-Agent':'ELEV8 Brand Backfill/1.0' },
    });
    if (!response.ok) throw new Error(`Gaming Nectar storefront returned ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload.products) ? payload.products : [];
    if (!rows.length) break;
    products.push(...rows);
    if (rows.length < 250) break;
  }
  return products.slice(0,max);
}

function cardsForVendor(products=[], vendor='') {
  return products
    .filter(p => clean(p.vendor).toLowerCase() === clean(vendor).toLowerCase())
    .map(p => ({
      title: clean(p.title),
      vendor: clean(p.vendor),
      productType: clean(p.product_type),
      tags: Array.isArray(p.tags) ? p.tags : String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
      description: clean(p.body_html || p.description || ''),
      url: `https://www.gamingnectar.com/products/${p.handle}`,
      handle: p.handle || '',
    }));
}

async function aiProfile({ vendor, cards, productLines }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      aboutBrand:'', shortDescription:'',
      seoTitle:`${vendor} Products UK | Gaming Nectar`.slice(0,70),
      seoDescription:`Shop ${vendor} products at Gaming Nectar with UK stock and fast dispatch.`.slice(0,160),
      confidence:0.4,
      productFamilies:productLines.map(x=>x.name),
      coreProductLines:productLines,
    };
  }

  const prompt = `Create a reusable brand profile from Gaming Nectar's existing live storefront products.
Return JSON only with:
aboutBrand, shortDescription, seoTitle, seoDescription, claims, productFamilies,
productTypes, coreProductLines, confidence.

Rules:
- Use only the supplied existing Gaming Nectar product evidence.
- Infer the brand's reusable identity and product families, not product-specific flavour copy.
- Separate materially different product lines.
- Never generalise caffeine/nutrition claims across a whole brand unless all supplied evidence supports it.
- SEO title <=70 characters where practical; description <=160.
- If evidence is insufficient for a field, leave it blank.

VENDOR: ${vendor}
DETERMINISTIC PRODUCT LINES:
${JSON.stringify(productLines, null, 2)}
PRODUCT EVIDENCE:
${JSON.stringify(cards.slice(0,50), null, 2)}`;

  const model = process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      model, temperature:0.15, response_format:{type:'json_object'},
      messages:[
        {role:'system',content:'You create conservative evidence-grounded ecommerce brand metadata.'},
        {role:'user',content:prompt},
      ],
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || `OpenAI failed (${response.status})`);
  return JSON.parse(json?.choices?.[0]?.message?.content || '{}');
}

async function generateBrandsFromStorefront({ shopDomain, rootUrl='https://www.gamingnectar.com', onlyMissing=true }) {
  const products = await fetchStorefrontProducts(rootUrl);
  const vendors = [...new Set(products.map(p=>clean(p.vendor)).filter(Boolean))].sort();
  const existing = await ProductBrandProfile.find({ shopDomain }).lean();
  const existingKeys = new Set(existing.map(x=>x.brandKey));
  const results = [];

  for (const vendor of vendors) {
    const key = brandKey(vendor);
    if (onlyMissing && existingKeys.has(key)) continue;

    const cards = cardsForVendor(products, vendor);
    if (!cards.length) continue;
    const lines = deterministicProductLines(cards);
    const ai = await aiProfile({ vendor, cards, productLines:lines }).catch(() => ({
      aboutBrand:'', shortDescription:'',
      seoTitle:`${vendor} Products UK | Gaming Nectar`.slice(0,70),
      seoDescription:`Shop ${vendor} products at Gaming Nectar with UK stock and fast dispatch.`.slice(0,160),
      confidence:0.35,
      productFamilies:lines.map(x=>x.name),
      coreProductLines:lines,
    }));

    const profile = await saveBrand({
      shopDomain,
      profile:{
        ...ai,
        name:vendor,
        canonicalVendor:vendor,
        website:'',
        productFamilies:Array.isArray(ai.productFamilies) ? ai.productFamilies : lines.map(x=>x.name),
        coreProductLines:Array.isArray(ai.coreProductLines) ? ai.coreProductLines : lines,
        productTypes:[...new Set(cards.map(x=>x.productType).filter(Boolean))],
        source:'shopify',
        sourceUrls:Array.from(new Set(cards.slice(0,20).map(x=>x.url))),
        confidence:Number(ai.confidence || 0.35),
        status:'draft',
        lastAuditedAt:new Date(),
        evidence:{
          source:'gamingnectar-storefront',
          productCount:cards.length,
          sampleProducts:cards.slice(0,20).map(x=>({title:x.title,url:x.url,productType:x.productType})),
        },
      },
    });
    results.push(profile);
  }

  return { brands:results, created:results.length, vendorCount:vendors.length, productCount:products.length };
}

module.exports = { generateBrandsFromStorefront, fetchStorefrontProducts };
