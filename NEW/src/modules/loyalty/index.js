const routes = require('./loyalty.routes');
const publicRoutes = require('./public-loyalty.routes');
const systemRoutes = require('./system-loyalty.routes');
const { requireModule } = require('../../core/modules/feature-access');
const { eventBus } = require('../../core/modules/event-bus');
const { createScopedHash } = require('../../core/security/customer-identity.service');
const loyalty = require('./loyalty.service');

let listenersRegistered = false;

module.exports = {
  key: 'loyalty',
  name: 'Loyalty',
  description: 'Nectar Drops rules engine, delayed approvals, redemption codes and customer-facing balances.',
  enabledByDefault: true,
  register(app) {
    app.use('/api/admin/loyalty', requireModule('loyalty'), routes);
    app.use('/api/loyalty', publicRoutes);
    app.use('/api/system/loyalty', systemRoutes);
    if (!listenersRegistered) {
      eventBus.on('review.accepted', async (payload) => {
        try { await loyalty.maybeRewardAcceptedReview(payload); }
        catch (error) { console.warn('Loyalty review reward hook failed:', error.message); }
      });
      eventBus.on('order.paid', async (payload) => {
        try { await loyalty.awardPurchasePoints(payload.shopDomain, payload.order || payload.payload); }
        catch (error) { console.warn('Loyalty purchase reward hook failed:', error.message); }
      });
      eventBus.on('order.cancelled', async (payload) => {
        try { await loyalty.reverseForOrder(payload.shopDomain, payload.order || payload.payload); }
        catch (error) { console.warn('Loyalty order reversal hook failed:', error.message); }
      });
      eventBus.on('refund.created', async (payload) => {
        try {
          const refund = payload.payload || payload.order || {};
          const orderRef = refund.order_id || refund.order?.id || '';
          if (orderRef) await loyalty.reverseTransactionsForSource(payload.shopDomain, createScopedHash(payload.shopDomain, orderRef, 'order'), 'refund_created');
        } catch (error) { console.warn('Loyalty refund reversal hook failed:', error.message); }
      });
      eventBus.on('fulfillment.created', async (payload) => {
        try { await loyalty.processFulfillment(payload.shopDomain, payload.payload || payload.order); }
        catch (error) { console.warn('Loyalty fulfillment hook failed:', error.message); }
      });
      listenersRegistered = true;
    }
  }
};
