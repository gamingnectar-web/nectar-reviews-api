const express=require('express');
const { ProductBrandProfile }=require('./catalogueAudit.model');
const router=express.Router();
const shop=req=>req.shopDomain||req.query.shopDomain||req.body?.shopDomain||'';
router.get('/:brandId',async(req,res,next)=>{try{const brand=await ProductBrandProfile.findOne({_id:req.params.brandId,shopDomain:shop(req)}).lean();if(!brand)return res.status(404).json({error:'Brand not found'});res.json({brand})}catch(e){next(e)}});
router.put('/:brandId',async(req,res,next)=>{try{
  const b=req.body||{},set={};
  ['aboutBrand','shortDescription','seoTitle','seoDescription','website','canonicalVendor','howToUse','storage','warnings'].forEach(k=>{if(b[k]!==undefined)set[k]=b[k]});
  ['aliases','productFamilies','coreProductLines','claims','alwaysApply','conditionalRules'].forEach(k=>{if(Array.isArray(b[k]))set[k]=b[k]});
  if(b.status)set.status=b.status==='approved'?'approved':'draft';
  const brand=await ProductBrandProfile.findOneAndUpdate({_id:req.params.brandId,shopDomain:shop(req)},{$set:set},{new:true}).lean();
  if(!brand)return res.status(404).json({error:'Brand not found'});res.json({brand});
}catch(e){next(e)}});
module.exports=router;
