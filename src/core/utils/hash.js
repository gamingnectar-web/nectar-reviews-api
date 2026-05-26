const crypto = require('crypto');
const { env } = require('../../config/env');

function stableHash(value, namespace = 'default') {
  if (value === undefined || value === null || value === '') return '';
  return crypto
    .createHmac('sha256', env.tokenSigningSecret)
    .update(`${namespace}:${String(value).trim().toLowerCase()}`)
    .digest('hex');
}

function createRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function signPayload(payload, expiresAt) {
  const body = Buffer.from(JSON.stringify({ payload, expiresAt }), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', env.tokenSigningSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySignedPayload(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', env.tokenSigningSecret).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
  return parsed.payload;
}

module.exports = { stableHash, createRandomToken, signPayload, verifySignedPayload };
