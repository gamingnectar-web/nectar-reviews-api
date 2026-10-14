'use strict';
const {Member} = require('./model');
const {browserSession,featureEnabled} = require('./index');
const {verifyShopifySessionToken,requireAdminSession,allowedAdminOrigin} = require('../../utils/security');
const {canAccess,methodIsRead,shopMatches,userIdFromShopifyPayload} = require('./policy');

function requestedShop(req) {
  return String(req.query?.shopDomain||req.query?.shop||req.body?.shopDomain||req.body?.shop||req.headers['x-shop-domain']||'').trim().toLowerCase();
}
function deny(res,code,message) {return res.status(code).json({error:message});}
function validWriteOrigin(req) {
  if(methodIsRead(req.method)) return true;
  const origin=req.get('Origin');
  return !!origin && allowedAdminOrigin(origin);
}

// Rollout flag. OFF: preserve existing production authorisation exactly.
// ON: authenticated individual ELEV8 membership is mandatory for admin requests.
async function unifiedAdminSession(req,res,next) {
  if(process.env.ELEV8_UNIFIED_AUTH_ENFORCE !== 'true') {
    const {browserAdminMiddleware} = require('./index');
    return browserAdminMiddleware(req,res,error => {
      if(error) return next(error);
      if(req.adminAuthMode === 'elev8-browser') return next();
      return requireAdminSession(req,res,next);
    });
  }
  try {
    const auth=String(req.headers.authorization||'');
    const bearer=/^Bearer\s+(.+)$/i.exec(auth)?.[1];
    let member,mode;
    if(bearer) {
      const verified=verifyShopifySessionToken(bearer);
      if(!verified.ok) return deny(res,401,'Invalid Shopify session token');
      const staffId=userIdFromShopifyPayload(verified.payload);
      if(!staffId) return deny(res,403,'Shopify staff identity is missing');
      member=await Member.findOne({shopDomain:verified.shopDomain,shopifyUserId:staffId,active:true}).lean();
      mode='shopify-staff';
      if(!member) return deny(res,403,'Shopify staff member is not enrolled in ELEV8');
    } else if(featureEnabled()) {
      const login=await browserSession(req);
      if(login) {member=login.member;mode='elev8-browser';}
    }
    if(!member) return deny(res,401,'Sign in with an authorised ELEV8 account');
    if(!shopMatches(member.shopDomain,requestedShop(req))) return deny(res,403,'Shop mismatch');
    if(!canAccess(member.role,req.method)) return deny(res,403,'Insufficient permissions');
    if(!validWriteOrigin(req)) return deny(res,403,'Untrusted request origin');
    req.shopDomain=member.shopDomain;
    req.elev8Member=member;
    req.adminAuthMode=mode;
    return next();
  } catch(error) {return next(error);}
}
module.exports={unifiedAdminSession};
