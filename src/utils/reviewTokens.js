const crypto = require('crypto');
const { env } = require('../config/env');
const { sha256 } = require('./crypto');
function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.reviewTokenSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyPayload(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) throw new Error('Invalid token');
  const expected = crypto.createHmac('sha256', env.reviewTokenSecret).update(body).digest('base64url');
  if (expected !== sig) throw new Error('Invalid token signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && Date.now() > payload.exp) throw new Error('Token expired');
  return payload;
}
function hashToken(token) { return sha256(token); }
module.exports = { signPayload, verifyPayload, hashToken };
