'use strict';

const ReviewCompletionState = require('./reviewCompletion.model');
const { Review, ReviewRequestJob } = require('../../models');
const { cleanEmail, cleanText } = require('../../utils/validation');

const SIDE_CAR_MARKER = 'ELEV8_REVIEW_COMPLETION_SIDECAR_V1';

function canonicalProductId(value) {
  const raw = cleanText(value || '', 200);
  if (!raw) return '';
  const parts = raw.split('/').filter(Boolean);
  const tail = parts.length ? parts[parts.length - 1] : raw;
  const numeric = String(tail).match(/\d{5,}/);
  return numeric ? numeric[0] : raw;
}

function orderIdCandidates(value) {
  const raw = cleanText(value || '', 180);
  if (!raw) return [];
  const set = new Set([raw]);
  const parts = raw.split('/').filter(Boolean);
  const tail = parts.length ? parts[parts.length - 1] : '';
  if (tail) {
    set.add(tail);
    if (/^\d+$/.test(tail)) set.add(`gid://shopify/Order/${tail}`);
  }
  return Array.from(set).filter(Boolean);
}

function requestedProductsFromJob(job = {}) {
  const byId = new Map();
  (Array.isArray(job.products) ? job.products : []).forEach((product) => {
    const productId = canonicalProductId(product.productId || product.id);
    if (!productId) return;
    const current = byId.get(productId) || {
      productId,
      title: cleanText(product.title || 'Purchased product', 220),
      quantity: 0,
    };
    current.quantity += Math.max(1, Number(product.quantity || 1));
    if (!current.title && product.title) current.title = cleanText(product.title, 220);
    byId.set(productId, current);
  });
  return Array.from(byId.values());
}

function completionStatusFor(requestedCount, reviewedCount) {
  if (!requestedCount || !reviewedCount) return 'none';
  if (reviewedCount >= requestedCount) return 'complete';
  return 'partial';
}

async function findSourceJob(review = {}) {
  const shopDomain = cleanText(review.shopDomain || '', 180);
  const candidates = orderIdCandidates(review.orderId);
  if (!shopDomain || !candidates.length) return null;

  const job = await ReviewRequestJob.findOne({
    shopDomain,
    orderId: { $in: candidates },
    testMode: { $ne: true },
  }).lean();

  if (!job) return null;

  const reviewEmail = cleanEmail(review.email || '');
  const jobEmail = cleanEmail(job.customerEmail || '');
  if (reviewEmail && jobEmail && reviewEmail !== jobEmail) return null;

  return job;
}

async function reconcileCompletionForJob(job = {}, reviewHint = null) {
  if (!job?._id || job.testMode) return { skipped: 'no_live_source_job' };

  const requestedProducts = requestedProductsFromJob(job);
  const requestedProductIds = requestedProducts.map((item) => item.productId);
  if (!requestedProductIds.length) return { skipped: 'no_requested_products' };

  const orderIds = orderIdCandidates(job.orderId);
  const email = cleanEmail(job.customerEmail || '');
  const match = {
    shopDomain: job.shopDomain,
    orderId: { $in: orderIds },
    isDeleted: { $ne: true },
    isTestReview: { $ne: true },
    testMode: { $ne: true },
  };
  if (email) match.email = email;

  const reviews = await Review.find(match)
    .select('_id itemId createdAt status')
    .sort({ createdAt: 1 })
    .lean();

  const requestedSet = new Set(requestedProductIds);
  const relevant = reviews.filter((review) => requestedSet.has(canonicalProductId(review.itemId)));
  const reviewedProductIds = Array.from(new Set(relevant.map((review) => canonicalProductId(review.itemId)).filter(Boolean)));
  const reviewedCount = reviewedProductIds.length;
  const requestedCount = requestedProductIds.length;
  const completionStatus = completionStatusFor(requestedCount, reviewedCount);

  const firstReviewedAt = relevant.length ? relevant[0].createdAt || null : null;
  const lastReviewedAt = relevant.length ? relevant[relevant.length - 1].createdAt || null : null;
  const completedAt = completionStatus === 'complete' ? lastReviewedAt : null;

  const state = await ReviewCompletionState.findOneAndUpdate(
    { sourceJobId: String(job._id) },
    {
      $set: {
        shopDomain: job.shopDomain,
        sourceJobId: String(job._id),
        orderId: cleanText(job.orderId || '', 180),
        orderName: cleanText(job.orderName || '', 120),
        requestedProducts,
        requestedProductIds,
        reviewedProductIds,
        requestedCount,
        reviewedCount,
        completionStatus,
        firstReviewedAt,
        lastReviewedAt,
        completedAt,
        lastReviewId: reviewHint?._id ? String(reviewHint._id) : '',
        lastReconciledAt: new Date(),
      },
      $setOnInsert: {
        postReviewActionStatus: 'not_configured',
        postReviewActionAt: null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return { ok: true, state };
}

async function trackReviewCompletionFromReview(review = {}) {
  if (!review || review.isTestReview || review.testMode) return { skipped: 'test_review' };
  if (!review.orderId) return { skipped: 'review_has_no_order' };

  const job = await findSourceJob(review);
  if (!job) return { skipped: 'no_matching_review_request_job' };

  return reconcileCompletionForJob(job, review);
}

function queueReviewCompletionTracking(reviews) {
  const list = (Array.isArray(reviews) ? reviews : [reviews]).filter(Boolean);
  if (!list.length) return;

  // Deliberately detached from the customer HTTP response. A completion-tracking
  // failure must never turn a successfully saved review into a failed submission.
  setImmediate(() => {
    Promise.allSettled(list.map((review) => trackReviewCompletionFromReview(review)))
      .then((results) => {
        results.forEach((result) => {
          if (result.status === 'rejected') {
            console.warn('Review completion sidecar skipped:', result.reason?.message || result.reason);
          }
        });
      })
      .catch((error) => console.warn('Review completion sidecar batch skipped:', error.message));
  });
}

async function getCompletionStateMap(shopDomain, jobs = []) {
  const sourceJobIds = (Array.isArray(jobs) ? jobs : [])
    .map((job) => String(job?._id || ''))
    .filter(Boolean);

  if (!shopDomain || !sourceJobIds.length) return new Map();

  const rows = await ReviewCompletionState.find({
    shopDomain,
    sourceJobId: { $in: sourceJobIds },
  }).lean();

  return new Map(rows.map((row) => [String(row.sourceJobId), row]));
}

module.exports = {
  SIDE_CAR_MARKER,
  canonicalProductId,
  orderIdCandidates,
  requestedProductsFromJob,
  completionStatusFor,
  reconcileCompletionForJob,
  trackReviewCompletionFromReview,
  queueReviewCompletionTracking,
  getCompletionStateMap,
};
