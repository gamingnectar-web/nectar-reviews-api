const crypto = require('crypto');
const { env } = require('../../../config/env');
const { encryptSecret, decryptSecret } = require('../../../utils/crypto');

function privacySecret() {
  const secret = env.emailCredentialSecret;
  if (!secret || secret.length < 16) {
    throw new Error('EMAIL_CREDENTIAL_SECRET must be configured for notification privacy hardening.');
  }
  return secret;
}

function anonymousRef(shopDomain, purpose, value) {
  if (value === undefined || value === null || value === '') return '';
  return crypto
    .createHmac('sha256', privacySecret())
    .update(`${String(shopDomain || '').toLowerCase()}|${String(purpose || 'ref')}|${String(value)}`)
    .digest('hex');
}

function publicRef(value = '') {
  const raw = String(value || '');
  return raw ? raw.slice(0, 12) : '';
}

function sealText(value) {
  return value === undefined || value === null || value === '' ? '' : encryptSecret(String(value));
}

function openText(value) {
  if (!value) return '';
  try { return decryptSecret(value); } catch (_) { return ''; }
}

function sealJson(value) {
  if (value === undefined || value === null) return '';
  return encryptSecret(JSON.stringify(value));
}

function openJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(decryptSecret(value));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) { return fallback; }
}

function redactText(value = '') {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/gid:\/\/shopify\/Customer\/\d+/gi, 'gid://shopify/Customer/[redacted]')
    .replace(/\b(customer|order|tracking)[ _-]?(id|number)?\s*[:=]\s*[A-Za-z0-9#_-]+/gi, '$1 $2=[redacted]')
    .slice(0, 800);
}

function scrubMeta(value, shopDomain) {
  if (Array.isArray(value)) return value.map((item) => scrubMeta(item, shopDomain));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const k = String(key || '').toLowerCase();
    if (k === 'customerid' || k === 'customer_id') {
      out.customerRef = anonymousRef(shopDomain, 'customer', item);
      continue;
    }
    if (k.includes('email')) {
      out[`${key}Hash`] = anonymousRef(shopDomain, 'email', String(item || '').toLowerCase());
      continue;
    }
    if (k.includes('tracking') || k === 'orderid' || k === 'order_id' || k === 'ordername' || k === 'order_name') {
      out[`${key}Ref`] = anonymousRef(shopDomain, key, item);
      continue;
    }
    out[key] = scrubMeta(item, shopDomain);
  }
  return out;
}

module.exports = {
  anonymousRef,
  publicRef,
  sealText,
  openText,
  sealJson,
  openJson,
  redactText,
  scrubMeta,
};
