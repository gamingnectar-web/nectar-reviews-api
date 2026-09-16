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
  return '';
}

router.get('/health', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const count = shopDomain ? await ProductBrandProfile.countDocuments({shopDomain}) : await ProductBrandProfile.countDocuments({});
    res.json({ok:true,shopDomain,count});
  } catch (e) { next(e); }
});

router.get('/brands', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const brands = shopDomain
      ? await listBrands({shopDomain})
      : await ProductBrandProfile.find({}).sort({name:1}).lean();
    res.json({brands,shopDomain});
  } catch (e) { next(e); }
});

async function startScrape(req,res,next) {
  try {
    const shopDomain = await resolveShop(req);
    const body = req.body || {};
    const job = await createBrandScrapeJob({
      shopDomain,
      sourceUrl:body.sourceUrl || body.url || '',
      brandName:body.brandName || '',
    });
    res.status(202).json({job});
  } catch (e) { next(e); }
}

async function readScrape(req,res,next) {
  try {
    const shopDomain = await resolveShop(req);
    const job = await getBrandScrapeJob({shopDomain,jobId:req.params.jobId});
    res.json({job});
  } catch (e) { next(e); }
}

router.post('/scrape-job', startScrape);
router.post('/brands/scrape-job', startScrape);
router.get('/scrape-job/:jobId', readScrape);
router.get('/brands/scrape-job/:jobId', readScrape);

router.post('/generate-from-storefront', async (req,res,next) => {
  try {
    const shopDomain = await resolveShop(req);
    const result = await generateBrandsFromStorefront({
      shopDomain,
      rootUrl:req.body?.rootUrl || 'https://www.gamingnectar.com',
      onlyMissing:req.body?.onlyMissing !== false,
    });
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
