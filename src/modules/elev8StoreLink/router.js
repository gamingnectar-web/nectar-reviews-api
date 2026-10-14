'use strict';
const express=require('express');
const crypto=require('crypto');
const {env}=require('../../config/env');
const {accountSession}=require('../elev8Accounts');
const {Workspace,Membership,Connection,Audit}=require('../elev8Workspaces/models');
const mongoose=require('mongoose');
const router=express.Router();
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const fail=(res,code,msg)=>res.status(code).json({error:msg});
const shopOk=s=>/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);
const base=()=>new URL(process.env.APP_URL).origin;
const callback=()=>base()+'/elev8/store-link/callback';
const collection=()=>mongoose.connection.db.collection('elev8_store_oauth_states');
const enabled=()=>process.env.ELEV8_STORE_LINK_ENABLED==='true';
const validOrigin=req=>{try{return req.get('Origin')===base();}catch{return false;}};
const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
function verifyHmac(query){
 const got=String(query.hmac||'');if(!/^[a-f0-9]{64}$/i.test(got))return false;
 const message=Object.keys(query).filter(k=>!['hmac','signature'].includes(k)).sort().map(k=>`${k}=${Array.isArray(query[k])?query[k].join(','):query[k]}`).join('&');
 const actual=crypto.createHmac('sha256',env.shopifyApiSecret).update(message).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(got,'hex'),Buffer.from(actual,'hex'));
}
router.use((req,res,next)=>enabled()?next():res.status(404).end());
router.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');next()});
router.post('/start',express.json({limit:'8kb'}),async(req,res,next)=>{try{
 if(!validOrigin(req))return fail(res,403,'Invalid request origin');
 const auth=await accountSession(req);if(!auth)return fail(res,401,'Sign in required');
 const workspaceId=String(req.body?.workspaceId||'');const shopDomain=String(req.body?.shopDomain||'').trim().toLowerCase();
 if(!mongoose.isValidObjectId(workspaceId)||!shopOk(shopDomain))return fail(res,400,'Invalid store or workspace');
 const role=await Membership.findOne({workspaceId,memberId:auth.account._id,active:true,role:{$in:['owner','admin']}}).lean();
 if(!role||!await Workspace.exists({_id:workspaceId,status:'active'}))return fail(res,403,'Workspace administrator required');
 if(!env.shopifyApiKey||!env.shopifyApiSecret||!env.appUrl)return fail(res,503,'Shopify OAuth unavailable');
 const state=random();await collection().createIndex({expiresAt:1},{expireAfterSeconds:0});
 await collection().insertOne({stateHash:hash(state),workspaceId:new mongoose.Types.ObjectId(workspaceId),accountId:auth.account._id,shopDomain,consumedAt:null,expiresAt:new Date(Date.now()+10*60*1000)});
 res.cookie('elev8_store_oauth_state',state,{httpOnly:true,secure:true,sameSite:'lax',path:'/elev8/store-link',maxAge:600000});
 const url=new URL(`https://${shopDomain}/admin/oauth/authorize`);
 for(const [k,v] of Object.entries({client_id:env.shopifyApiKey,scope:env.shopifyScopes,redirect_uri:callback(),state}))url.searchParams.set(k,v);
 return res.json({authorizeUrl:url.toString()});
 }catch(e){next(e)}});
router.get('/callback',async(req,res,next)=>{try{
 const state=String(req.query.state||'');const shop=String(req.query.shop||'').toLowerCase();const code=String(req.query.code||'');
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(state)||!shopOk(shop)||!code||cookie(req,'elev8_store_oauth_state')!==state||!verifyHmac(req.query))return fail(res,400,'Invalid Shopify authorisation');
 res.clearCookie('elev8_store_oauth_state',{httpOnly:true,secure:true,sameSite:'lax',path:'/elev8/store-link'});
 const record=await collection().findOneAndUpdate({stateHash:hash(state),shopDomain:shop,consumedAt:null,expiresAt:{$gt:new Date()}},{$set:{consumedAt:new Date()}},{returnDocument:'after'});
 if(!record)return fail(res,400,'Authorisation expired or already used');
 const auth=await accountSession(req);if(!auth||String(auth.account._id)!==String(record.accountId))return fail(res,403,'Original ELEV8 account session required');
 if(!await Membership.exists({workspaceId:record.workspaceId,memberId:record.accountId,active:true,role:{$in:['owner','admin']}}))return fail(res,403,'Workspace permission changed');
 const tokenResp=await fetch(`https://${shop}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:env.shopifyApiKey,client_secret:env.shopifyApiSecret,code}),signal:AbortSignal.timeout(10000)});
 if(!tokenResp.ok)return fail(res,502,'Shopify token exchange failed');
 const t=await tokenResp.json();if(!t.access_token)return fail(res,502,'Missing Shopify authorisation token');
 // Confirm the returned token can only read the exact shop that was authorised.
 const verify=await fetch(`https://${shop}/admin/api/${env.shopifyApiVersion}/shop.json`,{headers:{'X-Shopify-Access-Token':t.access_token},signal:AbortSignal.timeout(10000)});
 if(!verify.ok)return fail(res,502,'Unable to verify Shopify store');
 const body=await verify.json();if(String(body.shop?.myshopify_domain||'').toLowerCase()!==shop)return fail(res,403,'Shopify store mismatch');
 // Never modify Shop.accessTokenEncrypted or installed modules. Record only verified relationship.
 const conn=await Connection.findOneAndUpdate({workspaceId:record.workspaceId,shopDomain:shop},{$set:{state:'verified',verifiedAt:new Date(),verifiedBy:record.accountId,approvedScopes:String(t.scope||'').split(',').filter(Boolean),connectionReference:'oauth-verified-no-token-retained'},$setOnInsert:{requestedBy:record.accountId}},{upsert:true,new:true,setDefaultsOnInsert:true});
 await Audit.create({workspaceId:record.workspaceId,actorId:record.accountId,action:'connection.shopify_verified',subjectType:'connection',subjectId:String(conn._id)});
 return res.redirect(303,'/elev8/account/home?connection=verified');
 }catch(e){next(e)}});
router.use((err,req,res,next)=>{console.error('[ELEV8 store link]',err.message);return fail(res,500,'Store connection failed')});
module.exports={router};
