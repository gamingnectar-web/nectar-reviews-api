const express = require('express');
const crypto = require('crypto');
const { env } = require('../config/env');
const { Review } = require('../models');
const { cleanText, cleanEmail, clampNumber } = require('../utils/validation');
const { shopifyFetchOptional } = require('../utils/shopify');

const router = express.Router();
const shop = req => req.shopDomain || req.query.shopDomain || req.body?.shopDomain || '';
const numericId = value => (String(value || '').match(/\d{5,}/g) || []).pop() || '';
const newBatchId = () => `manual-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const allowedImportReasons = new Set(['historical_migration','platform_export','customer_record','manual_recovery','other']);
const isEditableImport = review => ['manual','import'].includes(String(review?.source||''));

function cleanAttributes(raw={}) {
  const out={};
  for (const [key,value] of Object.entries(raw||{})) {
    const name=cleanText(key,80).toLowerCase();
    const n=Number(value);
    if(name && Number.isFinite(n)) out[name]=Math.max(1,Math.min(10,n));
  }
  return out;
}

function hash(shopDomain,row={}) {
  const fp=[shopDomain,row.itemId,row.email,row.userId,row.rating,row.headline,row.comment,
    row.createdAt ? new Date(row.createdAt).toISOString().slice(0,10) : '']
    .join('|').toLowerCase().replace(/\s+/g,' ').trim();
  return crypto.createHash('sha256').update(fp).digest('hex');
}

router.get('/products', async (req,res,next) => {
  try {
    const q=cleanText(req.query.q||'',120);
    if(!q) return res.json({products:[]});
    const payload=await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/graphql.json`,{
      shopDomain:shop(req),method:'POST',
      body:JSON.stringify({
        query:`query($q:String!){products(first:20,query:$q,sortKey:TITLE){nodes{id title handle featuredImage{url altText} variants(first:5){nodes{id title sku}}}}}`,
        variables:{q}
      })
    });
    const products=(payload?.data?.products?.nodes||[]).map(p=>({
      id:numericId(p.id),gid:p.id,title:p.title||'',handle:p.handle||'',image:p.featuredImage?.url||'',
      variants:(p.variants?.nodes||[]).map(v=>({id:numericId(v.id),gid:v.id,title:v.title||'',sku:v.sku||''}))
    }));
    res.json({products});
  } catch(e){next(e)}
});

router.post('/generate-title', async (req,res,next) => {
  try {
    const comment=cleanText(req.body?.comment||'',6000);
    const productTitle=cleanText(req.body?.productTitle||'',300);
    const rating=Number(req.body?.rating||0);
    if(comment.length<8)return res.status(400).json({error:'Add more review text before generating a title.'});
    const fallback=()=>{const first=comment.split(/[.!?]/).map(x=>x.trim()).find(Boolean)||comment;return first.length<=80?first:first.slice(0,77).trim()+'…'};
    if(!process.env.OPENAI_API_KEY)return res.json({title:fallback(),source:'fallback'});
    const model=process.env.OPENAI_ASSISTANT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:.2,messages:[{role:'system',content:'Write a concise ecommerce review headline from the customer review text. Maximum 80 characters. Preserve sentiment and tone. Do not add facts, product claims, scores, flavour notes or benefits not explicitly present. Return the headline only.'},{role:'user',content:'Product: '+(productTitle||'Unknown')+'\nStar rating: '+(rating||'Unknown')+'\nReview:\n'+comment}]})});
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error?.message||('OpenAI title generation failed ('+response.status+')'));
    const title=cleanText(payload?.choices?.[0]?.message?.content||'',120).replace(/^[\"“]|[\"”]$/g,'').trim();
    res.json({title:(title||fallback()).slice(0,80),source:title?'openai':'fallback'});
  } catch(e){next(e)}
});

router.post('/batches', async (req,res,next) => {
  try {
    const shopDomain=shop(req);
    const rows=Array.isArray(req.body?.reviews)?req.body.reviews:[];
    if(!rows.length) return res.status(400).json({error:'Add at least one review.'});
    if(rows.length>100) return res.status(400).json({error:'Manual batches are limited to 100 reviews.'});

    const requestedBatchId=String(req.body?.batchId||'').trim();
    const id=/^manual-\d{10,}-[a-f0-9]{6,}$/i.test(requestedBatchId)?requestedBatchId:newBatchId(), docs=[], errors=[];
    rows.forEach((raw,index)=>{
      try {
        const scope=raw.reviewScope==='site'?'site':'product';
        if(!allowedImportReasons.has(String(raw.importReason||''))) throw new Error('Choose why this review is being added manually.');
        if(raw.importReason==='other'&&!cleanText(raw.importReasonDetail||'',500)) throw new Error('Add a note explaining the Other import reason.');
        const productId=numericId(raw.itemId||raw.productId||'');
        if(scope==='product'&&!productId) throw new Error('Choose a product.');
        const comment=cleanText(raw.comment||'',6000);
        if(!comment) throw new Error('Review text is required.');
        const createdAt=raw.createdAt?new Date(raw.createdAt):new Date();
        if(Number.isNaN(createdAt.getTime())) throw new Error('Review date is invalid.');

        const doc={
          shopDomain,itemId:scope==='site'?'site':productId,
          userId:cleanText(raw.userId||raw.reviewerName||'Guest',120)||'Guest',
          email:cleanEmail(raw.email||''),isAnonymous:Boolean(raw.isAnonymous),
          rating:clampNumber(raw.rating,1,5,5),
          headline:cleanText(raw.headline||'',300),comment,
          attributes:cleanAttributes(raw.attributes),reviewScope:scope,
          productTitle:cleanText(raw.productTitle||'',300),
          productHandle:cleanText(raw.productHandle||'',200),
          productUrl:cleanText(raw.productUrl||'',1000),
          productImage:cleanText(raw.productImage||'',1000),
          externalProductId:productId,
          source:'manual',sourcePlatform:'manual',sourceLabel:'Manual Add',
          importBatchId:id,status:'pending',
          importReason:String(raw.importReason||''),importReasonDetail:cleanText(raw.importReasonDetail||'',500),
          verifiedPurchase:Boolean(raw.verifiedPurchase),
          verificationNote:raw.verifiedPurchase?'Manually marked as verified purchase by admin.':'',
          orderId:cleanText(raw.orderId||'',120),createdAt
        };
        doc.duplicateHash=hash(shopDomain,doc);
        docs.push(doc);
      } catch(e){errors.push({index,error:e.message})}
    });

    if(errors.length) return res.status(400).json({error:'Some review rows need attention.',errors});
    const existing=await Review.find({shopDomain,duplicateHash:{$in:docs.map(x=>x.duplicateHash)},isDeleted:{$ne:true}})
      .select('duplicateHash userId productTitle createdAt').lean();
    if(existing.length) return res.status(409).json({error:`${existing.length} review(s) look like duplicates. Nothing was saved.`,duplicates:existing});

    const created=await Review.insertMany(docs,{ordered:true});
    res.status(201).json({ok:true,batchId:id,saved:created.length,status:'pending',message:`${created.length} review(s) saved as draft.`});
  } catch(e){next(e)}
});

router.get('/batches', async (req,res,next) => {
  try {
    const rows=await Review.aggregate([
      {$match:{shopDomain:shop(req),source:'manual',importBatchId:{$ne:''},isDeleted:{$ne:true}}},
      {$sort:{createdAt:-1}},
      {$group:{_id:'$importBatchId',count:{$sum:1},pending:{$sum:{$cond:[{$eq:['$status','pending']},1,0]}},accepted:{$sum:{$cond:[{$eq:['$status','accepted']},1,0]}},lastCreatedAt:{$max:'$createdAt'},reviewers:{$addToSet:'$userId'},products:{$addToSet:'$productTitle'}}},
      {$sort:{lastCreatedAt:-1}},{$limit:30}
    ]);
    res.json({batches:rows});
  } catch(e){next(e)}
});

router.get('/batches/:batchId', async (req,res,next) => {
  try {
    const reviews=await Review.find({shopDomain:shop(req),source:'manual',importBatchId:req.params.batchId,isDeleted:{$ne:true}})
      .sort({createdAt:1}).lean();
    res.json({reviews});
  } catch(e){next(e)}
});

router.post('/batches/:batchId/approve', async (req,res,next) => {
  try {
    const result=await Review.updateMany({shopDomain:shop(req),source:'manual',importBatchId:req.params.batchId,status:'pending',isDeleted:{$ne:true}},{$set:{status:'accepted',updatedAt:new Date()}});
    res.json({ok:true,approved:result.modifiedCount||0,batchId:req.params.batchId});
  } catch(e){next(e)}
});

router.post('/batches/:batchId/delete', async (req,res,next) => {
  try {
    const result=await Review.updateMany({shopDomain:shop(req),source:'manual',importBatchId:req.params.batchId,status:'pending',isDeleted:{$ne:true}},{$set:{isDeleted:true,deletedAt:new Date()}});
    res.json({ok:true,deleted:result.modifiedCount||0});
  } catch(e){next(e)}
});

router.get('/reviews/:reviewId', async (req,res,next) => {
  try {
    const review=await Review.findOne({_id:req.params.reviewId,shopDomain:shop(req),isDeleted:{$ne:true}}).lean();
    if(!review)return res.status(404).json({error:'Review not found.'});
    if(!isEditableImport(review))return res.status(403).json({error:'Only manual and imported historical reviews can be edited here.'});
    res.json({review});
  } catch(e){next(e)}
});

router.patch('/reviews/:reviewId', async (req,res,next) => {
  try {
    const review=await Review.findOne({_id:req.params.reviewId,shopDomain:shop(req),isDeleted:{$ne:true}});
    if(!review)return res.status(404).json({error:'Review not found.'});
    if(!isEditableImport(review))return res.status(403).json({error:'Only manual and imported historical reviews can be edited here.'});
    const body=req.body||{};
    const reason=String(body.importReason||'');
    if(!allowedImportReasons.has(reason))return res.status(400).json({error:'Choose why this review was imported.'});
    const reasonDetail=cleanText(body.importReasonDetail||'',500);
    if(reason==='other'&&!reasonDetail)return res.status(400).json({error:'Add a note explaining the Other import reason.'});
    const comment=cleanText(body.comment??review.comment,6000);if(!comment)return res.status(400).json({error:'Review text is required.'});
    const createdAt=body.createdAt?new Date(body.createdAt):review.createdAt;if(Number.isNaN(createdAt.getTime()))return res.status(400).json({error:'Review date is invalid.'});
    review.userId=cleanText(body.userId??review.userId,120)||'Guest';
    review.email=cleanEmail(body.email??review.email);
    review.rating=clampNumber(body.rating??review.rating,1,5,review.rating||5);
    review.headline=cleanText(body.headline??review.headline,300);
    review.comment=comment;review.createdAt=createdAt;
    review.verifiedPurchase=Boolean(body.verifiedPurchase);
    review.attributes=cleanAttributes(body.attributes||{});
    review.importReason=reason;review.importReasonDetail=reasonDetail;
    review.importedReviewEditedAt=new Date();review.importedReviewEditedBy='admin';
    review.duplicateHash=hash(review.shopDomain,review);
    await review.save();
    res.json({ok:true,review:review.toObject()});
  } catch(e){next(e)}
});

module.exports=router;
