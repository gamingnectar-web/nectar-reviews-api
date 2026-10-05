const { shopifyAdminGraphql } = require('../../cart-rewards/services/shopifyAdminGraphql');

function customerGid(id){const raw=String(id||'');return raw.startsWith('gid://shopify/Customer/')?raw:`gid://shopify/Customer/${raw}`;}
function orderGid(id){const raw=String(id||'').trim();if(!raw)return '';return raw.startsWith('gid://shopify/Order/')?raw:`gid://shopify/Order/${raw.replace(/\D/g,'')}`;}
function textDelivered(value=''){return /\bdelivered\b/i.test(String(value||''));}
function fulfilmentDeliveryState(f={}){
  const deliveredAt=f.deliveredAt||null;
  return {
    delivered:Boolean(deliveredAt)||textDelivered(f.displayStatus)||textDelivered(f.status),
    deliveredAt,
    status:f.displayStatus||f.status||'',
    tracking:(f.trackingInfo||[]).map(info=>({number:info.number||'',company:info.company||'',url:info.url||''}))
  };
}
function resolveOrderDelivery(order={},trackingNumber=''){
  const wanted=String(trackingNumber||'').replace(/\s+/g,'').toUpperCase();
  const states=(order.fulfillments||[]).map(fulfilmentDeliveryState);
  let relevant=states;
  if(wanted){
    const matched=states.filter(state=>state.tracking.some(info=>String(info.number||'').replace(/\s+/g,'').toUpperCase()===wanted));
    if(matched.length) relevant=matched;
  }
  const deliveredState=relevant.find(state=>state.delivered);
  return {
    delivered:Boolean(deliveredState),
    deliveredAt:deliveredState?.deliveredAt||null,
    status:deliveredState?.status||order.displayFulfillmentStatus||'',
    orderName:order.name||'',
    orderId:order.id||'',
    source:deliveredState?'shopify':'shopify_unconfirmed',
    fulfillments:states
  };
}

async function getCustomerSnapshot(shopDomain,customerId){
  const query=`query Elev8NotificationCustomer($id: ID!) {
    customer(id:$id){
      id firstName lastName email
      orders(first:12,reverse:true){nodes{
        id legacyResourceId name createdAt displayFulfillmentStatus statusPageUrl
        fulfillments(first:10){id status displayStatus deliveredAt trackingInfo{number company url}}
      }}
    }
  }`;
  const data=await shopifyAdminGraphql({shopDomain,query,variables:{id:customerGid(customerId)}});
  return data?.customer||null;
}

async function getOrderDeliverySnapshot(shopDomain,orderId,trackingNumber=''){
  const id=orderGid(orderId); if(!id) return null;
  const query=`query Elev8OrderDelivery($id: ID!) {
    order(id:$id){
      id legacyResourceId name displayFulfillmentStatus tags
      fulfillments(first:20){id status displayStatus deliveredAt trackingInfo{number company url}}
    }
  }`;
  const data=await shopifyAdminGraphql({shopDomain,query,variables:{id}});
  return data?.order?resolveOrderDelivery(data.order,trackingNumber):null;
}

async function getProductSnapshot(shopDomain,{productId,variantId,productHandle}){
  const handle=String(productHandle||'');
  const numericProduct=String(productId||'').split('/').pop();
  const numericVariant=String(variantId||'').split('/').pop();
  const queryText=handle?`handle:${handle}`:numericProduct?`id:${numericProduct}`:'';
  if(!queryText)return null;
  const query=`query Elev8TrackedProduct($query:String!){products(first:5,query:$query){nodes{
    id title handle featuredMedia{preview{image{url}}}
    variants(first:100){nodes{id title price availableForSale inventoryQuantity}}
  }}}`;
  const data=await shopifyAdminGraphql({shopDomain,query,variables:{query:queryText}});
  const product=data?.products?.nodes?.[0];if(!product)return null;
  const variant=numericVariant?product.variants?.nodes?.find(v=>String(v.id||'').endsWith(`/`+numericVariant)):product.variants?.nodes?.[0];
  return {productId:product.id,title:product.title,handle:product.handle,imageUrl:product.featuredMedia?.preview?.image?.url||'',variantId:variant?.id||'',variantTitle:variant?.title||'',price:Number(variant?.price||0),availableForSale:Boolean(variant?.availableForSale),inventoryQuantity:Number(variant?.inventoryQuantity||0)};
}

module.exports={getCustomerSnapshot,getOrderDeliverySnapshot,getProductSnapshot,resolveOrderDelivery,fulfilmentDeliveryState};
