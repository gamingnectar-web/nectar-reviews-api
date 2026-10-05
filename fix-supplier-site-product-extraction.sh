#!/usr/bin/env bash
set -euo pipefail

FILE="src/modules/product-creation-import/extractors/urlProductExtractor.js"
if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found. Run this from the repo root."
  exit 1
fi

cp "$FILE" "${FILE}.bak-shopify-json"

python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/extractors/urlProductExtractor.js")
s=p.read_text()

marker="async function extractProductFromUrl(url) {"
if marker not in s:
    raise SystemExit("extractProductFromUrl not found")

helper = r"""
const shopifyCatalogueCache = new Map();

function shopifyHandleFromUrl(sourceUrl = '') {
  try {
    const parsed = new URL(sourceUrl);
    const match = parsed.pathname.match(/^\/products\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (_) { return ''; }
}

function shopifyMoney(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return (value / 100).toFixed(2);
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw) && Number(raw) >= 100) return (Number(raw) / 100).toFixed(2);
  return toMoney(raw);
}

function shopifyImageList(product = {}, title = '') {
  const raw = [];
  if (product.featured_image) raw.push(product.featured_image);
  if (Array.isArray(product.images)) raw.push(...product.images);
  return dedupeImageCandidates(raw.map((image, index) => {
    if (typeof image === 'string') {
      return { src:image, alt:index===0?title:`${title} product image ${index+1}`, source:'shopify-public-json', originalIndex:index };
    }
    return {
      src:image?.src || image?.url || '',
      alt:cleanText(image?.alt || (index===0?title:`${title} product image ${index+1}`),180),
      source:'shopify-public-json',
      originalIndex:Number.isFinite(Number(image?.position)) ? Number(image.position)-1 : index,
    };
  }));
}

function shopifyProductToDraft(product = {}, sourceUrl = '') {
  const title=cleanText(product.title || '',220);
  if (!title) return null;
  const variants=Array.isArray(product.variants)?product.variants:[];
  const first=variants.find(v=>v && v.available!==false) || variants[0] || {};
  const barcode=variants.find(v=>v?.barcode)?.barcode || first.barcode || '';
  const sku=variants.find(v=>v?.sku)?.sku || first.sku || '';
  const bodyHtml=String(product.description || product.body_html || '');
  const images=shopifyImageList(product,title);
  const weight=first.weight !== undefined && first.weight !== null ? String(first.weight) : '';
  const unit=cleanText(first.weight_unit || 'g',10).toLowerCase();

  const draft=normaliseDraftProduct({
    source:'shopify-public-json',
    sourceUrl,
    title,
    handle:product.handle || shopifyHandleFromUrl(sourceUrl),
    descriptionHtml:bodyHtml,
    vendor:product.vendor || '',
    productType:product.type || product.product_type || '',
    price:shopifyMoney(first.price ?? product.price),
    compareAtPrice:shopifyMoney(first.compare_at_price ?? product.compare_at_price),
    sku,
    barcode,
    weight,
    weightUnit:['g','kg','oz','lb'].includes(unit)?unit:'g',
    images,
    tags:Array.isArray(product.tags)?product.tags:String(product.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
    seo:{ title, description:cleanText(bodyHtml.replace(/<[^>]+>/g,' '),160) },
    sourceVariants:variants,
    sourceOptions:product.options || [],
    sourceProductId:product.id || '',
    rawSupplierProduct:product,
  });

  return {
    ...draft,
    confidence:0.99,
    rawExtract:{
      source:'shopify-public-json',
      sourceUrl,
      sourceProductId:product.id || '',
      handle:product.handle || shopifyHandleFromUrl(sourceUrl),
      imageCount:images.length,
      variantCount:variants.length,
      sourceVariants:variants,
      sourceOptions:product.options || [],
      rawSupplierProduct:product,
      barcodeSource:barcode?'shopify-variant':'',
      skuSource:sku?'shopify-variant':'',
    }
  };
}

async function fetchPublicShopifyJson(url, timeoutMs=15000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(url,{
      headers:{'User-Agent':'Mozilla/5.0 NectarProductImporter/2.0',Accept:'application/json,text/plain;q=0.9,*/*;q=0.5'},
      redirect:'follow',
      signal:controller.signal
    });
    if (!response.ok) return null;
    const parsed=safeJsonParse(await response.text());
    return parsed && typeof parsed==='object' ? parsed : null;
  } catch (_) { return null; }
  finally { clearTimeout(timer); }
}

async function loadShopifyCatalogue(origin) {
  const cached=shopifyCatalogueCache.get(origin);
  if (cached && Date.now()-cached.loadedAt < 10*60*1000) return cached.products;
  const products=[];
  for (let page=1; page<=10; page+=1) {
    const json=await fetchPublicShopifyJson(`${origin}/products.json?limit=250&page=${page}`);
    const rows=Array.isArray(json?.products)?json.products:[];
    if (!rows.length) break;
    products.push(...rows);
    if (rows.length<250) break;
  }
  if (products.length) shopifyCatalogueCache.set(origin,{loadedAt:Date.now(),products});
  return products;
}

async function extractShopifyProductFromPublicJson(sourceUrl='') {
  const handle=shopifyHandleFromUrl(sourceUrl);
  if (!handle) return null;
  let origin;
  try { origin=new URL(sourceUrl).origin; } catch (_) { return null; }

  const direct=await fetchPublicShopifyJson(`${origin}/products/${encodeURIComponent(handle)}.js`);
  if (direct?.title) return shopifyProductToDraft(direct,sourceUrl);

  const catalogue=await loadShopifyCatalogue(origin);
  const product=catalogue.find(row=>String(row?.handle||'').toLowerCase()===handle.toLowerCase());
  return product ? shopifyProductToDraft(product,sourceUrl) : null;
}
"""

if "const shopifyCatalogueCache = new Map();" not in s:
    s=s.replace(marker,helper+"\n"+marker)

needle="""  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 NectarProductImporter/1.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
    },
  });"""

replacement="""  const shopifyJsonProduct = await extractShopifyProductFromPublicJson(sourceUrl);
  if (shopifyJsonProduct) return shopifyJsonProduct;

  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 NectarProductImporter/2.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
    },
  });"""

if needle not in s:
    raise SystemExit("HTML fetch block not found")

s=s.replace(needle,replacement)
p.write_text(s)
print("Patched",p)
PY

node --check "$FILE"

echo
echo "Patch complete."
echo "Run next:"
echo "npm run deploy:preflight"
echo "git add src/modules/product-creation-import/extractors/urlProductExtractor.js"
echo 'git commit -m "Fix supplier site Shopify product extraction"'
echo "git push origin clean-main"
