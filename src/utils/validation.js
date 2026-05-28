function cleanText(value = '', max = 1000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function cleanEmail(value = '') {
  const email = cleanText(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanShopDomain(value = '') {
  return cleanText(value, 255).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function isValidShopDomain(value = '') {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleanShopDomain(value));
}

module.exports = { cleanText, cleanEmail, clampNumber, cleanShopDomain, isValidShopDomain };
