const crypto = require('crypto');
const express = require('express');
const { env } = require('../config/env');
const { cleanShopDomain } = require('../utils/validation');
const { timingSafeEqualString } = require('../utils/crypto');
const { Shop } = require('../models');
const { scheduleReviewRequestFromOrder, updateReviewRequestDeliveryFromOrder } = require('../modules/reviews/reviewRequestAutomation');

const router = express.Router();

function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!env.shopifyApiSecret) return false;
  const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(rawBody).digest('base64');
  return timingSafeEqualString(digest, String(hmacHeader || ''));
}


async function recordReviewWebhookReceipt({ shopDomain, topic, webhookId, order = {} }) {
  if (!shopDomain || !topic) return;
  const now = new Date();
  const set = {
    'modules.reviews.enabled': true,
    'modules.reviews.lastWebhookReceivedAt': now,
    'modules.reviews.lastWebhookTopic': topic,
    'modules.reviews.lastWebhookId': String(webhookId || ''),
    'modules.reviews.lastWebhookOrderId': String(order.admin_graphql_api_id || order.id || order.order_id || ''),
    'modules.reviews.lastWebhookOrderName': String(order.name || order.order_number || order.id || ''),
  };
  const inc = { 'modules.reviews.webhookReceiptCount': 1 };
  if (topic === 'orders/fulfilled') {
    set['modules.reviews.lastOrdersFulfilledWebhookAt'] = now;
    inc['modules.reviews.ordersFulfilledReceiptCount'] = 1;
  }
  if (topic === 'orders/updated') {
    set['modules.reviews.lastOrdersUpdatedWebhookAt'] = now;
    inc['modules.reviews.ordersUpdatedReceiptCount'] = 1;
  }
  await Shop.findOneAndUpdate(
    { shopDomain },
    { $set: set, $inc: inc, $setOnInsert: { shopDomain } },
    { upsert: true, setDefaultsOnInsert: true }
  ).catch((error) => console.warn('[Reviews webhook] receipt tracking skipped:', error.message));
}

async function handleOrderFulfilled(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const shopDomain = cleanShopDomain(req.headers['x-shopify-shop-domain'] || req.query.shop || '');
  const webhookId = String(req.headers['x-shopify-webhook-id'] || req.headers['x-shopify-event-id'] || '');

  if (!verifyShopifyWebhook(rawBody, hmac)) {
    return res.status(401).json({ error: 'Invalid Shopify webhook signature.' });
  }
  if (!shopDomain) return res.status(400).json({ error: 'Missing Shopify shop domain.' });

  let order = {};
  try {
    order = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch (error) {
    return res.status(400).json({ error: 'Invalid Shopify webhook JSON.' });
  }

  await recordReviewWebhookReceipt({ shopDomain, topic: 'orders/fulfilled', webhookId, order });

  const job = await scheduleReviewRequestFromOrder({
    shopDomain,
    order,
    source: 'shopify_orders_fulfilled_webhook',
    webhookId,
  });
  return res.status(200).json({ ok: true, jobId: String(job._id), status: job.status, scheduledAt: job.scheduledAt });
}

async function handleOrderUpdated(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const shopDomain = cleanShopDomain(req.headers['x-shopify-shop-domain'] || req.query.shop || '');
  const webhookId = String(req.headers['x-shopify-webhook-id'] || req.headers['x-shopify-event-id'] || '');

  if (!verifyShopifyWebhook(rawBody, hmac)) {
    return res.status(401).json({ error: 'Invalid Shopify webhook signature.' });
  }
  if (!shopDomain) return res.status(400).json({ error: 'Missing Shopify shop domain.' });

  let order = {};
  try {
    order = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch (error) {
    return res.status(400).json({ error: 'Invalid Shopify webhook JSON.' });
  }

  await recordReviewWebhookReceipt({ shopDomain, topic: 'orders/updated', webhookId, order });

  const result = await updateReviewRequestDeliveryFromOrder({ shopDomain, order, webhookId });
  return res.status(200).json({ ok: true, ...result });
}

router.post('/shopify/orders-fulfilled', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => {
  handleOrderFulfilled(req, res).catch(next);
});

router.post('/shopify/orders-updated', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => {
  handleOrderUpdated(req, res).catch(next);
});

module.exports = router;
