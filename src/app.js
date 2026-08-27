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
const { securityHeaders, corsOptions, makeRateLimiter, errorHandler, requireAdminSession } = require('./utils/security');
const reviewSubmissionSecurity = require('./utils/reviewSubmissionSecurity');
const { mountPlatformModules } = require('./modules');

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

app.get('/admin', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain || '');
    const justInstalled = Boolean(req.query.installed);
    if (shopDomain && isValidShopDomain(shopDomain) && !justInstalled && env.shopifyApiKey && env.shopifyApiSecret && env.appUrl) {
      const shop = await Shop.findOne({ shopDomain }).select('accessTokenEncrypted').lean();
      if (!shop?.accessTokenEncrypted) return res.redirect(302, `/auth/shopify?shop=${encodeURIComponent(shopDomain)}`);
    }
    const filePath = path.join(publicDir, 'admin.html');
    const html = injectProductImportCleanupAssets(fs.readFileSync(filePath, 'utf8'))
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

app.use(express.static(publicDir, { etag: true, maxAge: env.nodeEnv === 'production' ? '5m' : 0, index: false }));
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/loyalty/checkout', makeRateLimiter({ windowMs: 60 * 1000, max: 60, keyPrefix: 'loyalty-checkout' }), loyaltyCheckoutRoutes);
mountPlatformModules(app, { makeRateLimiter, requireAdminSession });
app.use('/api/admin/ai', makeRateLimiter({ windowMs: 60 * 1000, max: 30, keyPrefix: 'admin-ai' }), requireAdminSession, aiEmailModuleRoutes);
app.use('/api/admin/email-module-library', requireAdminSession, emailModuleLibraryRoutes);
app.use('/api/admin/review-migrations', reviewMigrationRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin/loyalty', loyaltyRoutes);
app.use('/api/admin', adminRoutes);

app.patch('/api/reviews/:id', requireAdminSession, (req, res, next) => { req.url = `/reviews/${req.params.id}`; return adminRoutes(req, res, next); });
app.post('/api/reviews/import', requireAdminSession, (req, res, next) => { req.url = '/reviews/import'; return adminRoutes(req, res, next); });
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use(errorHandler);
module.exports = app;
