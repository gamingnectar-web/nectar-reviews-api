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

router.post('/batches', async (req,res,next) => {
  try {
    const shopDomain=shop(req);
    const rows=Array.isArray(req.body?.reviews)?req.body.reviews:[];
    if(!rows.length) return res.status(400).json({error:'Add at least one review.'});
    if(rows.length>100) return res.status(400).json({error:'Manual batches are limited to 100 reviews.'});

    const id=newBatchId(), docs=[], errors=[];
    rows.forEach((raw,index)=>{
      try {
        const scope=raw.reviewScope==='site'?'site':'product';
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

module.exports=router;
