const routes = require('./marketingIntelligence.routes');

function mountMarketingIntelligenceModule(app, deps = {}) {
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());
  const makeRateLimiter = deps.makeRateLimiter || ((_opts) => (_req, _res, next) => next());

  app.use(
    '/api/admin/marketing-intelligence',
    makeRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'marketing-intelligence' }),
    requireAdminSession,
    routes
  );
}

function startMarketingIntelligenceJobs() {
  return null;
}

module.exports = {
  mountMarketingIntelligenceModule,
  startMarketingIntelligenceJobs
};
