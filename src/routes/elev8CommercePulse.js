const express = require('express');
const mongoose = require('mongoose');
const { shopifyAdminGraphql } = require('../modules/cart-rewards/services/shopifyAdminGraphql');

const router = express.Router();

const money = (node) => Number(node?.shopMoney?.amount || node?.presentmentMoney?.amount || 0);
const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

async function sixMonthWeightedCosts(shopDomain) {
  const since = new Date(Date.now() - 183 * 86400000);
  const docs = await mongoose.connection.db.collection('product_creation_imports')
    .find({
      shopDomain,
      createdAt:{$gte:since},
      $or:[
        {'purchaseOrder.lines.0':{$exists:true}},
        {'lines.0':{$exists:true}},
      ],
    })
    .project({purchaseOrder:1,lines:1,createdAt:1})
    .toArray();

  const buckets = new Map();
  const push = (line, docDate) => {
    if (line?.includeInPurchaseOrder === false) return;
    const sku = String(line?.sku || '').trim().toUpperCase();
    if (!sku) return;
    const qty = Number(line?.quantity || 0);
    const unit = Number(line?.netUnitCost ?? line?.unitCost ?? 0);
    if (!(qty > 0) || !(unit > 0)) return;
    const row = buckets.get(sku) || {units:0,cost:0,lastUnitCost:0,lastDate:null};
    row.units += qty;
    row.cost += qty * unit;
    if (!row.lastDate || new Date(docDate) > new Date(row.lastDate)) {
      row.lastDate = docDate;
      row.lastUnitCost = unit;
    }
    buckets.set(sku,row);
  };

  for (const doc of docs) {
    for (const line of (doc.purchaseOrder?.lines || doc.lines || [])) push(line, doc.createdAt);
  }

  const out = new Map();
  for (const [sku,row] of buckets) {
    out.set(sku,{
      weightedCost:row.units > 0 ? row.cost / row.units : row.lastUnitCost,
      units:row.units,
      lastUnitCost:row.lastUnitCost,
    });
  }
  return out;
}

async function fetchOrders(shopDomain) {
  const orders = [];
  let cursor = null;
  for (let page=0; page<20; page++) {
    const query = `query Elev8CommercePulse($cursor:String,$query:String!){
      orders(first:250,after:$cursor,query:$query,sortKey:CREATED_AT,reverse:true){
        pageInfo{hasNextPage endCursor}
        nodes{
          id createdAt cancelledAt displayFinancialStatus
          currentTotalPriceSet{shopMoney{amount currencyCode}}
          currentSubtotalPriceSet{shopMoney{amount currencyCode}}
          totalRefundedSet{shopMoney{amount currencyCode}}
          customer{id numberOfOrders}
          lineItems(first:100){
            nodes{
              quantity
              sku
              discountedTotalSet{shopMoney{amount currencyCode}}
            }
          }
        }
      }
    }`;
    const data = await shopifyAdminGraphql({
      shopDomain,
      query,
      variables:{cursor,query:`created_at:>=${isoDaysAgo(183)}`},
    });
    const conn = data?.orders;
    if (!conn) break;
    orders.push(...(conn.nodes || []));
    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return orders;
}

function summarize(orders, costs, days) {
  const since = Date.now() - days*86400000;
  const rows = orders.filter(o => new Date(o.createdAt).getTime() >= since && !o.cancelledAt);
  const customers = new Set();
  const returningCustomers = new Set();
  let revenue=0, productRevenue=0, refunded=0, cogs=0, knownCostRevenue=0, returningRevenue=0;

  for (const order of rows) {
    const orderRevenue = money(order.currentTotalPriceSet);
    revenue += orderRevenue;
    refunded += money(order.totalRefundedSet);

    const cid = order.customer?.id || '';
    if (cid) customers.add(cid);
    if (Number(order.customer?.numberOfOrders || 0) > 1) {
      if (cid) returningCustomers.add(cid);
      returningRevenue += orderRevenue;
    }

    for (const item of order.lineItems?.nodes || []) {
      const lineRevenue = money(item.discountedTotalSet);
      productRevenue += lineRevenue;
      const sku = String(item.sku || '').trim().toUpperCase();
      const cost = costs.get(sku)?.weightedCost;
      if (cost > 0) {
        cogs += cost * Number(item.quantity || 0);
        knownCostRevenue += lineRevenue;
      }
    }
  }

  const orderCount = rows.length;
  const grossProfit = Math.max(0, productRevenue - cogs);
  const grossMargin = productRevenue > 0 ? grossProfit / productRevenue : 0;
  const costCoverage = productRevenue > 0 ? knownCostRevenue / productRevenue : 0;

  return {
    days,
    sales:revenue,
    productSales:productRevenue,
    refunds:refunded,
    orders:orderCount,
    aov:orderCount ? revenue/orderCount : 0,
    customers:customers.size,
    returningCustomers:returningCustomers.size,
    returningCustomerRate:customers.size ? returningCustomers.size/customers.size : 0,
    returningRevenue,
    returningRevenueRate:revenue ? returningRevenue/revenue : 0,
    grossProfit,
    grossMargin,
    grossProfitPerOrder:orderCount ? grossProfit/orderCount : 0,
    costCoverage,
  };
}

router.get('/commerce-pulse', async (req,res,next) => {
  try {
    const shopDomain = req.shopDomain || req.query.shopDomain || '';
    const [orders,costs] = await Promise.all([
      fetchOrders(shopDomain),
      sixMonthWeightedCosts(shopDomain),
    ]);

    const periods = {
      today:summarize(orders,costs,1),
      week:summarize(orders,costs,7),
      month:summarize(orders,costs,30),
      sixMonths:summarize(orders,costs,183),
    };

    res.setHeader('Cache-Control','no-store');
    res.json({
      generatedAt:new Date().toISOString(),
      periods,
      costMethod:'6-month weighted PO unit cost by SKU',
      costSkuCount:costs.size,
    });
  } catch (error) { next(error); }
});

module.exports = router;
