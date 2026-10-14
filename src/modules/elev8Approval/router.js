'use strict';
const express = require('express');
const {verifyShopifySessionToken} = require('../../utils/security');
const {Member} = require('../elev8BrowserAuth/model');
const {Workspace,Membership,Connection,Proposal,Audit}=require('../elev8Workspaces/models');
const router=express.Router();
const reject=(res,status,error)=>res.status(status).json({error});
const roles=new Set(['owner','admin']);
const validId=v=>/^[a-f\d]{24}$/i.test(String(v||''));
const staffIdFrom=payload=>String(payload?.sub||'').trim();
router.use((req,res,next)=>process.env.ELEV8_SHOPIFY_DRAFTS_ENABLED==='true'?next():res.status(404).end());
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next()});
router.use(async(req,res,next)=>{
 try {
  const token=/^Bearer\s+(.+)$/i.exec(String(req.get('Authorization')||''))?.[1];
  if(!token)return reject(res,401,'A Shopify staff session token is required');
  const checked=verifyShopifySessionToken(token);
  if(!checked.ok||!checked.shopDomain)return reject(res,401,'Invalid Shopify staff session');
  const staffId=staffIdFrom(checked.payload);
  if(!staffId)return reject(res,403,'Shopify staff identity unavailable');
  // Membership must be explicitly linked through existing enrolment process.
  const member=await Member.findOne({shopDomain:checked.shopDomain,shopifyUserId:staffId,active:true}).lean();
  if(!member)return reject(res,403,'Staff member has not been enrolled');
  req.elev8Shop=checked.shopDomain;req.elev8Actor=member;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const trusted=new URL(process.env.APP_URL).origin;
   if(req.get('Origin')!==trusted)return reject(res,403,'Untrusted request origin');
  }
  next();
 }catch(e){next(e)}
});
async function scope(req,res,next){
 try{
  if(!validId(req.params.connectionId))return reject(res,400,'Invalid connection');
  const connection=await Connection.findOne({_id:req.params.connectionId,shopDomain:req.elev8Shop,state:'verified'}).lean();
  if(!connection)return reject(res,404,'Verified store connection not found');
  const workspace=await Workspace.findOne({_id:connection.workspaceId,status:'active'}).lean();
  if(!workspace)return reject(res,404,'Workspace not found');
  const membership=await Membership.findOne({workspaceId:workspace._id,memberId:req.elev8Actor._id,active:true}).lean();
  // Legacy Shopify member IDs and independent account IDs are not automatically interchangeable.
  if(!membership)return reject(res,403,'Explicit workspace membership required');
  req.connection=connection;req.membership=membership;next();
 }catch(e){next(e)}
}
router.get('/connections',async(req,res,next)=>{
 try{
  const memberships=await Membership.find({memberId:req.elev8Actor._id,active:true}).lean();
  const ids=memberships.map(m=>m.workspaceId);
  const connections=await Connection.find({workspaceId:{$in:ids},shopDomain:req.elev8Shop,state:'verified'}).select('shopDomain workspaceId state').lean();
  res.json({connections});
 }catch(e){next(e)}
});
router.get('/connections/:connectionId/proposals',scope,async(req,res,next)=>{
 try{
  const status=String(req.query.status||'');
  const statuses=['draft','submitted','approved','rejected','cancelled'];
  if(status&&!statuses.includes(status))return reject(res,400,'Invalid status');
  const query={connectionId:req.connection._id,workspaceId:req.connection.workspaceId};
  if(status)query.status=status;
  const proposals=await Proposal.find(query).select('title kind status revision original proposed createdBy reviewedBy reviewedAt createdAt updatedAt').sort({updatedAt:-1}).limit(100).lean();
  res.json({proposals,shopifyMutationPerformed:false});
 }catch(e){next(e)}
});
router.post('/connections/:connectionId/proposals/:proposalId/decision',scope,async(req,res,next)=>{
 try{
  if(process.env.ELEV8_SHOPIFY_APPROVAL_ENABLED!=='true')return reject(res,403,'Approval decisions are not enabled');
  if(!roles.has(req.membership.role))return reject(res,403,'Approval permission required');
  if(!validId(req.params.proposalId))return reject(res,400,'Invalid proposal ID');
  const decision=req.body?.decision;
  if(!['approved','rejected'].includes(decision))return reject(res,400,'Invalid decision');
  const row=await Proposal.findOneAndUpdate({
    _id:req.params.proposalId,connectionId:req.connection._id,workspaceId:req.connection.workspaceId,
    status:'submitted',createdBy:{$ne:req.elev8Actor._id}
  },{$set:{status:decision,reviewedBy:req.elev8Actor._id,reviewedAt:new Date()},$inc:{revision:1}},{new:true});
  if(!row)return reject(res,409,'Proposal unavailable or already reviewed');
  await Audit.create({workspaceId:req.connection.workspaceId,actorId:req.elev8Actor._id,action:'shopify.proposal.'+decision,subjectType:'proposal',subjectId:String(row._id)});
  res.json({id:row._id,status:row.status,shopifyMutationPerformed:false});
 }catch(e){next(e)}
});
router.use((err,req,res,next)=>{console.error('[ELEV8 approvals]',err.message);reject(res,500,'Unable to process approval queue')});
module.exports={router};
