const express = require('express');
const cors = require('cors');
const path = require('path');
const { registerModules } = require('./modules/module-registry');
const { registerAdminRoutes } = require('../admin/admin.routes');
const shopifyRoutes = require('./shopify/shopify.routes');
const productSearchRoutes = require('./shopify/product-search.routes');
const shopifyWebhookRoutes = require('./shopify/webhooks.routes');
const auditRoutes = require('./audit/audit.routes');
const bootstrapRoutes = require('./bootstrap/bootstrap.routes');
const { notFoundHandler, errorHandler } = require('./http/error-handler');
const { requireAdminApi } = require('./security/admin-auth.middleware');
const { createRateLimiter } = require('./http/rate-limit.middleware');
const { requestContext } = require('./http/request-context.middleware');
const { securityHeaders } = require('./http/security-headers.middleware');
const { config } = require('./config');

function createApp() {
  const app = express();

  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(requestContext);

  const corsOptions = config.security.corsOrigin
    ? { origin: config.security.corsOrigin.split(',').map((entry) => entry.trim()).filter(Boolean) }
    : { origin: false };
  app.use(cors(corsOptions));
  app.use(createRateLimiter({ keyPrefix: 'api' }));

  // Shopify webhooks must be mounted before express.json so HMAC verification can use the raw body.
  app.use('/api/webhooks/shopify', shopifyWebhookRoutes);

  app.use(express.json({ limit: config.security.maxJsonSize }));
  app.use(express.urlencoded({ extended: true, limit: config.security.maxJsonSize }));
  app.use(securityHeaders);

  app.use(express.static(path.join(__dirname, '../../public')));
  app.use('/admin-assets', express.static(path.join(__dirname, '../admin/assets')));

  app.get('/', (req, res) => {
    res.json({
      ok: true,
      app: 'nectar-reviews-api',
      version: '3.1.1',
      message: 'Nectar Reviews API is running.',
      endpoints: {
        health: '/health',
        admin: '/admin',
        setup: '/setup/bootstrap',
        reviewsWidgetScript: '/widget/reviews-widget.js',
        reviewsSummary: '/api/reviews/summary?shopDomain=example.myshopify.com&itemId=123'
      },
      time: new Date().toISOString()
    });
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, app: 'nectar-reviews-api', version: '3.1.1', modular: true, time: new Date().toISOString() });
  });

  // Backwards-compatible static aliases. The canonical script URL is /widget/reviews-widget.js.
  app.use('/public', express.static(path.join(__dirname, '../../public')));
  app.use('/widgets', express.static(path.join(__dirname, '../../public/widget')));

  // Public storefront endpoints need CORS because Shopify storefronts load the widget from the API domain.
  const publicStorefrontCors = cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    credentials: false,
    maxAge: 600
  });
  app.use('/api/reviews', publicStorefrontCors);

  app.use('/auth/shopify', shopifyRoutes);
  app.use('/api/shopify', shopifyRoutes);
  app.use('/api/shopify/products', productSearchRoutes);

  app.use('/api/admin', requireAdminApi);
  app.use('/api/admin/products', productSearchRoutes);
  app.use('/api/admin/audit', auditRoutes);
  app.use('/setup', bootstrapRoutes);

  registerAdminRoutes(app);
  registerModules(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
