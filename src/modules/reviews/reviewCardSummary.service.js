'use strict';

const { Review } = require('../../models');
const { cleanText } = require('../../utils/validation');

function productIdCandidates(value) {
  const raw = cleanText(value || '', 200);
  const set = new Set();
  if (raw) set.add(raw);

  const parts = raw.split('/').filter(Boolean);
  const tail = parts.length ? parts[parts.length - 1] : raw;
  if (tail) set.add(tail);

  const digits = raw.match(/\d{5,}/g) || [];
  digits.forEach((id) => {
    set.add(id);
    set.add(`gid://shopify/Product/${id}`);
  });

  return Array.from(set).filter(Boolean);
}

function canonicalProductId(value) {
  const raw = cleanText(value || '', 200);
  const digits = raw.match(/\d{5,}/g) || [];
  return digits.length ? digits[digits.length - 1] : raw;
}

async function getProductCardReviewSummaries(shopDomain, productIds = []) {
  const ids = Array.from(new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((id) => canonicalProductId(id))
      .filter(Boolean)
  )).slice(0, 50);

  const empty = Object.fromEntries(ids.map((id) => [id, { count: 0, average: 0 }]));
  if (!shopDomain || !ids.length) return empty;

  const candidates = Array.from(new Set(ids.flatMap(productIdCandidates)));

  const rows = await Review.find({
    shopDomain,
    itemId: { $in: candidates },
    status: 'accepted',
    isDeleted: false,
    isTestReview: { $ne: true },
    testMode: { $ne: true },
  }).select('itemId rating').lean();

  const totals = new Map(ids.map((id) => [id, { count: 0, total: 0 }]));

  rows.forEach((review) => {
    const reviewId = canonicalProductId(review.itemId);
    if (!totals.has(reviewId)) return;
    const current = totals.get(reviewId);
    current.count += 1;
    current.total += Number(review.rating || 0);
  });

  return Object.fromEntries(ids.map((id) => {
    const value = totals.get(id) || { count: 0, total: 0 };
    return [
      id,
      {
        count: value.count,
        average: value.count ? Number((value.total / value.count).toFixed(1)) : 0,
      },
    ];
  }));
}

module.exports = {
  productIdCandidates,
  canonicalProductId,
  getProductCardReviewSummaries,
};
