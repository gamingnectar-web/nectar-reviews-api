const express=require('express');
const mongoose=require('mongoose');
const { shopifyAdminGraphql }=require('../modules/cart-rewards/services/shopifyAdminGraphql');
const router=express.Router(),TZ='Europe/London';
const money=n=>Number(n?.shopMoney?.amount||n?.presentmentMoney?.amount||n?.amount||0);

function dateKey(d){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function threshold(days){return dateKey(new Date(Date.now()-(days-1)*86400000))}
function valid(o){
  if(o.cancelledAt)return false;
  return ['PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(String(o.displayFinancialStatus||'').toUpperCase());
}
function inWindow(o,days){return dateKey(new Date(o.createdAt))>=threshold(days)}

async function poCosts(shopDomain){
  const since=new Date(Date.now()-183*86400000);
  const docs=await mongoose.connection.db.collection('product_creation_imports').find({
    shopDomain,'purchaseOrder.lines.0':{$exists:true},
    $or:[{createdAt:{$gte:since}},{'purchaseOrder.createdAt':{$gte:since}},{'purchaseOrder.updatedAt':{$gte:since}}]
  }).project({purchaseOrder:1,createdAt:1}).toArray();
  const b=new Map();
  for(const doc of docs)for(const line of doc.purchaseOrder?.lines||[]){
    if(line?.includeInPurchaseOrder===false||['non_stock_charge','landing_item','excluded'].includes(line?.poLineType))continue;
    const sku=String(line?.sku||'').trim().toUpperCase(),qty=Number(line?.quantity||0),unit=Number(line?.netUnitCost||line?.unitCost||0);
    if(!sku||!(qty>0)||!(unit>0))continue;
    const row=b.get(sku)||{q:0,c:0};row.q+=qty;row.c+=qty*unit;b.set(sku,row);
  }
  const out=new Map();for(const [sku,row] of b)out.set(sku,row.c/row.q);return out;
}

async function orders(shopDomain){
  const out=[];let cursor=null;
  for(let page=0;page<20;page++){
    const query=`query Q($cursor:String,$query:String!){orders(first:250,after:$cursor,query:$query,sortKey:CREATED_AT,reverse:true){pageInfo{hasNextPage endCursor}nodes{id createdAt cancelledAt displayFinancialStatus currentTotalPriceSet{shopMoney{amount currencyCode}} totalRefundedSet{shopMoney{amount currencyCode}} customer{id numberOfOrders} lineItems(first:100){nodes{quantity sku discountedTotalSet{shopMoney{amount currencyCode}} variant{inventoryItem{unitCost{amount currencyCode}}}}}}}}`;
    const data=await shopifyAdminGraphql({shopDomain,query,variables:{cursor,query:`created_at:>=${new Date(Date.now()-184*86400000).toISOString()}`}});
    const conn=data?.orders;if(!conn)break;out.push(...(conn.nodes||[]));if(!conn.pageInfo?.hasNextPage)break;cursor=conn.pageInfo.endCursor;
  }
  return out;
}
async function customerCount(shopDomain){
  try{const d=await shopifyAdminGraphql({shopDomain,query:`query{customersCount{count precision}}`,variables:{}});return Number(d?.customersCount?.count||0)}
  catch(_){return null}
}
function summarize(all,costs,days){
  const rows=all.filter(o=>valid(o)&&inWindow(o,days));
  const customers=new Set(),returners=new Set();
  let sales=0,productSales=0,returnRevenue=0,knownRevenue=0,knownCost=0,fullProfit=0,fullOrders=0;
  for(const o of rows){
    const total=money(o.currentTotalPriceSet),refund=money(o.totalRefundedSet),net=Math.max(0,total-refund);
    sales+=net;
    const cid=o.customer?.id||'';if(cid)customers.add(cid);
    if(Number(o.customer?.numberOfOrders||0)>1){if(cid)returners.add(cid);returnRevenue+=net}
    let orderRevenue=0,orderCost=0,allKnown=true;
    for(const item of o.lineItems?.nodes||[]){
      const rev=money(item.discountedTotalSet);productSales+=rev;orderRevenue+=rev;
      const sku=String(item.sku||'').trim().toUpperCase(),po=costs.get(sku),shop=Number(item.variant?.inventoryItem?.unitCost?.amount||0);
      const unit=po>0?po:shop>0?shop:null;
      if(unit==null){allKnown=false;continue}
      knownRevenue+=rev;knownCost+=unit*Number(item.quantity||0);orderCost+=unit*Number(item.quantity||0);
    }
    if(allKnown&&orderRevenue>0){fullOrders++;fullProfit+=orderRevenue-orderCost}
  }
  return {days,sales,orders:rows.length,aov:rows.length?sales/rows.length:0,customers:customers.size,returningCustomers:returners.size,returningCustomerRate:customers.size?returners.size/customers.size:0,returningRevenueRate:sales?returnRevenue/sales:0,grossProfit:knownRevenue>0?knownRevenue-knownCost:null,grossMargin:knownRevenue>0?(knownRevenue-knownCost)/knownRevenue:null,grossProfitPerOrder:fullOrders?fullProfit/fullOrders:null,costCoverage:productSales?knownRevenue/productSales:0,fullyCostedOrders:fullOrders};
}
router.get('/commerce-pulse',async(req,res,next)=>{
  try{
    const shopDomain=req.shopDomain||req.query.shopDomain||'';
    const [all,costs,totalCustomers]=await Promise.all([orders(shopDomain),poCosts(shopDomain),customerCount(shopDomain)]);
    res.setHeader('Cache-Control','no-store');
    res.json({generatedAt:new Date().toISOString(),timezone:TZ,totalCustomers,periods:{today:summarize(all,costs,1),week:summarize(all,costs,7),month:summarize(all,costs,30),sixMonths:summarize(all,costs,183)},costMethod:'6-month quantity-weighted PO cost by SKU, then Shopify unit cost fallback',poCostSkuCount:costs.size});
  }catch(e){next(e)}
});
module.exports=router;
