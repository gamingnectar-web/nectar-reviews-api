const crypto = require('crypto');
const { env } = require('../config/env');
const { base64UrlDecode, base64UrlEncode, timingSafeEqualString } = require('./crypto');
const { cleanShopDomain, isValidShopDomain } = require('./validation');

function securityHeaders(req, res, next) {
  const csp = [
    "default-src 'self' https:",
    "script-src 'self' 'unsafe-inline' https://cdn.shopify.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (env.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function makeRateLimiter({ windowMs = 60000, max = 60, keyPrefix = 'global' } = {}) {
  const hits = new Map();
  const MAX_TRACKED_KEYS = 20000;
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${clientIp(req)}`;
    const current = hits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }
    current.count += 1;
    hits.set(key, current);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - current.count)));
    res.setHeader('RateLimit-Reset', String(Math.max(0, Math.ceil((current.resetAt - now) / 1000))));

    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }

    if (hits.size > MAX_TRACKED_KEYS || Math.random() < 0.01) {
      for (const [storedKey, value] of hits.entries()) {
        if (now > value.resetAt || hits.size > MAX_TRACKED_KEYS) hits.delete(storedKey);
        if (hits.size <= MAX_TRACKED_KEYS) break;
      }
    }
    next();
  };
}

function originString(value) {
  try { return new URL(String(value || '')).origin.toLowerCase(); }
  catch (_) { return ''; }
}

function allowedAdminOrigin(origin) {
  const normalized = originString(origin);
  if (!normalized) return false;
  const allowed = new Set(env.allowedAdminOrigins.map(originString).filter(Boolean));
  if (env.appUrl) allowed.add(originString(env.appUrl));
  allowed.add('https://admin.shopify.com');
  return allowed.has(normalized);
}

function corsOptions(req, callback) {
  const origin = req.header('Origin');
  const isAdminRoute = req.path.startsWith('/api/admin') || req.path.startsWith('/admin');

  if (!origin) return callback(null, { origin: false });
  if (!isAdminRoute) {
    return callback(null, { origin: true, credentials: false, methods: ['GET', 'HEAD', 'POST', 'OPTIONS'] });
  }
  if (allowedAdminOrigin(origin)) return callback(null, { origin: true, credentials: true });
  return callback(null, { origin: false });
}

function verifyShopifySessionToken(token) {
  if (!env.shopifyApiSecret) return { ok: false, error: 'SHOPIFY_API_SECRET is not configured' };
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, error: 'Malformed token' };
  const [headerB64, payloadB64, signatureB64] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (_) {
    return { ok: false, error: 'Could not decode token' };
  }
  if (header.alg !== 'HS256') return { ok: false, error: 'Unsupported token algorithm' };
  const expected = base64UrlEncode(crypto.createHmac('sha256', env.shopifyApiSecret).update(`${headerB64}.${payloadB64}`).digest());
  if (!timingSafeEqualString(expected, signatureB64)) return { ok: false, error: 'Invalid token signature' };
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) < now) return { ok: false, error: 'Token has expired' };
  if (payload.nbf && Number(payload.nbf) > now + 5) return { ok: false, error: 'Token is not valid yet' };
  if (payload.aud && env.shopifyApiKey && payload.aud !== env.shopifyApiKey) return { ok: false, error: 'Token audience mismatch' };
  const dest = String(payload.dest || payload.iss || '').replace(/^https?:\/\//, '').split('/')[0];
  const shopDomain = cleanShopDomain(dest);
  if (!shopDomain || !isValidShopDomain(shopDomain)) return { ok: false, error: 'Token does not contain a valid shop' };
  return { ok: true, shopDomain, payload };
}

function adminSessionSecret() {
  return env.shopifyApiSecret || env.emailCredentialSecret || env.adminSharedSecret || '';
}

function createAdminAuthToken(shopDomain, ttlMs = 8 * 60 * 60 * 1000) {
  const secret = adminSessionSecret();
  if (!secret) return '';
  const payload = { shop: cleanShopDomain(shopDomain), exp: Date.now() + ttlMs, nonce: crypto.randomBytes(12).toString('hex') };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = base64UrlEncode(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

function verifyAdminAuthToken(token, requestedShop = '') {
  const secret = adminSessionSecret();
  if (!secret) return { ok: false, error: 'Admin token secret is not configured.' };
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return { ok: false, error: 'Malformed admin token.' };
  const expected = base64UrlEncode(crypto.createHmac('sha256', secret).update(body).digest());
  if (!timingSafeEqualString(expected, sig)) return { ok: false, error: 'Invalid admin token signature.' };
  let payload;
  try { payload = JSON.parse(base64UrlDecode(body)); } catch (_) { return { ok: false, error: 'Could not decode admin token.' }; }
  const shopDomain = cleanShopDomain(payload.shop);
  if (!shopDomain || !isValidShopDomain(shopDomain)) return { ok: false, error: 'Admin token has invalid shop.' };
  if (requestedShop && requestedShop !== shopDomain) return { ok: false, error: 'Shop mismatch.' };
  if (!payload.exp || Number(payload.exp) < Date.now()) return { ok: false, error: 'Admin token expired.' };
  return { ok: true, shopDomain, payload };
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '').split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index < 0) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function setAdminSessionCookie(res, shopDomain, { exposeHeader = false } = {}) {
  const token = createAdminAuthToken(shopDomain);
  if (!token) return '';
  const cookieOptions = {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  };
  res.cookie('nectar_admin_session', token, cookieOptions);
  res.cookie('platform_admin_session', token, cookieOptions);
  if (exposeHeader) res.setHeader('X-Admin-Session-Token', token);
  return token;
}

function isExpectedAuthExpiry(error) { return /expired/i.test(String(error || '')); }

function extractRequestedShop(req) {
  return cleanShopDomain(req.query.shopDomain || req.query.shop || req.body?.shopDomain || req.body?.shop || req.headers['x-shop-domain'] || '');
}

function isUnsafeMethod(req) { return !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase()); }

function requireTrustedCookieOrigin(req, res) {
  if (!isUnsafeMethod(req)) return true;
  const origin = req.header('Origin');
  if (origin && allowedAdminOrigin(origin)) return true;
  res.status(403).json({ error: 'Untrusted admin request origin.' });
  return false;
}

function requireAdminSession(req, res, next) {
  const requestedShop = extractRequestedShop(req);
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) {
    const verified = verifyShopifySessionToken(bearer);
    if (verified.ok) {
      if (requestedShop && requestedShop !== verified.shopDomain) return res.status(403).json({ error: 'Shop mismatch.' });
      req.shopDomain = verified.shopDomain;
      req.adminAuthMode = 'shopify-session-token';
      setAdminSessionCookie(res, verified.shopDomain, { exposeHeader: true });
      return next();
    }
    if (!isExpectedAuthExpiry(verified.error)) console.warn('Admin token rejected:', verified.error);
  }

  const cookies = parseCookies(req.headers.cookie);
  const headerToken = String(req.headers['x-nectar-admin-token'] || '');
  const cookieToken = String(cookies.platform_admin_session || cookies.nectar_admin_session || '');
  const signedToken = headerToken || cookieToken;
  if (signedToken) {
    const verified = verifyAdminAuthToken(signedToken, requestedShop);
    if (verified.ok) {
      if (!headerToken && cookieToken && !requireTrustedCookieOrigin(req, res)) return;
      req.shopDomain = verified.shopDomain;
      req.adminAuthMode = headerToken ? 'signed-admin-header' : 'signed-admin-session';
      return next();
    }
    if (!isExpectedAuthExpiry(verified.error)) console.warn('Signed admin session rejected:', verified.error);
  }

  const sharedSecret = String(req.headers['x-nectar-admin-secret'] || '');
  if (env.adminSharedSecret && sharedSecret && timingSafeEqualString(sharedSecret, env.adminSharedSecret)) {
    if (!requestedShop || !isValidShopDomain(requestedShop)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    req.shopDomain = requestedShop;
    req.adminAuthMode = 'admin-shared-secret';
    setAdminSessionCookie(res, requestedShop);
    return next();
  }

  if (env.allowUnauthenticatedAdmin && env.nodeEnv !== 'production') {
    if (!requestedShop || !isValidShopDomain(requestedShop)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    req.shopDomain = requestedShop;
    req.adminAuthMode = 'development-unprotected';
    return next();
  }

  res.setHeader('X-Admin-Auth-Required', '1');
  return res.status(401).json({ error: 'Admin authentication required.', detail: 'Open the app through Shopify OAuth, use Shopify App Bridge session tokens, or use an authenticated admin header.' });
}

function errorHandler(error, req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomBytes(8).toString('hex');
  console.error('Unhandled API error:', { requestId, message: error.message, stack: env.nodeEnv === 'production' ? undefined : error.stack });
  if (res.headersSent) return next(error);
  return res.status(error.status || 500).json({ error: error.publicMessage || 'Something went wrong.', requestId });
}

module.exports = {
  securityHeaders,
  makeRateLimiter,
  corsOptions,
  requireAdminSession,
  verifyShopifySessionToken,
  createAdminAuthToken,
  verifyAdminAuthToken,
  setAdminSessionCookie,
  errorHandler,
  allowedAdminOrigin,
};
