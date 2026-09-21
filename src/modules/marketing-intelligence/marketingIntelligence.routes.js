const express=require('express');
const {getInsights,generateBackground}=require('./marketingIntelligence.service');
const router=express.Router();
const shop=req=>req.shopDomain||req.query.shopDomain||req.body?.shopDomain||'';

router.get('/insights',async(req,res,next)=>{
  try{const result=await getInsights(shop(req));res.setHeader('Cache-Control','no-store');res.json(result)}catch(e){next(e)}
});

router.post('/creative/background',async(req,res,next)=>{
  try{
    const size=['1024x1024','1536x1024','1024x1536'].includes(String(req.body?.size||''))?String(req.body.size):'1024x1024';
    res.json(await generateBackground({product:req.body?.product||{},style:String(req.body?.style||'luxury-studio'),brief:String(req.body?.brief||''),size}));
  }catch(e){next(e)}
});

router.get('/image-proxy',async(req,res,next)=>{
  try{
    const url=new URL(String(req.query.url||'')),host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||!(host==='cdn.shopify.com'||host.endsWith('.shopifycdn.com')))return res.status(400).json({error:'Only Shopify CDN product images can be proxied.'});
    const response=await fetch(url.toString(),{redirect:'follow'});
    if(!response.ok)return res.status(502).json({error:`Product image fetch failed (${response.status})`});
    const type=response.headers.get('content-type')||'';
    if(!type.startsWith('image/'))return res.status(400).json({error:'The supplied URL did not return an image.'});
    const buffer=Buffer.from(await response.arrayBuffer());
    if(buffer.length>8*1024*1024)return res.status(413).json({error:'Product image is too large.'});
    res.setHeader('Content-Type',type);res.setHeader('Cache-Control','private, max-age=300');res.send(buffer);
  }catch(e){next(e)}
});
module.exports=router;
