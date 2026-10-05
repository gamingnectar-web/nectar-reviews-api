const NotificationSubscription=require('../models/NotificationSubscription');
const NotificationConfig=require('../models/NotificationConfig');
const { getProductSnapshot,getOrderDeliverySnapshot }=require('./shopifyNotifications');
const { trackByNumber }=require('./trackingService');
const { createEvent,sendEventEmail }=require('./notificationEvents');

function productUrl(shop,handle){return handle?`https://${shop}/products/${encodeURIComponent(handle)}`:''}

async function processProduct(sub,config){
  const snap=await getProductSnapshot(sub.shopDomain,sub);if(!snap){sub.lastCheckedAt=new Date();return sub.save()}
  const prev=sub.state||{};const first=prev.availableForSale===undefined&&prev.price===undefined;let event=null;
  if(!first&&sub.type==='restock'&&config.restockEnabled!==false&&!prev.availableForSale&&snap.availableForSale){
    event=await createEvent({shopDomain:sub.shopDomain,customerId:sub.customerId,email:sub.email,subscriptionId:sub._id,eventKey:`restock:${sub._id}:${snap.variantId}:${snap.inventoryQuantity}`,type:'restock',title:`${snap.title} is back in stock`,body:snap.variantTitle&&snap.variantTitle!=='Default Title'?`${snap.variantTitle} is available again.`:'The product you asked us to watch is available again.',url:productUrl(sub.shopDomain,snap.handle),imageUrl:snap.imageUrl,data:snap});
  }
  if(!first&&sub.type==='price_drop'&&config.priceDropEnabled!==false){
    const old=Number(prev.price||0);
    if(old>0&&snap.price>0&&snap.price<old)event=await createEvent({shopDomain:sub.shopDomain,customerId:sub.customerId,email:sub.email,subscriptionId:sub._id,eventKey:`price:${sub._id}:${snap.price}`,type:'price_drop',title:`${snap.title} has dropped in price`,body:`Now £${snap.price.toFixed(2)} — previously £${old.toFixed(2)}.`,url:productUrl(sub.shopDomain,snap.handle),imageUrl:snap.imageUrl,data:{...snap,previousPrice:old}});
  }
  sub.state={...(sub.state||{}),title:snap.title,imageUrl:snap.imageUrl,price:snap.price,availableForSale:snap.availableForSale,inventoryQuantity:snap.inventoryQuantity,variantId:snap.variantId};sub.lastCheckedAt=new Date();if(event)sub.lastNotifiedAt=new Date();await sub.save();
  if(event&&sub.channels?.email&&config.emailEnabled)await sendEventEmail(event).catch(e=>console.warn('[notifications] email failed:',e.message));
}

async function resolveTrackingState(sub){
  let shopify=null;
  try{shopify=await getOrderDeliverySnapshot(sub.shopDomain,sub.orderId,sub.trackingNumber);}
  catch(e){console.warn('[notifications] Shopify delivery lookup failed:',sub.orderId,e.message);}
  if(shopify?.delivered){
    return {found:true,status:'DELIVERED',history:[],trackingNumber:sub.trackingNumber||'',carrier:sub.carrier||'',lastEvent:'Delivered',lastEventTime:shopify.deliveredAt||'',trackingUrl:'',provider:'shopify',deliverySource:'shopify',shopify};
  }
  const tracked=await trackByNumber(sub.trackingNumber,sub.carrier);
  return {...tracked,deliverySource:tracked.status==='DELIVERED'?'track123':'tracking',shopify};
}

async function processTracking(sub,config){
  if(!sub.trackingNumber||config.trackingEnabled===false)return;
  const current=await resolveTrackingState(sub);const prev=sub.state||{};
  const changed=(current.status&&current.status!==prev.status)||(current.lastEvent&&current.lastEvent!==prev.lastEvent)||(current.deliverySource&&current.deliverySource!==prev.deliverySource);
  let event=null;
  if(changed&&(prev.status||current.status==='DELIVERED'))event=await createEvent({shopDomain:sub.shopDomain,customerId:sub.customerId,email:sub.email,subscriptionId:sub._id,eventKey:`tracking:${sub._id}:${current.status}:${current.lastEventTime||current.lastEvent||'state'}`,type:'tracking',title:current.status==='DELIVERED'?`${sub.orderName||'Your order'} has been delivered`:`${sub.orderName||'Your order'} has a tracking update`,body:current.lastEvent||`Tracking status: ${current.status}`,url:current.trackingUrl||'',data:current});
  sub.state={...(sub.state||{}),status:current.status,lastEvent:current.lastEvent,lastEventTime:current.lastEventTime,provider:current.provider,deliverySource:current.deliverySource,deliveredAt:current.status==='DELIVERED'?(current.shopify?.deliveredAt||current.lastEventTime||new Date()):(sub.state?.deliveredAt||null),shopifyStatus:current.shopify?.status||''};
  sub.lastCheckedAt=new Date();if(event)sub.lastNotifiedAt=new Date();if(current.status==='DELIVERED')sub.active=false;await sub.save();
  if(event&&sub.channels?.email&&config.emailEnabled)await sendEventEmail(event).catch(e=>console.warn('[notifications] email failed:',e.message));
}

async function processNotificationsBatch(limit=50){
  const subs=await NotificationSubscription.find({active:true}).sort({lastCheckedAt:1,updatedAt:1}).limit(limit);
  for(const sub of subs){try{const config=await NotificationConfig.findOne({shopDomain:sub.shopDomain}).lean()||{};if(!config.enabled)continue;if(sub.type==='order_tracking')await processTracking(sub,config);else if(sub.type==='restock'||sub.type==='price_drop')await processProduct(sub,config)}catch(e){console.warn('[notifications] check failed:',sub._id,e.message);sub.lastCheckedAt=new Date();await sub.save().catch(()=>{})}}
  return subs.length;
}
module.exports={processNotificationsBatch,resolveTrackingState};
