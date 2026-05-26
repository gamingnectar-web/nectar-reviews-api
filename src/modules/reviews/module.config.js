module.exports = {
  key: 'reviews',
  name: 'Reviews',
  description: 'Collect, verify, moderate, import and display product reviews.',
  defaultEnabled: true,
  admin: {
    navGroup: 'Customer proof',
    navLabel: 'Reviews',
    html: '/modules/reviews/admin/reviews.html',
    js: '/modules/reviews/admin/reviews.js',
    css: '/modules/reviews/admin/reviews.css',
    staticDir: true
  },
  api: {
    basePath: '/api/reviews'
  },
  legacyBasePath: '/api',
  routeFactory: require('./routes/reviews.routes').createReviewsRouter,
  legacyRouteFactory: require('./routes/reviews.routes').createReviewsLegacyRouter
};
