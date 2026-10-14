'use strict';
// Keep rules intentionally narrow until individual module permissions are audited.
const ROLES = Object.freeze(['owner','admin','editor','viewer']);
function methodIsRead(method) { return ['GET','HEAD','OPTIONS'].includes(String(method||'').toUpperCase()); }
function canAccess(role,method) {
  if (!ROLES.includes(role)) return false;
  return methodIsRead(method) || role === 'owner' || role === 'admin';
}
function shopMatches(memberShop, requestedShop) {
  return !!memberShop && (!requestedShop || String(memberShop).toLowerCase()===String(requestedShop).toLowerCase());
}
function userIdFromShopifyPayload(payload) {
  const sub = payload && payload.sub;
  return (typeof sub==='string' || typeof sub==='number') && /^\d+$/.test(String(sub)) ? String(sub) : '';
}
module.exports={canAccess,methodIsRead,shopMatches,userIdFromShopifyPayload};
