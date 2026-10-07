const { env } = require('../../config/env');
const { shopifyFetchOptional } = require('../../utils/shopify');
const {
  Workflow,
  WorkflowWebhookStat,
  WorkflowSettings,
} = require('./workflows.models');

const GENERIC_ENDPOINT = '/api/webhooks/shopify/automation';
const DEDICATED_ENDPOINTS = {
  'orders/fulfilled': '/api/webhooks/shopify/orders-fulfilled',
  'orders/updated': '/api/webhooks/shopify/orders-updated',
};

const COMPANION_PROFILE_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'product_publications/create',
  'product_publications/update',
  'product_publications/delete',
  'orders/create',
  'orders/updated',
  'orders/fulfilled',
  'orders/cancelled',
  'orders/delete',
  'orders/edited',
  'orders/paid',
  'draft_orders/create',
  'draft_orders/update',
  'draft_orders/delete',
  'customers/create',
  'customers/update',
  'customers/delete',
  'customer_tags_added',
  'customer_tags_removed',
  'collections/create',
  'collections/update',
  'collections/delete',
  'collection_publications/create',
  'collection_publications/update',
  'collection_publications/delete',
  'company_locations/create',
  'company_locations/update',
  'company_locations/delete',
  'metaobjects/create',
  'metaobjects/update',
  'metaobjects/delete',
  'locations/create',
  'locations/update',
  'locations/activate',
  'locations/deactivate',
  'locations/delete',
  'markets/create',
  'markets/update',
  'markets/delete',
  'discounts/create',
  'discounts/update',
  'discounts/delete',
  'discounts/redeemcode_added',
  'discounts/redeemcode_removed',
  'segments/create',
  'segments/update',
  'segments/delete',
];

const RESOURCE_TOPICS = {
  product: ['products/create', 'products/update', 'products/delete'],
  order: ['orders/create', 'orders/updated', 'orders/fulfilled', 'orders/cancelled', 'orders/delete'],
  draft_order: ['draft_orders/create', 'draft_orders/update', 'draft_orders/delete'],
  customer: ['customers/create', 'customers/update', 'customers/delete'],
  collection: ['collections/create', 'collections/update', 'collections/delete'],
  metaobject: ['metaobjects/create', 'metaobjects/update', 'metaobjects/delete'],
  company_location: ['company_locations/create', 'company_locations/update', 'company_locations/delete'],
  location: ['locations/create', 'locations/update', 'locations/activate', 'locations/deactivate', 'locations/delete'],
  market: ['markets/create', 'markets/update', 'markets/delete'],
  discount: ['discounts/create', 'discounts/update', 'discounts/delete', 'discounts/redeemcode_added', 'discounts/redeemcode_removed'],
  customer_segment: ['segments/create', 'segments/update', 'segments/delete'],
};

function endpointFor(topic) {
  const path = DEDICATED_ENDPOINTS[topic] || GENERIC_ENDPOINT;
  return `${String(env.appUrl || '').replace(/\/$/, '')}${path}`;
}

function workflowTopics(workflow) {
  const trigger = workflow?.trigger || {};
  if (!workflow?.enabled || trigger.kind === 'schedule' || trigger.kind === 'custom') return [];
  const exact = String(trigger.event || '').toLowerCase();
  if ((trigger.kind === 'resource_event' || trigger.kind === 'lifecycle') && exact.includes('/')) return [exact];
  return RESOURCE_TOPICS[String(trigger.resourceType || '').toLowerCase()] || [];
}

async function desiredTopics(shopDomain) {
  const [settings, workflows] = await Promise.all([
    WorkflowSettings.findOne({ shopDomain }).lean(),
    Workflow.find({ shopDomain, enabled: true }).lean(),
  ]);
  const map = new Map();

  for (const workflow of workflows) {
    for (const topic of workflowTopics(workflow)) {
      const row = map.get(topic) || { topic, reasons: [], workflowIds: [], workflowNames: [] };
      row.reasons.push('enabled_workflow');
      row.workflowIds.push(String(workflow._id));
      row.workflowNames.push(workflow.name);
      map.set(topic, row);
    }
  }

  if (settings?.migrationProfile === 'workflow_companion') {
    for (const topic of COMPANION_PROFILE_TOPICS) {
      const row = map.get(topic) || { topic, reasons: [], workflowIds: [], workflowNames: [] };
      if (!row.reasons.includes('workflow_companion_profile')) row.reasons.push('workflow_companion_profile');
      map.set(topic, row);
    }
  }

  return [...map.values()].sort((a, b) => a.topic.localeCompare(b.topic));
}

async function recordStat(topic, shopDomain, patch = {}, inc = {}) {
  if (!shopDomain || !topic) return null;
  return WorkflowWebhookStat.findOneAndUpdate(
    { shopDomain, topic },
    {
      $set: {
        endpoint: endpointFor(topic),
        ...patch,
      },
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
      $setOnInsert: { shopDomain, topic },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function recordWebhookAccepted({ shopDomain, topic, webhookId = '', resourceType = '', enriched = false, runCount = 0 }) {
  return recordStat(topic, shopDomain, {
    resourceType,
    lastReceivedAt: new Date(),
    lastWebhookId: String(webhookId || ''),
    lastStatus: 'received',
    lastError: '',
    lastEnriched: Boolean(enriched),
  }, {
    receivedCount: 1,
    runCount: Number(runCount || 0),
  });
}

async function recordWebhookDuplicate({ shopDomain, topic, webhookId = '' }) {
  return recordStat(topic, shopDomain, {
    lastDuplicateAt: new Date(),
    lastWebhookId: String(webhookId || ''),
    lastStatus: 'duplicate',
  }, { duplicateCount: 1 });
}

async function recordWebhookFailure({ shopDomain, topic, webhookId = '', error }) {
  return recordStat(topic, shopDomain, {
    lastFailedAt: new Date(),
    lastWebhookId: String(webhookId || ''),
    lastStatus: 'failed',
    lastError: String(error?.message || error || '').slice(0, 2000),
  }, { failureCount: 1 });
}

async function syncOne(shopDomain, desired) {
  const topic = desired.topic;
  const address = endpointFor(topic);
  const existing = await shopifyFetchOptional(
    `/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(topic)}`,
    { shopDomain }
  );

  if (!existing) {
    const stat = await recordStat(topic, shopDomain, {
      required: true,
      subscriptionStatus: 'unknown',
      lastSyncAt: new Date(),
      dependencyReasons: desired.reasons,
      dependentWorkflowIds: desired.workflowIds,
      dependentWorkflowNames: desired.workflowNames,
      lastSyncError: 'Could not inspect this topic with the current Shopify permissions/API.',
    });
    return { topic, ok: false, status: 'unknown', address, stat };
  }

  const match = (existing.webhooks || []).find(
    (item) => String(item.address || '').replace(/\/$/, '') === address.replace(/\/$/, '')
  );

  if (match) {
    const stat = await recordStat(topic, shopDomain, {
      required: true,
      subscriptionStatus: 'connected',
      shopifyWebhookId: String(match.id || ''),
      lastSyncAt: new Date(),
      dependencyReasons: desired.reasons,
      dependentWorkflowIds: desired.workflowIds,
      dependentWorkflowNames: desired.workflowNames,
      lastSyncError: '',
    });
    return { topic, ok: true, status: 'connected', address, webhookId: String(match.id || ''), stat };
  }

  const created = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
  });

  const ok = Boolean(created?.webhook?.id);
  const stat = await recordStat(topic, shopDomain, {
    required: true,
    subscriptionStatus: ok ? 'connected' : 'blocked',
    shopifyWebhookId: ok ? String(created.webhook.id) : '',
    lastSyncAt: new Date(),
    dependencyReasons: desired.reasons,
    dependentWorkflowIds: desired.workflowIds,
    dependentWorkflowNames: desired.workflowNames,
    lastSyncError: ok ? '' : 'Shopify did not confirm this subscription. The app may need another access scope or the topic may not be available to this app.',
  });
  return { topic, ok, status: ok ? 'connected' : 'blocked', address, webhookId: ok ? String(created.webhook.id) : '', stat };
}

async function syncTrackedWebhooks(shopDomain) {
  if (!env.appUrl) throw new Error('APP_URL is required before ELEV8 can own Shopify webhooks.');
  const desired = await desiredTopics(shopDomain);
  const results = [];
  for (const row of desired) {
    try {
      results.push(await syncOne(shopDomain, row));
    } catch (error) {
      await recordWebhookFailure({ shopDomain, topic: row.topic, error });
      results.push({ topic: row.topic, ok: false, status: 'error', error: error.message, address: endpointFor(row.topic) });
    }
  }

  await WorkflowSettings.findOneAndUpdate(
    { shopDomain },
    {
      $set: {
        webhookSyncAt: new Date(),
        webhookSyncOk: results.every((r) => r.ok),
        webhookTopics: desired.map((r) => r.topic),
        webhookSyncResults: results.map((r) => ({
          topic: r.topic,
          ok: r.ok,
          status: r.status,
          address: r.address,
          webhookId: r.webhookId || '',
          error: r.error || '',
        })),
      },
      $setOnInsert: { shopDomain },
    },
    { upsert: true, new: true }
  );

  return {
    ok: results.every((r) => r.ok),
    desired: desired.length,
    connected: results.filter((r) => r.ok).length,
    results,
  };
}

async function adoptWorkflowCompanionProfile(shopDomain) {
  await WorkflowSettings.findOneAndUpdate(
    { shopDomain },
    {
      $set: {
        migrationProfile: 'workflow_companion',
        migrationProfileEnabledAt: new Date(),
      },
      $setOnInsert: { shopDomain },
    },
    { upsert: true, new: true }
  );
  return syncTrackedWebhooks(shopDomain);
}

async function getWebhookRegistry(shopDomain) {
  const desired = await desiredTopics(shopDomain);
  const desiredMap = new Map(desired.map((x) => [x.topic, x]));
  const stats = await WorkflowWebhookStat.find({ shopDomain }).sort({ topic: 1 }).lean();

  for (const row of desired) {
    if (!stats.some((s) => s.topic === row.topic)) {
      stats.push({
        shopDomain,
        topic: row.topic,
        endpoint: endpointFor(row.topic),
        required: true,
        subscriptionStatus: 'not_synced',
        dependencyReasons: row.reasons,
        dependentWorkflowIds: row.workflowIds,
        dependentWorkflowNames: row.workflowNames,
        receivedCount: 0,
        duplicateCount: 0,
        failureCount: 0,
        runCount: 0,
      });
    }
  }

  const rows = stats.map((row) => {
    const wanted = desiredMap.get(row.topic);
    return {
      ...row,
      required: Boolean(wanted),
      endpoint: row.endpoint || endpointFor(row.topic),
      dependencyReasons: wanted?.reasons || row.dependencyReasons || [],
      dependentWorkflowIds: wanted?.workflowIds || row.dependentWorkflowIds || [],
      dependentWorkflowNames: wanted?.workflowNames || row.dependentWorkflowNames || [],
    };
  }).sort((a, b) => String(a.topic).localeCompare(String(b.topic)));

  const settings = await WorkflowSettings.findOne({ shopDomain }).lean();
  return {
    migrationProfile: settings?.migrationProfile || '',
    migrationProfileEnabledAt: settings?.migrationProfileEnabledAt || null,
    rows,
    summary: {
      tracked: rows.length,
      required: rows.filter((r) => r.required).length,
      connected: rows.filter((r) => r.required && r.subscriptionStatus === 'connected').length,
      receiving: rows.filter((r) => r.lastReceivedAt).length,
      failures: rows.reduce((n, r) => n + Number(r.failureCount || 0), 0),
      duplicates: rows.reduce((n, r) => n + Number(r.duplicateCount || 0), 0),
    },
    note: 'Shopify webhook subscriptions are app-scoped. ELEV8 cannot read or take ownership of subscriptions created by Workflow Companion or Workflow Webhooks; this registry mirrors the required coverage under the ELEV8 app and tracks ELEV8 deliveries independently.',
  };
}

module.exports = {
  COMPANION_PROFILE_TOPICS,
  desiredTopics,
  recordWebhookAccepted,
  recordWebhookDuplicate,
  recordWebhookFailure,
  syncTrackedWebhooks,
  adoptWorkflowCompanionProfile,
  getWebhookRegistry,
};
