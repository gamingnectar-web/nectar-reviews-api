const crypto = require('crypto');
const { env } = require('../config/env');
const { cleanShopDomain, isValidShopDomain } = require('./validation');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

const corsOptions = {
  origin(origin, cb) { cb(null, true); },
  credentials: true,
};

function makeRateLimiter({ windowMs = 60000, max = 60, keyPrefix = 'rl' } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || req.headers['x-forwarded-for'] || 'local'}`;
    const now = Date.now();
    const current = hits.get(key) || { reset: now + windowMs, count: 0 };
    if (current.reset < now) { current.reset = now + windowMs; current.count = 0; }
    current.count += 1;
    hits.set(key, current);
    if (current.count > max) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map(v => v.trim()).filter(Boolean).map(pair => {
    const idx = pair.indexOf('=');
    return idx >= 0 ? [decodeURIComponent(pair.slice(0, idx)), decodeURIComponent(pair.slice(idx + 1))] : [pair, ''];
  }));
}

function sessionSignature(shopDomain) {
  return crypto.createHmac('sha256', env.adminSharedSecret || env.reviewTokenSecret).update(shopDomain).digest('hex');
}

function setAdminSessionCookie(res, shopDomain) {
  const shop = cleanShopDomain(shopDomain);
  const payload = `${shop}.${sessionSignature(shop)}`;
  res.setHeader('Set-Cookie', `nectar_admin_session=${encodeURIComponent(payload)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=604800`);
}

function resolveShopDomain(req) {
  return cleanShopDomain(req.query.shopDomain || req.query.shop || req.body?.shopDomain || req.headers['x-shop-domain'] || '');
}

function requireAdminSession(req, res, next) {
  const shopDomain = resolveShopDomain(req);
  if (shopDomain && isValidShopDomain(shopDomain)) req.shopDomain = shopDomain;
  const providedSecret = req.query.admin_secret || req.headers['x-admin-secret'];
  if (env.allowUnauthenticatedAdmin) return next();
  if (providedSecret && env.adminSharedSecret && providedSecret === env.adminSharedSecret) return next();
  const cookies = parseCookies(req.headers.cookie || '');
  const [shop, sig] = String(cookies.nectar_admin_session || '').split('.');
  if (shop && sig && sig === sessionSignature(shop)) { req.shopDomain = shop; return next(); }
  if (!env.adminSharedSecret && env.nodeEnv !== 'production') return next();
  return res.status(401).json({ error: 'Admin session required. Open through Shopify OAuth or provide a dev admin secret.' });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  const status = Number(err.status || err.statusCode || 500);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message, detail: env.nodeEnv === 'production' ? undefined : err.message });
}

module.exports = { securityHeaders, corsOptions, makeRateLimiter, errorHandler, requireAdminSession, setAdminSessionCookie, resolveShopDomain };
