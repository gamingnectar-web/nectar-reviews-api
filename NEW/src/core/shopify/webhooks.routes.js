const express = require('express');
const { verifyWebhookHmac } = require('./shopify.service');
const { cleanShopDomain } = require('../http/request-utils');
const { eventBus } = require('../modules/event-bus');
const { recordAuditEvent } = require('../audit/audit.service');

const router = express.Router();

function parseRawJson(req) {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body || '');
  return raw ? JSON.parse(raw) : {};
}

function verifyShopifyWebhook(req, res, next) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Invalid webhook signature');
  req.shopDomain = cleanShopDomain(req.get('X-Shopify-Shop-Domain'));
  req.shopifyTopic = req.get('X-Shopify-Topic') || '';
  next();
}

function webhook(topic, eventName) {
  return [
    express.raw({ type: 'application/json', limit: '2mb' }),
    verifyShopifyWebhook,
    async (req, res, next) => {
      try {
        const payload = parseRawJson(req);
        eventBus.emit(eventName, { shopDomain: req.shopDomain, payload, order: payload, topic });
        await recordAuditEvent({
          shopDomain: req.shopDomain,
          actorType: 'shopify_webhook',
          module: 'shopify',
          eventType: `webhook.${topic}`,
          entityType: 'webhook',
          entityKey: String(payload.id || payload.admin_graphql_api_id || ''),
          action: 'received',
          metadata: { sourceType: topic }
        });
        res.status(200).send('ok');
      } catch (error) {
        next(error);
      }
    }
  ];
}

router.post('/orders-paid', ...webhook('orders_paid', 'order.paid'));
router.post('/orders-cancelled', ...webhook('orders_cancelled', 'order.cancelled'));
router.post('/refunds-create', ...webhook('refunds_create', 'refund.created'));
router.post('/fulfillments-create', ...webhook('fulfillments_create', 'fulfillment.created'));

module.exports = router;
