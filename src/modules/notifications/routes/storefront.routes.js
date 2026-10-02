const express=require('express');
const NotificationSubscription=require('../models/NotificationSubscription');
const NotificationEvent=require('../models/NotificationEvent');
const NotificationConfig=require('../models/NotificationConfig');
const { verifyAppProxy,requireProxyCustomer }=require('../services/appProxyAuth');
const { getCustomerIdentity,getCustomerSnapshot }=require('../services/shopifyNotifications');
const { trackByNumber,normalizeTrackingNumber }=require('../services/trackingService');
const { eventForSignedCustomer }=require('../services/notificationEvents');
const { anonymousRef, sealText, openText, openJson }=require('../services/privacyVault');
const {
  getOrCreateConfig,
  publicStorefrontConfig,
  getSubscriptionStatus,
  subscribeRestock,
  unsubscribeRestock,
}=require('../notifications.service');
const router=express.Router();
router.use(verifyAppProxy);

function proxyError(message,status=400){
  const error=new Error(message);
  error.status=status;
  error.publicMessage=message;
  return error;
}

async function restockEmailForProxyRequest(req,{required=true}={}){
  // If Shopify says this is a signed-in customer, trust Shopify as the identity
  // source and ignore any browser-supplied email.
  if(req.customerId){
    const identity=await getCustomerIdentity(req.shopDomain,req.customerId);
    if(!identity)throw proxyError('Your Shopify customer account could not be verified.',401);
    const email=String(identity.email||'').trim();
    if(!email&&required)throw proxyError('Your Shopify customer account does not have an email address.',409);
    return email;
  }

  const email=String(req.body?.email||'').trim();
  if(!email&&required)throw proxyError('Please enter an email address.',400);
  return email;
}

// Public storefront restock endpoints.
// These still require a valid Shopify App Proxy signature, but a Shopify login
// is not required because guests may legitimately request a stock alert.
router.get('/notifications/config',async(req,res,next)=>{try{
  const config=await getOrCreateConfig(req.shopDomain);
  res.setHeader('Cache-Control','private, max-age=30');
  res.json({...publicStorefrontConfig(config),customerSignedIn:Boolean(req.customerId)});
}catch(e){next(e)}});

router.post('/notifications/restock/status',async(req,res,next)=>{try{
  const variantId=String(req.body?.variantId||'').trim();
  if(!variantId)return res.status(400).json({error:'Missing variant id.'});
  const email=await restockEmailForProxyRequest(req,{required:false});
  if(!email)return res.json({subscribed:false,status:'none',customerSignedIn:Boolean(req.customerId),requiresEmail:!req.customerId});
  const result=await getSubscriptionStatus({shopDomain:req.shopDomain,email,variantId});
  res.setHeader('Cache-Control','no-store');
  res.json({...result,customerSignedIn:Boolean(req.customerId),requiresEmail:false});
}catch(e){next(e)}});

router.post('/notifications/restock/subscribe',async(req,res,next)=>{try{
  const email=await restockEmailForProxyRequest(req);
  const result=await subscribeRestock({
    shopDomain:req.shopDomain,
    email,
    variantId:req.body?.variantId,
    source:'shopify_app_proxy'
  });
  res.setHeader('Cache-Control','no-store');
  res.json({...result,customerSignedIn:Boolean(req.customerId)});
}catch(e){next(e)}});

router.post('/notifications/restock/unsubscribe',async(req,res,next)=>{try{
  const email=await restockEmailForProxyRequest(req);
  const result=await unsubscribeRestock({
    shopDomain:req.shopDomain,
    email,
    variantId:req.body?.variantId
  });
  res.setHeader('Cache-Control','no-store');
  res.json({...result,customerSignedIn:Boolean(req.customerId)});
}catch(e){next(e)}});

// Everything below this point is the signed-in customer notification centre.
router.use(requireProxyCustomer);

function customerRef(req){return anonymousRef(req.shopDomain,'customer',req.customerId)}
function rawResourceKey(b={}){return b.type==='order_tracking'?`order:${b.orderId||b.orderName||''}:${normalizeTrackingNumber(b.trackingNumber)}`:`product:${b.variantId||b.productId||b.productHandle||''}`}
function resourceKeyHash(req,b={}){return anonymousRef(req.shopDomain,'resource',rawResourceKey(b))}
async function customerContext(req){const customer=await getCustomerSnapshot(req.shopDomain,req.customerId);if(!customer){const e=new Error('Customer could not be verified.');e.status=401;throw e}return customer}
function subscriptionForSignedCustomer(row){return {id:String(row._id),type:row.type,productId:row.productId||'',variantId:row.variantId||'',productHandle:row.productHandle||'',orderName:openText(row.orderNameEncrypted||''),trackingNumber:openText(row.trackingNumberEncrypted||''),carrier:row.carrier||'',channels:row.channels||{},state:openJson(row.stateEncrypted||'',{}),active:row.active!==false,lastCheckedAt:row.lastCheckedAt||null,lastNotifiedAt:row.lastNotifiedAt||null,createdAt:row.createdAt,updatedAt:row.updatedAt}}

router.get('/feed',async(req,res,next)=>{try{
  const ref=customerRef(req);const [customer,config,subscriptions,events]=await Promise.all([customerContext(req),NotificationConfig.findOne({shopDomain:req.shopDomain}).lean(),NotificationSubscription.find({shopDomain:req.shopDomain,customerRefHash:ref}).sort({updatedAt:-1}).lean(),NotificationEvent.find({shopDomain:req.shopDomain,customerRefHash:ref}).sort({createdAt:-1}).limit(100)]);
  const orders=(customer.orders?.nodes||[]).map(order=>({id:order.id,legacyResourceId:order.legacyResourceId,name:order.name,createdAt:order.createdAt,fulfillmentStatus:order.displayFulfillmentStatus,statusPageUrl:order.statusPageUrl||'',tracking:(order.fulfillments||[]).flatMap(f=>(f.trackingInfo||[]).map(info=>({number:info.number||'',company:info.company||'',url:info.url||'',status:f.displayStatus||f.status||'',deliveredAt:f.deliveredAt||null})))}));
  res.setHeader('Cache-Control','no-store');res.json({enabled:Boolean(config?.enabled&&config?.pageEnabled),config:{title:config?.pageTitle||'Your notifications',intro:config?.pageIntro||'Track orders, products and the things you want to hear about.',restockEnabled:config?.restockEnabled!==false,priceDropEnabled:config?.priceDropEnabled!==false,trackingEnabled:config?.trackingEnabled!==false},customer:{firstName:customer.firstName||'',email:customer.email||''},orders,subscriptions:subscriptions.map(subscriptionForSignedCustomer),events:events.map(eventForSignedCustomer),unreadCount:events.filter(e=>!e.readAt).length});
}catch(e){next(e)}});

router.post('/subscriptions',async(req,res,next)=>{try{
  const customer=await customerContext(req),b=req.body||{},type=String(b.type||'');if(!['restock','price_drop','order_tracking','product_news'].includes(type))return res.status(400).json({error:'Unsupported notification type.'});
  let order=null,trackingNumber=normalizeTrackingNumber(b.trackingNumber),orderId='',orderName='';
  if(type==='order_tracking'){
    order=(customer.orders?.nodes||[]).find(r=>r.id===b.orderId||String(r.legacyResourceId||'')===String(b.orderId||'')||r.name===b.orderName);if(!order)return res.status(403).json({error:'That order does not belong to this customer.'});
    const allowed=(order.fulfillments||[]).flatMap(f=>f.trackingInfo||[]).map(i=>normalizeTrackingNumber(i.number));if(trackingNumber&&!allowed.includes(trackingNumber))return res.status(403).json({error:'That tracking number does not belong to this order.'});
    orderId=order.id||String(order.legacyResourceId||'');orderName=order.name||'';if(!trackingNumber)trackingNumber=allowed[0]||'';
  }
  const rawKey=rawResourceKey({...b,orderId:orderId||b.orderId,orderName:orderName||b.orderName,trackingNumber});if(!rawKey||rawKey.endsWith(':'))return res.status(400).json({error:'A tracked product or order is required.'});
  const ref=customerRef(req),key=anonymousRef(req.shopDomain,'resource',rawKey);
  const subscription=await NotificationSubscription.findOneAndUpdate({shopDomain:req.shopDomain,customerRefHash:ref,type,resourceKeyHash:key},{$set:{customerRefHash:ref,emailEncrypted:sealText(customer.email||''),resourceKeyHash:key,productId:b.productId||'',variantId:b.variantId||'',productHandle:b.productHandle||'',orderIdEncrypted:sealText(orderId),orderNameEncrypted:sealText(orderName),trackingNumberEncrypted:sealText(trackingNumber),carrier:b.carrier||'',channels:{inApp:b.channels?.inApp!==false,email:b.channels?.email!==false},active:b.active!==false}},{upsert:true,new:true,setDefaultsOnInsert:true});res.json({ok:true,subscription:subscriptionForSignedCustomer(subscription)});
}catch(e){next(e)}});

router.post('/subscriptions/remove',async(req,res,next)=>{try{const ref=customerRef(req);await NotificationSubscription.updateOne({_id:req.body.id,shopDomain:req.shopDomain,customerRefHash:ref},{$set:{active:false}});res.json({ok:true})}catch(e){next(e)}});
router.post('/events/read',async(req,res,next)=>{try{const ref=customerRef(req),ids=Array.isArray(req.body.ids)?req.body.ids:[];await NotificationEvent.updateMany({_id:{$in:ids},shopDomain:req.shopDomain,customerRefHash:ref},{$set:{readAt:new Date()}});res.json({ok:true})}catch(e){next(e)}});
router.post('/track',async(req,res,next)=>{try{const customer=await customerContext(req);const order=(customer.orders?.nodes||[]).find(r=>r.id===req.body.orderId||String(r.legacyResourceId||'')===String(req.body.orderId||'')||r.name===req.body.orderName);if(!order)return res.status(403).json({error:'Order not found for this customer.'});const trackings=(order.fulfillments||[]).flatMap(f=>(f.trackingInfo||[]).map(i=>({number:normalizeTrackingNumber(i.number),company:i.company||''})));const requested=normalizeTrackingNumber(req.body.trackingNumber);const tracking=requested?trackings.find(r=>r.number===requested):trackings[0];if(!tracking?.number)return res.status(404).json({error:'No tracking number is available yet.'});res.json(await trackByNumber(tracking.number,tracking.company))}catch(e){next(e)}});
module.exports=router;
