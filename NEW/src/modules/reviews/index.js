const publicRoutes = require('./reviews.routes');
const adminRoutes = require('./reviews.admin.routes');
const reviewPageRoutes = require('./review-page.routes');
const { requireModule } = require('../../core/modules/feature-access');

module.exports = {
  key: 'reviews',
  name: 'Reviews',
  description: 'Reviews, moderation, widgets, rich snippets and one-use review links.',
  enabledByDefault: true,
  register(app) {
    app.use('/api/reviews', publicRoutes);
    app.use('/api/admin/reviews', requireModule('reviews'), adminRoutes);
    app.use('/review', reviewPageRoutes);
  }
};
