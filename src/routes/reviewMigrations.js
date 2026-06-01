const express = require('express');
const { Settings } = require('../models');
const { requireAdminSession } = require('../utils/security');
const { cleanText, clampNumber } = require('../utils/validation');
const {
  ReviewMigrationBatch,
  ReviewMigrationStagedReview,
  ReviewStorefrontScan,
} = require('../models/reviewMigrationModels');
const {
  previewCsvMigration,
  importMigrationBatch,
  migrationOverview,
  runStorefrontScan,
} = require('../services/reviewMigrationService');

const router = express.Router();
router.use(requireAdminSession);

const sourcePlatforms = new Set(['yotpo', 'shop_app', 'shopify_native', 'judgeme', 'weebly', 'square', 'generic', 'manual']);

function shopDomainFromReq(req) {
  return req.shopDomain;
}

function normalizeSource(value) {
  const source = String(value || 'generic').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return sourcePlatforms.has(source) ? source : 'generic';
}

function migrationOptions(body = {}) {
  return {
    importOnlyPublished: body.importOnlyPublished !== false,
    importVerifiedWhenAvailable: body.importVerifiedWhenAvailable !== false,
    keepSourceDate: body.keepSourceDate !== false,
    createSiteReviews: body.createSiteReviews !== false,
    maxRows: clampNumber(body.maxRows, 1, 10000, 10000),
  };
}

router.get('/overview', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    return res.json(await migrationOverview(shopDomain));
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const doc = await Settings.findOneAndUpdate(
      { shopDomain },
      { $setOnInsert: { shopDomain } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json(doc?.migrationMode || {});
  } catch (error) {
    next(error);
  }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const migrationMode = {
      enabled: Boolean(req.body.enabled),
      sourcePlatform: normalizeSource(req.body.sourcePlatform || req.body.currentSource || 'yotpo'),
      yotpoStillLive: req.body.yotpoStillLive !== false,
      nectarWidgetsEnabled: Boolean(req.body.nectarWidgetsEnabled),
      nectarEmailsEnabled: Boolean(req.body.nectarEmailsEnabled),
      duplicateSchemaProtection: req.body.duplicateSchemaProtection !== false,
      importOnlyPublished: req.body.importOnlyPublished !== false,
      importVerifiedWhenAvailable: req.body.importVerifiedWhenAvailable !== false,
      lastCheckedAt: new Date(),
      notes: cleanText(req.body.notes, 2000),
    };
    const doc = await Settings.findOneAndUpdate(
      { shopDomain },
      { $set: { migrationMode }, $setOnInsert: { shopDomain } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ ok: true, migrationMode: doc.migrationMode });
  } catch (error) {
    next(error);
  }
});

router.post('/csv/preview', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const csvText = String(req.body.csvText || '');
    if (!csvText.trim()) return res.status(400).json({ error: 'CSV text is required.' });
    if (csvText.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'CSV is too large for browser upload. Split it into smaller batches.' });

    const result = await previewCsvMigration({
      shopDomain,
      sourcePlatform: normalizeSource(req.body.sourcePlatform),
      csvText,
      fileName: cleanText(req.body.fileName, 240),
      options: migrationOptions(req.body),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/batches', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const batches = await ReviewMigrationBatch.find({ shopDomain }).sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ batches });
  } catch (error) {
    next(error);
  }
});

router.get('/batches/:batchId', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const batch = await ReviewMigrationBatch.findOne({ _id: req.params.batchId, shopDomain }).lean();
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });
    const rows = await ReviewMigrationStagedReview.find({ batchId: batch._id, shopDomain })
      .sort({ rowIndex: 1 })
      .limit(clampNumber(req.query.limit, 1, 500, 100))
      .lean();
    return res.json({ batch, rows });
  } catch (error) {
    next(error);
  }
});

router.patch('/staged/:rowId', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const row = await ReviewMigrationStagedReview.findOne({ _id: req.params.rowId, shopDomain });
    if (!row) return res.status(404).json({ error: 'Staged row not found.' });
    if (req.body.selectedProduct) {
      row.selectedProduct = {
        id: cleanText(req.body.selectedProduct.id || req.body.selectedProduct.productId, 180),
        gid: cleanText(req.body.selectedProduct.gid || '', 220),
        title: cleanText(req.body.selectedProduct.title, 240),
        handle: cleanText(req.body.selectedProduct.handle, 180),
      };
      row.status = 'matched';
      row.confidence = 100;
      row.issue = '';
    }
    if (req.body.status && ['matched', 'needs_mapping', 'site_review', 'skipped'].includes(req.body.status)) {
      row.status = req.body.status;
      if (req.body.status === 'site_review') {
        row.reviewScope = 'site';
        row.selectedProduct = null;
        row.issue = '';
        row.normalized = { ...(row.normalized || {}), reviewScope: 'site', itemId: '__site__' };
      }
      if (req.body.status === 'skipped') {
        row.issue = cleanText(req.body.issue || 'Skipped during staging review.', 240);
      }
    }
    await row.save();
    return res.json({ ok: true, row });
  } catch (error) {
    next(error);
  }
});

router.post('/batches/:batchId/import', async (req, res, next) => {
  try {
    const result = await importMigrationBatch({
      shopDomain: shopDomainFromReq(req),
      batchId: req.params.batchId,
      mappingOverrides: req.body.mappingOverrides || {},
      importStatus: cleanText(req.body.importStatus || 'accepted', 20),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/scan/storefront', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const scan = await runStorefrontScan(shopDomain, {
      limit: clampNumber(req.body.limit, 1, 20, 8),
      purpose: cleanText(req.body.purpose || 'detect_external_review_signals', 120),
    });
    return res.json({ ok: true, scan });
  } catch (error) {
    next(error);
  }
});

router.get('/scans', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const scans = await ReviewStorefrontScan.find({ shopDomain }).sort({ createdAt: -1 }).limit(20).lean();
    return res.json({ scans });
  } catch (error) {
    next(error);
  }
});

router.get('/scans/:scanId', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const scan = await ReviewStorefrontScan.findOne({ _id: req.params.scanId, shopDomain }).lean();
    if (!scan) return res.status(404).json({ error: 'Scan not found.' });
    return res.json({ scan });
  } catch (error) {
    next(error);
  }
});

router.get('/shop-review-sync/status', async (req, res) => {
  return res.json({
    ok: true,
    directShopReviewPullAvailable: false,
    sourceOfTruth: 'Nectar can import Shop/Shopify-native reviews from exports, standard review metaobjects when the app is approved/eligible, or public storefront schema signals. There is not a normal public Shopify Admin API endpoint that exposes every Shop app review to third-party apps.',
    recommendedFlow: [
      'Use Yotpo/Shop export or API import when available.',
      'Use storefront scan to detect review widgets/schema and mapping gaps.',
      'Syndicate Nectar reviews to Shopify standard product review metaobjects when approved so Shop can consume Nectar reviews instead of the other way around.',
    ],
  });
});

module.exports = router;
