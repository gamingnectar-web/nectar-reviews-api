const crypto = require('crypto');
const { getAuditEventModel } = require('./audit-event.model');
const { cleanShopDomain } = require('../http/request-utils');
const { config } = require('../config');

const ALLOWED_META_KEYS = new Set([
  'fieldsChanged', 'status', 'fromStatus', 'toStatus', 'points', 'ruleName', 'ruleType',
  'trigger', 'reason', 'sourceType', 'result', 'count', 'moduleKey', 'enabledModules',
  'discountValue', 'discountType', 'redemptionStatus', 'reviewStatus', 'errorCode'
]);

function auditHash(value) {
  const secret = config.security.auditHashSecret || config.security.customerIdSecret || 'development-only';
  return crypto.createHmac('sha256', secret).update(String(value || '')).digest('hex');
}

function objectHash(value) {
  const normalised = JSON.stringify(value || {}, Object.keys(value || {}).sort());
  return auditHash(normalised);
}

function safeMetadata(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (Array.isArray(value)) output[key] = value.map((entry) => String(entry).slice(0, 100)).slice(0, 20);
    else if (typeof value === 'number' || typeof value === 'boolean') output[key] = value;
    else output[key] = String(value ?? '').slice(0, 200);
  }
  return output;
}

function actorFromRequest(req, fallbackType = 'unknown') {
  if (!req) return { actorType: fallbackType, actorKey: '' };
  const token = req.get?.('x-nectar-admin-token') || req.get?.('authorization') || '';
  const customerRef = req.customerKey ? `customer:${req.customerKey}` : '';
  if (customerRef) return { actorType: 'customer', actorKey: auditHash(customerRef) };
  if (token) return { actorType: 'merchant_admin', actorKey: auditHash(`admin:${token}`) };
  return { actorType: fallbackType, actorKey: '' };
}

function requestInfo(req) {
  if (!req) return {};
  const ip = req.ip || req.headers?.['x-forwarded-for'] || '';
  const ua = req.get?.('user-agent') || '';
  return {
    ipHash: ip ? auditHash(`ip:${ip}`) : '',
    userAgentHash: ua ? auditHash(`ua:${ua}`) : '',
    requestId: req.requestId || ''
  };
}

async function recordAuditEvent(event = {}) {
  try {
    const AuditEvent = getAuditEventModel();
    const doc = {
      shopDomain: cleanShopDomain(event.shopDomain),
      actorType: event.actorType || 'unknown',
      actorKey: event.actorKey || '',
      module: String(event.module || '').slice(0, 60),
      eventType: String(event.eventType || '').slice(0, 120),
      entityType: String(event.entityType || '').slice(0, 80),
      entityKey: String(event.entityKey || '').slice(0, 160),
      action: String(event.action || '').slice(0, 80),
      severity: event.severity || 'info',
      beforeHash: event.before ? objectHash(event.before) : (event.beforeHash || ''),
      afterHash: event.after ? objectHash(event.after) : (event.afterHash || ''),
      metadata: safeMetadata(event.metadata),
      request: event.request || {}
    };
    if (!doc.shopDomain || !doc.eventType) return null;
    return AuditEvent.create(doc);
  } catch (error) {
    console.warn('Audit log write failed:', error.message);
    return null;
  }
}

async function auditFromRequest(req, event = {}) {
  const actor = actorFromRequest(req, event.actorType || 'unknown');
  return recordAuditEvent({
    ...event,
    actorType: event.actorType || actor.actorType,
    actorKey: event.actorKey || actor.actorKey,
    request: requestInfo(req)
  });
}

async function listAuditEvents({ shopDomain, module, eventType, limit = 100 }) {
  const AuditEvent = getAuditEventModel();
  const query = { shopDomain: cleanShopDomain(shopDomain) };
  if (module) query.module = String(module);
  if (eventType) query.eventType = String(eventType);
  return AuditEvent.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 250)).lean();
}

module.exports = { auditHash, objectHash, safeMetadata, recordAuditEvent, auditFromRequest, listAuditEvents };
