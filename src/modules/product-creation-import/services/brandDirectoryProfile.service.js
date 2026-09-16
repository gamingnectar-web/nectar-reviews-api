const { ProductBrandProfile } = require('../catalogue-audit/catalogueAudit.model');
const { cleanText } = require('../utils/safe');
const { applyBrandRules } = require('./brandRules.service');

function brandKey(value=''){return cleanText(value,160).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
async function findProfile(shopDomain,vendor=''){
  const key=brandKey(vendor),safe=String(vendor).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return ProductBrandProfile.findOne({shopDomain,$or:[{brandKey:key},{aliases:{$elemMatch:{$regex:`^${safe}$`,$options:'i'}}}]}).lean();
}
async function applyBrandDirectoryProfile({shopDomain,draft={}}){
  const vendor=cleanText(draft.vendor||'',120);if(!shopDomain||!vendor)return draft;
  const profile=await findProfile(shopDomain,vendor);if(!profile)return draft;
  let next={...draft,vendor:draft.vendor||profile.canonicalVendor||profile.name||'',productType:draft.productType||(profile.productTypes||[])[0]||'',enrichment:{...(draft.enrichment||{}),brandDirectory:{
    profileId:String(profile._id||''),name:profile.name||vendor,canonicalVendor:profile.canonicalVendor||vendor,aboutBrand:profile.aboutBrand||'',shortDescription:profile.shortDescription||'',seoTitle:profile.seoTitle||'',seoDescription:profile.seoDescription||'',productFamilies:profile.productFamilies||[],productTypes:profile.productTypes||[],coreProductLines:profile.coreProductLines||[],claims:profile.claims||[],howToUse:profile.howToUse||'',storage:profile.storage||'',warnings:profile.warnings||'',website:profile.website||'',source:profile.source||'',confidence:Number(profile.confidence||0)}}};
  return applyBrandRules(next,profile);
}
module.exports={applyBrandDirectoryProfile,brandKey,findProfile};
