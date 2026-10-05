const express = require('express');
const NotificationEvent = require('../../notifications/models/NotificationEvent');
const { verifyAppProxy, requireProxyCustomer } = require('../../notifications/services/appProxyAuth');
const { getCustomerSnapshot, getCustomerIdentity } = require('../../notifications/services/shopifyNotifications');
const { anonymousRef } = require('../../notifications/services/privacyVault');
const { eventForSignedCustomer } = require('../../notifications/services/notificationEvents');
const { unsubscribeRestock } = require('../../notifications/notifications.service');
const { shopifyAdminGraphql } = require('../../cart-rewards/services/shopifyAdminGraphql');
const { getOrCreate, sanitizeDefinition } = require('../customerHub.service');

const router = express.Router();
router.use(verifyAppProxy);

function customerGid(id){ const raw=String(id||''); return raw.startsWith('gid://shopify/Customer/') ? raw : `gid://shopify/Customer/${raw}`; }

async function customerTags(shopDomain, customerId){
  const query = `query Elev8CustomerHubTags($id:ID!){customer(id:$id){tags}}`;
  const data = await shopifyAdminGraphql({ shopDomain, query, variables:{ id:customerGid(customerId) } });
  return Array.isArray(data?.customer?.tags) ? data.customer.tags : [];
}

async function resolveRestockTags(shopDomain, tags){
  const variantIds = [...new Set(tags.map(t=>String(t||'').match(/^restock_id_(\d+)$/i)?.[1]).filter(Boolean))].slice(0,20);
  if (!variantIds.length) return [];
  const gids = variantIds.map(id=>`gid://shopify/ProductVariant/${id}`);
  const query = `query Elev8CustomerHubVariants($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id legacyResourceId title availableForSale product{id title handle featuredImage{url}}}}}`;
  const data = await shopifyAdminGraphql({ shopDomain, query, variables:{ ids:gids } });
  const byId = new Map((data?.nodes || []).filter(Boolean).map(v=>[String(v.legacyResourceId || String(v.id||'').split('/').pop()), v]));
  return variantIds.map(variantId=>{
    const v = byId.get(String(variantId));
    return {
      variantId:String(variantId),
      title:v?.product?.title || `Product variant ${variantId}`,
      variantTitle:v?.title || '',
      handle:v?.product?.handle || '',
      image:v?.product?.featuredImage?.url || '',
      availableForSale:Boolean(v?.availableForSale),
      url:v?.product?.handle ? `/products/${v.product.handle}?variant=${variantId}` : '',
    };
  });
}

router.get('/config', async (req,res,next)=>{ try {
  const row = await getOrCreate(req.shopDomain);
  const published = row.published && Object.keys(row.published).length ? sanitizeDefinition(row.published) : null;
  res.setHeader('Cache-Control','no-store');
  res.json({ enabled:Boolean(published), version:Number(row.publishedVersion||0), publishedAt:row.publishedAt || null, definition:published });
} catch(e){ next(e); } });

router.use(requireProxyCustomer);

router.get('/feed', async (req,res,next)=>{ try {
  const ref = anonymousRef(req.shopDomain,'customer',req.customerId);
  const [customer, identity, tags, events] = await Promise.all([
    getCustomerSnapshot(req.shopDomain, req.customerId),
    getCustomerIdentity(req.shopDomain, req.customerId),
    customerTags(req.shopDomain, req.customerId),
    NotificationEvent.find({ shopDomain:req.shopDomain, customerRefHash:ref }).sort({ createdAt:-1 }).limit(30).lean(),
  ]);
  if (!customer || !identity) return res.status(401).json({ error:'Customer could not be verified.' });
  const alerts = await resolveRestockTags(req.shopDomain, tags);
  const orders = (customer.orders?.nodes || []).map(order=>({
    id:order.id,
    legacyResourceId:order.legacyResourceId,
    name:order.name,
    createdAt:order.createdAt,
    fulfillmentStatus:order.displayFulfillmentStatus || '',
    statusPageUrl:order.statusPageUrl || '',
    tracking:(order.fulfillments || []).flatMap(f=>(f.trackingInfo || []).map(info=>({ number:info.number || '', company:info.company || '', url:info.url || '', status:f.displayStatus || f.status || '', deliveredAt:f.deliveredAt || null }))),
  }));
  res.setHeader('Cache-Control','no-store');
  res.json({
    customer:{ firstName:customer.firstName || '', lastName:customer.lastName || '', email:identity.email || '' },
    orders,
    restockAlerts:alerts,
    events:events.map(eventForSignedCustomer),
    unreadCount:events.filter(e=>!e.readAt).length,
  });
} catch(e){ next(e); } });

router.post('/restock/remove', async (req,res,next)=>{ try {
  const identity = await getCustomerIdentity(req.shopDomain, req.customerId);
  if (!identity?.email) return res.status(409).json({ error:'Your Shopify account does not have an email address.' });
  const result = await unsubscribeRestock({ shopDomain:req.shopDomain, email:identity.email, variantId:req.body?.variantId, source:'shopify_app_proxy' });
  res.json(result);
} catch(e){ next(e); } });

module.exports = router;
