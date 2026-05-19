const crypto = require('crypto');
const { config } = require('../config');
const { cleanShopDomain } = require('../http/request-utils');
const { hashValue } = require('./credentials.service');

function normaliseCustomerId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const gidMatch = raw.match(/Customer\/(\d+)/i);
  if (gidMatch) return gidMatch[1];
  return raw.replace(/[^a-zA-Z0-9:_-]/g, '');
}

function ensureCustomerSecret() {
  const secret = config.security.customerIdSecret;
  if (!secret) {
    const error = new Error('CUSTOMER_ID_SECRET, SESSION_SECRET or SHOPIFY_API_SECRET must be set before storing customer loyalty records.');
    error.statusCode = 503;
    throw error;
  }
  return secret;
}

function createCustomerKey(shopDomain, customerId) {
  const cleanShop = cleanShopDomain(shopDomain);
  const cleanCustomerId = normaliseCustomerId(customerId);
  if (!cleanShop || !cleanCustomerId) return '';
  return crypto.createHmac('sha256', ensureCustomerSecret()).update(`${cleanShop}:${cleanCustomerId}`).digest('hex');
}

function publicCustomerRef(customerKey) {
  const key = String(customerKey || '');
  return key ? `cust_${key.slice(0, 10)}` : '';
}

function createScopedHash(shopDomain, value, namespace = 'default') {
  const cleanShop = cleanShopDomain(shopDomain);
  const raw = String(value || '').trim();
  if (!cleanShop || !raw) return '';
  return hashValue(`${namespace}:${cleanShop}:${raw}`, ensureCustomerSecret());
}

function getCustomerIdFromOrder(order = {}) {
  return order.customer?.admin_graphql_api_id || order.customer?.id || order.customer_id || '';
}

function getCustomerKeyFromOrder(shopDomain, order = {}) {
  return createCustomerKey(shopDomain, getCustomerIdFromOrder(order));
}

function getCustomerIdFromAppProxyRequest(req) {
  return req.query.logged_in_customer_id || req.body?.logged_in_customer_id || '';
}

function getCustomerKeyFromAppProxyRequest(req) {
  const shopDomain = req.shopDomain || req.query.shop || req.query.shopDomain || req.body?.shop || req.body?.shopDomain || '';
  return createCustomerKey(shopDomain, getCustomerIdFromAppProxyRequest(req));
}

function sanitizePublicCustomer(customerKey) {
  return {
    customerRef: publicCustomerRef(customerKey),
    customerKeyLast4: String(customerKey || '').slice(-4)
  };
}

module.exports = {
  normaliseCustomerId,
  createCustomerKey,
  publicCustomerRef,
  createScopedHash,
  getCustomerIdFromOrder,
  getCustomerKeyFromOrder,
  getCustomerIdFromAppProxyRequest,
  getCustomerKeyFromAppProxyRequest,
  sanitizePublicCustomer
};
