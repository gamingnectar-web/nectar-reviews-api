const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const {Member,Challenge,Session}=require('./model');
const router=express.Router();
const COOKIE='elev8_browser_session';
const TTL_SHORT=12*60*60*1000;
const TTL_LONG=30*24*60*60*1000;
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const validShop=value=>/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(String(value||''));
function originAllowed(req){
  let origin=req.get('Origin');
  if(!origin)return false;
  try {return new URL(origin).origin===new URL(process.env.APP_URL).origin;}catch{return false;}
}
function featureEnabled(){return process.env.ELEV8_BROWSER_LOGIN_ENABLED==='true';}
function render(res,body,status=200){
 res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');
 res.status(status).type('html').send(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ELEV8 Sign in</title><style>body{font:16px system-ui;background:#f3f6f8;display:grid;place-items:center;min-height:100vh;color:#152c3a}main{width:min(420px,90vw);background:#fff;border-radius:18px;padding:32px;box-shadow:0 12px 42px #16273418}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border-radius:8px;border:1px solid #bdced4}button{background:#12637a;color:white;cursor:pointer}small{color:#58707b}</style></head><body><main><h1>ELEV8</h1>${body}</main></body></html>`);
}
router.get('/login',(req,res)=>{
 if(!featureEnabled())return res.status(404).end();
 return render(res,`<p>Sign in with your approved ELEV8 email.</p><form method="post" action="/elev8/login/request"><label>Shop domain<input name="shop" placeholder="your-store.myshopify.com" required autocomplete="organization"></label><label>Email<input type="email" name="email" autocomplete="email" required></label><button>Send secure sign-in link</button></form><small>Shopify Admin access continues separately.</small>`);
});
const requests=new Map();
function throttle(req){
 const key=digest(String(req.ip||'')+':'+String(req.body?.email||''));
 const now=Date.now();const row=requests.get(key)||{n:0,end:now+15*60*1000};
 if(row.end<now){row.n=0;row.end=now+15*60*1000;}
 row.n++;requests.set(key,row);
 if(requests.size>10000)for(const [k,v] of requests){if(v.end<now)requests.delete(k);}
 return row.n<=5;
}
router.post('/login/request',express.urlencoded({extended:false,limit:'8kb'}),async(req,res,next)=>{
 if(!featureEnabled())return res.status(404).end();
 if(!originAllowed(req))return res.status(403).end();
 if(!throttle(req))return res.status(429).send('Try again later');
 const email=normalizeEmail(req.body.email);const shop=String(req.body.shop||'').trim().toLowerCase();
 if(email.length>254||!validShop(shop))return res.status(400).send('Invalid details');
 try{
  const member=await Member.findOne({shopDomain:shop,email,active:true});
  if(member){
   if(!process.env.ELEV8_LOGIN_SMTP_URL||!process.env.ELEV8_LOGIN_FROM)throw new Error('Browser login email is not configured');
   const value=token();
   await Challenge.create({memberId:member._id,tokenHash:digest(value),expiresAt:new Date(Date.now()+15*60*1000)});
   const url=new URL('/elev8/login/verify',process.env.APP_URL);url.searchParams.set('token',value);
   const transport=nodemailer.createTransport(process.env.ELEV8_LOGIN_SMTP_URL);
   await transport.sendMail({from:process.env.ELEV8_LOGIN_FROM,to:email,subject:'Sign in to ELEV8',text:`Open this link to confirm your ELEV8 login (expires in 15 minutes):\n${url.toString()}\nIf you did not request this, ignore it.`});
  }
  return render(res,'<p>If you have access, a sign-in link has been sent. Check your email.</p>');
 }catch(error){return next(error);}
});
router.get('/login/verify',(req,res)=>{
 if(!featureEnabled())return res.status(404).end();
 const value=String(req.query.token||'');
 if(!/^[a-zA-Z0-9_-]{40,100}$/.test(value))return render(res,'<p>Invalid link.</p>',400);
 return render(res,`<p>Confirm this sign-in to ELEV8.</p><form method="post" action="/elev8/login/verify"><input type="hidden" name="token" value="${value}"><label><input style="width:auto" type="checkbox" name="remember" value="yes"> Remember this browser for 30 days</label><button>Complete sign in</button></form>`);
});
router.post('/login/verify',express.urlencoded({extended:false,limit:'8kb'}),async(req,res,next)=>{
 if(!featureEnabled())return res.status(404).end();
 if(!originAllowed(req))return res.status(403).end();
 const value=String(req.body.token||'');
 if(!/^[a-zA-Z0-9_-]{40,100}$/.test(value))return res.status(400).end();
 const now=new Date();
 try{
  const challenge=await Challenge.findOneAndUpdate({tokenHash:digest(value),consumedAt:null,expiresAt:{$gt:now}},{$set:{consumedAt:now}},{new:true});
  if(!challenge)return render(res,'<p>Link expired or already used.</p>',400);
  const member=await Member.findOne({_id:challenge.memberId,active:true});
  if(!member)return res.status(403).end();
  const secret=token(),ttl=req.body.remember==='yes'?TTL_LONG:TTL_SHORT;
  await Session.create({memberId:member._id,shopDomain:member.shopDomain,tokenHash:digest(secret),expiresAt:new Date(Date.now()+ttl),userAgentHash:digest(req.get('User-Agent')||'')});
  res.cookie(COOKIE,secret,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:ttl});
  res.set('Cache-Control','no-store');return res.redirect(303,`/admin?shop=${encodeURIComponent(member.shopDomain)}`);
 }catch(error){return next(error);}
});
function readCookie(req){
 const match=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 return match?match.slice(COOKIE.length+1):'';
}
async function browserSession(req){
 if(!featureEnabled())return null;
 const raw=readCookie(req);
 if(!/^[a-zA-Z0-9_-]{40,100}$/.test(raw))return null;
 const session=await Session.findOne({tokenHash:digest(raw),revokedAt:null,expiresAt:{$gt:new Date()}}).lean();
 if(!session||session.userAgentHash!==digest(req.get('User-Agent')||''))return null;
 const member=await Member.findOne({_id:session.memberId,active:true}).lean();
 if(!member||member.shopDomain!==session.shopDomain)return null;
 return {session,member};
}
function unsafe(req){return !['GET','HEAD','OPTIONS'].includes(req.method);}
async function browserAdminMiddleware(req,res,next){
 try{
  const auth=await browserSession(req);if(!auth)return next();
  const requested=String(req.query.shopDomain||req.query.shop||req.body?.shopDomain||req.body?.shop||req.get('x-shop-domain')||'').toLowerCase();
  if(requested&&requested!==auth.member.shopDomain)return res.status(403).json({error:'Shop mismatch'});
  if(unsafe(req)&&!originAllowed(req))return res.status(403).json({error:'Untrusted request origin'});
  if(unsafe(req)&&!['owner','admin'].includes(auth.member.role))return res.status(403).json({error:'This action requires an administrator'});
  req.shopDomain=auth.member.shopDomain;req.elev8Member=auth.member;req.adminAuthMode='elev8-browser';
  return next();
 }catch(error){return next(error);}
}
router.post('/logout',async(req,res,next)=>{
 if(!originAllowed(req))return res.status(403).end();
 try{
  const raw=readCookie(req);if(raw)await Session.updateOne({tokenHash:digest(raw)},{$set:{revokedAt:new Date()}});
  res.clearCookie(COOKIE,{path:'/',httpOnly:true,secure:true,sameSite:'lax'});
  return res.redirect(303,'/elev8/login');
 }catch(error){next(error);}
});
module.exports={router,browserSession,browserAdminMiddleware,featureEnabled};
