'use strict';
// Optional native Shopify fixed-bundle linking. Never adjusts inventory implicitly.
const { shopifyGraphql } = require('./shopifyProduct.service');
const { cleanText } = require('../utils/safe');
const gid = (s, type) => { const v=String(s||''); return v.startsWith('gid://shopify/') ? v : /^\d+$/.test(v) ? `gid://shopify/${type}/${v}` : ''; };
function fail(message,status=422) { const e=new Error(message);e.status=status;throw e; }
function errors(payload) { const list=payload?.userErrors||[];if(list.length)fail(list.map(x=>`${x.field||''} ${x.message}`).join('; ')); }
const money = v => /^\d+(?:\.\d{1,2})?$/.test(String(v||''));
function specRows(draft) {
  const enabled=(draft?.variants||[]).filter(v=>v.included!==false && v.packBreakdown?.enabled);
  if(!enabled.length)fail('Enable pack breakdown on at least one variation.');
  const options=draft.options||[];
  const flavourIndex=options.findIndex(o=>/flavou?r|scent|colour|color|style/i.test(o.name));
  if(flavourIndex<0 && enabled.length>1)fail('A flavour/colour/style option is required to share stock correctly across multiple variations.');
  const rows=[];
  const seenSourceIds=new Set();
  for(const v of enabled){
    const key=flavourIndex<0 ? 'Single' : String(v.options?.[flavourIndex]?.value||'').trim();
    const count=Number(v.packBreakdown?.unitsPerPack);
    const price=String(v.packBreakdown?.singlePrice||'');
    const id=String(v.sourceVariantId||'');
    if(!key||!Number.isSafeInteger(count)||count<2||count>1000)fail(`Invalid pack size or option for ${id||'a variation'}.`);
    if(!money(price))fail(`Individual unit price is required for ${key}.`);
    if(!id||seenSourceIds.has(id))fail('Every enabled source variation must have a unique supplier variant ID.');
    seenSourceIds.add(id);
    rows.push({sourceVariantId:id,flavour:key,count,price,packSku:String(v.sku||'').trim(),imageUrl:String(v.imageUrl||'')});
  }
  const byFlavour=new Map();
  for(const r of rows){
    const old=byFlavour.get(r.flavour.toLowerCase());
    if(old && old.price!==r.price)fail(`Individual unit prices differ for ${r.flavour}; variants sharing a stock pool must have the same unit price.`);
    if(!old)byFlavour.set(r.flavour.toLowerCase(),r);
  }
  return {rows, components:[...byFlavour.values()]};
}
async function getParentVariants(shopDomain,productId){
  let after=null;const variants=[];
  do {
    const data=await shopifyGraphql({shopDomain,query:`query PackParent($id:ID!,$after:String){ product(id:$id){ id title variants(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id sku selectedOptions{name value} productVariantComponents(first:2){nodes{id}}} } } }`,variables:{id:productId,after}});
    if(!data.product)fail('Parent Shopify draft does not exist.');
    variants.push(...data.product.variants.nodes);
    if(!data.product.variants.pageInfo.hasNextPage)break;
    after=data.product.variants.pageInfo.endCursor;
  }while(variants.length<2100);
  return variants;
}
function findParent(parentVariants, sourceDraft, row) {
  const source=sourceDraft.variants.find(v=>String(v.sourceVariantId||'')===row.sourceVariantId);
  if(!source)return null;
  return parentVariants.find(p=>{
    const attrs=p.selectedOptions||[];
    return (source.options||[]).every(o=>attrs.some(a=>a.name===o.name && a.value===o.value));
  });
}
async function checkBundleAccess({shopDomain}) {
  const data=await shopifyGraphql({shopDomain,query:`query PackBundleAccess{shop{features{bundles{eligibleForBundles ineligibilityReason}}}}`});
  const bundle=data.shop?.features?.bundles;
  if(!bundle?.eligibleForBundles)fail(`Shopify Bundles is not available on this shop${bundle?.ineligibilityReason ? ': '+bundle.ineligibilityReason : ''}.`);
  return true;
}
async function configureNativePackBreakdown({shopDomain,draft,parentProductId}){
  const parentId=gid(parentProductId,'Product');
  if(!shopDomain||!parentId)fail('Shop and parent product ID are required.');
  const {rows,components}=specRows(draft);
  // Validate everything before any mutation. Never touch inventory without an explicit action.
  await checkBundleAccess({shopDomain});
  const parents=await getParentVariants(shopDomain,parentId);
  const associations=rows.map(r=>({row:r,parent:findParent(parents,draft,r)}));
  if(associations.some(a=>!a.parent))fail('Some parent variants were not found in the Shopify draft; no stock links created.');
  if(associations.some(a=>a.parent.productVariantComponents?.nodes?.length))fail('At least one variation is already a bundle. Refusing to overwrite an existing component relationship.');
  const componentProduct={title:`${cleanText(draft.title,175)} — Individual Units`,vendor:cleanText(draft.vendor||'',120),status:'DRAFT',descriptionHtml:`Individual units from ${cleanText(draft.title,175)}. Stock is counted in units.`, productOptions:[{name:'Flavour',values:components.map(c=>({name:c.flavour}))}]};
  const created=await shopifyGraphql({shopDomain,query:`mutation PackComponentCreate($product:ProductCreateInput!){productCreate(product:$product){product{id title variants(first:5){nodes{id}}}userErrors{field message}}}`,variables:{product:componentProduct}});
  errors(created.productCreate);
  const single=created.productCreate?.product;
  if(!single?.id)fail('Shopify did not create the individual-unit draft.');
  const output={componentProductId:single.id,parentProductId:parentId,createdUnitVariants:[],linked:[],errors:[]};
  try{
    const bulk=await shopifyGraphql({shopDomain,query:`mutation PackComponentVariants($id:ID!,$variants:[ProductVariantsBulkInput!]!,$strategy:ProductVariantsBulkCreateStrategy!){productVariantsBulkCreate(productId:$id,variants:$variants,strategy:$strategy){productVariants{id sku selectedOptions{name value}}userErrors{field message}}}`,variables:{id:single.id,strategy:'REMOVE_STANDALONE_VARIANT',variants:components.map(c=>({price:c.price, optionValues:[{optionName:'Flavour',name:c.flavour}],inventoryItem:{tracked:true,sku:cleanText(`${c.packSku||'PACK'}-SINGLE`,120)}}))}});
    errors(bulk.productVariantsBulkCreate);
    output.createdUnitVariants=bulk.productVariantsBulkCreate?.productVariants||[];
    if(output.createdUnitVariants.length!==components.length)fail('Shopify created a different number of individual-unit variants than expected.');
    const unitByFlavour=new Map(output.createdUnitVariants.map(v=>[String(v.selectedOptions?.find(o=>o.name==='Flavour')?.value||'').toLowerCase(),v]));
    const relationships=associations.map(({row,parent})=>{
      const child=unitByFlavour.get(row.flavour.toLowerCase());
      if(!child?.id)fail(`Missing individual-unit variant for ${row.flavour}.`);
      return { parentProductVariantId:parent.id,productVariantRelationshipsToCreate:[{id:child.id,quantity:row.count}]};
    });
    const linked=await shopifyGraphql({shopDomain,query:`mutation LinkNativeBundles($input:[ProductVariantRelationshipUpdateInput!]!){productVariantRelationshipBulkUpdate(input:$input){parentProductVariants{id requiresComponents productVariantComponents(first:30){nodes{quantity productVariant{id}}}}userErrors{code field message}}}`,variables:{input:relationships}});
    errors(linked.productVariantRelationshipBulkUpdate);
    output.linked=linked.productVariantRelationshipBulkUpdate?.parentProductVariants||[];
    if(output.linked.length!==relationships.length)fail('Shopify did not confirm all parent bundle relationships.');
    for(let i=0;i<output.linked.length;i++){
      const p=output.linked[i];if(!p.requiresComponents||!p.productVariantComponents?.nodes?.length)fail(`Bundle relationship not confirmed for ${p.id}.`);
    }
    return output;
  }catch(error){
    error.message=`Individual-unit draft ${single.id} was created; native bundle setup is incomplete. Do not publish either product. ${error.message}`;
    error.componentProductId=single.id;
    throw error;
  }
}
module.exports={configureNativePackBreakdown,specRows,checkBundleAccess};
