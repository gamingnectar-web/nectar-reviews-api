const crypto = require('crypto');
const { config } = require('../config');
const { getShopDomainFromRequest, cleanShopDomain } = require('../http/request-utils');
const { readSessionToken, verifyAdminSessionToken } = require('./admin-session.service');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}

function readBearerToken(req) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function hasValidSharedSecret(req) {
  const expected = config.security.adminApiSecret;
  if (!expected) return false;
  const provided = req.get('x-nectar-admin-token') || readBearerToken(req);
  return safeEqual(provided, expected);
}

function hasValidShopSession(req) {
  const session = verifyAdminSessionToken(readSessionToken(req));
  if (!session?.shopDomain) return false;
  const requestedShop = cleanShopDomain(getShopDomainFromRequest(req));
  if (requestedShop && requestedShop !== session.shopDomain) return false;
  req.adminSession = session;
  req.shopDomain = session.shopDomain;
  return true;
}

function requireAdminApi(req, res, next) {
  const mode = config.security.adminAuthMode;
  if (mode === 'off') return next();

  if (mode === 'strict_shared_secret') {
    if (hasValidSharedSecret(req)) return next();
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  // Default and backwards compatible modes: installed Shopify admin session is enough.
  // ADMIN_API_SECRET remains as a break-glass/development fallback and is not shown in the UI.
  if (hasValidShopSession(req) || hasValidSharedSecret(req)) return next();

  return res.status(401).json({
    error: 'Admin session required. Open the app from Shopify Admin, or use ADMIN_API_SECRET only for development.'
  });
}

module.exports = { requireAdminApi };
