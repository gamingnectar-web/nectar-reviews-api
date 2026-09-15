const express=require('express');
const {
  runCatalogueAudit,listAudits,getAudit,listBrands,saveBrand,createBrandFromAudit,
  generateBrandsFromShopify
}=require('./catalogueAudit.service');

const router=express.Router();
function shop(req){return req.shopDomain||req.query.shopDomain||req.body?.shopDomain||req.headers['x-shop-domain']||req.headers['x-shopify-shop-domain']||''}
function wrap(fn){return(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next)}

router.post('/audit',wrap(async(req,res)=>{
  const body=req.body||{};
  const result=await runCatalogueAudit({shopDomain:shop(req),sourceUrl:body.sourceUrl||body.url||'',brandName:body.brandName||''});
  res.json(result);
}));
router.get('/audits',wrap(async(req,res)=>res.json({audits:await listAudits({shopDomain:shop(req),limit:req.query.limit||30})})));
router.get('/audits/:auditId',wrap(async(req,res)=>res.json({audit:await getAudit({shopDomain:shop(req),auditId:req.params.auditId})})));
router.get('/brands',wrap(async(req,res)=>res.json({brands:await listBrands({shopDomain:shop(req)})})));
router.post('/brands',wrap(async(req,res)=>res.json({brand:await saveBrand({shopDomain:shop(req),profile:req.body?.brand||req.body||{}})})));
router.post('/audits/:auditId/create-brand',wrap(async(req,res)=>res.json({brand:await createBrandFromAudit({shopDomain:shop(req),auditId:req.params.auditId,approve:Boolean(req.body?.approve)})})));
router.post('/brands/generate-from-shopify',wrap(async(req,res)=>{
  const brands=await generateBrandsFromShopify({shopDomain:shop(req),onlyMissing:req.body?.onlyMissing!==false});
  res.json({brands,created:brands.length});
}));

module.exports=router;
