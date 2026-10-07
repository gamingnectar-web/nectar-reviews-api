const crypto = require('crypto');
const { env } = require('../../config/env');
const { shopifyFetch, shopifyFetchOptional } = require('../../utils/shopify');
const {
  Workflow,
  WorkflowSnapshot,
  WorkflowEvent,
  WorkflowSettings,
} = require('./workflows.models');
const { ingestEvent, normalizeType, normalizeId } = require('./workflows.service');
const {
  recordWebhookAccepted,
  recordWebhookDuplicate,
  recordWebhookFailure,
} = require('./workflows.webhookRegistry');

const RESOURCE_GID = {
  product: 'Product',
  product_variant: 'ProductVariant',
  order: 'Order',
  draft_order: 'DraftOrder',
  customer: 'Customer',
  collection: 'Collection',
  company: 'Company',
  company_location: 'CompanyLocation',
  location: 'Location',
  market: 'Market',
  metaobject: 'Metaobject',
};

const TOPIC_RESOURCE = {
  'products/create': 'product',
  'products/update': 'product',
  'products/delete': 'product',
  'orders/create': 'order',
  'orders/updated': 'order',
  'orders/fulfilled': 'order',
  'orders/cancelled': 'order',
  'orders/delete': 'order',
  'draft_orders/create': 'draft_order',
  'draft_orders/update': 'draft_order',
  'draft_orders/delete': 'draft_order',
  'customers/create': 'customer',
  'customers/update': 'customer',
  'customers/delete': 'customer',
  'collections/create': 'collection',
  'collections/update': 'collection',
  'collections/delete': 'collection',
  'metaobjects/create': 'metaobject',
  'metaobjects/update': 'metaobject',
  'metaobjects/delete': 'metaobject',
  'companies/create': 'company',
  'companies/update': 'company',
  'companies/delete': 'company',
  'company_locations/create': 'company_location',
  'company_locations/update': 'company_location',
  'company_locations/delete': 'company_location',
  'markets/create': 'market',
  'markets/update': 'market',
  'markets/delete': 'market',
  'locations/activate': 'location',
  'locations/deactivate': 'location',
};

const RESOURCE_TOPICS = {
  product: ['products/create', 'products/update', 'products/delete'],
  order: ['orders/create', 'orders/updated', 'orders/fulfilled', 'orders/cancelled', 'orders/delete'],
  draft_order: ['draft_orders/create', 'draft_orders/update', 'draft_orders/delete'],
  customer: ['customers/create', 'customers/update', 'customers/delete'],
  collection: ['collections/create', 'collections/update', 'collections/delete'],
  metaobject: ['metaobjects/create', 'metaobjects/update', 'metaobjects/delete'],
  company: ['companies/create', 'companies/update', 'companies/delete'],
  company_location: ['company_locations/create', 'company_locations/update', 'company_locations/delete'],
  market: ['markets/create', 'markets/update', 'markets/delete'],
  location: ['locations/activate', 'locations/deactivate'],
};

const EXISTING_DEDICATED_TOPICS = new Set(['orders/fulfilled', 'orders/updated']);

function topicToResourceType(topic = '') {
  return TOPIC_RESOURCE[String(topic || '').toLowerCase()] || normalizeType(String(topic || '').split('/')[0] || 'generic');
}

function toGid(resourceType, value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.startsWith('gid://shopify/')) return raw;
  const kind = RESOURCE_GID[normalizeType(resourceType)];
  return kind ? `gid://shopify/${kind}/${raw}` : raw;
}

function mergeResource(base = {}, extra = {}) {
  const out = { ...(base || {}), ...(extra || {}) };
  if (extra.metafields) out.metafields = extra.metafields;
  if (extra.line_items) out.line_items = extra.line_items;
  if (extra.note_attributes) out.note_attributes = extra.note_attributes;
  if (extra.options) out.options = extra.options;
  return out;
}

function normalizeGraphqlResource(resourceType, node) {
  if (!node) return {};
  const out = { ...node };
  if (Array.isArray(node.tags)) out.tags = node.tags;
  if (node.metafields?.nodes) out.metafields = node.metafields.nodes;
  if (node.lineItems?.nodes) {
    out.line_items = node.lineItems.nodes.map((line) => ({
      id: line.legacyResourceId || line.id || '',
      admin_graphql_api_id: line.id || '',
      variant_id: line.variant?.legacyResourceId || '',
      product_id: line.product?.legacyResourceId || '',
      title: line.title || '',
      sku: line.sku || '',
      quantity: Number(line.quantity || 0),
      price: Number(line.originalUnitPriceSet?.shopMoney?.amount || 0),
      total_discount: Number(line.totalDiscountSet?.shopMoney?.amount || 0),
    }));
  }
  if (Array.isArray(node.customAttributes)) {
    out.note_attributes = node.customAttributes.map((item) => ({ name: item.key, value: item.value }));
  }
  if (node.legacyResourceId) out.id = node.legacyResourceId;
  if (node.id) out.admin_graphql_api_id = node.id;
  return out;
}

async function graphql(shopDomain, query, variables = {}) {
  const version = env.shopifyApiVersion || '2026-10';
  const data = await shopifyFetch(`/admin/api/${version}/graphql.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  if (Array.isArray(data.errors) && data.errors.length) {
    throw new Error(`Shopify GraphQL enrichment failed: ${JSON.stringify(data.errors).slice(0, 1800)}`);
  }
  return data.data || {};
}

function enrichmentNeeds(workflows = []) {
  return {
    any: workflows.some((w) => ['field_changed','metafield_changed','tags_added','tags_removed','attributes_changed','line_items_changed','product_options_changed'].includes(w.trigger?.kind)),
    metafields: workflows.some((w) => w.trigger?.kind === 'metafield_changed'),
    lineItems: workflows.some((w) => w.trigger?.kind === 'line_items_changed'),
    attributes: workflows.some((w) => w.trigger?.kind === 'attributes_changed'),
    options: workflows.some((w) => w.trigger?.kind === 'product_options_changed'),
  };
}

async function enabledResourceWorkflows(shopDomain, resourceType) {
  return Workflow.find({
    shopDomain,
    enabled: true,
    'trigger.resourceType': normalizeType(resourceType),
    'trigger.kind': { $ne: 'schedule' },
  }).lean();
}

async function enrichShopifyResource({ shopDomain, resourceType, resourceId, payload = {} }) {
  const type = normalizeType(resourceType);
  const workflows = await enabledResourceWorkflows(shopDomain, type);
  const needs = enrichmentNeeds(workflows);
  if (!needs.any || !resourceId) return { payload, enriched: false, needs };

  const gid = toGid(type, resourceId || payload.admin_graphql_api_id || payload.id);
  if (!gid) return { payload, enriched: false, needs };

  const fragments = {
    product: `... on Product {
      id legacyResourceId title handle status tags vendor productType updatedAt
      options { name position values }
      metafields(first:100) { nodes { namespace key value type } }
    }`,
    order: `... on Order {
      id legacyResourceId name tags note createdAt updatedAt
      displayFinancialStatus displayFulfillmentStatus
      customAttributes { key value }
      lineItems(first:100) {
        nodes {
          id title sku quantity
          variant { id legacyResourceId }
          product { id legacyResourceId }
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          totalDiscountSet { shopMoney { amount currencyCode } }
        }
      }
      metafields(first:100) { nodes { namespace key value type } }
    }`,
    draft_order: `... on DraftOrder {
      id legacyResourceId name tags note createdAt updatedAt
      customAttributes { key value }
      lineItems(first:100) {
        nodes {
          id title sku quantity
          variant { id legacyResourceId }
          product { id legacyResourceId }
          originalUnitPriceSet { shopMoney { amount currencyCode } }
        }
      }
      metafields(first:100) { nodes { namespace key value type } }
    }`,
    customer: `... on Customer {
      id legacyResourceId firstName lastName email phone tags updatedAt
      metafields(first:100) { nodes { namespace key value type } }
    }`,
    collection: `... on Collection {
      id legacyResourceId title handle updatedAt
      metafields(first:100) { nodes { namespace key value type } }
    }`,
    company: `... on Company {
      id name updatedAt
      metafields(first:100) { nodes { namespace key value type } }
    }`,
    company_location: `... on CompanyLocation {
      id name updatedAt
      metafields(first:100) { nodes { namespace key value type } }
    }`,
    location: `... on Location { id legacyResourceId name }`,
    market: `... on Market { id name status }`,
    metaobject: `... on Metaobject {
      id handle type updatedAt
      fields { key value type }
      capabilities { publishable { status } }
    }`,
  };

  if (!fragments[type]) return { payload, enriched: false, needs };

  try {
    const data = await graphql(shopDomain, `query E8WorkflowResource($id:ID!){ node(id:$id){ id ${fragments[type]} } }`, { id: gid });
    const normalized = normalizeGraphqlResource(type, data.node);
    if (!data.node) return { payload, enriched: false, needs, missing: true };
    return { payload: mergeResource(payload, normalized), enriched: true, needs };
  } catch (error) {
    console.warn('[ELEV8 Workflows] Shopify enrichment skipped:', type, error.message);
    return { payload, enriched: false, needs, warning: error.message };
  }
}

async function claimWebhookEvent({ shopDomain, webhookId, topic, resourceType, resourceId }) {
  const eventKey = webhookId
    ? `${shopDomain}:${webhookId}`
    : `${shopDomain}:${topic}:${resourceType}:${resourceId}:${crypto.createHash('sha256').update(`${topic}:${resourceId}`).digest('hex').slice(0,16)}`;
  try {
    const row = await WorkflowEvent.create({
      eventKey,
      shopDomain,
      webhookId: String(webhookId || ''),
      topic: String(topic || ''),
      resourceType: String(resourceType || ''),
      resourceId: String(resourceId || ''),
      receivedAt: new Date(),
      status: 'processing',
    });
    return { duplicate: false, row };
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true, row: null };
    throw error;
  }
}

async function ingestShopifyWebhookEvent({
  shopDomain,
  topic,
  webhookId = '',
  payload = {},
  resourceType = '',
  resourceId = '',
}) {
  const type = normalizeType(resourceType || topicToResourceType(topic));
  const id = String(resourceId || normalizeId(payload));
  const claim = await claimWebhookEvent({ shopDomain, webhookId, topic, resourceType: type, resourceId: id });
  if (claim.duplicate) {
    await recordWebhookDuplicate({ shopDomain, topic, webhookId }).catch(() => {});
    return { duplicate: true, started: 0, runs: [] };
  }

  try {
    const enriched = await enrichShopifyResource({ shopDomain, resourceType: type, resourceId: id, payload });
    const result = await ingestEvent({
      shopDomain,
      resourceType: type,
      resourceId: id,
      topic,
      event: topic,
      payload: enriched.payload,
      source: 'shopify',
    });
    await WorkflowEvent.updateOne({ _id: claim.row._id }, {
      $set: {
        status: 'completed',
        enriched: Boolean(enriched.enriched),
        runCount: Number(result.started || 0),
        finishedAt: new Date(),
      },
    });
    await recordWebhookAccepted({
      shopDomain,
      topic,
      webhookId,
      resourceType: type,
      enriched: Boolean(enriched.enriched),
      runCount: Number(result.started || 0),
    }).catch(() => {});
    return { ...result, duplicate: false, enriched: Boolean(enriched.enriched), warning: enriched.warning || '' };
  } catch (error) {
    await WorkflowEvent.updateOne({ _id: claim.row._id }, {
      $set: { status: 'failed', error: String(error.message || error).slice(0, 2000), finishedAt: new Date() },
    }).catch(() => {});
    await recordWebhookFailure({ shopDomain, topic, webhookId, error }).catch(() => {});
    throw error;
  }
}

function topicsForWorkflow(workflow) {
  const type = normalizeType(workflow.trigger?.resourceType);
  if (!type || workflow.trigger?.kind === 'schedule' || workflow.trigger?.kind === 'custom') return [];
  if (workflow.trigger?.kind === 'resource_event' || workflow.trigger?.kind === 'lifecycle') {
    const event = String(workflow.trigger?.event || '').toLowerCase();
    if (event.includes('/')) return [event];
  }
  return RESOURCE_TOPICS[type] || [];
}

async function requiredWebhookTopics(shopDomain) {
  const workflows = await Workflow.find({ shopDomain, enabled: true }).lean();
  const set = new Set();
  for (const workflow of workflows) topicsForWorkflow(workflow).forEach((topic) => set.add(topic));
  return [...set].sort();
}

function automationWebhookAddress() {
  return `${String(env.appUrl || '').replace(/\/$/, '')}/api/webhooks/shopify/automation`;
}

async function inspectAutomationWebhookSubscriptions(shopDomain) {
  const topics = await requiredWebhookTopics(shopDomain);
  const address = automationWebhookAddress();
  const results = [];
  for (const topic of topics) {
    if (EXISTING_DEDICATED_TOPICS.has(topic)) {
      results.push({ topic, ok: true, dedicated: true, address: topic === 'orders/fulfilled'
        ? `${String(env.appUrl || '').replace(/\/$/, '')}/api/webhooks/shopify/orders-fulfilled`
        : `${String(env.appUrl || '').replace(/\/$/, '')}/api/webhooks/shopify/orders-updated` });
      continue;
    }
    const existing = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(topic)}`, { shopDomain });
    if (!existing) {
      results.push({ topic, ok: false, unknown: true, address, reason: 'Could not inspect Shopify webhook subscriptions.' });
      continue;
    }
    const match = (existing.webhooks || []).find((item) => String(item.address || '').replace(/\/$/, '') === address);
    results.push({ topic, ok: Boolean(match), address, webhookId: match?.id ? String(match.id) : '', missing: !match });
  }
  return { ok: results.every((x) => x.ok), topics, address, results, checkedAt: new Date() };
}

async function syncAutomationWebhookSubscriptions(shopDomain) {
  if (!env.appUrl) throw new Error('APP_URL is required before Shopify automation webhooks can be registered.');
  const topics = await requiredWebhookTopics(shopDomain);
  const address = automationWebhookAddress();
  const results = [];

  for (const topic of topics) {
    if (EXISTING_DEDICATED_TOPICS.has(topic)) {
      results.push({ topic, ok: true, dedicated: true });
      continue;
    }

    const existing = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(topic)}`, { shopDomain });
    const match = (existing?.webhooks || []).find((item) => String(item.address || '').replace(/\/$/, '') === address);
    if (match) {
      results.push({ topic, ok: true, already: true, webhookId: String(match.id) });
      continue;
    }

    const created = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json`, {
      shopDomain,
      method: 'POST',
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    });
    if (created?.webhook?.id) results.push({ topic, ok: true, created: true, webhookId: String(created.webhook.id) });
    else results.push({ topic, ok: false, reason: 'Shopify did not confirm webhook creation. The app may need an additional Shopify access scope or this topic may not be available for the installed API version.' });
  }

  await WorkflowSettings.findOneAndUpdate(
    { shopDomain },
    { $set: {
      webhookSyncAt: new Date(),
      webhookSyncOk: results.every((x) => x.ok),
      webhookTopics: topics,
      webhookSyncResults: results,
    }, $setOnInsert: { shopDomain } },
    { upsert: true, new: true }
  );
  return { ok: results.every((x) => x.ok), topics, address, results };
}

const INDEX_QUERIES = {
  product: {
    connection: 'products',
    node: `id legacyResourceId title handle status tags vendor productType updatedAt
      options { name position values }
      metafields(first:100) { nodes { namespace key value type } }`,
  },
  order: {
    connection: 'orders',
    node: `id legacyResourceId name tags note createdAt updatedAt displayFinancialStatus displayFulfillmentStatus
      customAttributes { key value }
      lineItems(first:100) { nodes { id title sku quantity variant { id legacyResourceId } product { id legacyResourceId } originalUnitPriceSet { shopMoney { amount currencyCode } } totalDiscountSet { shopMoney { amount currencyCode } } } }
      metafields(first:100) { nodes { namespace key value type } }`,
  },
  customer: {
    connection: 'customers',
    node: `id legacyResourceId firstName lastName email phone tags updatedAt
      metafields(first:100) { nodes { namespace key value type } }`,
  },
  collection: {
    connection: 'collections',
    node: `id legacyResourceId title handle updatedAt
      metafields(first:100) { nodes { namespace key value type } }`,
  },
};

async function indexResourceType(shopDomain, resourceType, { maxItems = 5000, orderCoverageDays = 90 } = {}) {
  const type = normalizeType(resourceType);
  const cfg = INDEX_QUERIES[type];
  if (!cfg) return { resourceType: type, indexed: 0, skipped: true, reason: 'No safe bulk indexer is defined for this resource type yet. It will still snapshot itself on the first webhook.' };

  let after = null;
  let indexed = 0;
  const cap = Math.min(Math.max(Number(maxItems || 5000), 1), 20000);
  const queryFilter = type === 'order'
    ? `created_at:>=${new Date(Date.now() - Math.max(1, Number(orderCoverageDays || 90)) * 86400000).toISOString().slice(0, 10)}`
    : '';

  while (indexed < cap) {
    const query = `query E8Index($after:String,$query:String){
      ${cfg.connection}(first:100,after:$after,query:$query){
        nodes { ${cfg.node} }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await graphql(shopDomain, query, { after, query: queryFilter });
    const connection = data[cfg.connection];
    const nodes = connection?.nodes || [];
    for (const node of nodes) {
      const normalized = normalizeGraphqlResource(type, node);
      const id = String(normalized.id || node.legacyResourceId || node.id || '');
      if (!id) continue;
      await WorkflowSnapshot.findOneAndUpdate(
        { shopDomain, resourceType: type, resourceId: id },
        { $set: { data: normalized, capturedAt: new Date() } },
        { upsert: true }
      );
      indexed += 1;
      if (indexed >= cap) break;
    }
    if (!connection?.pageInfo?.hasNextPage || indexed >= cap) break;
    after = connection.pageInfo.endCursor;
  }
  return { resourceType: type, indexed, skipped: false };
}

async function indexRequiredSnapshots(shopDomain, options = {}) {
  const settings = await WorkflowSettings.findOne({ shopDomain }).lean();
  const workflows = await Workflow.find({
    shopDomain,
    enabled: true,
    'trigger.kind': { $in: ['field_changed','metafield_changed','tags_added','tags_removed','attributes_changed','line_items_changed','product_options_changed'] },
  }).lean();
  const types = [...new Set(workflows.map((w) => normalizeType(w.trigger?.resourceType)).filter(Boolean))];
  const results = [];
  for (const type of types) {
    try {
      results.push(await indexResourceType(shopDomain, type, {
        maxItems: options.maxItems,
        orderCoverageDays: options.orderCoverageDays || settings?.orderCoverageDays || 90,
      }));
    } catch (error) {
      results.push({ resourceType: type, indexed: 0, skipped: false, error: error.message });
    }
  }
  await WorkflowSettings.findOneAndUpdate(
    { shopDomain },
    { $set: {
      lastIndexAt: new Date(),
      lastIndexResults: results,
      indexReady: results.every((r) => !r.error),
    }, $setOnInsert: { shopDomain } },
    { upsert: true }
  );
  return { ok: results.every((r) => !r.error), resourceTypes: types, results };
}

async function workflowShopifyReadiness(shopDomain) {
  const [settings, hookStatus, snapshotCount, failedEvents] = await Promise.all([
    WorkflowSettings.findOne({ shopDomain }).lean(),
    inspectAutomationWebhookSubscriptions(shopDomain),
    WorkflowSnapshot.countDocuments({ shopDomain }),
    WorkflowEvent.countDocuments({ shopDomain, status: 'failed', receivedAt: { $gte: new Date(Date.now() - 86400000) } }),
  ]);
  return {
    ok: Boolean(hookStatus.ok && settings?.indexReady !== false),
    webhooks: hookStatus,
    snapshots: { count: snapshotCount, lastIndexAt: settings?.lastIndexAt || null, indexReady: settings?.indexReady ?? null, lastIndexResults: settings?.lastIndexResults || [] },
    events: { failedLast24h: failedEvents },
    oauthMode: 'existing_elev8_per_shop_token',
  };
}

module.exports = {
  topicToResourceType,
  enrichShopifyResource,
  ingestShopifyWebhookEvent,
  requiredWebhookTopics,
  inspectAutomationWebhookSubscriptions,
  syncAutomationWebhookSubscriptions,
  indexRequiredSnapshots,
  workflowShopifyReadiness,
};
