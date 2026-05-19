const fs = require('fs');
const path = require('path');
const express = require('express');
const { asyncHandler } = require('../core/http/async-handler');
const { requireShopDomain, cleanShopDomain } = require('../core/http/request-utils');
const { getOrCreateShopModules, setShopModules, defaultEnabledModules } = require('../core/modules/feature-access');
const { listAvailableModules } = require('../core/modules/module-registry');
const { auditFromRequest } = require('../core/audit/audit.service');
const { verifyOAuthHmac, getShopifyAdminAccessToken } = require('../core/shopify/shopify.service');
const { createAdminSessionToken, verifyAdminSessionToken } = require('../core/security/admin-session.service');
const reviewService = require('../modules/reviews/reviews.service');

function escapeClosingScript(value) {
  return String(value || '').replace(/<\/script/gi, '<\\/script');
}

async function buildAdminBootstrap(req) {
  const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain || req.query.shopify_domain || '');
  let sessionToken = '';
  let sessionSource = 'none';
  let installed = false;
  let authWarning = '';

  if (shopDomain) {
    installed = Boolean(await getShopifyAdminAccessToken(shopDomain));
  }

  if (shopDomain && req.query.adminSession) {
    const provided = verifyAdminSessionToken(req.query.adminSession);
    if (provided?.shopDomain === shopDomain) {
      sessionToken = req.query.adminSession;
      sessionSource = 'install-callback';
    }
  }

  if (!sessionToken && shopDomain && verifyOAuthHmac(req.query)) {
    sessionToken = createAdminSessionToken(shopDomain, { source: 'shopify-hmac' });
    sessionSource = 'shopify-hmac';
  }

  if (!sessionToken && shopDomain && process.env.ALLOW_DIRECT_ADMIN_SESSION === 'true') {
    sessionToken = createAdminSessionToken(shopDomain, { source: 'direct-dev' });
    sessionSource = 'direct-dev';
  }

  if (!sessionToken) {
    authWarning = shopDomain
      ? 'Open the app from Shopify Admin to unlock merchant actions. Direct browser previews are read-only unless ALLOW_DIRECT_ADMIN_SESSION=true is set for development.'
      : 'Open this app from Shopify Admin, or add ?shop=your-store.myshopify.com to preview.';
  }

  return {
    shopDomain,
    installed,
    sessionToken,
    sessionSource,
    authWarning,
    defaultEnabledModules,
    appName: 'Nectar Reviews',
    version: '3.2.0'
  };
}

function registerAdminRoutes(app) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const filePath = path.join(__dirname, 'pages/admin.html');
    const html = fs.readFileSync(filePath, 'utf8');
    const bootstrap = await buildAdminBootstrap(req);
    const injected = `<script>window.__NECTAR_BOOTSTRAP__=${escapeClosingScript(JSON.stringify(bootstrap))};</script>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html.replace('<!--NECTAR_BOOTSTRAP-->', injected));
  }));

  app.use('/admin', router);

  app.get('/api/admin/modules', asyncHandler(async (req, res) => {
    const shopDomain = requireShopDomain(req);
    const shopModules = await getOrCreateShopModules(shopDomain);
    res.json({ availableModules: listAvailableModules(), shopModules });
  }));

  app.put('/api/admin/modules', asyncHandler(async (req, res) => {
    const shopDomain = requireShopDomain(req);
    const before = await getOrCreateShopModules(shopDomain);
    const requested = Array.isArray(req.body.enabledModules) ? req.body.enabledModules : defaultEnabledModules;
    const moduleSettings = req.body.moduleSettings;
    const shopModules = await setShopModules(shopDomain, requested, moduleSettings);
    await auditFromRequest(req, { shopDomain, module: 'core', eventType: 'modules.updated', entityType: 'shop_modules', entityKey: shopDomain, action: 'update', before: before.toObject ? before.toObject() : before, after: shopModules.toObject ? shopModules.toObject() : shopModules, metadata: { enabledModules: shopModules.enabledModules.join(',') } });
    res.json({ ok: true, shopModules });
  }));

  // Backwards-compatible aliases used by the original admin console.
  app.get('/api/admin/settings', asyncHandler(async (req, res) => {
    const shopDomain = requireShopDomain(req);
    res.json(await reviewService.getSettings(shopDomain));
  }));

  app.patch('/api/admin/settings', asyncHandler(async (req, res) => {
    const shopDomain = requireShopDomain(req);
    const settings = await reviewService.updateSettings(shopDomain, req.body || {});
    await auditFromRequest(req, { shopDomain, module: 'reviews', eventType: 'reviews.settings.updated', entityType: 'review_settings', entityKey: shopDomain, action: 'update' });
    res.json(settings);
  }));

  app.get('/api/admin/stats', asyncHandler(async (req, res) => {
    const shopDomain = requireShopDomain(req);
    const analytics = await reviewService.analytics(shopDomain);
    res.json({
      summary: analytics.summary || {},
      sources: analytics.sources || { website: 0, email: 0, import: 0, admin: 0 },
      topProduct: analytics.topProduct || { id: 'N/A', count: 0, averageRating: 0 }
    });
  }));
}

module.exports = { registerAdminRoutes };
