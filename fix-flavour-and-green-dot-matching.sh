#!/usr/bin/env bash
set -euo pipefail

REQ=(
  "src/modules/product-creation-import/services/supplierFactMapper.service.js"
  "src/modules/product-creation-import/services/shopifyProduct.service.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "public/admin.html"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path
import re

# 1) Current Flavour is authoritative for all matched Shopify flavour fields.
p=Path("src/modules/product-creation-import/services/supplierFactMapper.service.js")
s=p.read_text()
s=s.replace(
"    labels: ['product flavour','product flavor','flavour','flavor','flavour name','flavor name','taste'],\n    exclude: ['family','profile','sweet','sour','description']",
"    labels: ['product flavour','product flavor','flavour','flavor','flavour name','flavor name','taste','flavour profile','flavor profile'],\n    exclude: ['family','sweet','sour','description']"
)
old = """    const matches=organisationFieldDefinitionMatches(field,definitions);\n    for(const match of matches){\n      metafields=normaliseMetafields([\n        ...metafields,\n        {\n          namespace:match.namespace,\n          key:match.key,\n          type:match.type||'single_line_text_field',\n          label:match.name,\n          value:String(value).trim(),\n          source:'organisation-field-mapper',\n          confidence:match.canonical?1:0.96\n        }\n      ]);\n    }"""
new = """    const matches=organisationFieldDefinitionMatches(field,definitions);\n    const matchedKeys=new Set(matches.map(match=>`${match.namespace}.${match.key}`));\n    metafields=metafields.filter(mf=>!matchedKeys.has(`${mf.namespace}.${mf.key}`));\n    for(const match of matches){\n      metafields=normaliseMetafields([\n        ...metafields,\n        {\n          namespace:match.namespace,\n          key:match.key,\n          type:match.type||'single_line_text_field',\n          label:match.name,\n          value:String(value).trim(),\n          source:'organisation-field-mapper',\n          confidence:match.canonical?1:0.99\n        }\n      ]);\n    }"""
if old in s:
    s=s.replace(old,new)
elif "const matchedKeys=new Set(matches.map" not in s:
    raise SystemExit("Could not patch organisation flavour fan-out")
p.write_text(s)

# 2) Replace incomplete REST page=N catalogue fetch with GraphQL cursor pagination.
p=Path("src/modules/product-creation-import/services/shopifyProduct.service.js")
s=p.read_text()
start=s.find("async function listShopifyProductsForMatching(")
end=s.find("\nfunction isValidJsonString", start)
if start < 0 or end < 0:
    raise SystemExit("Could not find listShopifyProductsForMatching()")
replacement = r'''async function listShopifyProductsForMatching({ shopDomain, maxProducts = 2500 }) {
  const wanted=Math.max(1,Math.min(Number(maxProducts)||2500,2500));
  const products=[];
  let after=null;
  const query=`query ProductImportCatalogue($first:Int!,$after:String){
    products(first:$first,after:$after,sortKey:ID){
      pageInfo{hasNextPage endCursor}
      nodes{
        id legacyResourceId title handle vendor productType tags status
        featuredMedia{preview{image{url}}}
        images(first:12){nodes{url}}
        variants(first:100){nodes{id legacyResourceId sku barcode price compareAtPrice inventoryQuantity inventoryItem{id legacyResourceId}}}
      }
    }
  }`;

  while(products.length<wanted){
    const first=Math.min(100,wanted-products.length);
    const data=await shopifyGraphqlOptional({shopDomain,query,variables:{first,after}});
    if(!data?.products) break;

    for(const product of data.products.nodes||[]){
      const variants=product.variants?.nodes||[];
      const firstVariant=variants[0]||{};
      const featured=product.featuredMedia?.preview?.image?.url||product.images?.nodes?.[0]?.url||'';
      products.push({
        id:product.id||'',
        legacyResourceId:String(product.legacyResourceId||numericId(product.id)||''),
        title:product.title||'Product',
        handle:product.handle||'',
        vendor:product.vendor||'',
        productType:product.productType||'',
        tags:Array.isArray(product.tags)?product.tags:[],
        status:product.status||'',
        image:featured,
        images:(product.images?.nodes||[]).map(image=>image.url).filter(Boolean),
        variantId:firstVariant.id||'',
        legacyVariantId:String(firstVariant.legacyResourceId||numericId(firstVariant.id)||''),
        inventoryItemId:firstVariant.inventoryItem?.id||'',
        legacyInventoryItemId:String(firstVariant.inventoryItem?.legacyResourceId||numericId(firstVariant.inventoryItem?.id)||''),
        sku:firstVariant.sku||'',
        barcode:firstVariant.barcode||'',
        skus:variants.map(v=>cleanText(v.sku||'',120)).filter(Boolean),
        barcodes:variants.map(v=>cleanText(v.barcode||'',120)).filter(Boolean),
        price:firstVariant.price||'',
        compareAtPrice:firstVariant.compareAtPrice||'',
        inventoryQuantity:Number(firstVariant.inventoryQuantity||0),
      });
      if(products.length>=wanted) break;
    }

    const pageInfo=data.products.pageInfo||{};
    if(!pageInfo.hasNextPage||!pageInfo.endCursor) break;
    after=pageInfo.endCursor;
  }

  if(!products.length){
    const data=await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&fields=id,title,handle,image,images,variants,tags,vendor,product_type,status`,{shopDomain});
    for(const product of data?.products||[]){
      products.push(restProductToCard(product,{
        status:product.status||'',
        skus:(product.variants||[]).map(v=>cleanText(v.sku||'',120)).filter(Boolean),
        barcodes:(product.variants||[]).map(v=>cleanText(v.barcode||'',120)).filter(Boolean),
      }));
    }
  }

  return products;
}
'''
s=s[:start]+replacement+s[end:]
p.write_text(s)

# 3) Persist a hard confirmed state for green-dot rendering.
p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()
old = """      if(match.confirmed){\n        confirmed+=1;\n        item.status='skipped';\n        item.approvalStatus='rejected';\n        item.error='';\n      }else{"""
new = """      if(match.confirmed){\n        confirmed+=1;\n        item.status='skipped';\n        item.approvalStatus='rejected';\n        item.error='';\n        item.suggestions={\n          ...(item.suggestions||{}),\n          existingProduct:{...match,confirmed:true,matchLevel:'confirmed',exact:true}\n        };\n      }else{"""
if old in s:
    s=s.replace(old,new)
p.write_text(s)

# 4) Force browser to pick up latest Supplier Sites JS/CSS.
p=Path("public/admin.html")
s=p.read_text()
s=re.sub(r'/supplier-sites-admin\.js\?v=[^"\']+', '/supplier-sites-admin.js?v=supplier-sites-11', s)
s=re.sub(r'/supplier-sites-admin\.css\?v=[^"\']+', '/supplier-sites-admin.css?v=supplier-sites-11', s)
p.write_text(s)

print("Applied flavour-authority and full Shopify catalogue matching repair")
PY

node --check src/modules/product-creation-import/services/supplierFactMapper.service.js
node --check src/modules/product-creation-import/services/shopifyProduct.service.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
npm run deploy:preflight

echo
echo "Repair passed."
echo "Then commit with:"
echo "git add src/modules/product-creation-import/services/supplierFactMapper.service.js src/modules/product-creation-import/services/shopifyProduct.service.js src/modules/product-creation-import/services/productImportBatch.service.js public/admin.html"
echo 'git commit -m "Fix flavour metafield authority and Shopify catalogue matching"'
echo "git push origin clean-main"
