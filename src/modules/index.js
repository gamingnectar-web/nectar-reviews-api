const { listModules } = require('./moduleRegistry');
const { startReviewRequestJobs } = require('./reviews');
const { mountCartRewardsModule, startCartRewardsJobs } = require('./cart-rewards');
const { mountDiscountsModule, startDiscountJobs } = require('./discounts');

let moduleJobsStarted = false;

function mountPlatformModules(app, deps = {}) {
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());

  // Product registry is exposed separately so /api/admin/modules can keep returning
  // per-shop live/beta enabled states from src/routes/admin.js.
  app.get('/api/admin/platform-modules', requireAdminSession, (_req, res) => {
    res.json({ modules: listModules() });
  });

  // Reviews routes are still mounted by the existing app.js route order.
  // Discounts and Cart Rewards are folderised modules mounted here.
  mountDiscountsModule(app, deps);
  mountCartRewardsModule(app, deps);
}

function startPlatformModuleJobs() {
  if (moduleJobsStarted) return;
  moduleJobsStarted = true;
  startReviewRequestJobs();
  startDiscountJobs();
  startCartRewardsJobs();
}

module.exports = {
  mountPlatformModules,
  startPlatformModuleJobs,
  listModules
};
