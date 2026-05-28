const cartRewardRoutes = require('./routes/cartRewards.routes');
const { startCartRewardScheduler, stopCartRewardScheduler } = require('./jobs/cartRewardScheduler');

function makeStorefrontBypass(requireAdminSession) {
  return function requireAdminUnlessCartRewardStorefront(req, res, next) {
    if (req.path.startsWith('/storefront')) return next();
    return requireAdminSession(req, res, next);
  };
}

function mountCartRewardsModule(app, deps = {}) {
  const makeRateLimiter = deps.makeRateLimiter || ((_opts) => (_req, _res, next) => next());
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());

  app.use(
    '/api/cart-rewards',
    makeRateLimiter({ windowMs: 60 * 1000, max: 300, keyPrefix: 'cart-rewards' }),
    makeStorefrontBypass(requireAdminSession),
    cartRewardRoutes
  );
}

function startCartRewardsJobs() {
  if (String(process.env.CART_REWARDS_SCHEDULER_DISABLED || '').toLowerCase() === 'true') return null;
  return startCartRewardScheduler();
}

module.exports = {
  mountCartRewardsModule,
  startCartRewardsJobs,
  stopCartRewardScheduler
};
