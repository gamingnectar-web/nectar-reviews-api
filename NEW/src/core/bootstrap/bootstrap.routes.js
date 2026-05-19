const express = require('express');
const { config } = require('../config');
const { runDatabaseBootstrap } = require('./bootstrap.service');

const router = express.Router();

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPage(result, error) {
  const messages = result?.messages || [];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Nectar Database Bootstrap</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px;}
    .wrap{max-width:900px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(15,23,42,.08);}
    h1{margin-top:0}.note{background:#fff7ed;border:1px solid #fed7aa;padding:14px;border-radius:12px;color:#7c2d12}.ok{background:#ecfdf5;border:1px solid #bbf7d0;color:#065f46;padding:14px;border-radius:12px}.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:14px;border-radius:12px}
    label{display:block;font-weight:700;margin-top:18px}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin-top:6px}button{margin-top:18px;background:#0f172a;color:white;border:0;border-radius:10px;padding:12px 18px;font-weight:800;cursor:pointer}.log{margin-top:18px;background:#020617;color:#e2e8f0;padding:18px;border-radius:12px;white-space:pre-wrap;max-height:420px;overflow:auto;font-family:ui-monospace,Menlo,monospace;font-size:13px}</style>
</head>
<body><div class="wrap">
  <h1>Nectar database bootstrap</h1>
  <p>This creates/updates the MongoDB databases, collections, indexes, TTL rules, and default Nectar Drops rules.</p>
  <div class="note"><strong>Security:</strong> run this once after deployment, then set <code>DISABLE_DATABASE_BOOTSTRAP=true</code> in Render.</div>
  ${error ? `<div class="err"><strong>Error:</strong> ${escapeHtml(error)}</div>` : ''}
  ${result?.ok ? `<div class="ok"><strong>Complete.</strong> Databases are ready.</div>` : ''}
  <form method="post" action="/setup/bootstrap">
    <label>DATABASE_BOOTSTRAP_SECRET</label>
    <input name="secret" type="password" autocomplete="off" required />
    <label>Type CREATE_DATABASES to confirm</label>
    <input name="confirm" type="text" autocomplete="off" required />
    <button type="submit">Create / update databases</button>
  </form>
  ${messages.length ? `<div class="log">${escapeHtml(messages.join('\n'))}</div>` : ''}
</div></body></html>`;
}

function verifyBootstrapSecret(req) {
  if (!config.security.databaseBootstrapSecret) {
    const error = new Error('DATABASE_BOOTSTRAP_SECRET is not set in Render.');
    error.statusCode = 503;
    throw error;
  }

  if (config.security.nodeEnv === 'production' && config.security.databaseBootstrapSecret.length < 24) {
    const error = new Error('DATABASE_BOOTSTRAP_SECRET must be at least 24 characters in production.');
    error.statusCode = 503;
    throw error;
  }

  const provided = req.body?.secret || req.get('x-nectar-bootstrap-secret') || '';
  if (provided !== config.security.databaseBootstrapSecret) {
    const error = new Error('Invalid bootstrap secret.');
    error.statusCode = 401;
    throw error;
  }

  if ((req.body?.confirm || req.get('x-nectar-bootstrap-confirm')) !== 'CREATE_DATABASES') {
    const error = new Error('Confirmation must exactly equal CREATE_DATABASES.');
    error.statusCode = 400;
    throw error;
  }
}

router.get('/bootstrap', (req, res) => {
  res.type('html').send(renderPage());
});

router.post('/bootstrap', async (req, res) => {
  try {
    verifyBootstrapSecret(req);
    const result = await runDatabaseBootstrap({ actor: 'browser-bootstrap' });
    res.type('html').send(renderPage(result));
  } catch (error) {
    res.status(error.statusCode || 500).type('html').send(renderPage(null, error.message));
  }
});

module.exports = router;
