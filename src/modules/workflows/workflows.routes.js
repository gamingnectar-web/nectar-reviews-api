const express = require('express');
const crypto = require('crypto');
const {
  Workflow,
  WorkflowRun,
  WorkflowCredential,
  WorkflowToken,
  WorkflowSettings,
} = require('./workflows.models');
const { encrypt, createToken, tokenHash } = require('./workflows.crypto');
const { templates } = require('./workflows.templates');
const { ingestEvent, runManual, ensureSettings } = require('./workflows.service');

const adminRouter = express.Router();
const publicRouter = express.Router();

function shopFromReq(req) {
  return String(
    req.shopDomain ||
    req.session?.shopDomain ||
    req.session?.shop ||
    resSafe(req)?.locals?.shopDomain ||
    req.query?.shopDomain ||
    req.body?.shopDomain ||
    ''
  ).toLowerCase().trim();
}
function resSafe(req) { return req.res || {}; }

function cleanWorkflow(input, shopDomain) {
  const safe = {
    shopDomain,
    name: String(input.name || '').trim().slice(0, 160),
    description: String(input.description || '').trim().slice(0, 1000),
    enabled: Boolean(input.enabled),
    trigger: input.trigger || { kind: 'custom' },
    conditionMode: input.conditionMode === 'any' ? 'any' : 'all',
    conditions: Array.isArray(input.conditions) ? input.conditions.slice(0, 50) : [],
    actions: Array.isArray(input.actions) ? input.actions.slice(0, 50) : [],
  };
  if (!safe.name) throw new Error('Workflow name is required.');
  if (!safe.trigger?.kind) throw new Error('Trigger kind is required.');
  safe.actions = safe.actions.map((action, index) => ({
    id: String(action.id || `action_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80),
    type: String(action.type || ''),
    label: String(action.label || '').slice(0, 160),
    enabled: action.enabled !== false,
    config: action.config || {},
  }));
  return safe;
}

adminRouter.get('/health', async (req, res) => {
  const shopDomain = shopFromReq(req);
  if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required.' });
  const [workflows, recentRuns] = await Promise.all([
    Workflow.countDocuments({ shopDomain }),
    WorkflowRun.countDocuments({ shopDomain, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
  ]);
  res.json({ ok: true, module: 'ELEV8 Automations', version: '1.0.0', shopDomain, workflows, recentRuns });
});

adminRouter.get('/templates', (req, res) => res.json({ templates }));

adminRouter.get('/definitions', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const rows = await Workflow.find({ shopDomain }).sort({ updatedAt: -1 }).lean();
  res.json({ workflows: rows });
});

adminRouter.post('/definitions', async (req, res) => {
  try {
    const shopDomain = shopFromReq(req);
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required.' });
    const row = await Workflow.create(cleanWorkflow(req.body, shopDomain));
    res.status(201).json({ workflow: row });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

adminRouter.put('/definitions/:id', async (req, res) => {
  try {
    const shopDomain = shopFromReq(req);
    const data = cleanWorkflow(req.body, shopDomain);
    const row = await Workflow.findOneAndUpdate({ _id: req.params.id, shopDomain }, { $set: data }, { new: true });
    if (!row) return res.status(404).json({ error: 'Workflow not found.' });
    res.json({ workflow: row });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

adminRouter.delete('/definitions/:id', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const row = await Workflow.findOneAndDelete({ _id: req.params.id, shopDomain });
  if (!row) return res.status(404).json({ error: 'Workflow not found.' });
  res.json({ success: true });
});

adminRouter.post('/definitions/:id/run', async (req, res) => {
  try {
    const shopDomain = shopFromReq(req);
    const workflow = await Workflow.findOne({ _id: req.params.id, shopDomain });
    if (!workflow) return res.status(404).json({ error: 'Workflow not found.' });
    const run = await runManual(workflow, req.body || {});
    res.status(202).json({ runId: run.runId, status: run.status });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

adminRouter.post('/templates/:key/install', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const source = templates.find((x) => x.key === req.params.key);
  if (!source) return res.status(404).json({ error: 'Template not found.' });
  const row = await Workflow.create(cleanWorkflow({ ...source, enabled: false }, shopDomain));
  res.status(201).json({ workflow: row });
});

adminRouter.get('/runs', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const rows = await WorkflowRun.find({ shopDomain }).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ runs: rows });
});

adminRouter.get('/runs/:runId', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const row = await WorkflowRun.findOne({ shopDomain, runId: req.params.runId }).lean();
  if (!row) return res.status(404).json({ error: 'Run not found.' });
  res.json({ run: row });
});

adminRouter.post('/events/test', async (req, res) => {
  try {
    const shopDomain = shopFromReq(req);
    const result = await ingestEvent({ ...req.body, shopDomain, source: 'test' });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

adminRouter.get('/settings', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const settings = await ensureSettings(shopDomain);
  res.json({ settings });
});

adminRouter.put('/settings', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const allowed = {};
  for (const key of ['enabled','orderCoverageDays','maxRunsPerMinute','storePayloads']) {
    if (req.body[key] !== undefined) allowed[key] = req.body[key];
  }
  if (req.body.debugMode === true) allowed.debugModeUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (req.body.debugMode === false) allowed.debugModeUntil = null;
  const settings = await WorkflowSettings.findOneAndUpdate({ shopDomain }, { $set: allowed, $setOnInsert: { shopDomain } }, { new: true, upsert: true });
  res.json({ settings });
});

adminRouter.get('/credentials', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const rows = await WorkflowCredential.find({ shopDomain }).sort({ name: 1 }).select('name type hint createdAt updatedAt').lean();
  res.json({ credentials: rows });
});

adminRouter.post('/credentials', async (req, res) => {
  try {
    const shopDomain = shopFromReq(req);
    const name = String(req.body.name || '').trim();
    const type = String(req.body.type || '').trim();
    if (!name || !type || !req.body.value || typeof req.body.value !== 'object') return res.status(400).json({ error: 'name, type and value object are required.' });
    const encrypted = encrypt({ type, ...req.body.value });
    const hint = req.body.hint || (req.body.value.apiKey ? `${String(req.body.value.apiKey).slice(0, 4)}…${String(req.body.value.apiKey).slice(-4)}` : '');
    const row = await WorkflowCredential.findOneAndUpdate(
      { shopDomain, name },
      { $set: { type, encrypted, hint } },
      { upsert: true, new: true }
    );
    res.json({ credential: { _id: row._id, name: row.name, type: row.type, hint: row.hint } });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

adminRouter.delete('/credentials/:id', async (req, res) => {
  const shopDomain = shopFromReq(req);
  await WorkflowCredential.deleteOne({ _id: req.params.id, shopDomain });
  res.json({ success: true });
});

adminRouter.get('/tokens', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const rows = await WorkflowToken.find({ shopDomain }).sort({ createdAt: -1 }).select('name prefix lastUsedAt revokedAt createdAt').lean();
  res.json({ tokens: rows });
});

adminRouter.post('/tokens', async (req, res) => {
  const shopDomain = shopFromReq(req);
  const token = createToken();
  const row = await WorkflowToken.create({ shopDomain, name: String(req.body.name || 'REST API'), hash: token.hash, prefix: token.prefix });
  res.status(201).json({ token: token.value, record: { _id: row._id, name: row.name, prefix: row.prefix } });
});

adminRouter.delete('/tokens/:id', async (req, res) => {
  const shopDomain = shopFromReq(req);
  await WorkflowToken.updateOne({ _id: req.params.id, shopDomain }, { $set: { revokedAt: new Date() } });
  res.json({ success: true });
});

publicRouter.post('/trigger/:resourceType?', async (req, res) => {
  try {
    const auth = String(req.headers.authorization || '');
    const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || req.body?.bearerToken || '';
    if (!bearer) return res.status(401).json({ error: 'Bearer token required.' });
    const hash = tokenHash(bearer);
    const token = await WorkflowToken.findOne({ hash, revokedAt: null });
    if (!token) return res.status(401).json({ error: 'Invalid token.' });
    await WorkflowToken.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } });
    const shopDomain = token.shopDomain;
    const result = await ingestEvent({
      shopDomain,
      resourceType: req.params.resourceType || req.body.resourceType || 'generic',
      resourceId: req.body.itemId || req.body.resourceId || '',
      event: req.body.event || 'custom',
      topic: req.body.topic || '',
      payload: req.body.resource || {},
      before: req.body.before || null,
      specifier: req.body.specifier || '',
      additionalParameters: req.body.additionalParameters || {},
      source: 'rest',
    });
    if (!result.started) return res.status(412).json({ error: 'No enabled ELEV8 workflow matched this trigger.' });
    res.json(result);
  } catch (error) {
    console.error('[ELEV8 Workflows] REST trigger', error);
    res.status(500).json({ error: error.message });
  }
});

// Use after your existing Shopify webhook HMAC validation.
// POST body: { shopDomain, resourceType, resourceId, topic, payload, before? }
publicRouter.post('/internal/shopify-event', async (req, res) => {
  const configured = process.env.ELEV8_WORKFLOWS_INTERNAL_KEY || '';
  const supplied = String(req.headers['x-elev8-internal-key'] || '');
  if (!configured || supplied.length !== configured.length || !crypto.timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))) {
    return res.status(401).json({ error: 'Invalid internal key.' });
  }
  try {
    const result = await ingestEvent({ ...req.body, source: 'shopify' });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = { adminRouter, publicRouter };
