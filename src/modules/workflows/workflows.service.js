const {
  Workflow,
  WorkflowRun,
  WorkflowSnapshot,
  WorkflowSettings,
} = require('./workflows.models');
const { queueWorkflow, getPath } = require('./workflows.engine');

function normalizeType(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

function normalizeId(payload, fallback = '') {
  return String(payload?.id || payload?.admin_graphql_api_id || payload?.legacyResourceId || fallback || '');
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function tags(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
}

function diffTags(before, after) {
  const b = new Set(tags(before));
  const a = new Set(tags(after));
  return {
    added: [...a].filter((x) => !b.has(x)),
    removed: [...b].filter((x) => !a.has(x)),
  };
}

function lineKey(line) {
  return String(line?.id || line?.variant_id || line?.variantId || `${line?.sku || ''}:${line?.title || ''}`);
}

function lineSummary(line) {
  if (!line) return null;
  return {
    id: line.id || '',
    variantId: line.variant_id || line.variantId || '',
    productId: line.product_id || line.productId || '',
    title: line.title || '',
    sku: line.sku || '',
    quantity: Number(line.quantity || 0),
    amount: Number(line.price || line.amount || 0),
    discount: Number(line.total_discount || line.discount || 0),
  };
}

function diffLineItems(before = [], after = []) {
  const b = new Map((before || []).map((x) => [lineKey(x), x]));
  const a = new Map((after || []).map((x) => [lineKey(x), x]));
  const added = [], removed = [], changed = [];
  for (const [key, line] of a) {
    if (!b.has(key)) added.push(lineSummary(line));
    else {
      const old = b.get(key);
      const current = lineSummary(line), previous = lineSummary(old);
      if (!eq(current, previous)) {
        changed.push({
          ...current,
          quantity: { previous: previous.quantity, current: current.quantity, delta: current.quantity - previous.quantity },
          amount: { previous: previous.amount, current: current.amount, delta: current.amount - previous.amount },
          discount: { previous: previous.discount, current: current.discount, delta: current.discount - previous.discount },
        });
      }
    }
  }
  for (const [key, line] of b) if (!a.has(key)) removed.push(lineSummary(line));
  return { added, removed, changed, addedCount: added.length, removedCount: removed.length, changedCount: changed.length, truncated: false };
}

function attributesToMap(items = []) {
  const out = {};
  for (const item of items || []) if (item?.name || item?.key) out[item.name || item.key] = item.value ?? '';
  return out;
}

function diffAttributes(before = [], after = []) {
  const b = attributesToMap(before), a = attributesToMap(after);
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => b[k] !== a[k]).map((key) => ({ key, previous: b[key] ?? '', current: a[key] ?? '' }));
}

function findMetafield(resource, namespace, key) {
  const list = resource?.metafields?.nodes || resource?.metafields || [];
  return (list || []).find((m) => m && m.namespace === namespace && m.key === key);
}

function triggerMatch(workflow, event) {
  const trigger = workflow.trigger || {};
  if (trigger.resourceType && normalizeType(trigger.resourceType) !== normalizeType(event.resourceType)) return null;
  const before = event.before || {};
  const after = event.resource || event.after || {};

  if (trigger.kind === 'resource_event') {
    if (trigger.event && String(trigger.event).toLowerCase() !== String(event.event || event.topic || '').toLowerCase()) return null;
    return { event: event.event || event.topic || '', previous: before, current: after };
  }
  if (trigger.kind === 'custom') {
    if (trigger.specifier && trigger.specifier !== event.specifier) return null;
    return { specifier: event.specifier || '' };
  }
  if (trigger.kind === 'field_changed') {
    const previous = getPath(before, trigger.fieldPath);
    const current = getPath(after, trigger.fieldPath);
    return eq(previous, current) ? null : { field: trigger.fieldPath, previous, current };
  }
  if (trigger.kind === 'metafield_changed') {
    const previous = findMetafield(before, trigger.namespace, trigger.key);
    const current = findMetafield(after, trigger.namespace, trigger.key);
    const pv = previous?.value, cv = current?.value;
    return eq(pv, cv) ? null : { namespace: trigger.namespace, key: trigger.key, type: current?.type || previous?.type || '', previous: pv, current: cv };
  }
  if (trigger.kind === 'tags_added' || trigger.kind === 'tags_removed') {
    const change = diffTags(before.tags, after.tags);
    const values = trigger.kind === 'tags_added' ? change.added : change.removed;
    return values.length ? { ...change } : null;
  }
  if (trigger.kind === 'attributes_changed') {
    const changes = diffAttributes(before.note_attributes || before.customAttributes, after.note_attributes || after.customAttributes);
    return changes.length ? { changes, oversizedKeys: [] } : null;
  }
  if (trigger.kind === 'line_items_changed') {
    const change = diffLineItems(before.line_items || before.lineItems, after.line_items || after.lineItems);
    return (change.addedCount || change.removedCount || change.changedCount) ? change : null;
  }
  if (trigger.kind === 'product_options_changed') {
    const previous = before.options || [], current = after.options || [];
    if (eq(previous, current)) return null;
    return { previous, current };
  }
  if (trigger.kind === 'lifecycle') {
    if (trigger.event && String(trigger.event).toLowerCase() !== String(event.event || event.topic || '').toLowerCase()) return null;
    return { event: event.event || event.topic || '', occurredAt: event.occurredAt || new Date().toISOString() };
  }
  return null;
}

async function ensureSettings(shopDomain) {
  return WorkflowSettings.findOneAndUpdate(
    { shopDomain },
    { $setOnInsert: { shopDomain } },
    { new: true, upsert: true }
  );
}

async function ingestEvent({
  shopDomain,
  resourceType,
  resourceId,
  topic = '',
  event = '',
  payload = {},
  before = null,
  specifier = '',
  additionalParameters = {},
  source = 'shopify',
}) {
  if (!shopDomain) throw new Error('shopDomain is required.');
  resourceType = normalizeType(resourceType || topic.split('/')[0] || 'generic');
  resourceId = String(resourceId || normalizeId(payload));
  const settings = await ensureSettings(shopDomain);
  if (!settings.enabled) return { started: 0, runs: [] };

  let previous = before;
  if (!previous && resourceId) {
    previous = (await WorkflowSnapshot.findOne({ shopDomain, resourceType, resourceId }).lean())?.data || {};
  }
  previous = previous || {};

  const eventObject = {
    shopDomain,
    resourceType,
    resourceId,
    topic,
    event: event || topic,
    resource: payload,
    after: payload,
    before: previous,
    specifier,
    additionalParameters,
    occurredAt: new Date().toISOString(),
  };

  const workflows = await Workflow.find({ shopDomain, enabled: true, 'trigger.kind': { $ne: 'schedule' } });
  const runs = [];
  for (const workflow of workflows) {
    const change = triggerMatch(workflow, eventObject);
    if (!change) continue;
    const context = {
      ...eventObject,
      change,
      resource: payload,
      before: previous,
      additionalParameters,
    };
    runs.push(await queueWorkflow(workflow, context, source));
  }

  if (resourceId && settings.storePayloads !== false) {
    await WorkflowSnapshot.findOneAndUpdate(
      { shopDomain, resourceType, resourceId },
      { $set: { data: payload, capturedAt: new Date() } },
      { upsert: true }
    );
  }

  return { started: runs.length, runs: runs.map((run) => ({ runId: run.runId, workflowName: run.workflowName, status: run.status })) };
}

async function runManual(workflow, context = {}) {
  return queueWorkflow(workflow, {
    resourceType: context.resourceType || workflow.trigger?.resourceType || '',
    resourceId: context.resourceId || '',
    specifier: context.specifier || '',
    additionalParameters: context.additionalParameters || {},
    resource: context.resource || {},
    ...context,
  }, 'manual');
}

module.exports = {
  normalizeType,
  normalizeId,
  diffTags,
  diffLineItems,
  diffAttributes,
  triggerMatch,
  ensureSettings,
  ingestEvent,
  runManual,
};
