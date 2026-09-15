const BrandScrapeJob = require('./brandScrapeJob.model');
const { scrapeBrandUrl } = require('./brandScrape.service');
const { saveBrand } = require('./catalogueAudit.service');

async function updateJob(jobId, patch = {}, log = null) {
  const update = { $set: patch };
  if (log) {
    update.$push = { logs: {
      at: new Date(),
      stage: patch.stage || '',
      message: log.message || '',
      detail: log.detail || '',
      status: log.status || 'info',
    }};
  }
  await BrandScrapeJob.updateOne({ _id: jobId }, update);
}

async function createBrandScrapeJob({ shopDomain, sourceUrl, brandName = '' }) {
  const job = await BrandScrapeJob.create({
    shopDomain, sourceUrl, brandName,
    status: 'queued', stage: 'queued', progress: 2,
    headline: 'Preparing brand scan',
    detail: 'Creating background scrape job.',
    logs: [{ message: 'Brand scan queued', detail: sourceUrl, status: 'info' }],
  });
  setImmediate(() => runBrandScrapeJob(String(job._id)).catch(() => {}));
  return job.toObject();
}

async function runBrandScrapeJob(jobId) {
  const job = await BrandScrapeJob.findById(jobId);
  if (!job || ['running','complete'].includes(job.status)) return;

  await updateJob(jobId, {
    status: 'running',
    stage: 'discovering',
    progress: 8,
    headline: 'Discovering supplier catalogue',
    detail: 'Checking the supplier site for product URLs.',
    startedAt: new Date(),
  }, { message: 'Started catalogue discovery', detail: job.sourceUrl });

  try {
    const scraped = await scrapeBrandUrl({
      sourceUrl: job.sourceUrl,
      brandName: job.brandName,
      onProgress: async (event = {}) => {
        const patch = {
          stage: event.stage || 'working',
          progress: Math.max(5, Math.min(Number(event.progress || 10), 94)),
          headline: event.headline || 'Working…',
          detail: event.detail || '',
        };
        if (event.discoveredCount !== undefined) patch.discoveredCount = Number(event.discoveredCount || 0);
        if (event.processedCount !== undefined) patch.processedCount = Number(event.processedCount || 0);
        if (event.productLineCount !== undefined) patch.productLineCount = Number(event.productLineCount || 0);
        await updateJob(jobId, patch, event.log ? {
          message: event.log,
          detail: event.logDetail || '',
          status: event.logStatus || 'info',
        } : null);
      },
    });

    await updateJob(jobId, {
      stage: 'saving',
      progress: 95,
      headline: 'Saving brand profile',
      detail: 'Writing reusable brand information to MongoDB.',
      discoveredCount: Number(scraped.discoveredCount || 0),
      productLineCount: Number((scraped.suggestion?.coreProductLines || scraped.deterministicProductLines || []).length),
    }, {
      message: 'Brand intelligence generated',
      detail: `${scraped.discoveredCount || 0} products analysed`,
      status: 'success',
    });

    const s = scraped.suggestion || {};
    const profile = await saveBrand({
      shopDomain: job.shopDomain,
      profile: {
        ...s,
        name: s.name || scraped.brandName,
        canonicalVendor: s.canonicalVendor || scraped.brandName,
        website: s.website || scraped.website,
        productFamilies: s.productFamilies || [],
        coreProductLines: s.coreProductLines || scraped.deterministicProductLines || [],
        aliases: Array.from(new Set([...(s.aliases || []), scraped.brandName, s.name, s.canonicalVendor].filter(Boolean))),
        sourceUrls: Array.from(new Set([job.sourceUrl, ...(s.sourceUrls || [])])),
        source: 'supplier',
        confidence: Number(s.confidence || 0),
        status: 'draft',
        lastAuditedAt: new Date(),
        evidence: {
          ...(s.evidence || {}),
          discoveredCount: scraped.discoveredCount,
          discoveryMethod: scraped.discoveryMethod,
        },
      },
    });

    await updateJob(jobId, {
      status: 'complete',
      stage: 'complete',
      progress: 100,
      headline: `${profile.name} profile created`,
      detail: 'Draft brand profile saved successfully.',
      profileId: profile._id,
      completedAt: new Date(),
      result: {
        brandName: profile.name,
        discoveredCount: scraped.discoveredCount,
        productLineCount: (profile.coreProductLines || profile.productFamilies || []).length,
        confidence: profile.confidence,
      },
    }, {
      message: 'Saved to Brand Directory',
      detail: `${profile.name} is ready to review`,
      status: 'success',
    });
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      stage: 'failed',
      headline: 'Brand scan failed',
      detail: error.message,
      error: error.message,
      completedAt: new Date(),
    }, {
      message: 'Brand scan failed',
      detail: error.message,
      status: 'error',
    });
  }
}

async function getBrandScrapeJob({ shopDomain, jobId }) {
  const job = await BrandScrapeJob.findOne({ _id: jobId, shopDomain }).lean();
  if (!job) {
    const error = new Error('Brand scrape job not found.');
    error.status = 404;
    throw error;
  }
  return job;
}

module.exports = { createBrandScrapeJob, getBrandScrapeJob };
