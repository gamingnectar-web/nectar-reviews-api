const { shopifyAdminGraphql } = require('../../cart-rewards/services/shopifyAdminGraphql');

function customerGid(id){
  const raw=String(id||'');
  return raw.startsWith('gid://shopify/Customer/')?raw:`gid://shopify/Customer/${raw}`;
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

async function getProductSnapshot(shopDomain,{productId,variantId,productHandle}){
  const handle=String(productHandle||'');
  const numericProduct=String(productId||'').split('/').pop();
  const numericVariant=String(variantId||'').split('/').pop();
  const queryText=handle?`handle:${handle}`:numericProduct?`id:${numericProduct}`:'';
  if(!queryText) return null;
  const query=`query Elev8TrackedProduct($query:String!){products(first:5,query:$query){nodes{
    id title handle featuredMedia{preview{image{url}}}
    variants(first:100){nodes{id title price availableForSale inventoryQuantity}}
  }}}`;
  const data=await shopifyAdminGraphql({shopDomain,query,variables:{query:queryText}});
  const product=data?.products?.nodes?.[0];
  if(!product) return null;
  const variant=numericVariant
    ? product.variants?.nodes?.find(v=>String(v.id||'').endsWith(`/${numericVariant}`))
    : product.variants?.nodes?.[0];
  return {
    productId:product.id,title:product.title,handle:product.handle,
    imageUrl:product.featuredMedia?.preview?.image?.url||'',
    variantId:variant?.id||'',variantTitle:variant?.title||'',
    price:Number(variant?.price||0),availableForSale:Boolean(variant?.availableForSale),
    inventoryQuantity:Number(variant?.inventoryQuantity||0)
  };
}
module.exports={getCustomerSnapshot,getProductSnapshot};
