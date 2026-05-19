const routes = require('./discounts.routes');
const { requireModule } = require('../../core/modules/feature-access');
const { eventBus } = require('../../core/modules/event-bus');
const discounts = require('./discounts.service');

let listenersRegistered = false;

module.exports = {
  key: 'discounts',
  name: 'Discounts',
  description: 'Review reward discounts and future free gift rules.',
  enabledByDefault: true,
  register(app) {
    app.use('/api/admin/discounts', requireModule('discounts'), routes);
    if (!listenersRegistered) {
      eventBus.on('review.accepted', async (payload) => {
        try {
          await discounts.maybeRewardAcceptedReview(payload);
        } catch (error) {
          console.warn('Discount reward hook failed:', error.message);
        }
      });
      listenersRegistered = true;
    }
  }
};
