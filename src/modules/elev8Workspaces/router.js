'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { browserSession } = require('../elev8BrowserAuth');
const { accountSession } = require('../elev8Accounts');
const { Workspace, Membership, Connection, Proposal, Audit } = require('./models');
const router=express.Router();
const oid=x=>mongoose.isValidObjectId(x);
const shopValid=x=>/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(String(x||''));
const fail=(res,code,message)=>res.status(code).json({error:message});
const roleCan=(role,task)=>({read:true,create:['owner','admin','editor'].includes(role),approve:['owner','admin'].includes(role),manage:['owner','admin'].includes(role)})[task]===true;
function requireOrigin(req,res,next){
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 try {
  const allowed = new URL(process.env.APP_URL||process.env.RENDER_EXTERNAL_URL).origin;
  if(req.get('Origin')!==allowed) return fail(res,403,'Origin rejected');
 }catch{return fail(res,503,'APP_URL must be configured');}
 next();
}
function noStore(req,res,next){res.set('Cache-Control','no-store');next();}
router.use((req,res,next)=>process.env.ELEV8_WORKSPACES_ENABLED==='true'?next():res.status(404).end());
router.use(noStore,requireOrigin);
router.use(async(req,res,next)=>{
 try {
  const independent=await accountSession(req);
  const legacy=independent?null:await browserSession(req);
  if(!independent&&!legacy)return fail(res,401,'Sign in to ELEV8');
  req.actor=independent?independent.account:legacy.member;
  next();
 }catch(error){next(error);}
});
async function access(req,res,next){
 try {
 if(!oid(req.params.workspaceId))return fail(res,400,'Invalid workspace');
 const member=await Membership.findOne({workspaceId:req.params.workspaceId,memberId:req.actor._id,active:true}).lean();
 const workspace=member&&await Workspace.findOne({_id:req.params.workspaceId,status:'active'}).lean();
 if(!workspace)return fail(res,404,'Workspace not found');
 req.membership=member;req.workspace=workspace;next();
 } catch(error) { next(error); }
}
function allowed(task){return(req,res,next)=>roleCan(req.membership.role,task)?next():fail(res,403,'Insufficient workspace permissions');}
async function audit(workspaceId,actorId,action,subjectType,subjectId){await Audit.create({workspaceId,actorId,action,subjectType,subjectId:String(subjectId)});}
router.get('/me',async(req,res,next)=>{try{
 const ms=await Membership.find({memberId:req.actor._id,active:true}).lean();
 const ids=ms.map(x=>x.workspaceId);
 const spaces=await Workspace.find({_id:{$in:ids},status:'active'}).select('name status createdAt').lean();
 res.json({user:{id:req.actor._id,email:req.actor.email},workspaces:spaces.map(x=>({...x,role:ms.find(y=>String(y.workspaceId)===String(x._id))?.role}))});
}catch(e){next(e)}});
router.post('/workspaces',async(req,res,next)=>{try{
 const name=String(req.body?.name||'').trim();if(!name||name.length>120)return fail(res,400,'Invalid workspace name');
 // Use transaction on replica-set backed MongoDB: never create a workspace without its owner membership.
 const session=await mongoose.startSession();let created;
 try{await session.withTransaction(async()=>{
  const [w]=await Workspace.create([{name,ownerMemberId:req.actor._id}],{session});created=w;
  await Membership.create([{workspaceId:w._id,memberId:req.actor._id,role:'owner'}],{session});
  await Audit.create([{workspaceId:w._id,actorId:req.actor._id,action:'workspace.created',subjectType:'workspace',subjectId:String(w._id)}],{session});
 });}finally{await session.endSession();}
 res.status(201).json({workspace:{id:created._id,name:created.name}});
}catch(e){next(e)}});
router.get('/workspaces/:workspaceId/connections',access,allowed('read'),async(req,res,next)=>{try{
 const rows=await Connection.find({workspaceId:req.workspace._id}).select('shopDomain state approvedScopes verifiedAt createdAt').lean();res.json({connections:rows});
}catch(e){next(e)}});
router.post('/workspaces/:workspaceId/connections',access,allowed('manage'),async(req,res,next)=>{try{
 const shopDomain=String(req.body?.shopDomain||'').trim().toLowerCase();
 if(!shopValid(shopDomain))return fail(res,400,'A valid myshopify.com shop domain is required');
 // Deliberately NEVER claim a store is connected here. Shopify authorization is a separate verified step.
 const row=await Connection.findOneAndUpdate({workspaceId:req.workspace._id,shopDomain},{$setOnInsert:{requestedBy:req.actor._id,state:'requested'}},{upsert:true,new:true,setDefaultsOnInsert:true});
 await audit(req.workspace._id,req.actor._id,'connection.requested','connection',row._id);
 res.status(202).json({connection:{id:row._id,shopDomain:row.shopDomain,state:row.state},next:'shopify_oauth_not_yet_integrated'});
}catch(e){next(e)}});
router.get('/workspaces/:workspaceId/proposals',access,allowed('read'),async(req,res,next)=>{try{
 const list=await Proposal.find({workspaceId:req.workspace._id}).select('title kind status resourceGid connectionId revision createdAt updatedAt').sort({updatedAt:-1}).limit(100).lean();res.json({proposals:list});
}catch(e){next(e)}});
router.post('/workspaces/:workspaceId/proposals',access,allowed('create'),async(req,res,next)=>{try{
 const {connectionId,kind,title,resourceGid='',original={},proposed={}}=req.body||{};
 if(!oid(connectionId)||!['product','seo','campaign','discount','inventory','other'].includes(kind)||typeof title!=='string'||!title.trim()||title.length>160)return fail(res,400,'Invalid proposal');
 if(![original,proposed].every(x=>x&&typeof x==='object'&&!Array.isArray(x)))return fail(res,400,'Invalid proposal data');
 const bytes=Buffer.byteLength(JSON.stringify({original,proposed}));if(bytes>64*1024)return fail(res,413,'Proposal exceeds 64 KB');
 const connected=await Connection.exists({_id:connectionId,workspaceId:req.workspace._id});if(!connected)return fail(res,404,'Store connection not found');
 const row=await Proposal.create({workspaceId:req.workspace._id,connectionId,createdBy:req.actor._id,kind,title:title.trim(),resourceGid:String(resourceGid).slice(0,256),original,proposed});
 await audit(req.workspace._id,req.actor._id,'proposal.created','proposal',row._id);
 res.status(201).json({proposal:{id:row._id,status:row.status,revision:row.revision}});
}catch(e){next(e)}});
router.post('/workspaces/:workspaceId/proposals/:proposalId/submit',access,allowed('create'),async(req,res,next)=>{try{
 if(!oid(req.params.proposalId))return fail(res,400,'Invalid proposal');
 const row=await Proposal.findOneAndUpdate({_id:req.params.proposalId,workspaceId:req.workspace._id,status:'draft'},{$set:{status:'submitted'},$inc:{revision:1}},{new:true});
 if(!row)return fail(res,409,'Draft was changed or is unavailable');
 await audit(req.workspace._id,req.actor._id,'proposal.submitted','proposal',row._id);
 res.json({id:row._id,status:row.status});
}catch(e){next(e)}});
router.post('/workspaces/:workspaceId/proposals/:proposalId/review',access,allowed('approve'),async(req,res,next)=>{try{
 if(!oid(req.params.proposalId))return fail(res,400,'Invalid proposal');
 const decision=req.body?.decision;
 if(!['approved','rejected'].includes(decision))return fail(res,400,'Invalid decision');
 const row=await Proposal.findOneAndUpdate({_id:req.params.proposalId,workspaceId:req.workspace._id,status:'submitted',createdBy:{$ne:req.actor._id}},{$set:{status:decision,reviewedBy:req.actor._id,reviewedAt:new Date()},$inc:{revision:1}},{new:true});
 if(!row)return fail(res,409,'Not submitted, already decided, or self-approval is not allowed');
 await audit(req.workspace._id,req.actor._id,`proposal.${decision}`,'proposal',row._id);
 res.json({id:row._id,status:row.status,shopifyMutationPerformed:false});
}catch(e){next(e)}});
router.get('/workspaces/:workspaceId/audit',access,allowed('manage'),async(req,res,next)=>{try{
 const records=await Audit.find({workspaceId:req.workspace._id}).sort({createdAt:-1}).limit(100).lean();res.json({events:records});
}catch(e){next(e)}});
router.use((err,req,res,next)=>{console.error('[ELEV8 workspaces]',err.message);res.status(500).json({error:'Workspace request failed'});});
module.exports={router,roleCan};
