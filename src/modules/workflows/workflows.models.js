const mongoose = require('mongoose');

const { Schema } = mongoose;
const Mixed = Schema.Types.Mixed;

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

const conditionSchema = new Schema({
  path: { type: String, default: '' },
  operator: { type: String, default: 'eq' },
  value: { type: Mixed, default: null },
}, { _id: false });

const actionSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  label: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  config: { type: Mixed, default: {} },
}, { _id: false });

const workflowSchema = new Schema({
  shopDomain: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  enabled: { type: Boolean, default: false, index: true },
  trigger: {
    kind: { type: String, required: true },
    resourceType: { type: String, default: '' },
    event: { type: String, default: '' },
    fieldPath: { type: String, default: '' },
    namespace: { type: String, default: '' },
    key: { type: String, default: '' },
    specifier: { type: String, default: '' },
    everyMinutes: { type: Number, default: 0 },
  },
  conditionMode: { type: String, enum: ['all', 'any'], default: 'all' },
  conditions: { type: [conditionSchema], default: [] },
  actions: { type: [actionSchema], default: [] },
  lastScheduledAt: { type: Date, default: null },
  runCount: { type: Number, default: 0 },
  lastRunAt: { type: Date, default: null },
  lastRunStatus: { type: String, default: '' },
}, { timestamps: true });

workflowSchema.index({ shopDomain: 1, enabled: 1, 'trigger.kind': 1 });

const runSchema = new Schema({
  runId: { type: String, required: true, unique: true, index: true },
  shopDomain: { type: String, required: true, index: true },
  workflowId: { type: Schema.Types.ObjectId, ref: 'Elev8Workflow', required: true, index: true },
  workflowName: { type: String, default: '' },
  source: { type: String, default: 'manual' },
  status: { type: String, enum: ['queued','running','succeeded','failed','skipped','cancelled'], default: 'queued', index: true },
  resourceType: { type: String, default: '' },
  resourceId: { type: String, default: '' },
  specifier: { type: String, default: '' },
  scheduledFor: { type: Date, default: Date.now, index: true },
  context: { type: Mixed, default: {} },
  outputs: { type: Mixed, default: {} },
  steps: { type: [Mixed], default: [] },
  error: { type: String, default: '' },
  startedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
}, { timestamps: true });

runSchema.index({ shopDomain: 1, createdAt: -1 });
runSchema.index({ status: 1, scheduledFor: 1 });

const snapshotSchema = new Schema({
  shopDomain: { type: String, required: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
  data: { type: Mixed, default: {} },
  capturedAt: { type: Date, default: Date.now },
}, { timestamps: true });
snapshotSchema.index({ shopDomain: 1, resourceType: 1, resourceId: 1 }, { unique: true });

const credentialSchema = new Schema({
  shopDomain: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  encrypted: { type: String, required: true },
  hint: { type: String, default: '' },
}, { timestamps: true });
credentialSchema.index({ shopDomain: 1, name: 1 }, { unique: true });

const tokenSchema = new Schema({
  shopDomain: { type: String, required: true, index: true },
  name: { type: String, required: true },
  hash: { type: String, required: true, unique: true },
  prefix: { type: String, required: true },
  lastUsedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

const settingsSchema = new Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: true },
  debugModeUntil: { type: Date, default: null },
  orderCoverageDays: { type: Number, default: 90 },
  maxRunsPerMinute: { type: Number, default: 120 },
  storePayloads: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = {
  Workflow: model('Elev8Workflow', workflowSchema),
  WorkflowRun: model('Elev8WorkflowRun', runSchema),
  WorkflowSnapshot: model('Elev8WorkflowSnapshot', snapshotSchema),
  WorkflowCredential: model('Elev8WorkflowCredential', credentialSchema),
  WorkflowToken: model('Elev8WorkflowToken', tokenSchema),
  WorkflowSettings: model('Elev8WorkflowSettings', settingsSchema),
};
