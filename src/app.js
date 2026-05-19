const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { env } = require('./config/env');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const { securityHeaders, corsOptions, makeRateLimiter, errorHandler, requireAdminSession } = require('./utils/security');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: env.jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: env.jsonLimit }));

app.use('/api/admin', makeRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'admin' }));
app.use('/api/reviews', makeRateLimiter({ windowMs: 60 * 1000, max: 60, keyPrefix: 'reviews' }));
app.use('/api/admin/test-email', makeRateLimiter({ windowMs: 60 * 1000, max: 10, keyPrefix: 'test-email' }));
app.use('/api/campaign', makeRateLimiter({ windowMs: 60 * 1000, max: 300, keyPrefix: 'campaign' }));

app.get('/', (req, res) => {
  return res.json({
    ok: true,
    service: 'Nectar Reviews API',
    status: 'running',
    admin: '/admin',
    health: '/health',
  });
});

app.get('/health', (req, res) => {
  return res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/admin', (req, res) => {
  const filePath = path.join(publicDir, 'admin.html');
  const html = fs.readFileSync(filePath, 'utf8')
    .replace(/__SHOPIFY_API_KEY__/g, env.shopifyApiKey || '')
    .replace(/__APP_URL__/g, env.appUrl || '');
  return res.type('html').send(html);
});

app.use(express.static(publicDir, {
  etag: true,
  maxAge: env.nodeEnv === 'production' ? '5m' : 0,
  index: false,
}));

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Backwards-compatible admin update/import paths used by the older dashboard JS.
app.patch('/api/reviews/:id', requireAdminSession, (req, res, next) => {
  req.url = `/reviews/${req.params.id}`;
  return adminRoutes(req, res, next);
});

app.post('/api/reviews/import', requireAdminSession, (req, res, next) => {
  req.url = '/reviews/import';
  return adminRoutes(req, res, next);
});

app.use((req, res) => {
  return res.status(404).json({ error: 'Not found', path: req.path });
});

app.use(errorHandler);

module.exports = app;
