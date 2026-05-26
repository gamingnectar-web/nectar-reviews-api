const { listModules } = require('./moduleRegistry');
const { mountCartRewardsModule, startCartRewardsJobs } = require('./cart-rewards');
const { mountDiscountsModule, startDiscountJobs } = require('./discounts');

let moduleJobsStarted = false;

function mountPlatformModules(app, deps = {}) {
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());

  app.get('/api/admin/modules', requireAdminSession, (_req, res) => {
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
  startDiscountJobs();
  startCartRewardsJobs();
}

module.exports = {
  mountPlatformModules,
  startPlatformModuleJobs,
  listModules
};
