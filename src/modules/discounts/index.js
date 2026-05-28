const discountRoutes = require('./discounts.routes');

function mountDiscountsModule(app, deps = {}) {
  const makeRateLimiter = deps.makeRateLimiter || ((_opts) => (_req, _res, next) => next());
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());
  app.use(
    '/api/admin/discounts',
    makeRateLimiter({ windowMs: 60 * 1000, max: 180, keyPrefix: 'discounts' }),
    requireAdminSession,
    discountRoutes
  );
}

function startDiscountJobs() {
  return null;
}

module.exports = { mountDiscountsModule, startDiscountJobs };
