const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(parts,s)=>fs.writeFileSync(F(...parts),s);

// BACKEND SERVICE
let svc=R('src','modules','marketing-intelligence','marketingIntelligence.service.js');

const poStart=svc.indexOf('async function poCosts(shopDomain){');
const poEnd=svc.indexOf('\n\nasync function orders(shopDomain)',poStart);
if(poStart<0||poEnd<0)throw new Error('poCosts() not found');

const newPo = `async function poCosts(shopDomain){
  const docs=await mongoose.connection.db.collection('product_creation_imports').find({
    shopDomain,
    'purchaseOrder.lines.0':{$exists:true}
  }).project({
    createdAt:1,
    'purchaseOrder.status':1,
    'purchaseOrder.poNumber':1,
    'purchaseOrder.supplierName':1,
    'purchaseOrder.invoiceNumber':1,
    'purchaseOrder.invoiceDate':1,
    'purchaseOrder.createdAt':1,
    'purchaseOrder.updatedAt':1,
    'purchaseOrder.lines':1
  }).toArray();

  const bySku=new Map(),byProduct=new Map(),byVariant=new Map(),receipts=[];
  const add=(map,key,qty,unit)=>{
    if(!key||qty<=0||unit<=0)return;
    const row=map.get(key)||{qty:0,cost:0,receipts:0};
    row.qty+=qty;row.cost+=qty*unit;row.receipts+=1;map.set(key,row);
  };
  for(const doc of docs){
    const po=doc.purchaseOrder||{};
    for(const line of po.lines||[]){
      if(line?.includeInPurchaseOrder===false||['non_stock_charge','landing_item','excluded'].includes(line?.poLineType))continue;
      const sku=String(line?.sku||'').trim().toUpperCase();
      const productId=pid(line?.productId||'');
      const variantId=pid(line?.variantId||'');
      const qty=Number(line?.quantity||0);
      const unit=Number(line?.netUnitCost||line?.unitCost||0);
      if(qty<=0||unit<=0)continue;
      add(bySku,sku,qty,unit);add(byProduct,productId,qty,unit);add(byVariant,variantId,qty,unit);
      receipts.push({
        poNumber:po.poNumber||'',
        supplierName:po.supplierName||'',
        invoiceNumber:po.invoiceNumber||'',
        invoiceDate:po.invoiceDate||'',
        date:po.updatedAt||po.createdAt||doc.createdAt||null,
        sku,
        productId,
        variantId,
        productTitle:line?.productTitle||line?.title||'',
        qty,
        unitCost:unit,
        netLineCost:round(qty*unit,2),
        matchStatus:line?.matchStatus||''
      });
    }
  }
  const average=(map,key)=>{const row=map.get(key);return row&&row.qty>0?row.cost/row.qty:null};
  return {bySku,byProduct,byVariant,receipts,average};
}`;
svc=svc.slice(0,poStart)+newPo+svc.slice(poEnd);

svc=svc.replace(
  "variant{inventoryItem{unitCost{amount currencyCode}}}",
  "variant{id inventoryQuantity inventoryItem{unitCost{amount currencyCode}}}"
);

const oldLookup="const qty=Number(item.quantity||0),rev=money(item.discountedTotalSet),sku=String(item.sku||'').trim().toUpperCase(),po=costs.get(sku),shop=Number(item.variant?.inventoryItem?.unitCost?.amount||0),unit=po>0?po:shop>0?shop:null;";
const newLookup="const qty=Number(item.quantity||0),rev=money(item.discountedTotalSet),sku=String(item.sku||'').trim().toUpperCase(),variantId=pid(item.variant?.id||''),productId=pid(p.id),poSku=costs.average(costs.bySku,sku),poVariant=costs.average(costs.byVariant,variantId),poProduct=costs.average(costs.byProduct,productId),po=poSku??poVariant??poProduct,shop=Number(item.variant?.inventoryItem?.unitCost?.amount||0),unit=po>0?po:shop>0?shop:null,costSource=poSku>0?'PO SKU':poVariant>0?'PO variant':poProduct>0?'PO product':shop>0?'Shopify unit cost':'';";
if(!svc.includes(oldLookup))throw new Error('performance cost lookup marker not found');
svc=svc.replace(oldLookup,newLookup);

svc=svc.replace(
  "verifiedReviews:0}}",
  "verifiedReviews:0,costSources:{},costedUnits30d:0,uncostedUnits30d:0}}"
);
svc=svc.replace(
  "if(age<30){r.units30d+=qty;r.revenue30d+=rev;if(unit!=null){r.cost30d+=unit*qty;r.knownCostRevenue30d+=rev}}",
  "if(age<30){r.units30d+=qty;r.revenue30d+=rev;if(unit!=null){r.cost30d+=unit*qty;r.knownCostRevenue30d+=rev;r.costedUnits30d+=qty;r.costSources[costSource]=(r.costSources[costSource]||0)+qty}else{r.uncostedUnits30d+=qty}}"
);

const marker="function creativePrompt({product={},style='luxury-studio',brief=''})";
const insert = `
async function productCostBasis(shopDomain,productId){
  const id=pid(productId);
  if(!id)throw new Error('A Shopify product ID is required.');
  const [costs,perf]=await Promise.all([poCosts(shopDomain),performance(shopDomain)]);
  const row=perf.find(x=>String(x.productId)===String(id))||null;

  const query=\`query ProductCostBasis($id:ID!){product(id:$id){id title handle vendor totalInventory variants(first:100){nodes{id title sku inventoryQuantity inventoryItem{unitCost{amount currencyCode}}}}}}\`;
  const data=await shopifyAdminGraphql({shopDomain,query,variables:{id:\`gid://shopify/Product/\${id}\`}});
  const product=data?.product||null;
  if(!product)throw new Error('Shopify product not found.');

  const variants=(product.variants?.nodes||[]).map(v=>({
    variantId:pid(v.id),
    title:v.title||'Default',
    sku:String(v.sku||''),
    inventory:Number(v.inventoryQuantity||0),
    shopifyUnitCost:Number(v.inventoryItem?.unitCost?.amount||0)||null
  }));
  const variantIds=new Set(variants.map(v=>v.variantId).filter(Boolean));
  const skus=new Set(variants.map(v=>String(v.sku||'').trim().toUpperCase()).filter(Boolean));

  const receipts=costs.receipts.filter(x=>
    String(x.productId||'')===String(id)||
    variantIds.has(String(x.variantId||''))||
    skus.has(String(x.sku||'').trim().toUpperCase())
  ).map(x=>{
    let matchedBy='Product ID';
    if(x.variantId&&variantIds.has(String(x.variantId)))matchedBy='Variant ID';
    else if(x.sku&&skus.has(String(x.sku).trim().toUpperCase()))matchedBy='SKU';
    return {...x,matchedBy};
  }).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));

  const totalQty=receipts.reduce((s,x)=>s+Number(x.qty||0),0);
  const totalCost=receipts.reduce((s,x)=>s+Number(x.netLineCost||0),0);
  const weightedPoUnitCost=totalQty>0?round(totalCost/totalQty,4):null;
  const shopifyCosts=variants.filter(x=>x.shopifyUnitCost!=null);
  const weightedShopifyUnitCost=shopifyCosts.length
    ? round(shopifyCosts.reduce((s,x)=>s+(x.shopifyUnitCost*Math.max(1,x.inventory)),0)/shopifyCosts.reduce((s,x)=>s+Math.max(1,x.inventory),0),4)
    : null;

  const missingReasons=[];
  if(!receipts.length)missingReasons.push('No PO line could be linked to this product by product ID, variant ID or SKU.');
  if(variants.some(v=>!v.sku))missingReasons.push('One or more Shopify variants has no SKU, which weakens PO matching.');
  if(row?.uncostedUnits30d>0)missingReasons.push(\`\${row.uncostedUnits30d} unit(s) sold in the last 30 days had no cost match at order-line level.\`);

  return{
    product:{productId:id,title:product.title||'',vendor:product.vendor||'',handle:product.handle||'',inventory:Number(product.totalInventory||0)},
    calculation:{
      revenue30d:row?.revenue30d||0,
      units30d:row?.units30d||0,
      knownCostRevenue30d:round(row?.knownCostRevenue30d||0,2),
      cost30d:round(row?.cost30d||0,2),
      grossProfit30d:row?.grossProfit30d??null,
      margin30d:row?.margin30d??null,
      costCoverage30d:row?.costCoverage30d||0,
      costedUnits30d:row?.costedUnits30d||0,
      uncostedUnits30d:row?.uncostedUnits30d||0,
      costSources:row?.costSources||{}
    },
    inventory:{
      currentShopifyInventory:Number(product.totalInventory||0),
      variants
    },
    purchaseHistory:{
      receiptCount:receipts.length,
      totalPurchasedQty:totalQty,
      totalPurchasedCost:round(totalCost,2),
      weightedPoUnitCost,
      weightedShopifyUnitCost,
      receipts
    },
    explanation:{
      marginFormula:'Gross margin = (revenue with a known cost - matched product cost) / revenue with a known cost.',
      coverageFormula:'Cost coverage = revenue from 30-day order lines with a matched unit cost / total 30-day product revenue.',
      costPriority:['PO line matched by SKU','PO line matched by variant ID','PO line matched by product ID','Shopify inventory item unit cost'],
      missingReasons
    }
  };
}

async function suggestCreativeBrief({product={},style='luxury-studio',marketing={}}){
  const fallback=()=>{
    const flavour=String(product.title||'').replace(/\\b(energy|formula|powder|tub|drink|hydration)\\b/gi,'').trim();
    const base=style==='luxury-studio'
      ? 'Premium editorial studio scene, restrained composition, dark-to-neutral gradient, sculpted side lighting, subtle reflective surface, generous negative space.'
      : style==='flavour-led'
        ? \`Premium flavour-led campaign scene inspired by \${flavour||'the product flavour'}, using only two or three restrained ingredient cues, sophisticated depth, no oversized fruit, no liquid splashes crossing the hero zone.\`
        : style==='gaming-premium'
          ? 'Dark premium gaming editorial scene, subtle edge lighting, refined neon accents, matte and glass materials, cinematic depth, no RGB clutter.'
          : style==='hydration-clean'
            ? 'Clean premium hydration campaign, frosted glass and water texture, bright directional daylight, pale mineral surfaces, restrained freshness cues.'
            : 'Premium seasonal editorial campaign, minimal props, refined colour palette, cinematic commercial lighting and clear negative space.';
    return \`\${base} Keep the central lower-third clear for the real product packshot. Aim for a campaign image that could sit on a premium DTC homepage or paid social ad.\`;
  };

  if(!process.env.OPENAI_API_KEY)return{brief:fallback(),source:'template'};
  const model=process.env.OPENAI_MODULE_MODEL||process.env.OPENAI_ASSISTANT_MODEL||'gpt-5.4-mini';
  const input=\`You are an ecommerce creative director. Write ONE concise art-direction brief for an AI image generator.
The AI will generate BACKGROUND ONLY; a real product packshot will be composited afterwards.
Make it premium, photographic, commercially usable, restrained and specific.
Avoid cheesy ad tropes, giant floating fruit, random liquid pours, clutter, fake packaging, logos or text.
Leave a clean central/lower-third hero zone.
Product: \${product.title||''}
Brand: \${product.vendor||''}
Type: \${product.productType||''}
Selected style: \${style}
Marketing angle: \${marketing.angle||''}
Reasons: \${(marketing.reasons||[]).join('; ')}
Return only the brief, maximum 120 words.\`;
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:\`Bearer \${process.env.OPENAI_API_KEY}\`,'Content-Type':'application/json'},
      body:JSON.stringify({model,input})
    });
    const payload=await response.json();
    if(!response.ok)throw new Error(payload?.error?.message||'Creative brief generation failed.');
    const text=String(payload.output_text||'').trim();
    return{brief:text||fallback(),source:text?'ai':'template'};
  }catch(_){return{brief:fallback(),source:'template'}}
}

`;
if(!svc.includes('async function productCostBasis('))svc=svc.replace(marker,insert+marker);

svc=svc.replace(
"Leave a visually clean hero zone around the centre for a real product tub to be overlaid. Use realistic commercial photography, premium materials, believable depth and polished campaign-level lighting. Avoid words and logos.",
"Create a sophisticated DTC campaign background, not a generic AI product advert. Use a restrained prop count, intentional art direction, believable premium materials and controlled photographic lighting. Avoid giant floating ingredients, random liquid streams, excessive splashes, visual clutter, fake packaging, words and logos. Keep the central lower-third clean for the real product packshot and preserve useful negative space for optional campaign copy."
);

svc=svc.replace(
"module.exports={getInsights,generateBackground};",
"module.exports={getInsights,generateBackground,productCostBasis,suggestCreativeBrief};"
);
W(['src','modules','marketing-intelligence','marketingIntelligence.service.js'],svc);

// ROUTES
let routes=R('src','modules','marketing-intelligence','marketingIntelligence.routes.js');
routes=routes.replace(
"const {getInsights,generateBackground}=require('./marketingIntelligence.service');",
"const {getInsights,generateBackground,productCostBasis,suggestCreativeBrief}=require('./marketingIntelligence.service');"
);

if(!routes.includes("router.get('/products/:productId/cost-basis'")){
  routes=routes.replace("router.post('/creative/background'",`router.get('/products/:productId/cost-basis',async(req,res,next)=>{
  try{res.json(await productCostBasis(shop(req),req.params.productId))}catch(e){next(e)}
});

router.post('/creative/suggest-brief',async(req,res,next)=>{
  try{res.json(await suggestCreativeBrief({product:req.body?.product||{},style:String(req.body?.style||'luxury-studio'),marketing:req.body?.marketing||{}}))}catch(e){next(e)}
});

router.post('/creative/background'`);
}
W(['src','modules','marketing-intelligence','marketingIntelligence.routes.js'],routes);

console.log('✓ all-time PO cost basis');
console.log('✓ SKU/variant/product fallback matching');
console.log('✓ cost/inventory diagnostic endpoint');
console.log('✓ AI creative brief endpoint');
console.log('✓ upgraded premium background prompt');
