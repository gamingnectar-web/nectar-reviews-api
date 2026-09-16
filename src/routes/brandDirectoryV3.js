const express = require('express');
const { ProductBrandProfile } = require('../modules/product-creation-import/catalogue-audit/catalogueAudit.model');
const { listBrands } = require('../modules/product-creation-import/catalogue-audit/catalogueAudit.service');
const { createBrandScrapeJob, getBrandScrapeJob } = require('../modules/product-creation-import/catalogue-audit/brandScrapeJob.service');
const { generateBrandsFromStorefront } = require('../modules/product-creation-import/catalogue-audit/storefrontBrandBackfill.service');

const router = express.Router();

async function resolveShop(req) {
  const explicit = req.shopDomain || req.query.shopDomain || req.body?.shopDomain ||
    req.headers['x-shop-domain'] || req.headers['x-shopify-shop-domain'] || '';
  if (explicit) return String(explicit).trim();

  const shops = await ProductBrandProfile.distinct('shopDomain');
  if (shops.length === 1) return shops[0];

  // Gaming Nectar's current production shop. This is a fallback only when no shop
  // context is supplied and the DB contains multiple shop domains.
  if (shops.includes('gaming-nectar.myshopify.com')) return 'gaming-nectar.myshopify.com';
  return '';
}

router.get('/health', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const count = shopDomain
      ? await ProductBrandProfile.countDocuments({shopDomain})
      : await ProductBrandProfile.countDocuments({});
    res.setHeader('Cache-Control','no-store');
    res.json({ok:true,route:'brand-directory-v3',shopDomain,count});
  } catch (error) { next(error); }
});

router.get('/brands', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const brands = shopDomain
      ? await listBrands({shopDomain})
      : await ProductBrandProfile.find({}).sort({name:1}).lean();
    res.setHeader('Cache-Control','no-store');
    res.json({brands,shopDomain,count:brands.length});
  } catch (error) { next(error); }
});

router.post('/scrape-job', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const body = req.body || {};
    const job = await createBrandScrapeJob({
      shopDomain,
      sourceUrl:body.sourceUrl || body.url || '',
      brandName:body.brandName || '',
    });
    res.status(202).json({job});
  } catch (error) { next(error); }
});

router.get('/scrape-job/:jobId', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const job = await getBrandScrapeJob({shopDomain,jobId:req.params.jobId});
    res.json({job});
  } catch (error) { next(error); }
});

router.post('/backfill-storefront', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const result = await generateBrandsFromStorefront({
      shopDomain,
      rootUrl:req.body?.rootUrl || 'https://www.gamingnectar.com',
      onlyMissing:req.body?.onlyMissing !== false,
    });
    res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
