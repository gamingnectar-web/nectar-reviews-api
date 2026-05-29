const productCreationImportRoutes = require('./productCreationImport.routes');

function mountProductCreationImportModule(app, deps = {}) {
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());
  const limiter = typeof deps.makeRateLimiter === 'function'
    ? deps.makeRateLimiter({ windowMs: 60 * 1000, max: 80, keyPrefix: 'product-import' })
    : (_req, _res, next) => next();
  app.use('/api/admin/product-creation-import', limiter, requireAdminSession, productCreationImportRoutes);
}

function startProductCreationImportJobs() {}

module.exports = { mountProductCreationImportModule, startProductCreationImportJobs };
