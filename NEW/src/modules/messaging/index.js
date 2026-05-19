const emailProviderRoutes = require('./email-provider.routes');
const testEmailRoutes = require('./test-email.routes');
const campaignRoutes = require('./campaign.routes');
const trackingRoutes = require('./tracking.routes');
const { requireModule } = require('../../core/modules/feature-access');
const { eventBus } = require('../../core/modules/event-bus');
const messaging = require('./messaging.service');
const discounts = require('../discounts/discounts.service');

let listenersRegistered = false;

module.exports = {
  key: 'messaging',
  name: 'Messaging',
  description: 'SMTP settings, review request emails and campaign open/click tracking.',
  enabledByDefault: true,
  register(app) {
    app.use('/api/admin/messaging', requireModule('messaging'), emailProviderRoutes);
    app.use('/api/admin/messaging', requireModule('messaging'), testEmailRoutes);
    app.use('/api/admin/messaging', requireModule('messaging'), campaignRoutes);
    app.use('/api/messaging/track', trackingRoutes);

    if (!listenersRegistered) {
      eventBus.on('discount.reviewReward.created', async ({ shopDomain, review, reward, discountCode }) => {
        try {
          await messaging.sendReviewRewardEmail({ shopDomain, review, reward, discountCode });
          if (reward?._id) await discounts.markRewardSent(shopDomain, reward._id);
        } catch (error) {
          console.warn('Review reward email failed:', error.message);
        }
      });
      listenersRegistered = true;
    }
  }
};
