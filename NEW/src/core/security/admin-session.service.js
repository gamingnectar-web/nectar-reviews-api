const crypto = require('crypto');
const { config } = require('../config');
const { cleanShopDomain } = require('../http/request-utils');

const VERSION = 'v1';
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(input) {
  const value = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sessionSecret() {
  return config.security.adminSessionSecret || config.shopify.apiSecret || config.security.adminApiSecret || '';
}

function signPayload(payload) {
  const secret = sessionSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createAdminSessionToken(shopDomain, options = {}) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!cleanShop) return '';
  const now = Date.now();
  const body = {
    v: VERSION,
    shopDomain: cleanShop,
    issuedAt: now,
    expiresAt: now + Number(options.ttlMs || DEFAULT_TTL_MS),
    source: options.source || 'shopify-admin'
  };
  const payload = base64url(JSON.stringify(body));
  const signature = signPayload(payload);
  if (!signature) return '';
  return `${payload}.${signature}`;
}

function verifyAdminSessionToken(token) {
  const raw = String(token || '').trim();
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = signPayload(payload);
  if (!expected) return null;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return null;
  try {
    if (!crypto.timingSafeEqual(left, right)) return null;
  } catch (_) {
    return null;
  }

  let body;
  try {
    body = JSON.parse(fromBase64url(payload));
  } catch (_) {
    return null;
  }

  if (body.v !== VERSION) return null;
  if (!body.shopDomain || Date.now() > Number(body.expiresAt || 0)) return null;
  return {
    shopDomain: cleanShopDomain(body.shopDomain),
    issuedAt: body.issuedAt,
    expiresAt: body.expiresAt,
    source: body.source || 'unknown'
  };
}

function readSessionToken(req) {
  return req.get('x-nectar-admin-session') || req.query.adminSession || '';
}

module.exports = {
  createAdminSessionToken,
  verifyAdminSessionToken,
  readSessionToken
};
