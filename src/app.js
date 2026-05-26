const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const { env } = require('./config/env');
const { getShopFromRequest } = require('./core/utils/clean-shop-domain');
const { registerModuleRoutes, getAvailableModules } = require('./core/module-registry');
const moduleSettingsRoutes = require('./core/settings/module-settings.routes');
const shopifyAuthRoutes = require('./core/auth/shopify-auth.routes');
const shopifyProductsRoutes = require('./core/shopify/products.routes');
const supportRoutes = require('./core/support/support.routes');

function createApp() {
  const app = express();

  app.disable('x-powered-by');

  // Shopify embedded apps are loaded inside the Shopify Admin iframe.
  // Helmet's default X-Frame-Options: SAMEORIGIN blocks that iframe, so disable
  // frameguard and set Shopify's required frame-ancestors CSP instead.
  app.use((req, res, next) => {
    const shop = getShopFromRequest(req);
    const frameAncestors = shop
      ? `https://${shop} https://admin.shopify.com`
      : `https://*.myshopify.com https://admin.shopify.com`;

    res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors};`);
    next();
  });

  app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
  app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/', (req, res) => {
    res.json({
      ok: true,
      name: 'Nectar Modular API',
      version: '2.0.0-modular',
      admin: '/admin',
      health: '/health'
    });
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'nectar-modular-api', timestamp: new Date().toISOString() });
  });

  app.get('/api/core/manifest', (req, res) => {
    res.json({
      brandName: env.brandName,
      modules: getAvailableModules().map((module) => ({
        key: module.key,
        name: module.name,
        description: module.description,
        navGroup: module.admin.navGroup,
        navLabel: module.admin.navLabel,
        basePath: module.api.basePath,
        defaultEnabled: module.defaultEnabled
      }))
    });
  });

  app.use('/api/core/settings', moduleSettingsRoutes());
  app.use('/auth', shopifyAuthRoutes());
  app.use('/api/auth', shopifyAuthRoutes());
  app.use('/api/shopify', shopifyProductsRoutes());
  app.use('/api/support-requests', supportRoutes());

  registerModuleRoutes(app);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(error.status || 500).json({
      error: error.publicMessage || error.message || 'Internal server error'
    });
  });

  return app;
}

module.exports = { createApp };
