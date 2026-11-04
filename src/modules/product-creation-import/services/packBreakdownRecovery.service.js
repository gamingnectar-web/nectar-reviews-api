'use strict';
/** Resumable Shopify native pack inventory setup. ELEV8 OAuth owns writes. */
const { shopifyGraphql } = require('./shopifyProduct.service');
const { cleanText } = require('../utils/safe');

function fail(message, status = 422) { const e = new Error(message); e.status = status; throw e; }
const gid = value => /^gid:\/\/shopify\/Product\/\d+$/.test(String(value || ''))
  ? String(value) : /^\d+$/.test(String(value || '')) ? `gid://shopify/Product/${value}` : '';
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = value => /^\d+(?:\.\d{1,2})?$/.test(String(value || ''));
function checkUserErrors(payload, context) {
  if (!payload) fail(`${context}: Shopify response did not contain the expected mutation result.`);
  if (payload.userErrors?.length) fail(`${context}: ${payload.userErrors.map(e => `${(e.field || []).join?.('.') || ''} ${e.message}`).join(' | ')}`);
}
async function graph(shopDomain, query, variables = {}) { return shopifyGraphql({ shopDomain, query, variables }); }
async function loadProduct(shopDomain, id) {
  const data = await graph(shopDomain, `query RecoverPackProduct($id:ID!){ product(id:$id){ id title handle status vendor variants(first:100){pageInfo{hasNextPage} nodes{id title sku price selectedOptions{name value} requiresComponents productVariantComponents(first:30){nodes{quantity productVariant{id}}} inventoryItem{tracked}}} } }`, { id });
  if (!data.product) fail(`Shopify product ${id} was not found.`);
  if (data.product.variants.pageInfo.hasNextPage) fail('Recovery currently supports up to 100 box variants.');
  return data.product;
}
function buildPlan(parent, draft) {
  if (parent.status !== 'DRAFT') fail('The box product must be a Shopify DRAFT before repairing it.');
  const chosen = (draft?.variants || []).filter(v => v.included !== false && v.packBreakdown?.enabled === true);
  if (!chosen.length) fail('Tick Sell individually / shared stock on at least one variation before repairing.');
  const names = draft?.options || [];
  const flavourIndex = names.findIndex(o => /flavou?r|scent|colour|color|style/i.test(o.name || ''));
  if (flavourIndex < 0 && chosen.length > 1) fail('Cannot safely identify distinct stock pools: a flavour/colour/style option is required.');
  const plan = [];
  const seen = new Set();
  for (const item of chosen) {
    const count = Number(item.packBreakdown.unitsPerPack);
    const unitPrice = String(item.packBreakdown.singlePrice || '');
    if (!Number.isSafeInteger(count) || count < 2 || count > 1000) fail('Units per pack must be a whole number between 2 and 1000.');
    if (!money(unitPrice) || Number(unitPrice) <= 0) fail('Enter a positive individual-unit selling price for every enabled flavour.');
    const values = item.options || [];
    const flavour = String(values[flavourIndex < 0 ? 0 : flavourIndex]?.value || '').trim();
    if (!flavour) fail('Every enabled variation needs a flavour value.');
    const match = parent.variants.nodes.filter(p => values.length && values.every(o => p.selectedOptions.some(a => a.name === o.name && a.value === o.value)));
    if (match.length !== 1) fail(`Cannot match Shopify box variant for ${flavour}; expected one exact option combination.`);
    const box = match[0];
    if (seen.has(box.id)) fail(`Duplicate Shopify box variant selected for ${flavour}.`);
    seen.add(box.id);
    if (box.requiresComponents && !box.productVariantComponents.nodes.length) fail(`Bundle metadata for ${box.title} is inconsistent; manual review needed.`);
    plan.push({boxId:box.id,flavour,count,unitPrice,sku:cleanText(`${box.sku || 'ELEV8'}-SINGLE`,120), linkedComponents:box.productVariantComponents.nodes});
  }
  const unique = new Map();
  for (const p of plan) {
    const key = p.flavour.toLowerCase();
    const prev = unique.get(key);
    if (prev && (prev.unitPrice !== p.unitPrice || prev.sku !== p.sku)) fail(`Conflicting individual-stock details for ${p.flavour}.`);
    if (!prev) unique.set(key,p);
  }
  return {plan, components:[...unique.values()]};
}
async function getComponentByHandle(shopDomain, handle) {
  const data = await graph(shopDomain, `query RecoverExistingUnits($term:String!){products(first:10, query:$term){nodes{id handle title status vendor tags variants(first:100){pageInfo{hasNextPage}nodes{id title sku price selectedOptions{name value} inventoryItem{tracked}}}}}}`, {term:`handle:${handle}`});
  const found = (data.products?.nodes || []).filter(p => p.handle === handle);
  if (found.length > 1) fail('Multiple stock component products share the intended handle; stop and review them.');
  return found[0] || null;
}
async function createComponent(shopDomain, parent, handle, components) {
  const data = await graph(shopDomain, `mutation RecoverCreateUnits($product:ProductCreateInput!){productCreate(product:$product){product{id title handle status}userErrors{field message}}}`, {
    product: {title:`${cleanText(parent.title,160)} — Individual Sticks`,handle, vendor:parent.vendor,status:'DRAFT',tags:['ELEV8_COMPONENT_STOCK'],productOptions:[{name:'Flavour', values:components.map(c=>({name:c.flavour}))}]}
  });
  checkUserErrors(data.productCreate, 'Create individual-stick inventory product');
  if (!data.productCreate.product?.id) fail('Shopify returned no individual-stick product ID.');
  return data.productCreate.product;
}
async function ensureComponents(shopDomain, parent, handle, components) {
  let existing = await getComponentByHandle(shopDomain, handle);
  if (!existing) {
    await createComponent(shopDomain,parent,handle,components);
    existing = await getComponentByHandle(shopDomain,handle);
  }
  if (!existing) fail('Individual-stick draft was created but could not be read back. Do not retry until Shopify responds.');
  if (existing.status !== 'DRAFT' || existing.vendor !== parent.vendor || !existing.tags?.includes('ELEV8_COMPONENT_STOCK')) fail('Potential existing individual-stick product does not match the expected ELEV8 draft/vendor/tag.');
  if (existing.variants.pageInfo.hasNextPage) fail('Individual-stick product contains too many variants to reconcile safely.');
  const byFlavour = new Map();
  for (const v of existing.variants.nodes) {
    const flavour = v.selectedOptions.find(o=>o.name==='Flavour')?.value;
    if (flavour) byFlavour.set(flavour.toLowerCase(), v);
  }
  // Shopify can initialise the first option value as a real variation with £0.
  // Correct only variants owned by our marked draft and refuse non-zero or conflicting SKUs.
  const updateRows=[];
  for (const c of components) {
    const current=byFlavour.get(c.flavour.toLowerCase());
    if (!current) continue;
    if ((current.sku && current.sku !== c.sku) || (Number(current.price)!==0 && Number(current.price)!==Number(c.unitPrice)))
      fail(`Existing unit variant for ${c.flavour} has conflicting SKU or non-zero price; refusing an automatic overwrite.`);
    if (Number(current.price)!==Number(c.unitPrice) || !current.inventoryItem.tracked || current.sku!==c.sku)
      updateRows.push({id:current.id,price:c.unitPrice,inventoryItem:{tracked:true,sku:c.sku}});
  }
  if (updateRows.length) {
    const updated=await graph(shopDomain,`mutation RecoverCorrectUnits($id:ID!,$rows:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$id,variants:$rows,allowPartialUpdates:false){productVariants{id}userErrors{field message}}}`,{id:existing.id,rows:updateRows});
    checkUserErrors(updated.productVariantsBulkUpdate,'Complete initial individual-stick variants');
    existing=await getComponentByHandle(shopDomain,handle);
  }
  const missing = components.filter(c=>!byFlavour.has(c.flavour.toLowerCase()));
  if (missing.length) {
    const isStandalone = existing.variants.nodes.length === 1 && existing.variants.nodes[0].selectedOptions.every(o => o.name==='Title' && o.value==='Default Title');
    const payload = missing.map(c => ({price:c.unitPrice,optionValues:[{optionName:'Flavour',name:c.flavour}],inventoryItem:{tracked:true,sku:c.sku}}));
    const result = await graph(shopDomain, `mutation RecoverUnitVariants($productId:ID!,$rows:[ProductVariantsBulkInput!]!,$strategy:ProductVariantsBulkCreateStrategy!){productVariantsBulkCreate(productId:$productId,variants:$rows,strategy:$strategy){productVariants{id}userErrors{field message}}}`,{productId:existing.id, rows:payload,strategy:isStandalone?'REMOVE_STANDALONE_VARIANT':'DEFAULT'});
    checkUserErrors(result.productVariantsBulkCreate, 'Create missing individual-stick variations');
    existing = await getComponentByHandle(shopDomain,handle);
  }
  const units = new Map();
  for (const c of components) {
    const matches = existing.variants.nodes.filter(v => v.selectedOptions.some(o => o.name==='Flavour' && o.value.toLowerCase()===c.flavour.toLowerCase()));
    if (matches.length!==1) fail(`Individual-stick variant for ${c.flavour} was not created uniquely. Component draft: ${existing.id}`);
    const v=matches[0];
    if (!v.inventoryItem.tracked || v.sku !== c.sku || Number(v.price)!==Number(c.unitPrice)) fail(`Individual-stick variant ${c.flavour} has incorrect inventory/price/SKU. Component draft: ${existing.id}`);
    units.set(c.flavour.toLowerCase(),v);
  }
  return {product: existing,units};
}
async function recoverPackBreakdown({shopDomain,parentProductId,draft}) {
  if (!shopDomain) fail('Missing Shopify installation context.');
  const parentId=gid(parentProductId);
  if (!parentId) fail('Enter a valid existing Shopify parent product ID.');
  const eligibility = await graph(shopDomain,`query RecoverBundleEligibility{shop{features{bundles{eligibleForBundles ineligibilityReason}}}}`);
  const feature=eligibility.shop?.features?.bundles;
  if(!feature?.eligibleForBundles)fail(`Shopify Bundles is not eligible: ${feature?.ineligibilityReason || 'unknown reason'}`);
  const parent = await loadProduct(shopDomain,parentId);
  const {plan,components}=buildPlan(parent,draft);
  const handle = `elev8-unit-stock-${parentId.split('/').pop()}`;
  // Pre-existing relationships are never silently overwritten. Matching links are idempotent.
  // A mismatched link is an explicit error before creating new components.
  const alreadyLinked=plan.filter(p=>p.linkedComponents.length);
  for(const p of alreadyLinked){
    if(p.linkedComponents.length!==1 || p.linkedComponents[0].quantity!==p.count)fail(`Existing bundle for ${p.flavour} has different components/quantity. No changes made.`);
  }
  const {product:unitProduct,units}=await ensureComponents(shopDomain,parent,handle,components);
  const toCreate=[];
  for(const p of plan){
    const unit = units.get(p.flavour.toLowerCase());
    if(p.linkedComponents.length){
      if(p.linkedComponents[0].productVariant?.id!==unit.id)fail(`${p.flavour} already linked to another component. Refusing to overwrite it.`);
    }else{
      toCreate.push({parentProductVariantId:p.boxId,productVariantRelationshipsToCreate:[{id:unit.id,quantity:p.count}]});
    }
  }
  if(toCreate.length){
    const data=await graph(shopDomain,`mutation RecoverLinkBundles($input:[ProductVariantRelationshipUpdateInput!]!){productVariantRelationshipBulkUpdate(input:$input){parentProductVariants{id requiresComponents productVariantComponents(first:30){nodes{quantity productVariant{id}}}}userErrors{field message code}}}`,{input:toCreate});
    checkUserErrors(data.productVariantRelationshipBulkUpdate,'Link native Shopify bundles');
  }
  const verified = await loadProduct(shopDomain,parentId);
  const report=[];
  for(const p of plan){
    const row=verified.variants.nodes.find(v=>v.id===p.boxId);
    const unit=units.get(p.flavour.toLowerCase());
    const linked=row?.productVariantComponents.nodes || [];
    if(!row?.requiresComponents || linked.length!==1 || linked[0].quantity!==p.count || linked[0].productVariant.id!==unit.id)
      fail(`Verification failed for ${p.flavour}. Box draft ${parentId}; unit draft ${unitProduct.id}. Do not publish.`);
    report.push({flavour:p.flavour,boxVariantId:p.boxId,unitVariantId:unit.id,unitsPerBox:p.count,verified:true});
  }
  return {ok:true,parentProductId:parentId,componentProductId:unitProduct.id,verified:report,unchangedStock:true};
}
module.exports={recoverPackBreakdown,buildPlan};
