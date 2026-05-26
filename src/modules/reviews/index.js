/*
  Reviews module shim.
  The current repository still mounts review routes from src/routes/public.js and src/routes/admin.js.
  This file defines the module boundary so the app shell can treat Reviews as a first-class product
  while you gradually move review-specific files into src/modules/reviews later.
*/

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
  manifest
};
