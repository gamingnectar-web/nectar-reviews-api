const { isDatabaseConnected } = require('../../../config/database');
const { stableHash, signPayload, verifySignedPayload } = require('../../../core/utils/hash');
const Review = require('../models/review.model');
const ReviewToken = require('../models/review-token.model');

const memoryReviews = [];
const memoryTokens = new Map();

function publicReview(review) {
  return {
    id: String(review._id || review.id || ''),
    itemId: review.itemId,
    rating: review.rating,
    title: review.title,
    body: review.body,
    authorName: review.authorName || 'Customer',
    verifiedPurchase: Boolean(review.verifiedPurchase),
    source: review.source,
    createdAt: review.createdAt
  };
}

function buildReviewPayload(shopDomain, input, options = {}) {
  const rating = Number(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    const error = new Error('Rating must be between 1 and 5.');
    error.status = 400;
    throw error;
  }

  const itemId = String(input.itemId || input.productId || '').trim();
  if (!itemId) {
    const error = new Error('itemId or productId is required.');
    error.status = 400;
    throw error;
  }

  const body = String(input.body || input.review || input.message || '').trim();
  if (body.length < 2) {
    const error = new Error('Review body is required.');
    error.status = 400;
    throw error;
  }

  return {
    shopDomain,
    itemId,
    variantId: input.variantId ? String(input.variantId) : '',
    orderIdHash: input.orderIdHash || stableHash(input.orderId, 'review-order'),
    customerEmailHash: input.customerEmailHash || stableHash(input.customerEmail || input.email, 'review-email'),
    customerRefHash: input.customerRefHash || stableHash(input.customerId || input.customerRef || input.email, 'review-customer'),
    authorName: String(input.authorName || input.name || 'Customer').slice(0, 120),
    rating,
    title: String(input.title || '').slice(0, 180),
    body: body.slice(0, 5000),
    images: Array.isArray(input.images) ? input.images.slice(0, 6) : [],
    source: options.source || 'storefront',
    status: options.status || 'pending',
    verifiedPurchase: Boolean(options.verifiedPurchase),
    verificationSource: options.verificationSource || 'none',
    verificationNote: options.verificationNote || ''
  };
}

async function createReview(shopDomain, input, options = {}) {
  const payload = buildReviewPayload(shopDomain, input, options);

  if (!isDatabaseConnected()) {
    const duplicate = memoryReviews.find((review) =>
      review.shopDomain === payload.shopDomain &&
      review.itemId === payload.itemId &&
      review.customerEmailHash &&
      review.customerEmailHash === payload.customerEmailHash &&
      review.orderIdHash &&
      review.orderIdHash === payload.orderIdHash
    );
    if (duplicate) {
      const error = new Error('This product has already been reviewed for this order/customer.');
      error.status = 409;
      throw error;
    }
    const record = { ...payload, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date(), updatedAt: new Date() };
    memoryReviews.unshift(record);
    return record;
  }

  try {
    return await Review.create(payload);
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = new Error('This product has already been reviewed for this order/customer.');
      duplicate.status = 409;
      throw duplicate;
    }
    throw error;
  }
}

async function listReviews(shopDomain, filters = {}) {
  if (!isDatabaseConnected()) {
    return memoryReviews.filter((review) => {
      if (review.shopDomain !== shopDomain) return false;
      if (filters.itemId && review.itemId !== String(filters.itemId)) return false;
      if (filters.status && review.status !== filters.status) return false;
      return true;
    });
  }

  const query = { shopDomain };
  if (filters.itemId) query.itemId = String(filters.itemId);
  if (filters.status) query.status = filters.status;
  return Review.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(filters.limit || 100), 250)).lean();
}

async function reviewSummary(shopDomain) {
  const approved = await listReviews(shopDomain, { status: 'approved', limit: 1000 });
  const count = approved.length;
  const average = count ? approved.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count : 0;
  return { count, average: Number(average.toFixed(2)) };
}

async function updateReview(shopDomain, id, patch) {
  const allowed = ['status', 'verifiedPurchase', 'verificationSource', 'verificationNote', 'adminNotes'];
  const update = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key)));

  if (!isDatabaseConnected()) {
    const review = memoryReviews.find((item) => item.shopDomain === shopDomain && item.id === id);
    if (!review) return null;
    Object.assign(review, update, { updatedAt: new Date() });
    return review;
  }

  return Review.findOneAndUpdate({ _id: id, shopDomain }, { $set: update }, { new: true }).lean();
}

async function importReviews(shopDomain, reviews) {
  const inputReviews = Array.isArray(reviews) ? reviews : [];
  const results = [];

  for (const input of inputReviews.slice(0, 500)) {
    try {
      const created = await createReview(shopDomain, input, {
        source: 'merchant-import',
        status: input.status || 'approved',
        verifiedPurchase: Boolean(input.verifiedPurchase),
        verificationSource: input.verifiedPurchase ? 'merchant-import' : 'none',
        verificationNote: input.verifiedPurchase ? 'Merchant supplied verified flag during import.' : ''
      });
      results.push({ ok: true, id: String(created._id || created.id) });
    } catch (error) {
      results.push({ ok: false, error: error.message, itemId: input.itemId || input.productId });
    }
  }

  return results;
}

async function createSignedReviewToken(shopDomain, input) {
  const expiresAt = input.expiresAt || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const payload = {
    shopDomain,
    itemId: String(input.itemId || input.productId || ''),
    variantId: input.variantId || '',
    orderIdHash: stableHash(input.orderId, 'review-order'),
    customerEmailHash: stableHash(input.customerEmail || input.email, 'review-email'),
    customerRefHash: stableHash(input.customerId || input.customerRef || input.email, 'review-customer')
  };
  if (!payload.itemId) {
    const error = new Error('itemId is required to create a token.');
    error.status = 400;
    throw error;
  }

  const token = signPayload(payload, expiresAt);
  const tokenHash = stableHash(token, 'review-token');

  const tokenRecord = { ...payload, tokenHash, expiresAt: new Date(expiresAt), createdAt: new Date() };
  if (isDatabaseConnected()) {
    await ReviewToken.create(tokenRecord);
  } else {
    memoryTokens.set(tokenHash, tokenRecord);
  }

  return { token, expiresAt, reviewUrl: `/review?shop=${encodeURIComponent(shopDomain)}&token=${encodeURIComponent(token)}` };
}

async function consumeSignedReviewToken(shopDomain, token, reviewInput) {
  const payload = verifySignedPayload(token);
  if (!payload || payload.shopDomain !== shopDomain) {
    const error = new Error('Invalid or expired review token.');
    error.status = 401;
    throw error;
  }

  const tokenHash = stableHash(token, 'review-token');
  let tokenRecord;

  if (isDatabaseConnected()) {
    tokenRecord = await ReviewToken.findOne({ shopDomain, tokenHash });
    if (!tokenRecord || tokenRecord.usedAt) {
      const error = new Error('This review link has already been used or does not exist.');
      error.status = 409;
      throw error;
    }
    tokenRecord.usedAt = new Date();
    await tokenRecord.save();
  } else {
    tokenRecord = memoryTokens.get(tokenHash);
    if (!tokenRecord || tokenRecord.usedAt) {
      const error = new Error('This review link has already been used or does not exist.');
      error.status = 409;
      throw error;
    }
    tokenRecord.usedAt = new Date();
  }

  return createReview(shopDomain, {
    ...reviewInput,
    itemId: payload.itemId,
    variantId: payload.variantId,
    orderIdHash: payload.orderIdHash,
    customerEmailHash: payload.customerEmailHash,
    customerRefHash: payload.customerRefHash
  }, {
    source: 'signed-link',
    status: 'pending',
    verifiedPurchase: true,
    verificationSource: 'signed-token',
    verificationNote: 'Verified with a one-use signed review token.'
  });
}

module.exports = {
  publicReview,
  createReview,
  listReviews,
  reviewSummary,
  updateReview,
  importReviews,
  createSignedReviewToken,
  consumeSignedReviewToken
};
