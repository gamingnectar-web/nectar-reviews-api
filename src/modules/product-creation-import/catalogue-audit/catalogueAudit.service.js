const { env } = require('../../../config/env');
const { shopifyFetchOptional } = require('../../../utils/shopify');
const { cleanText, cleanUrl } = require('../utils/safe');
const { discoverSiteProducts } = require('../services/siteCatalogDiscovery.service');
const { ProductBrandProfile, ProductCatalogueAudit } = require('./catalogueAudit.model');
const { scrapeBrandUrl } = require('./brandScrape.service');

function keyText(value='') {
  return cleanText(value, 240).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function brandKey(value='') { return keyText(value).replace(/\s+/g, '-'); }
function titleTokens(value='') { return new Set(keyText(value).split(/\s+/).filter(x => x.length > 2)); }
function scoreTitle(a='', b='') {
  const aa=titleTokens(a), bb=titleTokens(b);
  if (!aa.size || !bb.size) return 0;
  let same=0; for (const token of aa) if (bb.has(token)) same++;
  return same / Math.max(aa.size, bb.size);
}
function hostname(url='') { try { return new URL(url).hostname.replace(/^www\./,''); } catch (_) { return ''; } }
function inferBrandFromHost(url='') {
  const host=hostname(url);
  const token=(host.split('.')[0]||'').replace(/[-_]+/g,' ').trim();
  return token.replace(/\b\w/g,c=>c.toUpperCase()).replace(/^X Zero$/i,'X-Zero');
}

async function fetchSupplierProductCard(url) {
  try {
    const root = new URL(url);
    const handle = root.pathname.match(/\/products\/([^/?#]+)/)?.[1] || '';
    if (!handle) return { url, handle:'', title:'' };
    const endpoint = `${root.origin}/products/${handle}.js`;
    const response = await fetch(endpoint, { headers: { 'Accept':'application/json', 'User-Agent':'ELEV8 Catalogue Audit/1.0' } });
    if (!response.ok) throw new Error(String(response.status));
    const product = await response.json();
    return {
      url,
      handle: product.handle || handle,
      title: product.title || '',
      vendor: product.vendor || '',
      productType: product.type || '',
      image: product.featured_image || product.images?.[0] || '',
      tags: Array.isArray(product.tags) ? product.tags : [],
      description: cleanText(String(product.description || '').replace(/<[^>]+>/g,' '), 5000),
    };
  } catch (_) {
    return { url, handle:'', title:'' };
  }
}

async function listAllShopifyProducts({ shopDomain, max=5000 }) {
  const all=[];
  let sinceId='';
  for (let page=0; page<25 && all.length<max; page++) {
    const qs = new URLSearchParams({
      limit:'250',
      fields:'id,title,handle,vendor,product_type,tags,image,images,body_html,template_suffix,status',
    });
    if (sinceId) qs.set('since_id', sinceId);
    const payload = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?${qs.toString()}`, { shopDomain });
    const products = payload?.products || [];
    if (!products.length) break;
    all.push(...products);
    sinceId = String(products[products.length-1].id || '');
    if (products.length < 250) break;
  }
  return all.slice(0,max);
}

function findBestMatch(supplier, products) {
  const sh = keyText(supplier.handle);
  const st = keyText(supplier.title);
  const sv = keyText(supplier.vendor);
  let best=null;
  for (const product of products) {
    const ph=keyText(product.handle), pt=keyText(product.title), pv=keyText(product.vendor);
    let score=0;
    if (sh && ph === sh) score=1;
    else {
      score=scoreTitle(st,pt);
      if (sv && pv && sv===pv) score=Math.min(1, score+0.15);
    }
    if (!best || score>best.score) best={ product, score };
  }
  return best;
}

function productQuality(product={}) {
  const missing=[], weak=[];
  if (!cleanText(product.body_html||'', 5000)) missing.push('description');
  if (!product.image?.src && !(product.images||[]).length) missing.push('images');
  if (!cleanText(product.product_type||'',120)) missing.push('product type');
  if (!cleanText(product.vendor||'',120)) missing.push('vendor');
  if (!cleanText(product.template_suffix||'',120)) weak.push('template');
  const body = cleanText(String(product.body_html||'').replace(/<[^>]+>/g,' '), 5000);
  if (body.length && body.length < 120) weak.push('description');
  return { missing, weak };
}

function extractBrandStats(products=[], vendor='') {
  const vendorKey=keyText(vendor);
  const rows=products.filter(p => !vendorKey || keyText(p.vendor)===vendorKey);
  const countMap=(field)=> {
    const map=new Map();
    rows.forEach(p => {
      const val=cleanText(p[field]||'',160); if (!val) return;
      map.set(val,(map.get(val)||0)+1);
    });
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).map(([value,count])=>({value,count}));
  };
  return {
    products: rows.slice(0,80).map(p=>({
      title:p.title, handle:p.handle, productType:p.product_type,
      tags:Array.isArray(p.tags)?p.tags:String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
      description:cleanText(String(p.body_html||'').replace(/<[^>]+>/g,' '),1200),
    })),
    productTypes: countMap('product_type').slice(0,12),
    templateSuffixes: countMap('template_suffix').slice(0,8),
    productCount: rows.length,
  };
}

async function openAiBrandSuggestion({ brandName, website='', supplierCards=[], shopifyStats={} }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      name: brandName,
      canonicalVendor: brandName,
      website,
      aboutBrand:'',
      shortDescription:'',
      seoTitle:`${brandName} Products UK | Gaming Nectar`,
      seoDescription:`Shop ${brandName} products at Gaming Nectar with UK stock and fast dispatch.`,
      productFamilies: shopifyStats.productTypes?.map(x=>x.value).filter(Boolean).slice(0,8) || [],
      confidence:0.3,
      notes:['OPENAI_API_KEY is not available, so only deterministic fields were proposed.'],
    };
  }

  const prompt = `Create a reusable Shopify brand profile for Gaming Nectar.
Return ONLY valid JSON with:
name, canonicalVendor, website, aboutBrand, shortDescription, seoTitle, seoDescription,
productFamilies, productTypes, claims, howToUse, storage, warnings, countryOfOrigin, confidence.

Rules:
- Base factual claims only on the supplied evidence.
- Do not invent nutrition, manufacturing location, certifications or warnings.
- "aboutBrand" should be useful on product pages, 70-140 words.
- "shortDescription" should be 1-2 sentences.
- SEO title should normally be <= 70 characters and SEO description <= 160 characters.
- Reuse language/patterns from existing Gaming Nectar products where helpful, without copying product-specific text.
- Product families should be broad reusable ranges/categories.
- If evidence does not support a field, return an empty string/array.

BRAND: ${brandName}
WEBSITE: ${website}

SUPPLIER EVIDENCE:
${JSON.stringify(supplierCards.slice(0,24), null, 2)}

EXISTING SHOPIFY BRAND EVIDENCE:
${JSON.stringify(shopifyStats, null, 2)}
`;

  const model = process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      model,
      temperature:0.2,
      response_format:{ type:'json_object' },
      messages:[
        { role:'system', content:'You create accurate ecommerce catalogue metadata from supplied evidence only.' },
        { role:'user', content:prompt },
      ],
    }),
  });
  const json=await response.json();
  if (!response.ok) throw new Error(json?.error?.message || `OpenAI request failed (${response.status})`);
  const text=json?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

function brandMissingFields(profile) {
  const fields=[];
  if (!profile) return ['brand profile'];
  if (!profile.aboutBrand) fields.push('About Brand');
  if (!profile.shortDescription) fields.push('Short description');
  if (!profile.seoTitle) fields.push('Brand SEO title');
  if (!profile.seoDescription) fields.push('Brand SEO description');
  if (!(profile.productFamilies||[]).length && !(profile.productTypes||[]).length) fields.push('Product families');
  if (!profile.website) fields.push('Brand website');
  return fields;
}

async function runCatalogueAudit({ shopDomain, sourceUrl, brandName='' }) {
  const url=cleanUrl(sourceUrl);
  if (!url) throw new Error('A valid supplier or collection URL is required.');
  const inferredBrand=cleanText(brandName || inferBrandFromHost(url),120);
  const audit=await ProductCatalogueAudit.create({
    shopDomain, sourceUrl:url, supplierHost:hostname(url),
    brandName:inferredBrand, brandKey:brandKey(inferredBrand), status:'running'
  });

  try {
    const [discovery, shopifyProducts] = await Promise.all([
      discoverSiteProducts({ rootUrl:url, maxProducts:1000 }),
      listAllShopifyProducts({ shopDomain }),
    ]);

    const supplierCards=[];
    for (let i=0;i<discovery.urls.length;i+=12) {
      const chunk=discovery.urls.slice(i,i+12);
      const cards=await Promise.all(chunk.map(fetchSupplierProductCard));
      supplierCards.push(...cards);
    }

    const existingBrand=await ProductBrandProfile.findOne({ shopDomain, brandKey:brandKey(inferredBrand) }).lean();
    const rows=[];
    for (const supplier of supplierCards) {
      const best=findBestMatch(supplier,shopifyProducts);
      if (!best || best.score < 0.58) {
        rows.push({
          supplierUrl:supplier.url,supplierTitle:supplier.title,supplierHandle:supplier.handle,
          supplierImage:supplier.image,supplierVendor:supplier.vendor,status:'missing',matchScore:best?.score||0
        });
        continue;
      }
      const quality=productQuality(best.product);
      rows.push({
        supplierUrl:supplier.url,supplierTitle:supplier.title,supplierHandle:supplier.handle,
        supplierImage:supplier.image,supplierVendor:supplier.vendor,
        shopifyProductId:String(best.product.id||''),shopifyTitle:best.product.title||'',
        shopifyHandle:best.product.handle||'',matchScore:best.score,
        status:best.score>=0.88 ? ((quality.missing.length||quality.weak.length)?'needs_update':'matched') : 'possible_match',
        missingFields:quality.missing,weakFields:quality.weak,
      });
    }

    const shopifyStats=extractBrandStats(shopifyProducts,inferredBrand);
    const suggestion=await openAiBrandSuggestion({
      brandName:inferredBrand,website:new URL(url).origin,
      supplierCards,shopifyStats
    }).catch(error=>({ name:inferredBrand,canonicalVendor:inferredBrand,website:new URL(url).origin,confidence:0,notes:[error.message] }));

    const matched=rows.filter(r=>r.status==='matched').length;
    const missing=rows.filter(r=>r.status==='missing').length;
    const possible=rows.filter(r=>r.status==='possible_match').length;
    const needsUpdate=rows.filter(r=>r.status==='needs_update').length;
    const covered=matched+needsUpdate;
    audit.products=rows;
    audit.discoveredCount=rows.length;
    audit.matchedCount=matched;
    audit.missingCount=missing;
    audit.possibleMatchCount=possible;
    audit.needsUpdateCount=needsUpdate;
    audit.coveragePercent=rows.length ? Math.round((covered/rows.length)*1000)/10 : 0;
    audit.brandProfileMissing=!existingBrand;
    audit.brandProfileId=existingBrand?._id||null;
    audit.missingBrandFields=brandMissingFields(existingBrand);
    audit.suggestedBrand=suggestion;
    audit.discoveryMethod=discovery.method;
    audit.status='complete';
    audit.completedAt=new Date();
    await audit.save();

    return { audit, brandProfile:existingBrand, suggestion };
  } catch (error) {
    audit.status='failed';audit.error=cleanText(error.message||'Audit failed',1000);audit.completedAt=new Date();
    await audit.save();
    throw error;
  }
}

async function listAudits({ shopDomain, limit=30 }) {
  return ProductCatalogueAudit.find({shopDomain}).sort({createdAt:-1}).limit(Math.min(Number(limit)||30,100)).lean();
}
async function getAudit({ shopDomain, auditId }) {
  const audit=await ProductCatalogueAudit.findOne({_id:auditId,shopDomain}).lean();
  if (!audit) { const e=new Error('Catalogue audit not found.');e.status=404;throw e; }
  return audit;
}
async function listBrands({ shopDomain }) {
  return ProductBrandProfile.find({shopDomain}).sort({name:1}).lean();
}
async function saveBrand({ shopDomain, profile={} }) {
  const name=cleanText(profile.name||profile.canonicalVendor||'',120);
  if (!name) { const e=new Error('Brand name is required.');e.status=400;throw e; }
  const key=brandKey(name);
  const doc=await ProductBrandProfile.findOneAndUpdate(
    {shopDomain,brandKey:key},
    {$set:{
      ...profile,shopDomain,brandKey:key,name,
      canonicalVendor:cleanText(profile.canonicalVendor||name,120),
      website:cleanUrl(profile.website||''),
      status:profile.status==='approved'?'approved':'draft',
    }},
    {new:true,upsert:true,setDefaultsOnInsert:true}
  );
  return doc;
}

async function createBrandFromAudit({ shopDomain, auditId, approve=false }) {
  const audit=await ProductCatalogueAudit.findOne({_id:auditId,shopDomain});
  if (!audit) { const e=new Error('Catalogue audit not found.');e.status=404;throw e; }
  const suggestion=audit.suggestedBrand||{};
  const profile=await saveBrand({
    shopDomain,
    profile:{
      ...suggestion,
      name:suggestion.name||audit.brandName,
      canonicalVendor:suggestion.canonicalVendor||audit.brandName,
      website:suggestion.website||new URL(audit.sourceUrl).origin,
      source:'supplier',
      sourceUrls:[audit.sourceUrl],
      confidence:Number(suggestion.confidence||0),
      status:approve?'approved':'draft',
      lastAuditedAt:new Date(),
      evidence:{ auditId:String(audit._id), supplierHost:audit.supplierHost },
    }
  });
  audit.brandProfileId=profile._id;audit.brandProfileMissing=false;audit.missingBrandFields=brandMissingFields(profile);
  await audit.save();
  return profile;
}

async function scrapeAndSaveBrand({shopDomain,sourceUrl,brandName='',approve=false}){
  const scraped=await scrapeBrandUrl({sourceUrl,brandName});
  const s=scraped.suggestion||{};
  const profile=await saveBrand({shopDomain,profile:{
    ...s,
    name:s.name||scraped.brandName,
    canonicalVendor:s.canonicalVendor||scraped.brandName,
    website:s.website||scraped.website,
    productFamilies:s.productFamilies||[],
    coreProductLines:s.coreProductLines||scraped.deterministicProductLines||[],
    aliases:Array.from(new Set([...(s.aliases||[]),scraped.brandName,s.name,s.canonicalVendor].filter(Boolean))),
    sourceUrls:Array.from(new Set([sourceUrl,...(s.sourceUrls||[])])),
    source:'supplier',confidence:Number(s.confidence||0),status:approve?'approved':'draft',
    lastAuditedAt:new Date(),
    evidence:{...(s.evidence||{}),discoveredCount:scraped.discoveredCount,discoveryMethod:scraped.discoveryMethod,
      sampleProducts:scraped.productCards.slice(0,30).map(p=>({title:p.title,url:p.url,productType:p.productType}))}
  }});
  return {profile,scraped};
}

async function generateBrandsFromShopify({ shopDomain, onlyMissing=true }) {
  const products=await listAllShopifyProducts({shopDomain});
  const vendors=[...new Set(products.map(p=>cleanText(p.vendor||'',120)).filter(Boolean))].sort();
  const existing=await ProductBrandProfile.find({shopDomain}).lean();
  const existingKeys=new Set(existing.map(x=>x.brandKey));
  const results=[];

  for (const vendor of vendors) {
    const key=brandKey(vendor);
    if (onlyMissing && existingKeys.has(key)) continue;
    const stats=extractBrandStats(products,vendor);
    const suggestion=await openAiBrandSuggestion({
      brandName:vendor, website:'', supplierCards:[], shopifyStats:stats
    }).catch(()=>({
      name:vendor,canonicalVendor:vendor,website:'',aboutBrand:'',shortDescription:'',
      seoTitle:`${vendor} Products UK | Gaming Nectar`,
      seoDescription:`Shop ${vendor} products at Gaming Nectar with UK stock and fast dispatch.`,
      productFamilies:stats.productTypes.map(x=>x.value).filter(Boolean),confidence:0.35
    }));
    const profile=await saveBrand({
      shopDomain,
      profile:{
        ...suggestion,name:vendor,canonicalVendor:vendor,
        source:'shopify',confidence:Number(suggestion.confidence||0),
        status:'draft',lastAuditedAt:new Date(),
        evidence:{ shopifyProductCount:stats.productCount }
      }
    });
    results.push(profile);
  }
  return results;
}

module.exports={
  runCatalogueAudit,listAudits,getAudit,listBrands,saveBrand,createBrandFromAudit,
  generateBrandsFromShopify,scrapeAndSaveBrand,listAllShopifyProducts,brandMissingFields
};
