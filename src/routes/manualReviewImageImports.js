const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { env } = require('../config/env');
const { cleanText } = require('../utils/validation');
const { shopifyFetchOptional } = require('../utils/shopify');

const router = express.Router();
const shop = req => req.shopDomain || req.query.shopDomain || req.body?.shopDomain || '';
const collection = () => mongoose.connection.db.collection('manual_review_image_imports');
const allowedReasons = new Set(['historical_migration','platform_export','customer_record','manual_recovery','other']);

function newBatchId(){ return `review-image-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`; }
function cleanDataUrl(value=''){
  const raw=String(value||'');
  const match=raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if(!match)throw new Error('Upload a PNG, JPG or WEBP image.');
  const bytes=Buffer.byteLength(match[2],'base64');
  if(bytes>5*1024*1024)throw new Error('Image is still too large after browser compression (5 MB max).');
  return raw;
}
function normaliseDraft(raw={}){
  const attrs={};
  for(const key of ['sourness','sweetness','flavour']){
    const n=Number(raw?.attributes?.[key]);
    if(Number.isFinite(n)&&n>=1&&n<=10)attrs[key]=n;
  }
  const rating=Number(raw.rating);
  return {
    reviewerName:cleanText(raw.reviewerName||'',120),
    email:cleanText(raw.email||'',240),
    orderId:cleanText(raw.orderId||'',120),
    reviewDate:cleanText(raw.reviewDate||'',40),
    rating:Number.isFinite(rating)?Math.max(1,Math.min(5,rating)):5,
    headline:cleanText(raw.headline||'',300),
    headlineGenerated:Boolean(raw.headlineGenerated),
    reviewText:cleanText(raw.reviewText||'',6000),
    productHint:cleanText(raw.productHint||'',300),
    attributes:attrs,
    verifiedPurchase:Boolean(raw.verifiedPurchase),
    confidence:Number(raw.confidence||0),
    notes:Array.isArray(raw.notes)?raw.notes.map(x=>cleanText(x,500)).filter(Boolean).slice(0,12):[],
  };
}
async function analyseWithOpenAI({dataUrl,filename}){
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY is not configured.');
  const model=process.env.OPENAI_ASSISTANT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
  const response=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model,temperature:0.05,response_format:{type:'json_object'},
      messages:[
        {role:'system',content:`Extract a historic ecommerce review from a screenshot. Return JSON only with reviewerName,email,orderId,reviewDate,rating,headline,headlineGenerated,reviewText,productHint,attributes:{sourness,sweetness,flavour},verifiedPurchase,confidence,notes.
Rules:
- Transcribe reviewText faithfully. Do not rewrite it.
- Copy a visible headline. If none exists, create a short headline and set headlineGenerated=true.
- productHint must contain only a visible product name.
- rating is 1-5 only when visible; otherwise use 5 and add a note saying rating needs review.
- Only return sourness/sweetness/flavour when an explicit numeric score is visible.
- verifiedPurchase=true only if explicitly shown.
- reviewDate should be YYYY-MM-DD when confidently visible; otherwise blank.
- Never infer an email, order number, product, score or identity that is not visible.
- If no usable review exists, leave reviewText blank and explain why in notes.`},
        {role:'user',content:[
          {type:'text',text:`Extract the review from this uploaded image. Filename: ${filename||'review-image'}`},
          {type:'image_url',image_url:{url:dataUrl,detail:'high'}}
        ]}
      ]
    })
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error?.message||`OpenAI image analysis failed (${response.status})`);
  let parsed={};
  try{parsed=JSON.parse(payload?.choices?.[0]?.message?.content||'{}')}catch(_){}
  return normaliseDraft(parsed);
}
function numericId(value=''){return (String(value||'').match(/\d{5,}/g)||[]).pop()||''}

async function searchShopifyProducts(shopDomain,q=''){
  const queryText=cleanText(q,160);
  if(!queryText)return [];
  const payload=await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/graphql.json`,{
    shopDomain,method:'POST',
    body:JSON.stringify({
      query:`query ReviewImageProductSearch($q:String!){
        products(first:20,query:$q,sortKey:TITLE){
          nodes{
            id title handle status vendor
            featuredImage{url altText}
          }
        }
      }`,
      variables:{q:queryText}
    })
  });
  return (payload?.data?.products?.nodes||[]).map(p=>({
    id:numericId(p.id),gid:p.id,title:p.title||'',handle:p.handle||'',
    image:p.featuredImage?.url||'',status:p.status||'',vendor:p.vendor||'',isVault:false
  }));
}
async function productSuggestions(shopDomain,hint=''){
  try{return await searchShopifyProducts(shopDomain,hint)}catch(_){return []}
}
function autoMatch(hint,suggestions=[]){
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const h=norm(hint);
  if(!h)return null;
  const exact=suggestions.find(p=>norm(p.title)===h);
  if(exact)return exact;
  const strong=suggestions.filter(p=>{const t=norm(p.title);return t.includes(h)||h.includes(t)});
  return strong.length===1?strong[0]:null;
}
function makeVaultProduct(title='Archived product'){
  return {
    id:'',
    gid:'',
    title:cleanText(title||'Archived product',300)||'Archived product',
    handle:'',
    image:'/images/elev8-vault-tub.png',
    status:'VAULT',
    vendor:'',
    isVault:true
  };
}

router.get('/products/search',async(req,res,next)=>{
  try{
    const products=await searchShopifyProducts(shop(req),req.query.q||'');
    res.json({products});
  }catch(error){next(error)}
});

router.post('/analyse', async (req,res,next)=>{
  try{
    const shopDomain=shop(req),body=req.body||{},reason=String(body.importReason||'');
    if(!allowedReasons.has(reason))return res.status(400).json({error:'Choose why these review images are being imported.'});
    const reasonDetail=cleanText(body.importReasonDetail||'',500);
    if(reason==='other'&&!reasonDetail)return res.status(400).json({error:'Add a note explaining the Other import reason.'});
    const dataUrl=cleanDataUrl(body.dataUrl);
    const batchId=/^review-image-\d{10,}-[a-f0-9]{8}$/i.test(String(body.batchId||''))?String(body.batchId):newBatchId();
    const draft=await analyseWithOpenAI({dataUrl,filename:cleanText(body.filename||'',240)});
    const suggestions=await productSuggestions(shopDomain,draft.productHint);
    const matchedProduct=autoMatch(draft.productHint,suggestions);
    const item={_id:new mongoose.Types.ObjectId(),filename:cleanText(body.filename||'',240),draft,suggestions,matchedProduct:matchedProduct||null,status:matchedProduct?'ready':'needs_mapping',analysedAt:new Date()};
    await collection().updateOne(
      {shopDomain,batchId},
      {$setOnInsert:{shopDomain,batchId,createdAt:new Date(),importReason:reason,importReasonDetail:reasonDetail,status:'open'},$set:{updatedAt:new Date()},$push:{items:item}},
      {upsert:true}
    );
    res.status(201).json({batchId,item});
  }catch(error){next(error)}
});

router.post('/batches/:batchId/items/:itemId/vault',async(req,res,next)=>{
  try{
    const shopDomain=shop(req),title=cleanText(req.body?.title||'Archived product',300);
    const batch=await collection().findOne({shopDomain,batchId:req.params.batchId});
    if(!batch)return res.status(404).json({error:'Image review batch not found.'});
    const idx=(batch.items||[]).findIndex(x=>String(x._id)===String(req.params.itemId));
    if(idx<0)return res.status(404).json({error:'Image review item not found.'});
    const item=batch.items[idx];
    item.matchedProduct=makeVaultProduct(title||item.draft?.productHint||'Archived product');
    item.status='vault_ready';
    item.updatedAt=new Date();
    batch.items[idx]=item;
    await collection().updateOne({_id:batch._id},{$set:{items:batch.items,updatedAt:new Date()}});
    res.json({item});
  }catch(error){next(error)}
});

router.get('/batches/:batchId',async(req,res,next)=>{
  try{
    const batch=await collection().findOne({shopDomain:shop(req),batchId:req.params.batchId});
    if(!batch)return res.status(404).json({error:'Image review batch not found.'});
    res.json({batch});
  }catch(error){next(error)}
});
router.patch('/batches/:batchId/items/:itemId',async(req,res,next)=>{
  try{
    const shopDomain=shop(req),body=req.body||{};
    const batch=await collection().findOne({shopDomain,batchId:req.params.batchId});
    if(!batch)return res.status(404).json({error:'Image review batch not found.'});
    const idx=(batch.items||[]).findIndex(x=>String(x._id)===String(req.params.itemId));
    if(idx<0)return res.status(404).json({error:'Image review item not found.'});
    const item=batch.items[idx];
    if(body.matchedProduct!==undefined)item.matchedProduct=body.matchedProduct||null;
    if(body.draft)item.draft={...item.draft,...normaliseDraft({...item.draft,...body.draft})};
    item.status=item.matchedProduct?(item.matchedProduct.isVault?'vault_ready':'ready'):'needs_mapping';
    item.updatedAt=new Date();batch.items[idx]=item;
    await collection().updateOne({_id:batch._id},{$set:{items:batch.items,updatedAt:new Date()}});
    res.json({item});
  }catch(error){next(error)}
});
router.post('/batches/:batchId/complete',async(req,res,next)=>{
  try{
    await collection().updateOne({shopDomain:shop(req),batchId:req.params.batchId},{$set:{status:'converted',convertedAt:new Date(),updatedAt:new Date()}});
    res.json({ok:true})
  }catch(error){next(error)}
});
module.exports=router;
