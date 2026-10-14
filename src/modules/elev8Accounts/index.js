'use strict';
const express=require('express');
const crypto=require('crypto');
const {Account,AuthState,AccountSession}=require('./models');
const router=express.Router();
const BASE='/elev8/account';const COOKIE='elev8_account_session';
const enabled=()=>process.env.ELEV8_ACCOUNTS_ENABLED==='true';
const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const fail=(res,code,message)=>res.status(code).json({error:message});
const base=()=>new URL(process.env.APP_URL).origin;
const redirectUri=()=>`${base()}${BASE}/callback`;
function configured(){return !!(process.env.ELEV8_GOOGLE_CLIENT_ID&&process.env.ELEV8_GOOGLE_CLIENT_SECRET&&process.env.APP_URL);}
function originOk(req){try{return req.get('Origin')===base();}catch{return false;}}
function readCookie(req){const row=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));return row?row.slice(COOKIE.length+1):'';}
async function accountSession(req){
 if(!enabled())return null;
 const token=readCookie(req);
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))return null;
 const record=await AccountSession.findOne({tokenHash:h(token),revokedAt:null,expiresAt:{$gt:new Date()}}).lean();
 if(!record)return null;
 const account=await Account.findOne({_id:record.accountId,status:'active'}).lean();
 return account?{account,session:record}:null;
}
async function googleKeys(){
 const resp=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(5000)});
 if(!resp.ok)throw Error('Google signing keys unavailable');
 const data=await resp.json();return data.keys||[];
}
async function verifyIdToken(idToken,expectedNonce){
 const parts=String(idToken||'').split('.');if(parts.length!==3)throw Error('Invalid Google identity token');
 const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Unsupported identity signature');
 const keys=await googleKeys();const jwk=keys.find(x=>x.kid===header.kid&&x.kty==='RSA'&&x.use==='sig');
 if(!jwk)throw Error('Unrecognised identity signing key');
 const key=crypto.createPublicKey({key:jwk,format:'jwk'});
 if(!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))throw Error('Invalid identity signature');
 const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
 const now=Math.floor(Date.now()/1000);
 if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==process.env.ELEV8_GOOGLE_CLIENT_ID||!Number.isInteger(claims.exp)||claims.exp<=now||!Number.isInteger(claims.iat)||claims.iat>now+60||claims.iat<now-3600||claims.nonce!==expectedNonce||claims.email_verified!==true||typeof claims.sub!=='string'||!claims.sub||typeof claims.email!=='string')throw Error('Invalid Google identity claims');
 return claims;
}
router.use((req,res,next)=>enabled()?next():res.status(404).end());
router.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');next();});
router.get('/login',async(req,res,next)=>{
 if(!configured())return fail(res,503,'Google sign-in is not configured');
 try{
 const state=random(),nonce=random(),verifier=random();
 await AuthState.create({stateHash:h(state),nonceHash:h(nonce),verifier,expiresAt:new Date(Date.now()+10*60*1000)});
 const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v] of Object.entries({client_id:process.env.ELEV8_GOOGLE_CLIENT_ID,redirect_uri:redirectUri(),response_type:'code',scope:'openid email profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}))url.searchParams.set(k,v);
 // HTTP-only nonce-binding cookie prevents a login CSRF / authorization-code injection.
 res.cookie('elev8_oidc_state',state,{httpOnly:true,secure:true,sameSite:'lax',maxAge:600000,path:BASE});
 return res.redirect(302,url.toString());
 }catch(e){next(e)}
});
router.get('/callback',async(req,res,next)=>{
 try{
 const {state,code}=req.query;
 if(typeof state!=='string'||typeof code!=='string'||!state||!code||readStateCookie(req)!==state)return fail(res,400,'Invalid sign-in callback');
 res.clearCookie('elev8_oidc_state',{httpOnly:true,secure:true,sameSite:'lax',path:BASE});
 const saved=await AuthState.findOneAndUpdate({stateHash:h(state),consumedAt:null,expiresAt:{$gt:new Date()}},{$set:{consumedAt:new Date()}},{new:true});
 if(!saved)return fail(res,400,'Sign-in attempt already used or expired');
 const tokenResp=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.ELEV8_GOOGLE_CLIENT_ID,client_secret:process.env.ELEV8_GOOGLE_CLIENT_SECRET,code,code_verifier:saved.verifier,grant_type:'authorization_code',redirect_uri:redirectUri()}),signal:AbortSignal.timeout(7000)});
 if(!tokenResp.ok)return fail(res,401,'Google sign-in failed');
 const tokens=await tokenResp.json();
 // Google echoes nonce in ID token; we stored its hash, so first validate signature/claims,
 // then compare nonce hash (nonce never needs to appear in logs or DB plaintext).
 const idParts=String(tokens.id_token||'').split('.');if(idParts.length!==3)return fail(res,401,'Missing Google identity');
 const unsafeClaims=JSON.parse(Buffer.from(idParts[1],'base64url').toString('utf8'));
 if(typeof unsafeClaims.nonce!=='string'||h(unsafeClaims.nonce)!==saved.nonceHash)return fail(res,401,'Invalid sign-in nonce');
 const claims=await verifyIdToken(tokens.id_token,unsafeClaims.nonce);
 const email=claims.email.toLowerCase().trim();if(email.length>254)return fail(res,401,'Invalid account email');
 let account=await Account.findOne({googleSub:claims.sub});
 if(!account){
   // Do not automatically link existing accounts by email alone.
   account=await Account.create({email,googleSub:claims.sub,displayName:String(claims.name||'').slice(0,120)});
 }else if(account.status!=='active')return fail(res,403,'Account disabled');
 else{account.lastLoginAt=new Date();await account.save();}
 const secret=random(),ttl=12*60*60*1000;
 await AccountSession.create({tokenHash:h(secret),accountId:account._id,expiresAt:new Date(Date.now()+ttl)});
 res.cookie(COOKIE,secret,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:ttl});
 return res.redirect(303,'/elev8/account/home');
 }catch(error){console.error('[ELEV8 account login]',error.message);return fail(res,401,'Unable to complete sign-in')}
});
function readStateCookie(req){const row=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('elev8_oidc_state='));return row?row.slice('elev8_oidc_state='.length):'';}
router.get('/me',async(req,res,next)=>{try{const auth=await accountSession(req);if(!auth)return fail(res,401,'Sign in required');res.json({account:{id:auth.account._id,email:auth.account.email,name:auth.account.displayName}});}catch(e){next(e)}});
router.post('/logout',async(req,res,next)=>{try{if(!originOk(req))return fail(res,403,'Untrusted origin');const token=readCookie(req);if(token)await AccountSession.updateOne({tokenHash:h(token)},{$set:{revokedAt:new Date()}});res.clearCookie(COOKIE,{httpOnly:true,secure:true,sameSite:'lax',path:'/'});res.status(204).end();}catch(e){next(e)}});
router.get('/home',(req,res)=>res.status(200).type('html').send('<!doctype html><meta charset="utf-8"><title>ELEV8</title><main style="font:16px system-ui;max-width:680px;margin:10vh auto"><h1>ELEV8 account</h1><p>Signed-in account dashboard foundation. Use <code>/elev8/account/me</code> to inspect your verified session. Shopify store permissions are not granted by signing in.</p></main>'));
module.exports={router,accountSession,verifyIdToken};
