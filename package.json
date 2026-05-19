function cleanShopDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function isValidShopDomain(value) {
  const shop = cleanShopDomain(value);
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(shop);
}

function cleanText(value, max = 1000) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, max);
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function cleanReviewStatus(value) {
  const allowed = new Set(['pending', 'accepted', 'rejected', 'hold', 'spam']);
  const status = String(value || '').toLowerCase();
  return allowed.has(status) ? status : null;
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || '';
}

module.exports = {
  cleanShopDomain,
  isValidShopDomain,
  cleanText,
  cleanEmail,
  clampNumber,
  cleanReviewStatus,
  getClientIp,
};
