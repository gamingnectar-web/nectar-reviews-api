const Review = require('./review.model');
const Settings = require('./settings.model');
const ReviewRequestLink = require('./review-request-link.model');
const { cleanShopDomain } = require('../../core/http/request-utils');
const { createToken } = require('../../core/security/credentials.service');
const { setProductReviewMetafields } = require('../../core/shopify/metafields.service');
const { eventBus } = require('../../core/modules/event-bus');
const { createCustomerKey, createScopedHash, publicCustomerRef } = require('../../core/security/customer-identity.service');

function publicReview(review) {
  return {
    id: String(review._id),
    shopDomain: review.shopDomain,
    itemId: review.itemId,
    itemTitle: review.itemTitle || '',
    customerName: review.isAnonymous ? 'Anonymous' : 'Verified customer',
    customerRef: publicCustomerRef(review.customerKey),
    rating: review.rating,
    headline: review.headline || '',
    comment: review.comment || '',
    reply: review.reply || '',
    attributes: review.attributes || {},
    productTags: review.productTags || [],
    media: review.media || [],
    verifiedPurchase: Boolean(review.verifiedPurchase),
    isTestReview: Boolean(review.isTestReview),
    createdAt: review.createdAt
  };
}

async function getSettings(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  return Settings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $setOnInsert: { shopDomain: cleanShop } },
    { new: true, upsert: true }
  );
}

async function updateSettings(shopDomain, patch) {
  const cleanShop = cleanShopDomain(shopDomain);
  return Settings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $set: { ...patch, shopDomain: cleanShop } },
    { new: true, upsert: true, runValidators: true }
  );
}

function validateRating(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    const error = new Error('Rating must be between 1 and 5.');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

async function getValidRequestLink(token) {
  if (!token) return null;
  const link = await ReviewRequestLink.findOne({ token: String(token) });
  if (!link) {
    const error = new Error('Review link is invalid.');
    error.statusCode = 404;
    throw error;
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    const error = new Error('Review link has expired.');
    error.statusCode = 410;
    throw error;
  }
  if (link.useCount >= link.maxUses || link.usedAt) {
    const error = new Error('Review link has already been used.');
    error.statusCode = 409;
    throw error;
  }
  return link;
}

async function createReview(payload) {
  let shopDomain = cleanShopDomain(payload.shopDomain || payload.shop);
  let requestLink = null;

  if (payload.token || payload.requestToken) {
    requestLink = await getValidRequestLink(payload.token || payload.requestToken);
    shopDomain = requestLink.shopDomain;
  }

  if (!shopDomain) {
    const error = new Error('Missing shopDomain.');
    error.statusCode = 400;
    throw error;
  }

  const settings = await getSettings(shopDomain);
  const itemId = String(payload.itemId || requestLink?.itemId || '').trim();
  if (!itemId) {
    const error = new Error('Missing itemId.');
    error.statusCode = 400;
    throw error;
  }

  const rating = validateRating(payload.rating);
  const verifiedPurchase = Boolean(payload.verifiedPurchase || requestLink?.orderKey);
  const autoApprove = settings.autoApproveEnabled &&
    rating >= Number(settings.autoApproveMinStars || 4) &&
    (settings.autoApproveType === 'all' || verifiedPurchase);

  const review = await Review.create({
    shopDomain,
    itemId,
    itemTitle: payload.itemTitle || requestLink?.itemTitle || '',
    userId: '',
    customerKey: requestLink?.customerKey || createCustomerKey(shopDomain, payload.customerId || payload.customer_id || payload.customerGid || ''),
    customerName: '',
    email: '',
    isAnonymous: Boolean(payload.isAnonymous),
    rating,
    headline: payload.headline || payload.title || '',
    comment: payload.comment || payload.body || '',
    reply: '',
    attributes: payload.attributes || {},
    productTags: Array.isArray(payload.productTags) ? payload.productTags : [],
    media: Array.isArray(payload.media) ? payload.media : [],
    source: payload.source || (requestLink ? 'email' : 'website'),
    status: autoApprove ? 'accepted' : 'pending',
    verifiedPurchase,
    verificationNote: verifiedPurchase ? 'Verified using one-use review request link.' : '',
    orderId: '',
    orderKey: requestLink?.orderKey || createScopedHash(shopDomain, payload.orderId || payload.order_id || ''),
    requestToken: requestLink?.token || '',
    isTestReview: Boolean(payload.isTestReview || payload.testMode),
    testMode: Boolean(payload.testMode),
    testLabel: payload.testLabel || ''
  });

  if (requestLink) {
    requestLink.useCount += 1;
    requestLink.usedAt = new Date();
    await requestLink.save();
  }

  if (review.status === 'accepted') {
    await syncProductSummary(shopDomain, itemId).catch((error) => console.warn('Metafield sync failed:', error.message));
    eventBus.emit('review.accepted', { shopDomain, review: review.toObject() });
  }

  return review;
}

async function listPublicReviews({ shopDomain, itemId, limit = 20, includeTest = false }) {
  const query = {
    shopDomain: cleanShopDomain(shopDomain),
    status: 'accepted',
    isDeleted: { $ne: true }
  };
  if (itemId) query.itemId = String(itemId);
  if (!includeTest) query.isTestReview = { $ne: true };
  const reviews = await Review.find(query).sort({ createdAt: -1 }).limit(Number(limit) || 20).lean();
  return reviews.map(publicReview);
}

async function listAdminReviews({ shopDomain, itemId, status, limit = 100, includeDeleted = false }) {
  const query = { shopDomain: cleanShopDomain(shopDomain) };
  if (itemId) query.itemId = String(itemId);
  if (status) query.status = String(status);
  if (!includeDeleted) query.isDeleted = { $ne: true };
  return Review.find(query).sort({ createdAt: -1 }).limit(Number(limit) || 100).lean();
}

async function getReviewSummary(shopDomain, itemId, includeTest = false) {
  const match = {
    shopDomain: cleanShopDomain(shopDomain),
    status: 'accepted',
    isDeleted: { $ne: true }
  };
  if (itemId) match.itemId = String(itemId);
  if (!includeTest) match.isTestReview = { $ne: true };
  const [result] = await Review.aggregate([
    { $match: match },
    { $group: { _id: null, count: { $sum: 1 }, averageRating: { $avg: '$rating' } } }
  ]);
  return {
    count: result?.count || 0,
    averageRating: result?.averageRating ? Math.round(result.averageRating * 10) / 10 : 0
  };
}

async function syncProductSummary(shopDomain, itemId) {
  const summary = await getReviewSummary(shopDomain, itemId);
  await setProductReviewMetafields(shopDomain, itemId, summary);
  return summary;
}

async function updateReviewStatus(shopDomain, reviewId, status) {
  const allowed = ['pending', 'accepted', 'rejected', 'hold', 'spam'];
  if (!allowed.includes(status)) {
    const error = new Error('Invalid review status.');
    error.statusCode = 400;
    throw error;
  }
  const before = await Review.findOne({ _id: reviewId, shopDomain: cleanShopDomain(shopDomain) });
  if (!before) {
    const error = new Error('Review not found.');
    error.statusCode = 404;
    throw error;
  }
  before.status = status;
  await before.save();
  if (status === 'accepted') {
    await syncProductSummary(before.shopDomain, before.itemId).catch((error) => console.warn('Metafield sync failed:', error.message));
    eventBus.emit('review.accepted', { shopDomain: before.shopDomain, review: before.toObject() });
  }
  return before;
}

async function replyToReview(shopDomain, reviewId, reply) {
  const review = await Review.findOneAndUpdate(
    { _id: reviewId, shopDomain: cleanShopDomain(shopDomain) },
    { $set: { reply: String(reply || '') } },
    { new: true }
  );
  if (!review) {
    const error = new Error('Review not found.');
    error.statusCode = 404;
    throw error;
  }
  return review;
}

async function softDeleteReview(shopDomain, reviewId) {
  const review = await Review.findOneAndUpdate(
    { _id: reviewId, shopDomain: cleanShopDomain(shopDomain) },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true }
  );
  if (!review) {
    const error = new Error('Review not found.');
    error.statusCode = 404;
    throw error;
  }
  await syncProductSummary(review.shopDomain, review.itemId).catch((error) => console.warn('Metafield sync failed:', error.message));
  return review;
}

async function createReviewRequestLink(payload) {
  const shopDomain = cleanShopDomain(payload.shopDomain);
  if (!shopDomain) {
    const error = new Error('Missing shopDomain.');
    error.statusCode = 400;
    throw error;
  }
  const settings = await getSettings(shopDomain);
  const days = Number(payload.expiresAfterDays || settings.requestLinks?.expiresAfterDays || 30);
  const token = createToken(24);
  return ReviewRequestLink.create({
    shopDomain,
    token,
    customerKey: payload.customerKey || createCustomerKey(shopDomain, payload.customerId || payload.customer_id || payload.customerGid || ''),
    recipientHash: createScopedHash(shopDomain, payload.email || payload.to || payload.recipient || ''),
    orderKey: createScopedHash(shopDomain, payload.orderId || payload.order_id || ''),
    itemId: payload.itemId || '',
    itemTitle: payload.itemTitle || '',
    campaign: payload.campaign || 'review_request',
    maxUses: payload.maxUses || 1,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    metadata: { source: String(payload.campaign || 'review_request').slice(0, 80) }
  });
}

async function getRequestLink(token) {
  return getValidRequestLink(token);
}

async function analytics(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  const [statusCounts, ratingCounts, summary, sourceCounts, topProducts] = await Promise.all([
    Review.aggregate([{ $match: { shopDomain: cleanShop, isDeleted: { $ne: true } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Review.aggregate([{ $match: { shopDomain: cleanShop, status: 'accepted', isDeleted: { $ne: true } } }, { $group: { _id: '$rating', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    getReviewSummary(cleanShop),
    Review.aggregate([{ $match: { shopDomain: cleanShop, isDeleted: { $ne: true } } }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Review.aggregate([
      { $match: { shopDomain: cleanShop, status: 'accepted', isDeleted: { $ne: true } } },
      { $group: { _id: '$itemId', count: { $sum: 1 }, averageRating: { $avg: '$rating' }, title: { $first: '$itemTitle' } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ])
  ]);

  const sources = { website: 0, email: 0, import: 0, admin: 0 };
  for (const source of sourceCounts) {
    if (source?._id && Object.prototype.hasOwnProperty.call(sources, source._id)) sources[source._id] = source.count;
  }
  const top = topProducts[0];
  return {
    summary,
    sources,
    topProduct: top ? { id: top._id, title: top.title || '', count: top.count || 0, averageRating: top.averageRating ? Math.round(top.averageRating * 10) / 10 : 0 } : { id: 'N/A', count: 0, averageRating: 0 },
    statusCounts,
    ratingCounts
  };
}

module.exports = {
  publicReview,
  getSettings,
  updateSettings,
  createReview,
  listPublicReviews,
  listAdminReviews,
  getReviewSummary,
  syncProductSummary,
  updateReviewStatus,
  replyToReview,
  softDeleteReview,
  createReviewRequestLink,
  getRequestLink,
  analytics
};
