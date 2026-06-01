const crypto = require('crypto');
const { env } = require('../config/env');
const { base64UrlDecode, base64UrlEncode, timingSafeEqualString } = require('./crypto');
const { cleanShopDomain, isValidShopDomain, getClientIp } = require('./validation');

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
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Do not set X-Frame-Options here. Shopify embedded apps rely on CSP frame-ancestors;
  // Chromium ignores ALLOW-FROM and can show 'refused to connect' when XFO is present.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function makeRateLimiter({ windowMs = 60000, max = 60, keyPrefix = 'global' } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const current = hits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }
    current.count += 1;
    hits.set(key, current);

    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }

    if (Math.random() < 0.01) {
      for (const [storedKey, value] of hits.entries()) {
        if (now > value.resetAt) hits.delete(storedKey);
      }
    }

    next();
  };
}

function corsOptions(req, callback) {
  const origin = req.header('Origin');
  const isAdminRoute = req.path.startsWith('/api/admin') || req.path.startsWith('/admin');

  if (!origin) {
    return callback(null, { origin: true });
  }

  if (!isAdminRoute) {
    return callback(null, { origin: true });
  }

  const allowed = new Set(env.allowedAdminOrigins.filter(Boolean));
  if (origin.endsWith('.myshopify.com') || allowed.has(origin)) {
    return callback(null, { origin: true, credentials: true });
  }

  return callback(null, { origin: false });
}

function verifyShopifySessionToken(token) {
  if (!env.shopifyApiSecret) {
    return { ok: false, error: 'SHOPIFY_API_SECRET is not configured' };
  }

  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, error: 'Malformed token' };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (error) {
    return { ok: false, error: 'Could not decode token' };
  }

  if (header.alg !== 'HS256') return { ok: false, error: 'Unsupported token algorithm' };

  const expected = base64UrlEncode(
    crypto.createHmac('sha256', env.shopifyApiSecret).update(`${headerB64}.${payloadB64}`).digest()
  );
  if (!timingSafeEqualString(expected, signatureB64)) {
    return { ok: false, error: 'Invalid token signature' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && Number(payload.exp) < now) return { ok: false, error: 'Token has expired' };
  if (payload.nbf && Number(payload.nbf) > now + 5) return { ok: false, error: 'Token is not valid yet' };
  if (payload.aud && env.shopifyApiKey && payload.aud !== env.shopifyApiKey) {
    return { ok: false, error: 'Token audience mismatch' };
  }

  const dest = String(payload.dest || payload.iss || '').replace(/^https?:\/\//, '').split('/')[0];
  const shopDomain = cleanShopDomain(dest);
  if (!shopDomain || !isValidShopDomain(shopDomain)) {
    return { ok: false, error: 'Token does not contain a valid shop' };
  }

  return { ok: true, shopDomain, payload };
}


function adminSessionSecret() {
  return env.shopifyApiSecret || env.emailCredentialSecret || env.adminSharedSecret || '';
}

function createAdminAuthToken(shopDomain, ttlMs = 8 * 60 * 60 * 1000) {
  const secret = adminSessionSecret();
  if (!secret) return '';
  const payload = {
    shop: cleanShopDomain(shopDomain),
    exp: Date.now() + ttlMs,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
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
  try { payload = JSON.parse(base64UrlDecode(body)); } catch (error) { return { ok: false, error: 'Could not decode admin token.' }; }
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
  // Keep the original cookie for backwards compatibility, and add a neutral name for white-label builds.
  res.cookie('nectar_admin_session', token, cookieOptions);
  res.cookie('platform_admin_session', token, cookieOptions);
  if (exposeHeader) res.setHeader('X-Admin-Session-Token', token);
  return token;
}

function isExpectedAuthExpiry(error) {
  return /expired/i.test(String(error || ''));
}

function extractRequestedShop(req) {
  return cleanShopDomain(
    req.query.shopDomain ||
    req.query.shop ||
    req.body?.shopDomain ||
    req.body?.shop ||
    req.headers['x-shop-domain'] ||
    ''
  );
}

function requireAdminSession(req, res, next) {
  const requestedShop = extractRequestedShop(req);
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (bearer) {
    const verified = verifyShopifySessionToken(bearer);
    if (verified.ok) {
      if (requestedShop && requestedShop !== verified.shopDomain) {
        return res.status(403).json({ error: 'Shop mismatch.' });
      }
      req.shopDomain = verified.shopDomain;
      req.adminAuthMode = 'shopify-session-token';
      // Shopify session tokens only live for about a minute. When a fresh one is valid,
      // refresh our longer-lived signed admin session silently for fallback/admin helpers.
      setAdminSessionCookie(res, verified.shopDomain, { exposeHeader: true });
      return next();
    }
    if (!isExpectedAuthExpiry(verified.error)) console.warn('Admin token rejected:', verified.error);
  }

  const cookies = parseCookies(req.headers.cookie);
  const signedToken = String(req.headers['x-nectar-admin-token'] || req.query.admin_token || cookies.platform_admin_session || cookies.nectar_admin_session || '');
  if (signedToken) {
    const verified = verifyAdminAuthToken(signedToken, requestedShop);
    if (verified.ok) {
      req.shopDomain = verified.shopDomain;
      req.adminAuthMode = 'signed-admin-session';
      return next();
    }
    if (!isExpectedAuthExpiry(verified.error)) console.warn('Signed admin session rejected:', verified.error);
  }

  const sharedSecret = String(req.headers['x-nectar-admin-secret'] || req.query.admin_secret || '');
  if (env.adminSharedSecret && sharedSecret && timingSafeEqualString(sharedSecret, env.adminSharedSecret)) {
    if (!requestedShop || !isValidShopDomain(requestedShop)) {
      return res.status(400).json({ error: 'Valid shopDomain is required.' });
    }
    req.shopDomain = requestedShop;
    req.adminAuthMode = 'admin-shared-secret';
    setAdminSessionCookie(res, requestedShop);
    return next();
  }

  if (env.allowUnauthenticatedAdmin && env.nodeEnv !== 'production') {
    if (!requestedShop || !isValidShopDomain(requestedShop)) {
      return res.status(400).json({ error: 'Valid shopDomain is required.' });
    }
    req.shopDomain = requestedShop;
    req.adminAuthMode = 'development-unprotected';
    return next();
  }

  res.setHeader('X-Admin-Auth-Required', '1');
  return res.status(401).json({
    error: 'Admin authentication required.',
    detail: 'Open the app through Shopify OAuth, use Shopify App Bridge session tokens, or use ADMIN_SHARED_SECRET for temporary development access.',
  });
}

function errorHandler(error, req, res, next) {
  console.error('Unhandled API error:', error);
  if (res.headersSent) return next(error);
  return res.status(error.status || 500).json({ error: error.publicMessage || 'Something went wrong.' });
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
};
