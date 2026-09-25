const { cleanUrl } = require('../utils/safe');
const { supplierDefaultsForUrl } = require('./supplierProfile.service');

function xmlLocs(xml=''){ return Array.from(String(xml).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)).map(m=>m[1].trim()); }
function productUrl(url=''){ try{return /\/products\/[^/?#]+\/?$/.test(new URL(url).pathname);}catch(_){return false;} }

async function fetchText(url,timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      headers:{'User-Agent':'Mozilla/5.0 ELEV8 Product Importer/2.0','Accept':'application/json,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8'},
      redirect:'follow',
      signal:controller.signal
    });
    if(!response.ok) throw new Error(`Discovery fetch failed ${response.status} for ${url}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

async function discoverShopifyCatalogue(rootUrl,maxProducts=500){
  const root=new URL(rootUrl);
  const products=[];
  for(let page=1; products.length<maxProducts && page<=10; page+=1){
    let json;
    try{ json=JSON.parse(await fetchText(`${root.origin}/products.json?limit=250&page=${page}`)); }
    catch(_){ break; }
    const rows=Array.isArray(json.products)?json.products:[];
    if(!rows.length) break;
    for(const product of rows){
      if(product?.handle) products.push(product);
      if(products.length>=maxProducts) break;
    }
    if(rows.length<250) break;
  }
  return products.slice(0,maxProducts);
}

async function discoverFromSitemap(rootUrl,maxProducts=500){
  const root=new URL(rootUrl);
  const main=await fetchText(`${root.origin}/sitemap.xml`);
  const locs=xmlLocs(main);
  const direct=locs.filter(productUrl);
  const childMaps=locs.filter(url=>/sitemap.*\.xml/i.test(url));
  const products=[...direct];
  for(const mapUrl of childMaps){
    if(products.length>=maxProducts) break;
    if(!/product/i.test(mapUrl)&&childMaps.some(x=>/product/i.test(x))) continue;
    try{
      const xml=await fetchText(mapUrl);
      for(const url of xmlLocs(xml)){
        if(productUrl(url)) products.push(url);
        if(products.length>=maxProducts) break;
      }
    }catch(error){ console.warn('[site-import] sitemap child skipped:',mapUrl,error.message); }
  }
  return Array.from(new Set(products)).slice(0,maxProducts);
}

async function discoverShopifyProductsJson(rootUrl,maxProducts=500){
  const root=new URL(rootUrl);
  const products=await discoverShopifyCatalogue(rootUrl,maxProducts);
  return products.map(product=>`${root.origin}/products/${product.handle}`);
}

async function discoverSiteProducts({rootUrl,maxProducts=500}){
  const safe=cleanUrl(rootUrl);
  if(!safe) throw new Error('A valid supplier website URL is required.');
  const root=new URL(safe);

  const structured=await discoverShopifyCatalogue(safe,maxProducts).catch(()=>[]);
  if(structured.length){
    return {
      rootUrl:safe,
      method:'shopify-products-json',
      urls:structured.map(product=>`${root.origin}/products/${product.handle}`),
      products:structured,
      count:structured.length,
      supplierDefaults:supplierDefaultsForUrl(safe)
    };
  }

  let urls=[];
  try{ urls=await discoverFromSitemap(safe,maxProducts); }
  catch(error){ console.warn('[site-import] sitemap discovery failed:',error.message); }
  if(!urls.length) throw new Error('No product URLs could be discovered from this site.');

  return {rootUrl:safe,method:'sitemap',urls,products:[],count:urls.length,supplierDefaults:supplierDefaultsForUrl(safe)};
}

module.exports={discoverSiteProducts,discoverFromSitemap,discoverShopifyProductsJson,discoverShopifyCatalogue};
