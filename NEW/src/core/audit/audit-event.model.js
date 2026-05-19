const mongoose = require('mongoose');
const { getAuditConnection } = require('../database');

const auditEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  actorType: { type: String, enum: ['merchant_admin', 'customer', 'system', 'shopify_webhook', 'unknown'], default: 'unknown', index: true },
  actorKey: { type: String, default: '', index: true },
  module: { type: String, default: '', index: true },
  eventType: { type: String, required: true, index: true },
  entityType: { type: String, default: '', index: true },
  entityKey: { type: String, default: '', index: true },
  action: { type: String, default: '' },
  severity: { type: String, enum: ['info', 'warning', 'error', 'security'], default: 'info', index: true },
  beforeHash: { type: String, default: '' },
  afterHash: { type: String, default: '' },
  metadata: { type: Object, default: {} },
  request: {
    ipHash: { type: String, default: '' },
    userAgentHash: { type: String, default: '' },
    requestId: { type: String, default: '' }
  }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditEventSchema.index({ shopDomain: 1, createdAt: -1 });
auditEventSchema.index({ shopDomain: 1, module: 1, createdAt: -1 });
auditEventSchema.index({ shopDomain: 1, eventType: 1, createdAt: -1 });

function getAuditEventModel() {
  const connection = getAuditConnection();
  return connection.models.AuditEvent || connection.model('AuditEvent', auditEventSchema, 'audit_events');
}

module.exports = { getAuditEventModel };
