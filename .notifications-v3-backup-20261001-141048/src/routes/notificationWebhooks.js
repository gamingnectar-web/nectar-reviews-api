const crypto = require('crypto');
const express = require('express');
const { env } = require('../config/env');
const { cleanShopDomain } = require('../utils/validation');
const { timingSafeEqualString } = require('../utils/crypto');
const { processInventoryLevelUpdate } = require('../modules/notifications/notifications.service');

const router = express.Router();

function validHmac(rawBody, header) {
  if (!env.shopifyApiSecret) return false;
  const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(rawBody).digest('base64');
  return timingSafeEqualString(digest, String(header || ''));
}

router.post('/inventory-levels-update', express.raw({ type: '*/*', limit: '512kb' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  if (!validHmac(rawBody, req.headers['x-shopify-hmac-sha256'])) return res.status(401).json({ error: 'Invalid Shopify webhook signature.' });
  const shopDomain = cleanShopDomain(req.headers['x-shopify-shop-domain'] || '');
  if (!shopDomain) return res.status(400).json({ error: 'Missing Shopify shop domain.' });
  let payload = {};
  try { payload = JSON.parse(rawBody.toString('utf8') || '{}'); }
  catch (_) { return res.status(400).json({ error: 'Invalid Shopify webhook JSON.' }); }
  const inventoryItemId = payload.inventory_item_id || payload.inventoryItemId;
  const available = Number(payload.available || 0);
  const webhookId = String(req.headers['x-shopify-webhook-id'] || req.headers['x-shopify-event-id'] || '');
  res.status(200).json({ ok: true });
  if (!inventoryItemId) return;
  processInventoryLevelUpdate({ shopDomain, inventoryItemId, available, webhookId })
    .then((result) => console.log('[Notifications] inventory webhook processed', { shopDomain, inventoryItemId, available, ...result }))
    .catch((error) => console.error('[Notifications] inventory webhook failed', error.message));
});

module.exports = router;
