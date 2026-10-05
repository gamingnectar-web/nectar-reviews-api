const crypto = require('crypto');
const express = require('express');
const { env } = require('../config/env');
const { cleanShopDomain } = require('../utils/validation');
const { timingSafeEqualString } = require('../utils/crypto');
const {
  processInventoryLevelUpdate,
  processProductUpdate,
  recordFlowLifecycle,
} = require('../modules/notifications/notifications.service');

const router = express.Router();

function validHmac(rawBody, header) {
  if (!env.shopifyApiSecret) return false;
  const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(rawBody).digest('base64');
  return timingSafeEqualString(digest, String(header || ''));
}

function readSignedJson(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  if (!validHmac(rawBody, req.headers['x-shopify-hmac-sha256'])) {
    res.status(401).json({ error: 'Invalid Shopify signature.' });
    return null;
  }
  try {
    return { rawBody, payload: JSON.parse(rawBody.toString('utf8') || '{}') };
  } catch (_) {
    res.status(400).json({ error: 'Invalid Shopify JSON.' });
    return null;
  }
}

router.post('/inventory-levels-update', express.raw({ type: '*/*', limit: '512kb' }), (req, res) => {
  const parsed = readSignedJson(req, res);
  if (!parsed) return;
  const { payload } = parsed;
  const shopDomain = cleanShopDomain(req.headers['x-shopify-shop-domain'] || '');
  if (!shopDomain) return res.status(400).json({ error: 'Missing Shopify shop domain.' });
  const inventoryItemId = payload.inventory_item_id || payload.inventoryItemId;
  const available = Number(payload.available || 0);
  const webhookId = String(req.headers['x-shopify-webhook-id'] || req.headers['x-shopify-event-id'] || '');
  res.status(200).json({ ok: true });
  if (!inventoryItemId) return;
  processInventoryLevelUpdate({ shopDomain, inventoryItemId, available, webhookId })
    .then((result) => console.log('[Notifications] inventory webhook processed', { shopDomain, inventoryItemId, available, ...result }))
    .catch((error) => console.error('[Notifications] inventory webhook failed', error.message));
});

router.post('/products-update', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const parsed = readSignedJson(req, res);
  if (!parsed) return;
  const { payload } = parsed;
  const shopDomain = cleanShopDomain(req.headers['x-shopify-shop-domain'] || '');
  if (!shopDomain) return res.status(400).json({ error: 'Missing Shopify shop domain.' });
  const productId = payload.id || payload.admin_graphql_api_id || '';
  const status = payload.status || '';
  const webhookId = String(req.headers['x-shopify-webhook-id'] || req.headers['x-shopify-event-id'] || '');
  res.status(200).json({ ok: true });
  if (!productId) return;
  processProductUpdate({ shopDomain, productId, status, webhookId })
    .then((result) => console.log('[Notifications] product webhook processed', { shopDomain, productId, ...result }))
    .catch((error) => console.error('[Notifications] product webhook failed', error.message));
});

router.post('/flow-lifecycle', express.raw({ type: '*/*', limit: '256kb' }), (req, res) => {
  const parsed = readSignedJson(req, res);
  if (!parsed) return;
  const { payload } = parsed;
  const shopDomain = cleanShopDomain(payload.shopify_domain || req.headers['x-shopify-shop-domain'] || '');
  if (!shopDomain) return res.status(400).json({ error: 'Missing Shopify shop domain.' });
  const definitionId = String(payload.flow_trigger_definition_id || '');
  const timestamp = payload.timestamp || new Date().toISOString();
  const hasEnabledFlow = Boolean(payload.has_enabled_flow);
  res.status(200).json({ ok: true });
  recordFlowLifecycle({ shopDomain, definitionId, hasEnabledFlow, timestamp })
    .then((result) => console.log('[Notifications] Flow lifecycle updated', { shopDomain, definitionId, ...result }))
    .catch((error) => console.error('[Notifications] Flow lifecycle failed', error.message));
});

module.exports = router;
