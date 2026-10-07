const crypto = require('crypto');

function baseSecret() {
  const raw =
    process.env.ELEV8_WORKFLOWS_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.SHOPIFY_API_SECRET ||
    '';
  if (!raw || raw.length < 16) {
    throw new Error('Set ELEV8_WORKFLOWS_SECRET (32+ random characters recommended) before storing workflow credentials.');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const key = baseSecret();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decrypt(payload) {
  if (!payload) return null;
  const [iv64, tag64, data64] = String(payload).split('.');
  const key = baseSecret();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(data64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

function createToken() {
  const value = `e8wf_${crypto.randomBytes(30).toString('base64url')}`;
  return {
    value,
    hash: crypto.createHash('sha256').update(value).digest('hex'),
    prefix: value.slice(0, 12),
  };
}

function tokenHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

module.exports = { encrypt, decrypt, createToken, tokenHash };
