const adminRoutes = require('./routes/admin.routes');
const storefrontRoutes = require('./routes/storefront.routes');

function mountCustomerHubModule(app, deps = {}) {
  const requireAdminSession = deps.requireAdminSession || ((_req,_res,next)=>next());
  const makeRateLimiter = deps.makeRateLimiter || ((_opts)=>(_req,_res,next)=>next());
  app.use('/api/admin/customer-hub', makeRateLimiter({ windowMs:60000, max:120, keyPrefix:'customer-hub-admin' }), requireAdminSession, adminRoutes);
  app.use('/api/elev8/proxy/customer-hub', makeRateLimiter({ windowMs:60000, max:120, keyPrefix:'customer-hub-storefront' }), storefrontRoutes);
}
function startCustomerHubJobs(){ return null; }
module.exports = { mountCustomerHubModule, startCustomerHubJobs };
