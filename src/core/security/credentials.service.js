const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getEmailSecret() {
  const secret = process.env.EMAIL_CREDENTIAL_SECRET || process.env.SESSION_SECRET || process.env.SHOPIFY_API_SECRET || '';
  if (!secret) throw new Error('EMAIL_CREDENTIAL_SECRET, SESSION_SECRET or SHOPIFY_API_SECRET is required for credential encryption.');
  return crypto.createHash('sha256').update(secret).digest();
}

function createToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashValue(value, secret = process.env.CUSTOMER_ID_SECRET || process.env.SESSION_SECRET || process.env.SHOPIFY_API_SECRET || 'development-only') {
  return crypto.createHmac('sha256', secret).update(String(value || '')).digest('hex');
}

function encryptSecret(value) {
  const plain = String(value || '');
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEmailSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptSecret(payload) {
  const value = String(payload || '');
  if (!value) return '';
  const [ivHex, tagHex, encryptedHex] = value.split(':');
  if (!ivHex || !tagHex || !encryptedHex) return '';
  const decipher = crypto.createDecipheriv(ALGO, getEmailSecret(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { createToken, hashValue, encryptSecret, decryptSecret };
