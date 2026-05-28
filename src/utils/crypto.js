const crypto = require('crypto');
function sha256(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function safeCompare(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
module.exports = { sha256, safeCompare };
