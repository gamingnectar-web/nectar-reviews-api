const { env } = require('../../config/env');
const { shopifyFetch } = require('../../utils/shopify');
const { Workflow, WorkflowWebhookStat, WorkflowSettings } = require('./workflows.models');

const GENERIC_ENDPOINT = '/api/webhooks/shopify/automation';
const DEDICATED_ENDPOINTS = {
  'orders/fulfilled': '/api/webhooks/shopify/orders-fulfilled',
  'orders/updated': '/api/webhooks/shopify/orders-updated',
};

const COMPANION_PROFILE_TOPICS = [
  'products/create','products/update','products/delete',
  'product_publications/create','product_publications/update','product_publications/delete',
  'orders/create','orders/updated','orders/fulfilled','orders/cancelled','orders/delete','orders/edited','orders/paid',
  'draft_orders/create','draft_orders/update','draft_orders/delete',
  'customers/create','customers/update','customers/delete','customer_tags_added','customer_tags_removed',
  'collections/create','collections/update','collections/delete',
  'collection_publications/create','collection_publications/update','collection_publications/delete',
  'company_locations/create','company_locations/update','company_locations/delete',
  'metaobjects/create','metaobjects/update','metaobjects/delete',
  'locations/create','locations/update','locations/activate','locations/deactivate','locations/delete',
  'markets/create','markets/update','markets/delete',
  'discounts/create','discounts/update','discounts/delete','discounts/redeemcode_added','discounts/redeemcode_removed',
  'segments/create','segments/update','segments/delete',
];

const RESOURCE_TOPICS = {
  product: ['products/create','products/update','products/delete'],
  order: ['orders/create','orders/updated','orders/fulfilled','orders/cancelled','orders/delete'],
  draft_order: ['draft_orders/create','draft_orders/update','draft_orders/delete'],
  customer: ['customers/create','customers/update','customers/delete'],
  collection: ['collections/create','collections/update','collections/delete'],
  metaobject: ['metaobjects/create','metaobjects/update','metaobjects/delete'],
  company_location: ['company_locations/create','company_locations/update','company_locations/delete'],
  location: ['locations/create','locations/update','locations/activate','locations/deactivate','locations/delete'],
  market: ['markets/create','markets/update','markets/delete'],
  discount: ['discounts/create','discounts/update','discounts/delete','discounts/redeemcode_added','discounts/redeemcode_removed'],
  customer_segment: ['segments/create','segments/update','segments/delete'],
};

const METAOBJECT_TOPICS = new Set([
  'metaobjects/create',
  'metaobjects/update',
  'metaobjects/delete',
]);

function endpointFor(topic) {
  const path = DEDICATED_ENDPOINTS[topic] || GENERIC_ENDPOINT;
  return `${String(env.appUrl || '').replace(/\/$/, '')}${path}`;
}

function topicEnum(topic) {
  return String(topic || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isMetaobjectTopic(topic) {
  return METAOBJECT_TOPICS.has(String(topic || '').toLowerCase());
}

function normalizeFilter(filter = '') {
  return String(filter || '').trim();
}

function quoteFilterValue(value) {
  const raw = String(value || '').trim();
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function metaobjectFilterForType(type) {
  return `type:${quoteFilterValue(type)}`;
}

async function graphql(shopDomain, query, variables = {}) {
  const payload = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/graphql.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  if (payload.errors?.length) throw new Error(`Shopify GraphQL failed: ${JSON.stringify(payload.errors).slice(0, 1800)}`);
  return payload.data || {};
}

function workflowTopics(workflow) {
  const trigger = workflow?.trigger || {};
  if (!workflow?.enabled || trigger.kind === 'schedule' || trigger.kind === 'custom') return [];
  const exact = String(trigger.event || '').toLowerCase();
  if ((trigger.kind === 'resource_event' || trigger.kind === 'lifecycle') && exact) return [exact];
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
      if (!row.reasons.includes('enabled_workflow')) row.reasons.push('enabled_workflow');
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
  return [...map.values()].sort((a,b)=>a.topic.localeCompare(b.topic));
}

async function recordStat(topic, shopDomain, patch = {}, inc = {}) {
  if (!shopDomain || !topic) return null;
  return WorkflowWebhookStat.findOneAndUpdate({ shopDomain, topic }, {
    $set: { endpoint: endpointFor(topic), graphqlTopic: topicEnum(topic), ...patch },
    ...(Object.keys(inc).length ? { $inc: inc } : {}),
    $setOnInsert: { shopDomain, topic },
  }, { upsert: true, new: true, setDefaultsOnInsert: true });
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

async function listMetaobjectTypes(shopDomain) {
  const types = [];
  let after = null;

  while (true) {
    const data = await graphql(shopDomain, `query E8MetaobjectDefinitions($after:String){
      metaobjectDefinitions(first:100,after:$after){
        nodes{ type }
        pageInfo{ hasNextPage endCursor }
      }
    }`, { after });

    const connection = data.metaobjectDefinitions || {};
    for (const node of connection.nodes || []) {
      const type = String(node?.type || '').trim();
      if (type) types.push(type);
    }

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  }

  return [...new Set(types)].sort((a, b) => a.localeCompare(b));
}

async function requiredFiltersForTopic(shopDomain, topic) {
  if (!isMetaobjectTopic(topic)) return [''];
  const types = await listMetaobjectTypes(shopDomain);
  if (!types.length) {
    throw new Error(
      'No Shopify metaobject definitions were visible to ELEV8. Metaobject webhook topics require a type filter, so ELEV8 will not create an unfiltered subscription.'
    );
  }
  return types.map(metaobjectFilterForType);
}

async function listWebhookSubscriptions(shopDomain, enumTopic, address) {
  const nodes = [];
  let after = null;

  while (true) {
    const data = await graphql(shopDomain, `query E8WebhookSubscription($topics:[WebhookSubscriptionTopic!],$uri:String,$after:String){
      webhookSubscriptions(first:100,after:$after,topics:$topics,uri:$uri){
        nodes{ id topic uri format filter }
        pageInfo{ hasNextPage endCursor }
      }
    }`, {
      topics: [enumTopic],
      uri: address,
      after,
    });

    const connection = data.webhookSubscriptions || {};
    nodes.push(...(connection.nodes || []));

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  }

  const wantedAddress = String(address || '').replace(/\/$/, '');
  return nodes.filter((item) => String(item?.uri || '').replace(/\/$/, '') === wantedAddress);
}

function subscriptionMatchesFilter(subscription, wantedFilter) {
  const actual = normalizeFilter(subscription?.filter);
  const wanted = normalizeFilter(wantedFilter);
  return wanted ? actual === wanted : !actual;
}

async function inspectOne(shopDomain, desired) {
  const topic = desired.topic;
  const enumTopic = topicEnum(topic);
  const address = endpointFor(topic);
  const filters = await requiredFiltersForTopic(shopDomain, topic);
  const subscriptions = await listWebhookSubscriptions(shopDomain, enumTopic, address);

  const matches = [];
  const missingFilters = [];

  for (const filter of filters) {
    const match = subscriptions.find((item) => subscriptionMatchesFilter(item, filter));
    if (match) matches.push(match);
    else missingFilters.push(filter);
  }

  return {
    topic,
    enumTopic,
    address,
    filters,
    subscriptions,
    matches,
    missingFilters,
    match: matches[0] || null,
    zeroMetaobjectTypes: isMetaobjectTopic(topic) && filters.length === 0,
  };
}

function statusFromError(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('access') || lower.includes('scope')) return 'missing_scope';
  if (lower.includes('topic') || lower.includes('enum')) return 'unsupported';
  return 'error';
}

function webhookIds(items = []) {
  return [...new Set(items.map((item) => String(item?.id || '')).filter(Boolean))].join(',');
}

async function syncOne(shopDomain, desired) {
  const inspected = await inspectOne(shopDomain, desired);
  const {
    topic,
    enumTopic,
    address,
    filters,
    matches,
    missingFilters,
    zeroMetaobjectTypes,
  } = inspected;

  if (!missingFilters.length) {
    const ids = webhookIds(matches);
    const stat = await recordStat(topic, shopDomain, {
      required: true,
      subscriptionStatus: 'connected',
      shopifyWebhookId: ids,
      lastSyncAt: new Date(),
      dependencyReasons: desired.reasons,
      dependentWorkflowIds: desired.workflowIds,
      dependentWorkflowNames: desired.workflowNames,
      lastSyncError: '',
      lastSyncStatus: 'connected',
    });
    return {
      topic,
      enumTopic,
      ok: true,
      status: 'connected',
      address,
      webhookId: ids,
      subscriptionCount: matches.length,
      filterCount: filters.length,
      zeroMetaobjectTypes,
      stat,
    };
  }

  const createdSubscriptions = [];
  const creationErrors = [];

  for (const filter of missingFilters) {
    const input = { uri: address, format: 'JSON' };
    if (filter) input.filter = filter;

    try {
      const data = await graphql(shopDomain, `mutation E8WebhookCreate($topic:WebhookSubscriptionTopic!,$input:WebhookSubscriptionInput!){
        webhookSubscriptionCreate(topic:$topic,webhookSubscription:$input){
          webhookSubscription{ id topic uri format filter }
          userErrors{ field message }
        }
      }`, {
        topic: enumTopic,
        input,
      });

      const payload = data.webhookSubscriptionCreate || {};
      const errors = payload.userErrors || [];
      const created = payload.webhookSubscription || null;

      if (created?.id && !errors.length) {
        createdSubscriptions.push(created);
      } else {
        const message = errors.map((x) => x.message).filter(Boolean).join(' | ')
          || `Shopify did not create the webhook subscription${filter ? ` for ${filter}` : ''}.`;
        creationErrors.push({ filter, message });
      }
    } catch (error) {
      creationErrors.push({
        filter,
        message: String(error?.message || error || 'Webhook subscription creation failed.'),
      });
    }
  }

  const allSubscriptions = [...matches, ...createdSubscriptions];

  if (!creationErrors.length) {
    const ids = webhookIds(allSubscriptions);
    const stat = await recordStat(topic, shopDomain, {
      required: true,
      subscriptionStatus: 'connected',
      shopifyWebhookId: ids,
      lastSyncAt: new Date(),
      dependencyReasons: desired.reasons,
      dependentWorkflowIds: desired.workflowIds,
      dependentWorkflowNames: desired.workflowNames,
      lastSyncError: '',
      lastSyncStatus: 'connected',
    });
    return {
      topic,
      enumTopic,
      ok: true,
      status: 'connected',
      address,
      webhookId: ids,
      subscriptionCount: allSubscriptions.length,
      filterCount: filters.length,
      zeroMetaobjectTypes,
      stat,
    };
  }

  const message = creationErrors
    .map((item) => `${item.filter ? `${item.filter}: ` : ''}${item.message}`)
    .join(' | ')
    .slice(0, 2000);
  const status = statusFromError(message);
  const stat = await recordStat(topic, shopDomain, {
    required: true,
    subscriptionStatus: status,
    shopifyWebhookId: webhookIds(allSubscriptions),
    lastSyncAt: new Date(),
    dependencyReasons: desired.reasons,
    dependentWorkflowIds: desired.workflowIds,
    dependentWorkflowNames: desired.workflowNames,
    lastSyncError: message,
    lastSyncStatus: status,
  }, { syncFailureCount: 1 });

  return {
    topic,
    enumTopic,
    ok: false,
    status,
    address,
    error: message,
    subscriptionCount: allSubscriptions.length,
    filterCount: filters.length,
    failedFilters: creationErrors.map((item) => item.filter).filter(Boolean),
    stat,
  };
}

async function repairLegacySyncFailureCounters(shopDomain) {
  await WorkflowWebhookStat.updateMany({
    shopDomain,
    receivedCount: 0,
    $or: [{ lastWebhookId: '' }, { lastWebhookId: { $exists: false } }],
    failureCount: { $gt: 0 },
  }, {
    $set: {
      failureCount: 0,
      lastFailedAt: null,
      lastError: '',
      lastStatus: '',
    },
  });
}

async function syncTrackedWebhooks(shopDomain) {
  if (!env.appUrl) throw new Error('APP_URL is required before ELEV8 can own Shopify webhooks.');
  await repairLegacySyncFailureCounters(shopDomain);

  const desired = await desiredTopics(shopDomain);
  const results = [];

  for (const row of desired) {
    try {
      results.push(await syncOne(shopDomain, row));
    } catch (error) {
      const message = String(error.message || error);
      const status = statusFromError(message);
      await recordStat(row.topic, shopDomain, {
        required: true,
        subscriptionStatus: status,
        lastSyncAt: new Date(),
        dependencyReasons: row.reasons,
        dependentWorkflowIds: row.workflowIds,
        dependentWorkflowNames: row.workflowNames,
        lastSyncError: message.slice(0, 2000),
        lastSyncStatus: status,
      }, { syncFailureCount: 1 });
      results.push({
        topic: row.topic,
        enumTopic: topicEnum(row.topic),
        ok: false,
        status,
        address: endpointFor(row.topic),
        error: message,
      });
    }
  }

  await WorkflowSettings.findOneAndUpdate({ shopDomain }, {
    $set: {
      webhookSyncAt: new Date(),
      webhookSyncOk: results.every((r) => r.ok),
      webhookTopics: desired.map((r) => r.topic),
      webhookSyncResults: results.map((r) => ({
        topic: r.topic,
        enumTopic: r.enumTopic,
        ok: r.ok,
        status: r.status,
        address: r.address,
        webhookId: r.webhookId || '',
        error: r.error || '',
        filterCount: Number(r.filterCount || 0),
        subscriptionCount: Number(r.subscriptionCount || 0),
      })),
    },
    $setOnInsert: { shopDomain },
  }, { upsert: true, new: true });

  return {
    ok: results.every((r) => r.ok),
    desired: desired.length,
    connected: results.filter((r) => r.ok).length,
    missingScope: results.filter((r) => r.status === 'missing_scope').length,
    unsupported: results.filter((r) => r.status === 'unsupported').length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

async function inspectDesiredWebhooks(shopDomain) {
  const desired = await desiredTopics(shopDomain);
  const results = [];

  for (const row of desired) {
    try {
      const inspected = await inspectOne(shopDomain, row);
      const ok = inspected.missingFilters.length === 0;
      const ids = webhookIds(inspected.matches);
      const status = ok ? 'connected' : 'not_synced';

      await recordStat(row.topic, shopDomain, {
        required: true,
        subscriptionStatus: status,
        shopifyWebhookId: ids,
        lastSyncAt: new Date(),
        dependencyReasons: row.reasons,
        dependentWorkflowIds: row.workflowIds,
        dependentWorkflowNames: row.workflowNames,
        lastSyncError: '',
        lastSyncStatus: status,
      });

      results.push({
        topic: row.topic,
        enumTopic: inspected.enumTopic,
        ok,
        status,
        address: inspected.address,
        webhookId: ids,
        filterCount: inspected.filters.length,
        subscriptionCount: inspected.matches.length,
        missingFilters: inspected.missingFilters,
        zeroMetaobjectTypes: inspected.zeroMetaobjectTypes,
      });
    } catch (error) {
      const message = String(error.message || error);
      const status = statusFromError(message);
      await recordStat(row.topic, shopDomain, {
        required: true,
        subscriptionStatus: status,
        lastSyncAt: new Date(),
        dependencyReasons: row.reasons,
        dependentWorkflowIds: row.workflowIds,
        dependentWorkflowNames: row.workflowNames,
        lastSyncError: message.slice(0, 2000),
        lastSyncStatus: status,
      }, { syncFailureCount: 1 });
      results.push({
        topic: row.topic,
        enumTopic: topicEnum(row.topic),
        ok: false,
        status,
        address: endpointFor(row.topic),
        error: message,
      });
    }
  }

  return {
    ok: results.every((r) => r.ok),
    desired: desired.length,
    connected: results.filter((r) => r.ok).length,
    results,
  };
}

async function adoptWorkflowCompanionProfile(shopDomain) {
  await WorkflowSettings.findOneAndUpdate({ shopDomain }, {
    $set: {
      migrationProfile: 'workflow_companion',
      migrationProfileEnabledAt: new Date(),
    },
    $setOnInsert: { shopDomain },
  }, { upsert: true, new: true });

  return syncTrackedWebhooks(shopDomain);
}

async function getWebhookRegistry(shopDomain) {
  const desired = await desiredTopics(shopDomain);
  const wanted = new Map(desired.map((x) => [x.topic, x]));
  const stats = await WorkflowWebhookStat.find({ shopDomain }).sort({ topic: 1 }).lean();

  for (const row of desired) {
    if (!stats.some((s) => s.topic === row.topic)) {
      stats.push({
        shopDomain,
        topic: row.topic,
        graphqlTopic: topicEnum(row.topic),
        endpoint: endpointFor(row.topic),
        required: true,
        subscriptionStatus: 'not_synced',
        dependencyReasons: row.reasons,
        dependentWorkflowIds: row.workflowIds,
        dependentWorkflowNames: row.workflowNames,
        receivedCount: 0,
        duplicateCount: 0,
        failureCount: 0,
        syncFailureCount: 0,
        runCount: 0,
      });
    }
  }

  const rows = stats.map((row) => {
    const wantedRow = wanted.get(row.topic);
    return {
      ...row,
      graphqlTopic: row.graphqlTopic || topicEnum(row.topic),
      required: Boolean(wantedRow),
      endpoint: row.endpoint || endpointFor(row.topic),
      dependencyReasons: wantedRow?.reasons || row.dependencyReasons || [],
      dependentWorkflowIds: wantedRow?.workflowIds || row.dependentWorkflowIds || [],
      dependentWorkflowNames: wantedRow?.workflowNames || row.dependentWorkflowNames || [],
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
      deliveryFailures: rows.reduce((n, r) => n + Number(r.failureCount || 0), 0),
      syncFailures: rows.reduce((n, r) => n + Number(r.syncFailureCount || 0), 0),
      duplicates: rows.reduce((n, r) => n + Number(r.duplicateCount || 0), 0),
    },
    note: 'ELEV8 uses Shopify Admin GraphQL webhook subscriptions. Metaobject topics are expanded into one filtered subscription per metaobject definition type because Shopify requires a filter for METAOBJECTS_CREATE, METAOBJECTS_UPDATE and METAOBJECTS_DELETE.',
  };
}

module.exports = {
  COMPANION_PROFILE_TOPICS,
  desiredTopics,
  topicEnum,
  recordWebhookAccepted,
  recordWebhookDuplicate,
  recordWebhookFailure,
  inspectDesiredWebhooks,
  syncTrackedWebhooks,
  adoptWorkflowCompanionProfile,
  getWebhookRegistry,
};
