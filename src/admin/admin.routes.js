const path = require('path');
const express = require('express');
const { asyncHandler } = require('../core/http/async-handler');
const { requireShopDomain } = require('../core/http/request-utils');
const { getOrCreateShopModules, setShopModules } = require('../core/modules/feature-access');
const { listAvailableModules } = require('../core/modules/module-registry');
const { auditFromRequest } = require('../core/audit/audit.service');

function registerAdminRoutes(app) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/admin.html'));
  });

  app.use('/admin', router);

  app.get('/api/admin/modules', asyncHandler(async (req, res) => {
    const shopDomain = requireShopDomain(req);
    const shopModules = await getOrCreateShopModules(shopDomain);
    res.json({ availableModules: listAvailableModules(), shopModules });
  }));

  app.put('/api/admin/modules', asyncHandler(async (req, res) => {
    const shopDomain = requireShopDomain(req);
    const before = await getOrCreateShopModules(shopDomain);
    const enabledModules = Array.isArray(req.body.enabledModules) ? req.body.enabledModules : [];
    const moduleSettings = req.body.moduleSettings;
    const shopModules = await setShopModules(shopDomain, enabledModules, moduleSettings);
    await auditFromRequest(req, { shopDomain, module: 'core', eventType: 'modules.updated', entityType: 'shop_modules', entityKey: shopDomain, action: 'update', before: before.toObject ? before.toObject() : before, after: shopModules.toObject ? shopModules.toObject() : shopModules, metadata: { enabledModules: enabledModules.join(',') } });
    res.json({ ok: true, shopModules });
  }));
}

module.exports = { registerAdminRoutes };
