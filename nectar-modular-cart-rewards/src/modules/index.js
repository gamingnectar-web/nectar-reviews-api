const { listModules } = require('./moduleRegistry');
const { mountCartRewardsModule, startCartRewardsJobs } = require('./cart-rewards');

let moduleJobsStarted = false;

function mountPlatformModules(app, deps = {}) {
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());

  app.get('/api/admin/modules', requireAdminSession, (_req, res) => {
    res.json({ modules: listModules() });
  });

  // Reviews routes are still mounted by the existing app.js route order.
  // Cart Rewards is fully folderised and mounted here.
  mountCartRewardsModule(app, deps);
}

function startPlatformModuleJobs() {
  if (moduleJobsStarted) return;
  moduleJobsStarted = true;
  startCartRewardsJobs();
}

module.exports = {
  mountPlatformModules,
  startPlatformModuleJobs,
  listModules
};
