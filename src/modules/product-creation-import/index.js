const productCreationImportRoutes = require('./productCreationImport.routes');
const catalogueAuditRoutes = require('./catalogue-audit/catalogueAudit.routes');
const { startSiteImportAutomation } = require('./jobs/siteImportAutomation');

function mountProductCreationImportModule(app, deps = {}) {
  const requireAdminSession = deps.requireAdminSession || ((_req, _res, next) => next());
  const limiter = typeof deps.makeRateLimiter === 'function'
    ? deps.makeRateLimiter({ windowMs: 60 * 1000, max: 80, keyPrefix: 'product-import' })
    : (_req, _res, next) => next();
  app.use('/api/admin/product-creation-import/catalogue', limiter, requireAdminSession, catalogueAuditRoutes);
  app.use('/api/admin/brand-directory', limiter, requireAdminSession, catalogueAuditRoutes);
  app.use('/api/admin/product-creation-import', limiter, requireAdminSession, productCreationImportRoutes);
}

function startProductCreationImportJobs() { return startSiteImportAutomation(); }

module.exports = { mountProductCreationImportModule, startProductCreationImportJobs };
