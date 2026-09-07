const crypto = require('crypto');
const { env } = require('../../../config/env');

function safeCompare(a,b){
  const A=Buffer.from(String(a||''),'utf8');
  const B=Buffer.from(String(b||''),'utf8');
  return A.length===B.length && crypto.timingSafeEqual(A,B);
}

function signedMessage(query={}){
  return Object.keys(query).filter(k=>k!=='signature').sort().map(k=>{
    const v=query[k];
    return `${k}=${Array.isArray(v)?v.join(','):String(v??'')}`;
  }).join('');
}

function verifyAppProxy(req,res,next){
  const secret=env.shopifyApiSecret || process.env.SHOPIFY_API_SECRET || '';
  const signature=String(req.query.signature||'');
  if(!secret || !signature) return res.status(401).json({error:'Secure storefront connection is not configured.'});
  const timestamp=Number(req.query.timestamp||0);
  if(!timestamp || Math.abs(Math.floor(Date.now()/1000)-timestamp)>300) return res.status(401).json({error:'Storefront request has expired.'});
  const expected=crypto.createHmac('sha256',secret).update(signedMessage(req.query)).digest('hex');
  if(!safeCompare(expected,signature)) return res.status(401).json({error:'Invalid storefront signature.'});
  req.shopDomain=String(req.query.shop||'').replace(/^https?:\/\//,'').replace(/\/$/,'').toLowerCase();
  req.customerId=String(req.query.logged_in_customer_id||'').trim();
  if(!req.shopDomain) return res.status(400).json({error:'Shop is missing.'});
  next();
}

function requireProxyCustomer(req,res,next){
  if(!req.customerId) return res.status(401).json({error:'Please sign in to manage notifications.',loginRequired:true});
  next();
}

module.exports={verifyAppProxy,requireProxyCustomer};
