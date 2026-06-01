const crypto = require('crypto');
const { env } = require('../config/env');

function getCredentialKey() {
  const secret = env.emailCredentialSecret;
  if (!secret || secret.length < 16) {
    throw new Error('EMAIL_CREDENTIAL_SECRET must be set and should be a long random string.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCredentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptSecret(value) {
  if (!value) return '';
  const [ivHex, tagHex, encryptedHex] = String(value).split(':');
  if (!ivHex || !tagHex || !encryptedHex) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', getCredentialKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function hashValue(value, length = 24) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function base64UrlDecode(input) {
  const fixed = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = fixed + '='.repeat((4 - (fixed.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

module.exports = {
  encryptSecret,
  decryptSecret,
  hashValue,
  timingSafeEqualString,
  base64UrlDecode,
  base64UrlEncode,
};
