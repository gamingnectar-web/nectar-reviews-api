const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { env } = require('./config/env');
const { getLoyaltyConnection } = require('./config/db');
const { Review, Settings, Shop } = require('./models');
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
const { securityHeaders, corsOptions, makeRateLimiter, errorHandler, requireAdminSession, setAdminSessionCookie } = require('./utils/security');
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

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use('/api/webhooks', shopifyWebhookRoutes);
app.use(express.json({ limit: env.jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: env.jsonLimit }));

app.get('/', (req, res) => res.json({ ok: true, service: 'Nectar Reviews API', status: 'running', admin: '/admin', health: '/health' }));
app.get('/health', (req, res) => res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() }));
app.get('/health/db', (req, res) => {
  const loyaltyConn = getLoyaltyConnection();
  res.json({
    ok: true,
    coreDb: { configured: Boolean(env.mongoUri), readyState: mongoose.connection.readyState, database: mongoose.connection.name || null },
    loyaltyDb: { configured: Boolean(env.loyaltyMongoUri), usingSeparateConnection: Boolean(env.loyaltyMongoUri), readyState: loyaltyConn?.readyState ?? null, database: loyaltyConn?.name || null },
    timestamp: new Date().toISOString(),
  });
});

app.get('/admin', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain || '');
    const hasDevSecret = Boolean(req.query.admin_secret);
    const justInstalled = Boolean(req.query.installed);
    if (shopDomain && hasDevSecret && env.adminSharedSecret && String(req.query.admin_secret || '') === env.adminSharedSecret) setAdminSessionCookie(res, shopDomain);
    if (shopDomain && isValidShopDomain(shopDomain) && !hasDevSecret && !justInstalled && env.shopifyApiKey && env.shopifyApiSecret && env.appUrl) {
      const shop = await Shop.findOne({ shopDomain }).select('accessToken accessTokenEncrypted').lean();
      if (!shop?.accessToken && !shop?.accessTokenEncrypted) return res.redirect(302, `/auth/shopify?shop=${encodeURIComponent(shopDomain)}`);
    }
    const filePath = path.join(publicDir, 'admin.html');
    const html = fs.readFileSync(filePath, 'utf8').replace(/__SHOPIFY_API_KEY__/g, env.shopifyApiKey || '').replace(/__APP_URL__/g, env.appUrl || '');
    res.type('html').send(html);
  } catch (error) { next(error); }
});

app.get('/review-widget.js', (req, res) => {
  const js = fs.readFileSync(path.join(publicDir, 'review-widget.js'), 'utf8').replace(/__APP_URL__/g, env.appUrl || '');
  res.type('application/javascript; charset=utf-8').set('Cache-Control', env.nodeEnv === 'production' ? 'public, max-age=300' : 'no-store').send(js);
});

app.use(express.static(publicDir, { etag: true, maxAge: env.nodeEnv === 'production' ? '5m' : 0, index: false }));

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tasks', makeRateLimiter({ windowMs: 60 * 1000, max: 30, keyPrefix: 'tasks' }), taskRoutes);
app.use('/api/loyalty/checkout', makeRateLimiter({ windowMs: 60 * 1000, max: 60, keyPrefix: 'loyalty-checkout' }), loyaltyCheckoutRoutes);
mountPlatformModules(app, { makeRateLimiter, requireAdminSession });
app.use('/api/admin/email-module-library', makeRateLimiter({ windowMs: 60 * 1000, max: 80, keyPrefix: 'email-module-library' }), requireAdminSession, emailModuleLibraryRoutes);
app.use('/api/admin/ai', makeRateLimiter({ windowMs: 60 * 1000, max: 20, keyPrefix: 'admin-ai' }), requireAdminSession, aiEmailModuleRoutes);
app.use('/api/admin/review-migrations', reviewMigrationRoutes);
app.use('/api/admin/loyalty', makeRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'admin-loyalty' }), requireAdminSession, loyaltyRoutes);
app.use('/api/admin', makeRateLimiter({ windowMs: 60 * 1000, max: 180, keyPrefix: 'admin' }), requireAdminSession, adminRoutes);
app.use('/api', publicRoutes);

// Backwards-compatible admin update/import paths used by older dashboard JS.
app.patch('/api/reviews/:id', requireAdminSession, (req, res, next) => { req.url = `/reviews/${req.params.id}`; return adminRoutes(req, res, next); });
app.post('/api/reviews/import', requireAdminSession, (req, res, next) => { req.url = '/reviews/import'; return adminRoutes(req, res, next); });
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use(errorHandler);
module.exports = app;
