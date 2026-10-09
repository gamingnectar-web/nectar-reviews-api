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

function endpointFor(topic) {
  const path = DEDICATED_ENDPOINTS[topic] || GENERIC_ENDPOINT;
  return `${String(env.appUrl || '').replace(/\/$/, '')}${path}`;
}
function topicEnum(topic) {
  return String(topic || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
async function graphql(shopDomain, query, variables = {}) {
  const payload = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/graphql.json`, {
    shopDomain, method: 'POST', body: JSON.stringify({ query, variables }),
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
      row.workflowIds.push(String(workflow._id)); row.workflowNames.push(workflow.name); map.set(topic, row);
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
    ...(Object.keys(inc).length ? { $inc: inc } : {}), $setOnInsert: { shopDomain, topic },
  }, { upsert: true, new: true, setDefaultsOnInsert: true });
}
async function recordWebhookAccepted({ shopDomain, topic, webhookId = '', resourceType = '', enriched = false, runCount = 0 }) {
  return recordStat(topic, shopDomain, { resourceType, lastReceivedAt:new Date(), lastWebhookId:String(webhookId||''), lastStatus:'received', lastError:'', lastEnriched:Boolean(enriched) }, { receivedCount:1, runCount:Number(runCount||0) });
}
async function recordWebhookDuplicate({ shopDomain, topic, webhookId = '' }) {
  return recordStat(topic, shopDomain, { lastDuplicateAt:new Date(), lastWebhookId:String(webhookId||''), lastStatus:'duplicate' }, { duplicateCount:1 });
}
async function recordWebhookFailure({ shopDomain, topic, webhookId = '', error }) {
  return recordStat(topic, shopDomain, { lastFailedAt:new Date(), lastWebhookId:String(webhookId||''), lastStatus:'failed', lastError:String(error?.message||error||'').slice(0,2000) }, { failureCount:1 });
}
async function inspectOne(shopDomain, desired) {
  const topic = desired.topic, enumTopic = topicEnum(topic), address = endpointFor(topic);
  const data = await graphql(shopDomain, `query E8WebhookSubscription($topics:[WebhookSubscriptionTopic!],$uri:String){ webhookSubscriptions(first:100,topics:$topics,uri:$uri){ nodes{ id topic uri format } } }`, { topics:[enumTopic], uri:address });
  const match = (data.webhookSubscriptions?.nodes || []).find(x=>String(x.uri||'').replace(/\/$/,'')===address.replace(/\/$/,''));
  return { topic, enumTopic, address, match };
}
function statusFromError(message) {
  const lower = String(message||'').toLowerCase();
  if (lower.includes('access') || lower.includes('scope')) return 'missing_scope';
  if (lower.includes('topic') || lower.includes('enum')) return 'unsupported';
  return 'error';
}
async function syncOne(shopDomain, desired) {
  const inspected = await inspectOne(shopDomain, desired);
  const { topic, enumTopic, address, match } = inspected;
  if (match) {
    const stat = await recordStat(topic, shopDomain, { required:true, subscriptionStatus:'connected', shopifyWebhookId:String(match.id||''), lastSyncAt:new Date(), dependencyReasons:desired.reasons, dependentWorkflowIds:desired.workflowIds, dependentWorkflowNames:desired.workflowNames, lastSyncError:'', lastSyncStatus:'connected' });
    return { topic, enumTopic, ok:true, status:'connected', address, webhookId:String(match.id||''), stat };
  }
  const data = await graphql(shopDomain, `mutation E8WebhookCreate($topic:WebhookSubscriptionTopic!,$input:WebhookSubscriptionInput!){ webhookSubscriptionCreate(topic:$topic,webhookSubscription:$input){ webhookSubscription{ id topic uri format } userErrors{ field message } } }`, { topic:enumTopic, input:{ uri:address, format:'JSON' } });
  const payload = data.webhookSubscriptionCreate || {}, errors = payload.userErrors || [], created = payload.webhookSubscription || null;
  if (created?.id && !errors.length) {
    const stat = await recordStat(topic, shopDomain, { required:true, subscriptionStatus:'connected', shopifyWebhookId:String(created.id), lastSyncAt:new Date(), dependencyReasons:desired.reasons, dependentWorkflowIds:desired.workflowIds, dependentWorkflowNames:desired.workflowNames, lastSyncError:'', lastSyncStatus:'connected' });
    return { topic, enumTopic, ok:true, status:'connected', address, webhookId:String(created.id), stat };
  }
  const message = errors.map(x=>x.message).filter(Boolean).join(' | ') || 'Shopify did not create the webhook subscription.';
  const status = statusFromError(message);
  const stat = await recordStat(topic, shopDomain, { required:true, subscriptionStatus:status, lastSyncAt:new Date(), dependencyReasons:desired.reasons, dependentWorkflowIds:desired.workflowIds, dependentWorkflowNames:desired.workflowNames, lastSyncError:message, lastSyncStatus:status }, { syncFailureCount:1 });
  return { topic, enumTopic, ok:false, status, address, error:message, stat };
}
async function repairLegacySyncFailureCounters(shopDomain) {
  await WorkflowWebhookStat.updateMany({ shopDomain, receivedCount:0, $or:[{lastWebhookId:''},{lastWebhookId:{$exists:false}}], failureCount:{$gt:0} }, { $set:{ failureCount:0, lastFailedAt:null, lastError:'', lastStatus:'' } });
}
async function syncTrackedWebhooks(shopDomain) {
  if (!env.appUrl) throw new Error('APP_URL is required before ELEV8 can own Shopify webhooks.');
  await repairLegacySyncFailureCounters(shopDomain);
  const desired = await desiredTopics(shopDomain), results = [];
  for (const row of desired) {
    try { results.push(await syncOne(shopDomain,row)); }
    catch (error) {
      const message = String(error.message||error), status = statusFromError(message);
      await recordStat(row.topic,shopDomain,{ required:true, subscriptionStatus:status, lastSyncAt:new Date(), dependencyReasons:row.reasons, dependentWorkflowIds:row.workflowIds, dependentWorkflowNames:row.workflowNames, lastSyncError:message.slice(0,2000), lastSyncStatus:status },{syncFailureCount:1});
      results.push({ topic:row.topic, enumTopic:topicEnum(row.topic), ok:false, status, address:endpointFor(row.topic), error:message });
    }
  }
  await WorkflowSettings.findOneAndUpdate({shopDomain},{ $set:{ webhookSyncAt:new Date(), webhookSyncOk:results.every(r=>r.ok), webhookTopics:desired.map(r=>r.topic), webhookSyncResults:results.map(r=>({topic:r.topic,enumTopic:r.enumTopic,ok:r.ok,status:r.status,address:r.address,webhookId:r.webhookId||'',error:r.error||''})) }, $setOnInsert:{shopDomain} },{upsert:true,new:true});
  return { ok:results.every(r=>r.ok), desired:desired.length, connected:results.filter(r=>r.ok).length, missingScope:results.filter(r=>r.status==='missing_scope').length, unsupported:results.filter(r=>r.status==='unsupported').length, failed:results.filter(r=>!r.ok).length, results };
}
async function inspectDesiredWebhooks(shopDomain) {
  const desired = await desiredTopics(shopDomain), results=[];
  for (const row of desired) {
    try {
      const i = await inspectOne(shopDomain,row), ok=Boolean(i.match);
      await recordStat(row.topic,shopDomain,{ required:true, subscriptionStatus:ok?'connected':'not_synced', shopifyWebhookId:i.match?.id?String(i.match.id):'', lastSyncAt:new Date(), dependencyReasons:row.reasons, dependentWorkflowIds:row.workflowIds, dependentWorkflowNames:row.workflowNames, lastSyncError:'', lastSyncStatus:ok?'connected':'not_synced' });
      results.push({topic:row.topic,enumTopic:i.enumTopic,ok,status:ok?'connected':'not_synced',address:i.address,webhookId:i.match?.id?String(i.match.id):''});
    } catch(error) {
      const message=String(error.message||error), status=statusFromError(message);
      await recordStat(row.topic,shopDomain,{ required:true, subscriptionStatus:status, lastSyncAt:new Date(), dependencyReasons:row.reasons, dependentWorkflowIds:row.workflowIds, dependentWorkflowNames:row.workflowNames, lastSyncError:message.slice(0,2000), lastSyncStatus:status },{syncFailureCount:1});
      results.push({topic:row.topic,enumTopic:topicEnum(row.topic),ok:false,status,address:endpointFor(row.topic),error:message});
    }
  }
  return {ok:results.every(r=>r.ok),desired:desired.length,connected:results.filter(r=>r.ok).length,results};
}
async function adoptWorkflowCompanionProfile(shopDomain) {
  await WorkflowSettings.findOneAndUpdate({shopDomain},{ $set:{migrationProfile:'workflow_companion',migrationProfileEnabledAt:new Date()}, $setOnInsert:{shopDomain} },{upsert:true,new:true});
  return syncTrackedWebhooks(shopDomain);
}
async function getWebhookRegistry(shopDomain) {
  const desired=await desiredTopics(shopDomain), wanted=new Map(desired.map(x=>[x.topic,x])), stats=await WorkflowWebhookStat.find({shopDomain}).sort({topic:1}).lean();
  for (const row of desired) if (!stats.some(s=>s.topic===row.topic)) stats.push({shopDomain,topic:row.topic,graphqlTopic:topicEnum(row.topic),endpoint:endpointFor(row.topic),required:true,subscriptionStatus:'not_synced',dependencyReasons:row.reasons,dependentWorkflowIds:row.workflowIds,dependentWorkflowNames:row.workflowNames,receivedCount:0,duplicateCount:0,failureCount:0,syncFailureCount:0,runCount:0});
  const rows=stats.map(row=>{ const w=wanted.get(row.topic); return {...row,graphqlTopic:row.graphqlTopic||topicEnum(row.topic),required:Boolean(w),endpoint:row.endpoint||endpointFor(row.topic),dependencyReasons:w?.reasons||row.dependencyReasons||[],dependentWorkflowIds:w?.workflowIds||row.dependentWorkflowIds||[],dependentWorkflowNames:w?.workflowNames||row.dependentWorkflowNames||[]}; }).sort((a,b)=>String(a.topic).localeCompare(String(b.topic)));
  const settings=await WorkflowSettings.findOne({shopDomain}).lean();
  return { migrationProfile:settings?.migrationProfile||'', migrationProfileEnabledAt:settings?.migrationProfileEnabledAt||null, rows, summary:{tracked:rows.length,required:rows.filter(r=>r.required).length,connected:rows.filter(r=>r.required&&r.subscriptionStatus==='connected').length,receiving:rows.filter(r=>r.lastReceivedAt).length,deliveryFailures:rows.reduce((n,r)=>n+Number(r.failureCount||0),0),syncFailures:rows.reduce((n,r)=>n+Number(r.syncFailureCount||0),0),duplicates:rows.reduce((n,r)=>n+Number(r.duplicateCount||0),0)}, note:'ELEV8 uses Shopify Admin GraphQL webhook subscriptions. Modern topics rejected by the legacy REST endpoint are supported here when the app has the required access scope.' };
}

module.exports = { COMPANION_PROFILE_TOPICS, desiredTopics, topicEnum, recordWebhookAccepted, recordWebhookDuplicate, recordWebhookFailure, inspectDesiredWebhooks, syncTrackedWebhooks, adoptWorkflowCompanionProfile, getWebhookRegistry };
