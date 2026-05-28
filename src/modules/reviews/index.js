/*
  Reviews module boundary.
  Review routes still live in src/routes/public.js and src/routes/admin.js for backwards compatibility,
  while live review-request scheduling lives here as a proper product module service.
*/

const { startReviewRequestJobs } = require('./reviewRequestAutomation');

const manifest = {
  id: 'reviews',
  productSlug: 'review-widget',
  label: 'review-widget',
  defaultModule: true,
  apiNamespaces: ['/api', '/api/admin'],
  adminFolder: 'public/modules/reviews',
  legacyRoutes: true
};

module.exports = {
  manifest,
  startReviewRequestJobs,
};
