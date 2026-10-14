const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { env } = require('./config/env');
const { getLoyaltyConnection } = require('./config/db');
const { Shop, Review, Settings } = require('./models');
const { cleanShopDomain, isValidShopDomain } = require('./utils/validation');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const loyaltyRoutes = require('./routes/loyalty');
const loyaltyCheckoutRoutes = require('./routes/loyaltyCheckout');
const shopifyWebhookRoutes = require('./routes/shopifyWebhooks');
const taskRoutes = require('./routes/tasks');
const aiEmailModuleRoutes = require('./routes/aiEmailModules');
const emailModuleLibraryRoutes = require('./routes/emailModuleLibrary');
const reviewMigrationRoutes = require('./routes/reviewMigrations');
const elev8DashboardRoutes = require('./routes/elev8Dashboard');
const { publicRouter: notificationsPublicRoutes, adminRouter: notificationsAdminRoutes } = require('./routes/notifications');
const notificationWebhookRoutes = require('./routes/notificationWebhooks');
const brandDirectoryDirectRoutes = require('./routes/brandDirectoryDirect');
const brandDirectoryV3Routes = require('./routes/brandDirectoryV3');
const brandRulesRoutes = require('./modules/product-creation-import/catalogue-audit/brandRules.routes');
const elev8CommercePulseRoutes = require('./routes/elev8CommercePulse');
const manualReviewRoutes = require('./routes/manualReviews');
const manualReviewImageImportRoutes = require('./routes/manualReviewImageImports');
const { securityHeaders, corsOptions, makeRateLimiter, errorHandler, requireAdminSession, verifyAdminAuthToken } = require('./utils/security');
const reviewSubmissionSecurity = require('./utils/reviewSubmissionSecurity');
const { mountPlatformModules } = require('./modules');
const elev8Workflows = require('./modules/workflows');
const elev8BrowserAuth = require('./modules/elev8BrowserAuth');
const { unifiedAdminSession: hybridAdminSession } = require('./modules/elev8BrowserAuth/middleware');


const app = express();
const publicDir = path.join(__dirname, '..', 'public');

let trashCleanupStarted = false;
function startTrashAutoCleanup() {
  if (trashCleanupStarted) return;
  trashCleanupStarted = true;
  const run = async () => {
    try {
      const configs = await Settings.find({}).select('shopDomain trashRetentionDays').lean();
      for (const config of configs) {
        const days = Math.max(1, Math.min(28, Number(config.trashRetentionDays || 28)));
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        await Review.deleteMany({ shopDomain: config.shopDomain, isDeleted: true, deletedAt: { $lte: cutoff } });
      }
    } catch (error) { console.warn('Trash auto-cleanup skipped:', error.message); }
  };
  setTimeout(run, 30 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
}
startTrashAutoCleanup();

function injectProductImportCleanupAssets(html = '') {
  let next = String(html || '');
  const cssTag = '<link rel="stylesheet" href="/product-creation-import-cleanup.css?v=pci-cleanup-2">';
  const jsTag = '<script src="/product-creation-import-cleanup.js?v=pci-cleanup-2" defer></script>';
  if (!next.includes('/product-creation-import-cleanup.css')) {
    if (next.includes('</head>')) next = next.replace('</head>', `  ${cssTag}\n</head>`); else next = `${cssTag}\n${next}`;
  }
  if (!next.includes('/product-creation-import-cleanup.js')) {
    if (next.includes('</body>')) next = next.replace('</body>', `  ${jsTag}\n</body>`); else next = `${next}\n${jsTag}`;
  }
  return next;
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// ELEV8 Notifications: raw Shopify inventory webhook must run before express.json().
app.use('/api/webhooks/notifications', notificationWebhookRoutes);
// ELEV8 Notifications: raw Shopify notification webhooks before JSON parsing.
app.use('/api/webhooks/notifications', notificationWebhookRoutes);
app.use('/api/webhooks', shopifyWebhookRoutes);
app.use(express.json({ limit: env.jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: env.jsonLimit }));

app.use('/api/admin', makeRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'admin' }));
app.use('/api/tasks', makeRateLimiter({ windowMs: 60 * 1000, max: 30, keyPrefix: 'tasks' }), taskRoutes);
app.use('/api/reviews', makeRateLimiter({ windowMs: 60 * 1000, max: 60, keyPrefix: 'reviews' }), reviewSubmissionSecurity);
app.use('/api/admin/test-email', makeRateLimiter({ windowMs: 60 * 1000, max: 10, keyPrefix: 'test-email' }));
app.use('/api/campaign', makeRateLimiter({ windowMs: 60 * 1000, max: 300, keyPrefix: 'campaign' }));

app.get('/', (req, res) => res.json({ ok: true, service: 'Reviews Platform API', status: 'running', admin: '/admin', health: '/health' }));
app.get('/health', (req, res) => res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() }));
app.get('/health/db', (req, res) => {
  const loyaltyConn = getLoyaltyConnection();
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    ok: mongoose.connection.readyState === 1,
    coreDbReady: mongoose.connection.readyState === 1,
    loyaltyDbReady: (loyaltyConn?.readyState ?? 0) === 1,
    timestamp: new Date().toISOString(),
  });
});


function getValidDirectAdminShop(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    try {
      cookies[part.slice(0, index).trim()] =
        decodeURIComponent(part.slice(index + 1).trim());
    } catch (_) {}
  }

  for (const name of ['platform_admin_session', 'nectar_admin_session']) {
    const token = cookies[name];
    if (!token) continue;
    const result = verifyAdminAuthToken(token);
    if (result.ok) return result.shopDomain;
  }

  return '';
}

function directAdminLoginPage(res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(401).type('html').send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ELEV8 — Sign in required</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;
font:16px system-ui,sans-serif;background:#f5f7f9;color:#142638}
main{background:white;padding:40px;border:1px solid #e0e6eb;
border-radius:18px;max-width:440px;margin:20px;text-align:center;
box-shadow:0 12px 36px #12263a09}
h1{margin:0 0 12px;font-size:28px}
p{line-height:1.6;color:#536574}
a{display:inline-block;padding:13px 20px;background:#116981;
color:white;border-radius:10px;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<main>
<h1>ELEV8</h1>
<p>Your admin session is missing or has expired.</p>
<p>Open ELEV8 through your Shopify Admin to sign in securely.
Your existing store data is unaffected.</p>
<a href="https://admin.shopify.com/" rel="noopener">
Open Shopify Admin
</a>
</main>
</body>
</html>`);
}

app.use('/elev8', elev8BrowserAuth.router);
app.get('/admin', async (req, res, next) => {
  try {
    if (elev8BrowserAuth.featureEnabled()) {
      const browserAuth = await elev8BrowserAuth.browserSession(req);
      if (browserAuth && !req.query.shop && !req.query.shopDomain) {
        return res.redirect(302, `/admin?shop=${encodeURIComponent(browserAuth.member.shopDomain)}`);
      }
    }
    // Direct visits require an existing authenticated admin cookie.
    // Embedded Shopify visits retain their existing bootstrap flow.
    const launchShop = cleanShopDomain(req.query.shop || req.query.shopDomain || '');
    const isDirectVisit = !launchShop;

    if (isDirectVisit) {
      const authenticatedShop = getValidDirectAdminShop(req);
      if (!authenticatedShop) return directAdminLoginPage(res);
      return res.redirect(302, `/admin?shop=${encodeURIComponent(authenticatedShop)}`);
    }

    const shopDomain = launchShop;
    const justInstalled = Boolean(req.query.installed);
    if (shopDomain && isValidShopDomain(shopDomain) && !justInstalled && env.shopifyApiKey && env.shopifyApiSecret && env.appUrl) {
      const shop = await Shop.findOne({ shopDomain }).select('accessTokenEncrypted').lean();
      if (!shop?.accessTokenEncrypted) return res.redirect(302, `/auth/shopify?shop=${encodeURIComponent(shopDomain)}`);
    }
    const filePath = path.join(publicDir, 'admin.html');
    let html = injectProductImportCleanupAssets(fs.readFileSync(filePath, 'utf8'));
    if (!html.includes('/elev8-dashboard.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/elev8-dashboard.css?v=elev8-1"></head>');
    if (!html.includes('/notifications-center.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/notifications-center.css?v=notifications-4"></head>');
    if (!html.includes('/notifications-center.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/notifications-center.css?v=notifications-4"></head>');
    if (!html.includes('/notifications-center.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/notifications-center.css?v=notifications-4"></head>');
    if (!html.includes('/notifications-center.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/notifications-center.css?v=notifications-4"></head>');
    if (!html.includes('/elev8-dashboard.js')) html = html.replace('</body>', '<script src="/elev8-dashboard.js?v=elev8-1" defer></script></body>');
    if (!html.includes('/notifications-center.js')) html = html.replace('</body>', '<script src="/notifications-center.js?v=notifications-4" defer></script></body>');
    if (!html.includes('/notifications-center.js')) html = html.replace('</body>', '<script src="/notifications-center.js?v=notifications-4" defer></script></body>');
    if (!html.includes('/notifications-center.js')) html = html.replace('</body>', '<script src="/notifications-center.js?v=notifications-4" defer></script></body>');
    if (!html.includes('/notifications-center.js')) html = html.replace('</body>', '<script src="/notifications-center.js?v=notifications-4" defer></script></body>');
    html = html
      .replace(/__SHOPIFY_API_KEY__/g, env.shopifyApiKey || '').replace(/__APP_URL__/g, env.appUrl || '');
    res.setHeader('Cache-Control', 'no-store');
    return res.type('html').send(html);
  } catch (error) { next(error); }
});

app.get('/storefront/:asset', (req, res, next) => {
  const allowed = new Set(['nectar-review-page.js', 'nectar-review-page.css']);
  if (!allowed.has(req.params.asset)) return next();
  const filePath = path.join(publicDir, 'storefront', req.params.asset);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  return res.sendFile(filePath);
});

app.get('/review-widget.js', (req, res) => {
  const filePath = path.join(publicDir, 'review-widget.js');
  const js = fs.readFileSync(filePath, 'utf8').replace(/__APP_URL__/g, env.appUrl || '');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', env.nodeEnv === 'production' ? 'public, max-age=300' : 'no-store');
  return res.send(js);
});

// Supplier Sites admin assets are intentionally no-store.
app.get(['/supplier-sites-admin.js', '/supplier-sites-admin.css'], (req, res) => {
  const asset = path.basename(req.path);
  const filePath = path.join(publicDir, asset);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.sendFile(filePath);
});

app.use(express.static(publicDir, { etag: true, maxAge: env.nodeEnv === 'production' ? '5m' : 0, index: false }));
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/notifications', makeRateLimiter({ windowMs: 60 * 1000, max: 40, keyPrefix: 'notifications-public' }), notificationsPublicRoutes);
app.use('/api/loyalty/checkout', makeRateLimiter({ windowMs: 60 * 1000, max: 60, keyPrefix: 'loyalty-checkout' }), loyaltyCheckoutRoutes);
app.use('/api/admin/brand-directory-v3', hybridAdminSession, brandDirectoryV3Routes);
app.use('/api/admin/brand-rules', hybridAdminSession, brandRulesRoutes);
app.use('/api/admin/elev8-commerce', hybridAdminSession, elev8CommercePulseRoutes);
app.use('/api/admin/manual-reviews', hybridAdminSession, manualReviewRoutes);
app.use('/api/admin/manual-review-image-imports', hybridAdminSession, manualReviewImageImportRoutes);
mountPlatformModules(app, { makeRateLimiter, requireAdminSession: hybridAdminSession });
app.use('/api/admin/brand-directory-v2', hybridAdminSession, brandDirectoryDirectRoutes);
app.use('/api/admin/elev8', hybridAdminSession, elev8DashboardRoutes);
app.use('/api/admin/notifications', makeRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'notifications-admin' }), hybridAdminSession, notificationsAdminRoutes);
app.use('/api/admin/ai', makeRateLimiter({ windowMs: 60 * 1000, max: 30, keyPrefix: 'admin-ai' }), hybridAdminSession, aiEmailModuleRoutes);
app.use('/api/admin/email-module-library', hybridAdminSession, emailModuleLibraryRoutes);
app.use('/api/admin/review-migrations', reviewMigrationRoutes);
app.use('/api/workflows', elev8Workflows.publicRouter);
app.use('/api', publicRoutes);
app.use('/api/admin/loyalty', loyaltyRoutes);
app.use('/api/admin', hybridAdminSession, adminRoutes);

app.patch('/api/reviews/:id', hybridAdminSession, (req, res, next) => { req.url = `/reviews/${req.params.id}`; return adminRoutes(req, res, next); });
app.post('/api/reviews/import', hybridAdminSession, (req, res, next) => { req.url = '/reviews/import'; return adminRoutes(req, res, next); });
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use(errorHandler);
elev8Workflows.startWorkflowWorker();

module.exports = app;
