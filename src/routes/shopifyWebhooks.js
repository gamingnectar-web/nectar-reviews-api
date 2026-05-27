const crypto = require('crypto');
const express = require('express');
const { env } = require('../config/env');
const { cleanShopDomain } = require('../utils/validation');
const { timingSafeEqualString } = require('../utils/crypto');
const { scheduleReviewRequestFromOrder } = require('../modules/reviews/reviewRequestAutomation');

const router = express.Router();

function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!env.shopifyApiSecret) return false;
  const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(rawBody).digest('base64');
  return timingSafeEqualString(digest, String(hmacHeader || ''));
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

  const job = await scheduleReviewRequestFromOrder({
    shopDomain,
    order,
    source: 'shopify_orders_fulfilled_webhook',
    webhookId,
  });
  return res.status(200).json({ ok: true, jobId: String(job._id), status: job.status, scheduledAt: job.scheduledAt });
}

router.post('/shopify/orders-fulfilled', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => {
  handleOrderFulfilled(req, res).catch(next);
});

module.exports = router;
