const crypto = require('crypto');
const { env } = require('../config/env');
const { base64UrlEncode, base64UrlDecode, timingSafeEqualString } = require('./crypto');
const { cleanShopDomain, cleanText, cleanEmail, isValidShopDomain } = require('./validation');

const TOKEN_VERSION = 'rv1';

function tokenSecret() {
  return env.emailCredentialSecret || env.shopifyApiSecret || env.adminSharedSecret || '';
}

function normaliseId(value) {
  const raw = cleanText(value, 220);
  if (!raw) return '';
  const stripped = raw.replace(/^gid:\/\/shopify\/(Product|Variant)\//, '');
  const digits = stripped.match(/\d{5,}/g);
  return digits && digits.length ? digits[digits.length - 1] : stripped;
}

function normaliseProduct(product = {}) {
  const id = normaliseId(product.productId || product.itemId || product.id);
  const variantId = normaliseId(product.variantId || product.variant_id || product.variant || '');
  return {
    id,
    productId: id,
    variantId,
    title: cleanText(product.title || product.name || 'Product', 240) || 'Product',
    name: cleanText(product.name || product.title || 'Product', 240) || 'Product',
    image: cleanText(product.image || product.imageUrl || product.productImage || '', 1000),
    tags: Array.isArray(product.tags) ? product.tags.map((tag) => cleanText(tag, 80)).filter(Boolean) : [],
  };
}

function productMatchesToken(productId, tokenPayload = {}) {
  const target = normaliseId(productId);
  if (!target) return false;
  const products = Array.isArray(tokenPayload.products) ? tokenPayload.products : [];
  return products.some((product) => {
    const p = normaliseId(product.productId || product.id);
    const v = normaliseId(product.variantId || product.variant_id);
    return target === p || target === v;
  });
}

function createReviewToken(input = {}) {
  const secret = tokenSecret();
  if (!secret) return '';
  const shop = cleanShopDomain(input.shopDomain || input.shop);
  if (!shop || !isValidShopDomain(shop)) return '';
  const expiresMs = Math.max(1, Math.min(90, Number(input.expiresDays || 30))) * 24 * 60 * 60 * 1000;
  const payload = {
    v: 1,
    purpose: 'review_request',
    shop,
    email: cleanEmail(input.email),
    customerName: cleanText(input.customerName || input.name || '', 120),
    orderId: cleanText(input.orderId || input.order || '', 120),
    orderDate: cleanText(input.orderDate || input.createdAt || input.orderCreatedAt || '', 80),
    orderName: cleanText(input.orderName || input.orderDisplayName || '', 120),
    products: Array.isArray(input.products) ? input.products.map(normaliseProduct).filter((p) => p.id).map((p) => ({ id: p.id, productId: p.id, variantId: p.variantId, title: p.title, name: p.name, image: p.image })) : [],
    testMode: Boolean(input.testMode || input.isPreview),
    iat: Date.now(),
    exp: Date.now() + expiresMs,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = base64UrlEncode(crypto.createHmac('sha256', secret).update(`${TOKEN_VERSION}.${body}`).digest());
  return `${TOKEN_VERSION}.${body}.${sig}`;
}

function verifyReviewToken(token, expected = {}) {
  const secret = tokenSecret();
  if (!secret) return { ok: false, error: 'Review token secret is not configured.' };
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { ok: false, error: 'Malformed review token.' };
  const [, body, sig] = parts;
  const expectedSig = base64UrlEncode(crypto.createHmac('sha256', secret).update(`${TOKEN_VERSION}.${body}`).digest());
  if (!timingSafeEqualString(expectedSig, sig)) return { ok: false, error: 'Invalid review token signature.' };
  let payload;
  try { payload = JSON.parse(base64UrlDecode(body)); } catch (error) { return { ok: false, error: 'Could not decode review token.' }; }
  const shop = cleanShopDomain(payload.shop);
  if (!shop || !isValidShopDomain(shop)) return { ok: false, error: 'Review token has invalid shop.' };
  const expectedShop = cleanShopDomain(expected.shopDomain || expected.shop);
  if (expectedShop && expectedShop !== shop) return { ok: false, error: 'Review token shop mismatch.' };
  if (!payload.exp || Number(payload.exp) < Date.now()) return { ok: false, error: 'Review token has expired.' };
  if (payload.purpose !== 'review_request') return { ok: false, error: 'Review token purpose mismatch.' };
  const expectedEmail = cleanEmail(expected.email);
  const tokenEmail = cleanEmail(payload.email);
  if (expectedEmail && tokenEmail && expectedEmail !== tokenEmail) return { ok: false, error: 'Review token email mismatch.' };
  const expectedOrder = cleanText(expected.orderId || expected.order, 120);
  if (expectedOrder && payload.orderId && expectedOrder !== payload.orderId) return { ok: false, error: 'Review token order mismatch.' };
  const expectedItemId = normaliseId(expected.itemId || expected.productId);
  if (expectedItemId && !productMatchesToken(expectedItemId, payload)) return { ok: false, error: 'This product was not included in the signed review request.' };
  return { ok: true, payload };
}

module.exports = {
  createReviewToken,
  verifyReviewToken,
  productMatchesToken,
  normaliseProduct,
  normaliseId,
};
