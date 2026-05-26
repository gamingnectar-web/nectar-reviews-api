const express = require('express');
const { asyncHandler } = require('../middleware/async-handler');
const { getModuleSettings, updateModuleSettings } = require('./module-settings.service');
const { getAvailableModules } = require('../module-registry');
const { requireShop } = require('../middleware/require-shop');

module.exports = function moduleSettingsRoutes() {
  const router = express.Router();

  router.get('/modules', requireShop, asyncHandler(async (req, res) => {
    const settings = await getModuleSettings(req.shopDomain);
    const modules = getAvailableModules().map((module) => ({
      key: module.key,
      name: module.name,
      description: module.description,
      navGroup: module.admin.navGroup,
      navLabel: module.admin.navLabel,
      enabled: Boolean(settings.modules[module.key]),
      admin: module.admin,
      api: module.api
    }));

    res.json({ shopDomain: req.shopDomain, source: settings.source, modules });
  }));

  router.patch('/modules', requireShop, asyncHandler(async (req, res) => {
    const updated = await updateModuleSettings(req.shopDomain, req.body.modules || {});
    res.json(updated);
  }));

  return router;
};
