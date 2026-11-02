'use strict';

const { Review } = require('../../models');

async function getProductReviewIdentitySummary(shopDomain) {
  const [summary] = await Review.aggregate([
    {
      $match: {
        shopDomain,
        status: 'accepted',
        isDeleted: false,
        isTestReview: { $ne: true },
        testMode: { $ne: true },
        reviewScope: 'product',
        itemId: { $ne: '__site__' },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        average: { $avg: '$rating' },
      },
    },
  ]);

  const count = Number(summary?.count || 0);
  const average = count ? Number(Number(summary?.average || 0).toFixed(1)) : 0;

  return {
    count,
    average,
    scope: 'product',
  };
}

module.exports = {
  getProductReviewIdentitySummary,
};
