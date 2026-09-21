const mongoose = require('mongoose');
const { Review } = require('../../models');
const { shopifyAdminGraphql } = require('../cart-rewards/services/shopifyAdminGraphql');

const DAY=86400000;
const money=v=>Number(v?.shopMoney?.amount??v?.amount??0);
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n||0)));
const round=(n,dp=2)=>Math.round((Number(n||0)+Number.EPSILON)*(10**dp))/(10**dp);
const pid=v=>((String(v||'').match(/\d+/g)||[]).pop()||'');

async function poCosts(shopDomain){
  const since=new Date(Date.now()-183*DAY);
  const docs=await mongoose.connection.db.collection('product_creation_imports').find({
    shopDomain,'purchaseOrder.lines.0':{$exists:true},
    $or:[{createdAt:{$gte:since}},{'purchaseOrder.createdAt':{$gte:since}},{'purchaseOrder.updatedAt':{$gte:since}}]
  }).project({purchaseOrder:1}).toArray();
  const buckets=new Map();
  for(const doc of docs)for(const line of doc.purchaseOrder?.lines||[]){
    if(line?.includeInPurchaseOrder===false||['non_stock_charge','landing_item','excluded'].includes(line?.poLineType))continue;
    const sku=String(line?.sku||'').trim().toUpperCase(),qty=Number(line?.quantity||0),unit=Number(line?.netUnitCost||line?.unitCost||0);
    if(!sku||qty<=0||unit<=0)continue;
    const row=buckets.get(sku)||{q:0,c:0};row.q+=qty;row.c+=qty*unit;buckets.set(sku,row);
  }
  const out=new Map();for(const [sku,row] of buckets)if(row.q>0)out.set(sku,row.c/row.q);return out;
}

async function orders(shopDomain){
  const out=[];let cursor=null;
  for(let page=0;page<20;page++){
    const query=`query MI($cursor:String,$query:String!){orders(first:250,after:$cursor,query:$query,sortKey:CREATED_AT,reverse:true){pageInfo{hasNextPage endCursor}nodes{id createdAt cancelledAt displayFinancialStatus lineItems(first:100){nodes{quantity sku discountedTotalSet{shopMoney{amount currencyCode}} product{id title handle vendor productType status totalInventory featuredImage{url altText}} variant{inventoryItem{unitCost{amount currencyCode}}}}}}}}`;
    const data=await shopifyAdminGraphql({shopDomain,query,variables:{cursor,query:`created_at:>=${new Date(Date.now()-184*DAY).toISOString()}`}});
    const conn=data?.orders;if(!conn)break;out.push(...(conn.nodes||[]));if(!conn.pageInfo?.hasNextPage)break;cursor=conn.pageInfo.endCursor;
  }
  return out;
}
function valid(o){return !o?.cancelledAt&&['PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(String(o?.displayFinancialStatus||'').toUpperCase())}
function blank(p={}){return{productId:pid(p.id),gid:p.id||'',title:p.title||'Unknown product',handle:p.handle||'',vendor:p.vendor||'',productType:p.productType||'',status:p.status||'',image:p.featuredImage?.url||'',inventory:Number(p.totalInventory||0),units7d:0,units30d:0,units183d:0,revenue7d:0,revenue30d:0,revenue183d:0,cost30d:0,knownCostRevenue30d:0,reviews:0,rating:null,verifiedReviews:0}}
async function performance(shopDomain){
  const [all,costs]=await Promise.all([orders(shopDomain),poCosts(shopDomain)]),rows=new Map(),now=Date.now();
  for(const o of all){if(!valid(o))continue;const age=Math.floor((now-new Date(o.createdAt).getTime())/DAY);
    for(const item of o.lineItems?.nodes||[]){const p=item.product;if(!p?.id)continue;const key=pid(p.id);let r=rows.get(key)||blank(p);r.title=p.title||r.title;r.handle=p.handle||r.handle;r.vendor=p.vendor||r.vendor;r.productType=p.productType||r.productType;r.status=p.status||r.status;r.image=p.featuredImage?.url||r.image;r.inventory=Number(p.totalInventory||r.inventory||0);
      const qty=Number(item.quantity||0),rev=money(item.discountedTotalSet),sku=String(item.sku||'').trim().toUpperCase(),po=costs.get(sku),shop=Number(item.variant?.inventoryItem?.unitCost?.amount||0),unit=po>0?po:shop>0?shop:null;
      if(age<183){r.units183d+=qty;r.revenue183d+=rev}if(age<30){r.units30d+=qty;r.revenue30d+=rev;if(unit!=null){r.cost30d+=unit*qty;r.knownCostRevenue30d+=rev}}if(age<7){r.units7d+=qty;r.revenue7d+=rev}rows.set(key,r);
    }
  }
  const ids=[...rows.keys()];
  if(ids.length){const agg=await Review.aggregate([{$match:{shopDomain,status:'accepted',isDeleted:{$ne:true},isTestReview:{$ne:true},reviewScope:'product',$or:[{itemId:{$in:ids}},{externalProductId:{$in:ids}}]}},{$group:{_id:{$ifNull:['$externalProductId','$itemId']},count:{$sum:1},avg:{$avg:'$rating'},verified:{$sum:{$cond:['$verifiedPurchase',1,0]}}}}]);
    for(const a of agg){const k=String(a._id||'');if(!rows.has(k))continue;const r=rows.get(k);r.reviews=Number(a.count||0);r.rating=a.avg==null?null:round(a.avg,2);r.verifiedReviews=Number(a.verified||0)}
  }
  for(const r of rows.values()){r.revenue7d=round(r.revenue7d);r.revenue30d=round(r.revenue30d);r.revenue183d=round(r.revenue183d);r.grossProfit30d=r.knownCostRevenue30d>0?round(r.knownCostRevenue30d-r.cost30d):null;r.margin30d=r.knownCostRevenue30d>0?round((r.knownCostRevenue30d-r.cost30d)/r.knownCostRevenue30d,4):null;r.costCoverage30d=r.revenue30d>0?round(r.knownCostRevenue30d/r.revenue30d,4):0}
  return [...rows.values()];
}
function score(products=[]){const maxR=Math.max(1,...products.map(p=>p.revenue30d||0)),maxU=Math.max(1,...products.map(p=>p.units7d||0));
  return products.map(p=>{const d7=p.units7d/7,d30=p.units30d/30,d183=p.units183d/183,m=d30>0?d7/d30:d7>0?2:0,m6=d183>0?d30/d183:d30>0?2:0;
    const momentum=clamp(m/2*100),sales=clamp(p.revenue30d/maxR*100),velocity=clamp(p.units7d/maxU*100),margin=p.margin30d==null?50:clamp(p.margin30d*160),sentiment=p.rating==null?45:clamp((p.rating-3)/2*100)*Math.min(1,.35+Math.log10((p.reviews||0)+1)/2),stock=p.inventory<=0?0:p.inventory<Math.max(3,p.units7d)?30:100;
    const opportunityScore=round(momentum*.24+sales*.20+velocity*.16+margin*.16+sentiment*.14+stock*.10,0),reasons=[],cautions=[];
    if(m>=1.2&&p.units7d>=2)reasons.push(`7-day unit velocity is ${Math.round((m-1)*100)}% above its 30-day pace`);
    if(m6>=1.15&&p.units30d>=3)reasons.push(`30-day sales pace is ${Math.round((m6-1)*100)}% above the 6-month baseline`);
    if(p.margin30d!=null&&p.margin30d>=.35)reasons.push(`Known-cost gross margin is ${Math.round(p.margin30d*100)}%`);
    if(p.rating>=4.5&&p.reviews>=3)reasons.push(`${p.rating.toFixed(1)}★ from ${p.reviews} approved reviews`);
    if(p.inventory>=Math.max(10,p.units30d))reasons.push('Stock looks healthy relative to recent sales');
    if(p.inventory<=0)cautions.push('No Shopify inventory is currently available');else if(p.inventory<Math.max(3,p.units7d))cautions.push('Stock is tight versus recent sales');
    if(p.costCoverage30d<.5&&p.revenue30d>0)cautions.push('Less than half of 30-day revenue has a known cost basis');
    if(!p.image)cautions.push('No primary product image is available');
    let segment='Monitor';if(opportunityScore>=78&&p.inventory>0)segment='Push now';else if(opportunityScore>=63)segment='Strong opportunity';else if((p.margin30d||0)>=.4&&p.revenue30d<maxR*.25)segment='Hidden margin';else if(p.units7d>0&&m>=1.35)segment='Fast mover';
    const channels=[];if(p.rating>=4.4&&p.reviews>=3)channels.push('Review-led social');if((p.margin30d||0)>=.35)channels.push('Paid social');if(p.units7d>=2)channels.push('Email feature');if(opportunityScore>=70)channels.push('Homepage');if(!channels.length)channels.push('Organic social');
    const angle=p.rating>=4.5&&p.reviews>=3?`Lead with customer approval and ${p.rating.toFixed(1)}★ sentiment`:m>=1.2?'Lead with current popularity and momentum':(p.margin30d||0)>=.35?'Build a premium story rather than relying on discounting':'Test a product-led creative before increasing spend';
    return{...p,daily7:round(d7,2),daily30:round(d30,2),daily183:round(d183,2),momentum:round(m,2),sixMonthMomentum:round(m6,2),opportunityScore,segment,reasons,cautions,channels,angle};
  }).sort((a,b)=>b.opportunityScore-a.opportunityScore)
}
async function getInsights(shopDomain){const products=score(await performance(shopDomain));return{generatedAt:new Date().toISOString(),scoring:{description:'Opportunity score combines recent momentum, revenue, unit velocity, known-cost margin, review sentiment and stock position.',weights:{momentum:24,revenue:20,unitVelocity:16,margin:16,reviewSentiment:14,stock:10}},summary:{productsAnalysed:products.length,pushNow:products.filter(x=>x.segment==='Push now').length,strongOpportunities:products.filter(x=>x.segment==='Strong opportunity').length,hiddenMargin:products.filter(x=>x.segment==='Hidden margin').length},products}}
function creativePrompt({product={},style='luxury-studio',brief=''}){const styles={'luxury-studio':'ultra-premium studio advertising, luxury cosmetics lighting, controlled reflections, sculpted shadows, minimal clutter','flavour-led':'high-end flavour-led commercial scene, tasteful ingredient cues, elegant motion and depth, premium advertising photography','gaming-premium':'premium gaming atmosphere, restrained neon accents, sophisticated dark surfaces, cinematic lighting, not cluttered','hydration-clean':'bright premium hydration aesthetic, elegant water movement, clean white and silver surfaces, fresh high-end wellness photography','seasonal':'premium seasonal advertising scene, editorial art direction, tasteful celebratory cues, no cheap clip-art'};
  return `Generate ONLY a background plate for an ecommerce product advertisement.
Do not render a product tub, packaging, logo, label, text, badge, bottle, can, container or fake product.
A real product cutout will be composited over this background later.
Product context: ${product.title||'Product'} by ${product.vendor||'Unknown brand'} (${product.productType||'Supplement'}).
Art direction: ${styles[style]||styles['luxury-studio']}.
Leave a visually clean hero zone around the centre for a real product tub to be overlaid. Use realistic commercial photography, premium materials, believable depth and polished campaign-level lighting. Avoid words and logos.
${brief?`Additional brief: ${String(brief).slice(0,1000)}`:''}`;}
async function generateBackground({product,style,brief,size='1024x1024'}){if(!process.env.OPENAI_API_KEY){const e=new Error('OPENAI_API_KEY is not configured for Creative Studio.');e.status=412;throw e}
  const model=process.env.OPENAI_IMAGE_MODEL||'gpt-image-1',prompt=creativePrompt({product,style,brief});
  const response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,prompt,size,n:1})});
  const payload=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(payload?.error?.message||`OpenAI image generation failed (${response.status})`);e.status=response.status||502;throw e}
  const first=payload?.data?.[0]||{},background=first.b64_json?`data:image/png;base64,${first.b64_json}`:first.url||'';if(!background)throw new Error('Image generation returned no usable image.');return{model,prompt,background}}
module.exports={getInsights,generateBackground};
