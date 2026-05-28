const routes = require('./routes/cartRewards.routes');
const webhookRoutes = require('./routes/cartRewardWebhooks.routes');
function mount(app, { makeRateLimiter, requireAdminSession } = {}) {
  app.use('/api/admin/cart-rewards', makeRateLimiter ? makeRateLimiter({ windowMs: 60000, max: 120, keyPrefix: 'cart-rewards' }) : (req,res,next)=>next(), requireAdminSession || ((req,res,next)=>next()), routes);
  app.use('/api/cart-rewards/webhooks', webhookRoutes);
}
module.exports = { mount };
