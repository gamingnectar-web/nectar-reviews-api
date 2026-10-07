const crypto = require('crypto');
const { Workflow, WorkflowRun, WorkflowCredential, WorkflowSettings } = require('./workflows.models');
const { decrypt } = require('./workflows.crypto');
const { getAccessTokenForShop } = require('../../utils/shopify');

function getPath(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], obj);
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
}

function evaluateCondition(condition, context) {
  const left = getPath(context, condition.path);
  const right = condition.value;
  const op = condition.operator || 'eq';
  if (op === 'exists') return left !== undefined && left !== null;
  if (op === 'not_exists') return left === undefined || left === null;
  if (op === 'changed') {
    const previous = getPath(context, `before.${condition.path}`);
    return comparable(previous) !== comparable(left);
  }
  if (op === 'eq') return comparable(left) === comparable(right);
  if (op === 'neq') return comparable(left) !== comparable(right);
  if (op === 'gt') return Number(left) > Number(right);
  if (op === 'gte') return Number(left) >= Number(right);
  if (op === 'lt') return Number(left) < Number(right);
  if (op === 'lte') return Number(left) <= Number(right);
  if (op === 'contains') return Array.isArray(left) ? left.some((v) => comparable(v) === comparable(right)) : String(left ?? '').includes(String(right ?? ''));
  if (op === 'not_contains') return Array.isArray(left) ? !left.some((v) => comparable(v) === comparable(right)) : !String(left ?? '').includes(String(right ?? ''));
  if (op === 'in') return Array.isArray(right) && right.some((v) => comparable(v) === comparable(left));
  if (op === 'starts_with') return String(left ?? '').startsWith(String(right ?? ''));
  if (op === 'ends_with') return String(left ?? '').endsWith(String(right ?? ''));
  if (op === 'matches') return new RegExp(String(right || ''), 'i').test(String(left ?? ''));
  return false;
}

function conditionsPass(workflow, context) {
  const conditions = workflow.conditions || [];
  if (!conditions.length) return true;
  const results = conditions.map((c) => evaluateCondition(c, context));
  return workflow.conditionMode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function templateValue(value, context) {
  if (typeof value !== 'string') return value;
  const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (exact) {
    const v = getPath(context, exact[1].trim());
    return v === undefined ? '' : v;
  }
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => {
    const v = getPath(context, path.trim());
    if (v === undefined || v === null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function deepTemplate(value, context) {
  if (typeof value === 'string') return templateValue(value, context);
  if (Array.isArray(value)) return value.map((item) => deepTemplate(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepTemplate(v, context)]));
  }
  return value;
}

async function credential(shopDomain, name) {
  const row = await WorkflowCredential.findOne({ shopDomain, name });
  if (!row) throw new Error(`Workflow credential "${name}" was not found.`);
  return { type: row.type, ...decrypt(row.encrypted) };
}

async function httpRequest(config, context, shopDomain) {
  const rendered = deepTemplate(config, context);
  const headers = { ...(rendered.headers || {}) };
  if (rendered.contentType) headers['content-type'] = rendered.contentType;
  if (rendered.credential) {
    const c = await credential(shopDomain, rendered.credential);
    if (c.type === 'bearer') headers.authorization = `Bearer ${c.token}`;
    else if (c.type === 'basic') headers.authorization = `Basic ${Buffer.from(`${c.username}:${c.password}`).toString('base64')}`;
    else if (c.type === 'header') headers[c.headerName] = c.headerValue;
  }
  let body = rendered.body;
  if (body && typeof body !== 'string') body = JSON.stringify(body);

  let response;
  let attempt = 0;
  do {
    attempt += 1;
    response = await fetch(rendered.url, {
      method: rendered.method || 'GET',
      headers,
      body: ['GET', 'HEAD'].includes(String(rendered.method || 'GET').toUpperCase()) ? undefined : body,
      signal: AbortSignal.timeout(Math.min(Number(rendered.timeoutMs || 20000), 60000)),
    });
    if (response.status !== 429 || !rendered.retry429 || attempt >= 4) break;
    const wait = Math.min(Number(response.headers.get('retry-after') || attempt), 10);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  } while (attempt < 4);

  const text = await response.text();
  const family = Math.floor(response.status / 100);
  if ((family === 3 && rendered.failOn3xx) || (family === 4 && rendered.failOn4xx) || (family === 5 && rendered.failOn5xx)) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }
  let parsed = text;
  try { parsed = JSON.parse(text); } catch (_) {}
  return { ok: response.ok, status: response.status, body: parsed };
}

async function shopifyGraphql(config, context, shopDomain) {
  const rendered = deepTemplate(config, context);
  let token = await getAccessTokenForShop(shopDomain);
  if (rendered.credential) {
    const c = await credential(shopDomain, rendered.credential);
    token = c.token || c.accessToken || token;
  }
  if (!token) throw new Error('No Shopify Admin token is available for this shop. Reinstall/connect the Shopify store in ELEV8.');
  const apiVersion = rendered.apiVersion || '2026-07';
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
    body: JSON.stringify({ query: rendered.query, variables: rendered.variables || {} }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Shopify GraphQL failed: ${JSON.stringify(payload.errors || payload).slice(0, 1800)}`);
  }
  if (rendered.failOnUserErrors !== false) {
    const stack = [payload.data];
    while (stack.length) {
      const item = stack.pop();
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item.userErrors) && item.userErrors.length) {
        throw new Error(`Shopify userErrors: ${JSON.stringify(item.userErrors).slice(0, 1800)}`);
      }
      Object.values(item).forEach((v) => { if (v && typeof v === 'object') stack.push(v); });
    }
  }
  return { data: payload.data };
}

async function fetchImageAsBase64(url, maxBytes = 8 * 1024 * 1024) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Could not download AI image (${response.status}).`);
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('AI image is too large.');
  return { mime: response.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') };
}

async function aiGenerate(config, context, shopDomain) {
  const rendered = deepTemplate(config, context);
  const c = await credential(shopDomain, rendered.credential || rendered.provider);
  const provider = String(rendered.provider || c.type || '').toLowerCase();
  const prompt = String(rendered.prompt || '');
  const imageUrls = (rendered.imageUrls || []).filter(Boolean).slice(0, 10);

  if (provider === 'openai') {
    const content = [{ type: 'input_text', text: prompt }];
    imageUrls.forEach((url) => content.push({ type: 'input_image', image_url: url }));
    const body = {
      model: rendered.model || c.model || 'gpt-5-mini',
      instructions: rendered.systemPrompt || c.systemPrompt || undefined,
      input: [{ role: 'user', content }],
      max_output_tokens: rendered.maxTokens || c.maxTokens || 1200,
    };
    if (rendered.reasoningEffort || c.reasoningEffort) body.reasoning = { effort: rendered.reasoningEffort || c.reasoningEffort };
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`OpenAI failed: ${JSON.stringify(data).slice(0, 1600)}`);
    const text = data.output_text || (data.output || []).flatMap((x) => x.content || []).map((x) => x.text || '').join('');
    return { text, model: body.model };
  }

  if (provider === 'anthropic' || provider === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': c.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: rendered.model || c.model || 'claude-sonnet-4-5',
        max_tokens: rendered.maxTokens || c.maxTokens || 1200,
        system: rendered.systemPrompt || c.systemPrompt || undefined,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Anthropic failed: ${JSON.stringify(data).slice(0, 1600)}`);
    return { text: (data.content || []).map((x) => x.text || '').join(''), model: data.model };
  }

  if (provider === 'gemini' || provider === 'google') {
    const parts = [{ text: prompt }];
    for (const url of imageUrls) {
      const image = await fetchImageAsBase64(url);
      parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
    }
    const model = rendered.model || c.model || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(c.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        systemInstruction: rendered.systemPrompt || c.systemPrompt ? { parts: [{ text: rendered.systemPrompt || c.systemPrompt }] } : undefined,
        generationConfig: {
          temperature: rendered.temperature ?? c.temperature,
          maxOutputTokens: rendered.maxTokens || c.maxTokens || 1200,
        },
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Gemini failed: ${JSON.stringify(data).slice(0, 1600)}`);
    const text = (data.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    return { text, model };
  }

  throw new Error(`Unsupported AI provider "${provider}".`);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function renderBlocks(blocks, context) {
  return (blocks || []).map((raw) => {
    const block = deepTemplate(raw, context);
    if (block.condition && !evaluateCondition(block.condition, context)) return '';
    if (block.type === 'heading') return `<h2 style="margin:0 0 16px;font:700 24px/1.2 Arial,sans-serif;color:#111827">${escapeHtml(block.text)}</h2>`;
    if (block.type === 'text') return `<p style="margin:0 0 16px;font:400 15px/1.6 Arial,sans-serif;color:#374151">${escapeHtml(block.text)}</p>`;
    if (block.type === 'image') return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || '')}" style="display:block;max-width:100%;height:auto;margin:0 0 16px;border-radius:12px">`;
    if (block.type === 'button') return `<p style="margin:20px 0"><a href="${escapeHtml(block.url)}" style="display:inline-block;background:#111827;color:white;text-decoration:none;border-radius:9px;padding:12px 18px;font:700 14px Arial,sans-serif">${escapeHtml(block.text || 'View')}</a></p>`;
    if (block.type === 'divider') return '<hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0">';
    if (block.type === 'html') return String(block.html || '');
    return '';
  }).join('');
}

async function sendEmail(config, context, shopDomain, styled = false) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (_) { throw new Error('Email actions require nodemailer. Run: npm install nodemailer'); }

  const rendered = deepTemplate(config, context);
  const c = await credential(shopDomain, rendered.credential || 'smtp-default');
  if (!['smtp','email'].includes(c.type)) throw new Error('Selected credential is not an SMTP credential.');
  const transport = nodemailer.createTransport({
    host: c.host,
    port: Number(c.port || 587),
    secure: Boolean(c.secure),
    auth: c.username ? { user: c.username, pass: c.password } : undefined,
  });
  const html = styled
    ? `<div style="max-width:640px;margin:0 auto;padding:24px;font-family:Arial,sans-serif">${renderBlocks(rendered.blocks || [], context)}</div>`
    : undefined;
  const text = styled ? String(rendered.textFallback || '').trim() || (rendered.blocks || []).map((b) => b.text || '').filter(Boolean).join('\n\n') : String(rendered.body || '');
  const info = await transport.sendMail({
    from: rendered.from || c.from || c.username,
    to: rendered.to,
    cc: rendered.cc || undefined,
    bcc: rendered.bcc || undefined,
    subject: rendered.subject,
    text,
    html,
  });
  return { accepted: info.accepted || [], rejected: info.rejected || [], messageId: info.messageId };
}

async function loopLimitReached(workflow, context) {
  const settings = await WorkflowSettings.findOne({ shopDomain: workflow.shopDomain }).lean();
  const debug = settings?.debugModeUntil && new Date(settings.debugModeUntil) > new Date();
  const limit = debug ? 500 : 10;
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const count = await WorkflowRun.countDocuments({
    shopDomain: workflow.shopDomain,
    workflowId: workflow._id,
    resourceId: String(context.resourceId || context.resource?.id || ''),
    specifier: String(context.specifier || ''),
    createdAt: { $gte: since },
  });
  return count >= limit;
}

function scheduledDate(config, context) {
  const rendered = deepTemplate(config, context);
  if (rendered.startAt) {
    const date = new Date(rendered.startAt);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const seconds = Number(rendered.delaySeconds || 0);
  return new Date(Date.now() + Math.max(0, seconds) * 1000);
}


async function bulkStart(config, context, workflow) {
  const rendered = deepTemplate(config, context);
  const target = rendered.workflowId
    ? await Workflow.findOne({ _id: rendered.workflowId, shopDomain: workflow.shopDomain, enabled: true })
    : await Workflow.findOne({ name: rendered.workflowName, shopDomain: workflow.shopDomain, enabled: true });
  if (!target) throw new Error('Target bulk workflow not found or disabled.');

  let items = Array.isArray(rendered.items) ? rendered.items : [];
  const resourceType = String(rendered.resourceType || '').toLowerCase();

  if (!items.length && rendered.shopifyQuery !== undefined) {
    const map = {
      customer: 'customers',
      order: 'orders',
      product: 'products',
      company: 'companies',
    };
    const connection = map[resourceType];
    if (!connection && resourceType !== 'metaobject') throw new Error('Bulk Shopify query supports customer, order, product, company and metaobject.');
    let after = null;
    const cap = Math.min(Math.max(Number(rendered.maxItems || 5000), 1), 20000);

    while (items.length < cap) {
      const isMeta = resourceType === 'metaobject';
      const query = isMeta
        ? `query E8Bulk($after:String,$query:String,$type:String!){ metaobjects(type:$type,first:100,after:$after,query:$query){ nodes{id handle type} pageInfo{hasNextPage endCursor} } }`
        : `query E8Bulk($after:String,$query:String){ ${connection}(first:100,after:$after,query:$query){ nodes{id} pageInfo{hasNextPage endCursor} } }`;
      const variables = {
        after,
        query: String(rendered.shopifyQuery || ''),
        ...(isMeta ? { type: String(rendered.metaobjectType || '') } : {}),
      };
      if (isMeta && !variables.type) throw new Error('metaobjectType is required for bulk metaobject queries.');
      const result = await shopifyGraphql({
        query,
        variables,
        credential: rendered.credential,
        apiVersion: rendered.apiVersion || '2026-07',
      }, context, workflow.shopDomain);
      const connectionData = isMeta ? result.data.metaobjects : result.data[connection];
      items.push(...(connectionData?.nodes || []));
      if (!connectionData?.pageInfo?.hasNextPage) break;
      after = connectionData.pageInfo.endCursor;
    }
    items = items.slice(0, cap);
  }

  const runIds = [];
  const seen = new Set();
  const delayMs = Math.max(0, Number(rendered.delayBetweenMs || 0));
  for (const raw of items) {
    const item = typeof raw === 'string' ? { id: raw } : (raw || {});
    const id = String(item.id || item.legacyResourceId || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const run = await queueWorkflow(target, {
      ...context,
      resourceType: resourceType || target.trigger?.resourceType || '',
      resourceId: id,
      resource: item,
      specifier: rendered.specifier || '',
      additionalParameters: rendered.additionalParameters || {},
    }, 'bulk');
    runIds.push(run.runId);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 10000)));
  }
  return { startedWorkflows: runIds.length, runIds, objectType: resourceType, specifier: rendered.specifier || '' };
}

async function executeAction(action, context, workflow) {
  const config = action.config || {};
  if (action.type === 'current_datetime') return { currentDatetime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') };
  if (action.type === 'random_integer') {
    const rendered = deepTemplate(config, context);
    let from = Number(rendered.from ?? 0), to = Number(rendered.to ?? 100);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) throw new Error('Invalid random integer bounds.');
    return { randomNumber: crypto.randomInt(from, to + 1) };
  }
  if (action.type === 'set_variable') {
    const rendered = deepTemplate(config, context);
    return { name: rendered.name, value: rendered.value };
  }
  if (action.type === 'http_request') return httpRequest(config, context, workflow.shopDomain);
  if (action.type === 'shopify_graphql') return shopifyGraphql(config, context, workflow.shopDomain);
  if (action.type === 'ai_generate') return aiGenerate(config, context, workflow.shopDomain);
  if (action.type === 'email') return sendEmail(config, context, workflow.shopDomain, false);
  if (action.type === 'email_styled') return sendEmail(config, context, workflow.shopDomain, true);
  if (action.type === 'bulk_start') return bulkStart(config, context, workflow);
  if (action.type === 'start_workflow') {
    const rendered = deepTemplate(config, context);
    const target = rendered.workflowId
      ? await Workflow.findOne({ _id: rendered.workflowId, shopDomain: workflow.shopDomain, enabled: true })
      : await Workflow.findOne({ name: rendered.workflowName, shopDomain: workflow.shopDomain, enabled: true });
    if (!target) throw new Error('Target workflow not found or disabled.');
    const run = await queueWorkflow(target, {
      ...context,
      resourceId: rendered.resourceId || context.resourceId || context.resource?.id || '',
      specifier: rendered.specifier || '',
    }, 'workflow', scheduledDate(rendered, context));
    return { runId: run.runId, scheduledFor: run.scheduledFor };
  }
  if (action.type === 'stop') return { stop: true, reason: templateValue(config.reason || 'Stopped by action', context) };
  throw new Error(`Unsupported action type "${action.type}".`);
}

async function queueWorkflow(workflow, context, source = 'manual', scheduledFor = new Date()) {
  if (await loopLimitReached(workflow, context)) throw new Error('Loop protection stopped this workflow (same object/specifier ran too often in 30 minutes).');
  const runId = `e8run_${crypto.randomUUID()}`;
  return WorkflowRun.create({
    runId,
    shopDomain: workflow.shopDomain,
    workflowId: workflow._id,
    workflowName: workflow.name,
    source,
    status: 'queued',
    resourceType: String(context.resourceType || workflow.trigger?.resourceType || ''),
    resourceId: String(context.resourceId || context.resource?.id || ''),
    specifier: String(context.specifier || ''),
    scheduledFor,
    context,
  });
}

async function executeRun(run) {
  const workflow = await Workflow.findById(run.workflowId);
  if (!workflow || !workflow.enabled) {
    run.status = 'skipped';
    run.error = 'Workflow is missing or disabled.';
    run.finishedAt = new Date();
    await run.save();
    return run;
  }

  run.status = 'running';
  run.startedAt = new Date();
  await run.save();

  const context = {
    ...(run.context || {}),
    run: { id: run.runId, startedAt: run.startedAt.toISOString() },
    outputs: {},
  };

  try {
    if (!conditionsPass(workflow, context)) {
      run.status = 'skipped';
      run.error = 'Conditions did not match.';
      run.finishedAt = new Date();
      await run.save();
      return run;
    }

    const steps = [];
    for (const action of (workflow.actions || [])) {
      if (action.enabled === false) continue;
      const startedAt = new Date();
      try {
        const output = await executeAction(action, context, workflow);
        context.outputs[action.id] = output;
        if (action.type === 'set_variable' && output.name) context[output.name] = output.value;
        steps.push({ actionId: action.id, type: action.type, label: action.label, status: 'succeeded', startedAt, finishedAt: new Date(), output });
        if (output?.stop) break;
      } catch (error) {
        steps.push({ actionId: action.id, type: action.type, label: action.label, status: 'failed', startedAt, finishedAt: new Date(), error: String(error.message || error).slice(0, 4000) });
        throw error;
      }
    }

    run.status = 'succeeded';
    run.outputs = context.outputs;
    run.steps = steps;
    run.finishedAt = new Date();
    await run.save();
    await Workflow.updateOne({ _id: workflow._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: new Date(), lastRunStatus: 'succeeded' } });
  } catch (error) {
    run.status = 'failed';
    run.error = String(error.message || error).slice(0, 5000);
    run.finishedAt = new Date();
    await run.save();
    await Workflow.updateOne({ _id: workflow._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: new Date(), lastRunStatus: 'failed' } });
  }
  return run;
}

module.exports = {
  getPath,
  evaluateCondition,
  conditionsPass,
  deepTemplate,
  queueWorkflow,
  executeRun,
};
