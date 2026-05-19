const crypto = require('crypto');
const { config } = require('../config');

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

function requireAdminApi(req, res, next) {
  const mode = config.security.adminAuthMode;
  if (mode === 'off') return next();

  const expected = config.security.adminApiSecret;
  if (!expected) {
    return res.status(503).json({
      error: 'Admin API protection is enabled but ADMIN_API_SECRET is not configured.'
    });
  }

  const provided = req.get('x-nectar-admin-token') || readBearerToken(req);
  if (!safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  return next();
}

module.exports = { requireAdminApi };
