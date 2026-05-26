const path = require('path');
const express = require('express');
const { requireShopModule } = require('../middleware/require-shop');

const moduleDefinitions = [
  require('../../modules/reviews/module.config'),
  require('../../modules/loyalty/module.config'),
  require('../../modules/discounts/module.config'),
  require('../../modules/cart-rewards/module.config'),
  require('../../modules/campaigns/module.config'),
  require('../../modules/help/module.config')
];

function getAvailableModules() {
  return moduleDefinitions;
}

function registerModuleRoutes(app) {
  for (const module of moduleDefinitions) {
    if (module.admin?.staticDir) {
      app.use(`/modules/${module.key}/admin`, express.static(path.resolve(__dirname, '..', '..', 'modules', module.key, 'admin')));
    }

    if (module.routeFactory && module.api?.basePath) {
      app.use(module.api.basePath, requireShopModule(module.key), module.routeFactory());
    }

    if (module.legacyRouteFactory && module.legacyBasePath) {
      app.use(module.legacyBasePath, requireShopModule(module.key), module.legacyRouteFactory());
    }
  }
}

module.exports = { getAvailableModules, registerModuleRoutes };
